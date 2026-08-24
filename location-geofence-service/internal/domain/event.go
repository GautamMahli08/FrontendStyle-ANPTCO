package domain

import (
	"time"

	"github.com/google/uuid"
)

type AssetEventType string

const (
	AssetEventFuelFill      AssetEventType = "FUEL_FILL"
	AssetEventFuelDrain     AssetEventType = "FUEL_DRAIN"
	AssetEventFuelTheft     AssetEventType = "FUEL_THEFT" // drain while stationary/ignition-off → suspected theft
	AssetEventBatteryOn     AssetEventType = "BATTERY_ON"
	AssetEventBatteryOff    AssetEventType = "BATTERY_OFF"
	AssetEventIgnitionOn    AssetEventType = "IGNITION_ON"
	AssetEventIgnitionOff   AssetEventType = "IGNITION_OFF"
	AssetEventMovementStart AssetEventType = "MOVEMENT_START"
	AssetEventMovementStop  AssetEventType = "MOVEMENT_STOP"
)

// AssetEvent records a detected state transition for a truck.
// value_before / value_after carry the numeric context relevant to the event:
//   - FUEL_*:     fuel level in litres
//   - BATTERY_*:  external power voltage in volts
//   - MOVEMENT_*: speed in km/h
//   - IGNITION_*: nil (boolean transition, no numeric value needed)
type AssetEvent struct {
	ID          uuid.UUID      `db:"id"           json:"id"`
	TruckID     uuid.UUID      `db:"truck_id"     json:"truck_id"`
	WorkspaceID uuid.UUID      `db:"workspace_id" json:"workspace_id"`
	EventType   AssetEventType `db:"event_type"   json:"event_type"`
	Latitude    *float64       `db:"latitude"     json:"latitude,omitempty"`
	Longitude   *float64       `db:"longitude"    json:"longitude,omitempty"`
	ValueBefore *float64       `db:"value_before" json:"value_before,omitempty"`
	ValueAfter  *float64       `db:"value_after"  json:"value_after,omitempty"`
	OccurredAt  time.Time      `db:"occurred_at"  json:"occurred_at"`
	CreatedAt   time.Time      `db:"created_at"   json:"created_at"`
}
