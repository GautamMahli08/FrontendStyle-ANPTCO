package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AlertType classifies the kind of anomaly or sync failure that was detected.
type AlertType string

const (
	AlertTypeOrderSyncFailure        AlertType = "ORDER_SYNC_FAILURE"
	AlertTypeSuspectedDelivery       AlertType = "SUSPECTED_DELIVERY"
	AlertTypeSuspiciousStop          AlertType = "SUSPICIOUS_STOP"
	AlertTypeSensorTampering         AlertType = "SENSOR_TAMPERING"
	AlertTypeFuelDrainingSuspected   AlertType = "FUEL_DRAINING_SUSPECTED"
	AlertTypeExternalPowerTampering  AlertType = "EXTERNAL_POWER_TAMPERING"
)

// AlertStatus tracks the lifecycle of an alert through the operations workflow.
type AlertStatus string

const (
	AlertStatusOpen          AlertStatus = "OPEN"
	AlertStatusAcknowledged  AlertStatus = "ACKNOWLEDGED"
	AlertStatusResolved      AlertStatus = "RESOLVED"
	AlertStatusFalsePositive AlertStatus = "FALSE_POSITIVE"
)

// Alert is a de-duplicated, actionable signal raised by a detection subsystem.
// Multiple raw telemetry anomalies within the same time window for the same
// vehicle collapse into one alert via the unique dedup_key.
type Alert struct {
	ID          uuid.UUID       `db:"id"           json:"id"`
	WorkspaceID uuid.UUID       `db:"workspace_id" json:"workspace_id"`
	Type        AlertType       `db:"type"         json:"type"`
	Status      AlertStatus     `db:"status"       json:"status"`
	Severity    int             `db:"severity"     json:"severity"` // 1 critical .. 5 info
	VehicleID   *uuid.UUID      `db:"vehicle_id"   json:"vehicle_id,omitempty"`
	DeviceIMEI  *string         `db:"device_imei"  json:"device_imei,omitempty"`
	TripID      *uuid.UUID      `db:"trip_id"      json:"trip_id,omitempty"`
	OrderID     *uuid.UUID      `db:"order_id"     json:"order_id,omitempty"`
	SensorID    *string         `db:"sensor_id"    json:"sensor_id,omitempty"`
	OccurredAt  time.Time       `db:"occurred_at"  json:"occurred_at"`
	DetectedAt  time.Time       `db:"detected_at"  json:"detected_at"`
	LastLat     *float64        `db:"last_lat"     json:"last_lat,omitempty"`
	LastLng     *float64        `db:"last_lng"     json:"last_lng,omitempty"`
	GeofenceID  *uuid.UUID      `db:"geofence_id"  json:"geofence_id,omitempty"`
	Confidence  *float64        `db:"confidence"   json:"confidence,omitempty"`
	DedupKey    string          `db:"dedup_key"    json:"dedup_key"`
	Payload     json.RawMessage `db:"payload"      json:"payload"`
}

// MonitoringConfig holds per-workspace (or per-vehicle) detection thresholds.
// The repository returns DefaultMonitoringConfig when no row exists.
type MonitoringConfig struct {
	WorkspaceID             uuid.UUID  `db:"workspace_id"`
	VehicleID               *uuid.UUID `db:"vehicle_id"`
	FuelChangeL             float64    `db:"fuel_change_l"`
	StationarySpeedKmh      int        `db:"stationary_speed_kmh"`
	MinStopDurationS        int        `db:"min_stop_duration_s"`
	SuspiciousStopDurationS int        `db:"suspicious_stop_duration_s"`
	DrainWindowS            int        `db:"drain_window_s"`
	DrainDeltaStationaryPct float64    `db:"drain_delta_stationary_pct"`
	DrainDeltaMovingPct     float64    `db:"drain_delta_moving_pct"`
	PowerLossDebounceS      int        `db:"power_loss_debounce_s"`
	SensorMissWindowS       int        `db:"sensor_miss_window_s"`
	PowerMode               string     `db:"power_mode"` // "constant" | "ignition_switched"
}

// DefaultMonitoringConfig returns safe default thresholds when no DB row exists.
func DefaultMonitoringConfig(workspaceID uuid.UUID) *MonitoringConfig {
	return &MonitoringConfig{
		WorkspaceID:             workspaceID,
		FuelChangeL:             3.0,
		StationarySpeedKmh:      3,
		MinStopDurationS:        180,
		SuspiciousStopDurationS: 900,
		DrainWindowS:            180,
		DrainDeltaStationaryPct: 0.05,
		DrainDeltaMovingPct:     0.15,
		PowerLossDebounceS:      30,
		SensorMissWindowS:       120,
		PowerMode:               "constant",
	}
}
