package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Truck is a vehicle record from the trucks master table.
type Truck struct {
	ID                 uuid.UUID `db:"id"`
	WorkspaceID        uuid.UUID `db:"workspace_id"`
	GalileoskyDeviceID string    `db:"galileosky_device_id"`
	Status             string    `db:"status"`
}

// TruckLiveState is the single-row-per-truck latest known position.
// Written via upsert only when the incoming device timestamp is strictly newer
// than last_message_at — the primary guard against out-of-order delivery.
type TruckLiveState struct {
	TruckID              uuid.UUID       `db:"truck_id"`
	WorkspaceID          uuid.UUID       `db:"workspace_id"`
	Latitude             *float64        `db:"latitude"`
	Longitude            *float64        `db:"longitude"`
	Speed                *int            `db:"speed"`
	TotalFuelLiters      *float64        `db:"total_fuel_liters"`
	ExternalPowerVoltage *float64        `db:"external_power_voltage"`
	IgnitionOn           *bool           `db:"ignition_on"`
	CompartmentFuel      json.RawMessage `db:"compartment_fuel"`
	LastMessageAt        *time.Time      `db:"last_message_at"`
	UpdatedAt            time.Time       `db:"updated_at"`
}

// TruckTelemetry is one append-only row in the partitioned history table.
// Duplicate messages are accepted; callers that require uniqueness should add
// a unique index on (truck_id, timestamp).
type TruckTelemetry struct {
	ID                   uuid.UUID       `db:"id"`
	TruckID              uuid.UUID       `db:"truck_id"`
	WorkspaceID          uuid.UUID       `db:"workspace_id"`
	Timestamp            time.Time       `db:"timestamp"`
	Latitude             float64         `db:"latitude"`
	Longitude            float64         `db:"longitude"`
	Speed                *int            `db:"speed"`
	IgnitionOn           *bool           `db:"ignition_on"`
	CompartmentSensors   json.RawMessage `db:"compartment_sensors"`
	TotalFuelLiters      *float64        `db:"total_fuel_liters"`
	ExternalPowerVoltage *float64        `db:"external_power_voltage"`
	CreatedAt            time.Time       `db:"created_at"`
}
