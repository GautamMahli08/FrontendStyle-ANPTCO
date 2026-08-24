// Package events contains pure detection logic for asset state transitions.
// It has no database dependency — it compares a previous live state against
// a new telemetry reading and returns any events that should be recorded.
package events

import (
	"encoding/json"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// Thresholds for event detection.
const (
	fuelChangeLiters    = 3.0 // minimum litre delta to classify as fill or drain
	powerOnVolts        = 10.0 // voltage above which external power is considered connected
	powerOffVolts       = 5.0  // voltage below which external power is considered disconnected
	movementSpeedKmh    = 5    // speed (km/h) above which truck is considered moving
)

// Detect compares prev (the live state before this reading) against r (the
// incoming reading) and returns every transition that occurred.
// prev may be nil when this is the truck's very first reading.
func Detect(
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	ts time.Time,
) []*domain.AssetEvent {
	var events []*domain.AssetEvent

	lat := &r.Latitude
	lon := &r.Longitude

	mk := func(t domain.AssetEventType, before, after *float64) *domain.AssetEvent {
		return &domain.AssetEvent{
			TruckID:     truck.ID,
			WorkspaceID: truck.WorkspaceID,
			EventType:   t,
			Latitude:    lat,
			Longitude:   lon,
			ValueBefore: before,
			ValueAfter:  after,
			OccurredAt:  ts,
		}
	}

	f64 := func(v float64) *float64 { return &v }

	// ── Fuel level (total or first compartment) ───────────────────────────────
	newFuel := fuelLevel(r)
	if newFuel != nil {
		var prevFuel *float64
		if prev != nil {
			prevFuel = prevFuelLevel(prev)
		}
		if prevFuel != nil {
			delta := *newFuel - *prevFuel
			if delta >= fuelChangeLiters {
				events = append(events, mk(domain.AssetEventFuelFill, f64(*prevFuel), f64(*newFuel)))
			} else if delta <= -fuelChangeLiters {
				// Theft: drain while ignition off AND truck not moving.
				// Normal consumption happens with ignition on and speed > 0.
				ignOff := r.IgnitionOn == nil || !*r.IgnitionOn
				stationary := r.Speed == nil || *r.Speed < movementSpeedKmh
				if ignOff && stationary {
					events = append(events, mk(domain.AssetEventFuelTheft, f64(*prevFuel), f64(*newFuel)))
				} else {
					events = append(events, mk(domain.AssetEventFuelDrain, f64(*prevFuel), f64(*newFuel)))
				}
			}
		}
	}

	// ── External power / battery ──────────────────────────────────────────────
	if r.ExternalPowerVoltage != nil {
		newV := *r.ExternalPowerVoltage
		var prevV *float64
		if prev != nil {
			prevV = prev.ExternalPowerVoltage
		}
		nowOn := newV >= powerOnVolts
		wasOn := prevV != nil && *prevV >= powerOnVolts

		if nowOn && !wasOn {
			var before *float64
			if prevV != nil {
				before = f64(*prevV)
			}
			events = append(events, mk(domain.AssetEventBatteryOn, before, f64(newV)))
		} else if !nowOn && newV < powerOffVolts && wasOn {
			events = append(events, mk(domain.AssetEventBatteryOff, f64(*prevV), f64(newV)))
		}
	}

	// ── Ignition ──────────────────────────────────────────────────────────────
	if r.IgnitionOn != nil {
		newIgn := *r.IgnitionOn
		var prevIgn *bool
		if prev != nil {
			prevIgn = prev.IgnitionOn
		}
		wasOn := prevIgn != nil && *prevIgn
		if newIgn && !wasOn {
			events = append(events, mk(domain.AssetEventIgnitionOn, nil, nil))
		} else if !newIgn && wasOn {
			events = append(events, mk(domain.AssetEventIgnitionOff, nil, nil))
		}
	}

	// ── Movement ──────────────────────────────────────────────────────────────
	if r.Speed != nil {
		newSpeed := *r.Speed
		prevSpeed := 0
		if prev != nil && prev.Speed != nil {
			prevSpeed = *prev.Speed
		}
		wasMoving := prevSpeed >= movementSpeedKmh
		nowMoving := newSpeed >= movementSpeedKmh

		if nowMoving && !wasMoving {
			events = append(events, mk(domain.AssetEventMovementStart, f64(float64(prevSpeed)), f64(float64(newSpeed))))
		} else if !nowMoving && wasMoving {
			events = append(events, mk(domain.AssetEventMovementStop, f64(float64(prevSpeed)), f64(float64(newSpeed))))
		}
	}

	return events
}

// fuelLevel returns the best available fuel level from the reading:
// total_fuel_liters first, then the first compartment sensor value.
func fuelLevel(r *domain.TelemetryReading) *float64 {
	if r.TotalFuelLiters != nil {
		return r.TotalFuelLiters
	}
	for _, v := range r.CompartmentFuel {
		return &v
	}
	return nil
}

// prevFuelLevel mirrors fuelLevel but reads from the live state row.
// CompartmentFuel is stored as JSON (e.g. {"1": 45.2}) in the DB column.
func prevFuelLevel(s *domain.TruckLiveState) *float64 {
	if s.TotalFuelLiters != nil {
		return s.TotalFuelLiters
	}
	if len(s.CompartmentFuel) == 0 {
		return nil
	}
	var m map[string]float64
	if err := json.Unmarshal(s.CompartmentFuel, &m); err != nil {
		return nil
	}
	for _, v := range m {
		return &v
	}
	return nil
}
