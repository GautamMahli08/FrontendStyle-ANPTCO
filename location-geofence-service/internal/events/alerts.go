package events

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// AlertContext carries the geofence and trip state that the alert detectors
// need but that is only available after the geofence service has run.
type AlertContext struct {
	InsideDepotGeofence    bool
	InsideDeliveryGeofence bool
	ActiveTripID           *uuid.UUID
}

// DetectAlerts runs the per-reading monitoring detectors in the order prescribed
// by the design: power/sensor integrity first (measurement-layer), then fuel
// delta (needs stop + geofence context). Returns alerts to upsert idempotently.
func DetectAlerts(
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	actx AlertContext,
	cfg *domain.MonitoringConfig,
) []*domain.Alert {
	var alerts []*domain.Alert

	if a := detectPowerTampering(truck, prev, r, actx, cfg); a != nil {
		alerts = append(alerts, a)
	}
	if a := detectSensorTampering(truck, prev, r); a != nil {
		alerts = append(alerts, a)
	}
	if a := detectFuelDrain(truck, prev, r, actx, cfg); a != nil {
		alerts = append(alerts, a)
	}

	return alerts
}

// ── §6 External power tampering ───────────────────────────────────────────────

func detectPowerTampering(
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	actx AlertContext,
	cfg *domain.MonitoringConfig,
) *domain.Alert {
	if r.ExternalPowerVoltage == nil || prev == nil || prev.ExternalPowerVoltage == nil {
		return nil
	}

	wasOn := *prev.ExternalPowerVoltage >= powerOnVolts
	nowOff := *r.ExternalPowerVoltage < powerOffVolts
	if !wasOn || !nowOff {
		return nil
	}

	// Normal shutdown: ignition-switched truck powers down ignition-off at depot.
	ignOff := r.IgnitionOn == nil || !*r.IgnitionOn
	if cfg.PowerMode == "ignition_switched" && ignOff && actx.InsideDepotGeofence {
		return nil
	}

	moving := r.Speed != nil && *r.Speed >= cfg.StationarySpeedKmh
	ignOn := r.IgnitionOn != nil && *r.IgnitionOn

	ctx := "parked_offbase"
	if actx.InsideDepotGeofence {
		ctx = "parked_onbase"
	}
	if moving {
		ctx = "moving"
	}

	type payload struct {
		ExtVoltage  float64 `json:"ext_voltage"`
		PrevVoltage float64 `json:"prev_voltage"`
		Ignition    *bool   `json:"ignition"`
		Context     string  `json:"context"`
		PowerMode   string  `json:"power_mode"`
	}
	raw, _ := json.Marshal(payload{
		ExtVoltage:  *r.ExternalPowerVoltage,
		PrevVoltage: *prev.ExternalPowerVoltage,
		Ignition:    r.IgnitionOn,
		Context:     ctx,
		PowerMode:   cfg.PowerMode,
	})

	severity := 2
	if moving || ignOn {
		severity = 1
	}

	lat, lng := r.Latitude, r.Longitude
	imei := truck.GalileoskyDeviceID
	return &domain.Alert{
		WorkspaceID: truck.WorkspaceID,
		Type:        domain.AlertTypeExternalPowerTampering,
		Severity:    severity,
		VehicleID:   &truck.ID,
		DeviceIMEI:  &imei,
		TripID:      actx.ActiveTripID,
		OccurredAt:  r.Timestamp,
		LastLat:     &lat,
		LastLng:     &lng,
		DedupKey:    fmt.Sprintf("power_tamper:%s:%d", truck.ID, bucketHour(r.Timestamp)),
		Payload:     raw,
	}
}

// ── §4 Sensor tampering (absence detection) ───────────────────────────────────

func detectSensorTampering(
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
) *domain.Alert {
	if prev == nil {
		return nil
	}

	prevHadFuel := prevFuelLevel(prev) != nil
	currentHasFuel := fuelLevel(r) != nil

	// Sensor was present before but vanished from this reading while the device
	// is still alive (we received a position fix).
	if !prevHadFuel || currentHasFuel {
		return nil
	}

	lastGood := prevFuelLevel(prev)
	sensorID := "fuel_primary"

	type payload struct {
		Condition      string   `json:"condition"`
		LastGoodValueL *float64 `json:"last_good_value_l"`
		SensorID       string   `json:"sensor_id"`
	}
	raw, _ := json.Marshal(payload{
		Condition:      "absent",
		LastGoodValueL: lastGood,
		SensorID:       sensorID,
	})

	lat, lng := r.Latitude, r.Longitude
	imei := truck.GalileoskyDeviceID
	return &domain.Alert{
		WorkspaceID: truck.WorkspaceID,
		Type:        domain.AlertTypeSensorTampering,
		Severity:    2,
		VehicleID:   &truck.ID,
		DeviceIMEI:  &imei,
		SensorID:    &sensorID,
		OccurredAt:  r.Timestamp,
		LastLat:     &lat,
		LastLng:     &lng,
		DedupKey:    fmt.Sprintf("sensor_tamper:%s:%s:%d", truck.ID, sensorID, bucketHour(r.Timestamp)),
		Payload:     raw,
	}
}

// ── §5 Fuel draining outside geofence ─────────────────────────────────────────

func detectFuelDrain(
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	actx AlertContext,
	cfg *domain.MonitoringConfig,
) *domain.Alert {
	newFuel := fuelLevel(r)
	if newFuel == nil || prev == nil {
		return nil
	}
	prevFuel := prevFuelLevel(prev)
	if prevFuel == nil || *prevFuel <= 0 {
		return nil
	}

	drop := *prevFuel - *newFuel
	if drop <= 0 {
		return nil
	}

	moving := r.Speed != nil && *r.Speed >= cfg.StationarySpeedKmh
	threshold := cfg.DrainDeltaStationaryPct * (*prevFuel)
	if moving {
		threshold = cfg.DrainDeltaMovingPct * (*prevFuel)
	}
	if drop < threshold {
		return nil
	}

	// Drain inside a known depot or delivery geofence is authorized — skip.
	if actx.InsideDepotGeofence || actx.InsideDeliveryGeofence {
		return nil
	}

	type payload struct {
		DropL          float64 `json:"drop_l"`
		PrevL          float64 `json:"prev_l"`
		CurrentL       float64 `json:"current_l"`
		Moving         bool    `json:"moving"`
		InsideGeofence bool    `json:"inside_geofence"`
		ActiveDelivery bool    `json:"active_delivery"`
	}
	raw, _ := json.Marshal(payload{
		DropL:          drop,
		PrevL:          *prevFuel,
		CurrentL:       *newFuel,
		Moving:         moving,
		InsideGeofence: false,
		ActiveDelivery: actx.ActiveTripID != nil,
	})

	lat, lng := r.Latitude, r.Longitude
	imei := truck.GalileoskyDeviceID
	return &domain.Alert{
		WorkspaceID: truck.WorkspaceID,
		Type:        domain.AlertTypeFuelDrainingSuspected,
		Severity:    2,
		VehicleID:   &truck.ID,
		DeviceIMEI:  &imei,
		TripID:      actx.ActiveTripID,
		OccurredAt:  r.Timestamp,
		LastLat:     &lat,
		LastLng:     &lng,
		DedupKey:    fmt.Sprintf("fuel_drain:%s:%d", truck.ID, bucketHour(r.Timestamp)),
		Payload:     raw,
	}
}

// bucketHour truncates a timestamp to the current hour boundary for dedup keys.
// Alerts that fire repeatedly within an hour collapse into one row.
func bucketHour(t time.Time) int64 {
	return t.Truncate(time.Hour).Unix()
}
