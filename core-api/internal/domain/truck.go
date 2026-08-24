package domain

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type TruckStatus string

const (
	TruckStatusIdle    TruckStatus = "IDLE"
	TruckStatusEnRoute TruckStatus = "EN_ROUTE"
)

// JSONB scans nullable PostgreSQL JSONB columns and marshals the raw JSON
// verbatim (not base64). A nil JSONB means the column was NULL.
type JSONB []byte

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	switch v := value.(type) {
	case []byte:
		*j = append(JSONB(nil), v...)
	case string:
		*j = JSONB(v)
	default:
		return fmt.Errorf("JSONB.Scan: unsupported type %T", value)
	}
	return nil
}

func (j JSONB) MarshalJSON() ([]byte, error) {
	if j == nil {
		return []byte("null"), nil
	}
	return []byte(j), nil
}

type Truck struct {
	ID          uuid.UUID   `db:"id"                    json:"id"`
	WorkspaceID uuid.UUID   `db:"workspace_id"          json:"workspace_id"`
	DeviceID    string      `db:"galileosky_device_id"  json:"device_id"`
	Status      TruckStatus `db:"status"                json:"status"`
	CreatedAt   time.Time   `db:"created_at"            json:"created_at"`
	QRUrl       *string     `db:"qr_url"                json:"qr_url,omitempty"`
}

// TruckPosition holds the latest known GPS fix and fuel state for a truck.
type TruckPosition struct {
	TruckID         uuid.UUID   `db:"truck_id"          json:"truck_id"`
	Latitude        *float64    `db:"latitude"          json:"latitude"`
	Longitude       *float64    `db:"longitude"         json:"longitude"`
	Speed           *int        `db:"speed"             json:"speed"`
	LastMessageAt   *time.Time  `db:"last_message_at"   json:"last_message_at"`
	TotalFuelLiters *float64    `db:"total_fuel_liters" json:"total_fuel_liters,omitempty"`
	CompartmentFuel JSONB       `db:"compartment_fuel"  json:"compartment_fuel,omitempty"`
}

// FuelReading is one time-stamped fuel snapshot from truck_telemetry,
// returned by GET /v1/trucks/{id}/fuel-history.
type FuelReading struct {
	Timestamp       time.Time          `db:"timestamp"           json:"timestamp"`
	CompartmentFuel map[string]float64 `db:"-"                   json:"compartment_fuel,omitempty"`
	TotalFuelLiters *float64           `db:"total_fuel_liters"   json:"total_fuel_liters,omitempty"`
	// rawSensors is populated by the DB scan and decoded into CompartmentFuel.
	RawSensors JSONB `db:"compartment_sensors" json:"-"`
}

// TruckWithPosition is the combined response returned by GET /v1/trucks.
type TruckWithPosition struct {
	ID              uuid.UUID   `db:"id"                json:"id"`
	WorkspaceID     uuid.UUID   `db:"workspace_id"      json:"workspace_id"`
	DeviceID        string      `db:"device_id"         json:"device_id"`
	Status          TruckStatus `db:"status"            json:"status"`
	CreatedAt       time.Time   `db:"created_at"        json:"created_at"`
	Latitude        *float64    `db:"latitude"          json:"latitude"`
	Longitude       *float64    `db:"longitude"         json:"longitude"`
	Speed           *int        `db:"speed"             json:"speed"`
	LastSeenAt      *time.Time  `db:"last_seen_at"      json:"last_seen_at"`
	TotalFuelLiters *float64    `db:"total_fuel_liters" json:"total_fuel_liters,omitempty"`
	CompartmentFuel JSONB       `db:"compartment_fuel"  json:"compartment_fuel,omitempty"`
}
