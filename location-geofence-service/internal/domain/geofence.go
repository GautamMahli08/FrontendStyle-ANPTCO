package domain

import (
	"time"

	"github.com/google/uuid"
)

// GeofenceType classifies the purpose of a circular zone.
type GeofenceType string

const (
	GeofenceTypeDepot   GeofenceType = "DEPOT"
	GeofenceTypeStation GeofenceType = "STATION"
)

// EventType records which kind of boundary crossing occurred.
type EventType string

const (
	EventTypeEnter EventType = "ENTER"
	EventTypeExit  EventType = "EXIT"
)

// Geofence is a named circular zone (depot or delivery station).
// Radii: depot ≈ 200 m, station ≈ 100–250 m (overridable via env).
type Geofence struct {
	ID           uuid.UUID    `db:"id"`
	WorkspaceID  uuid.UUID    `db:"workspace_id"`
	Type         GeofenceType `db:"type"`
	RefID        *string      `db:"ref_id"`
	Name         *string      `db:"name"`
	Latitude     float64      `db:"latitude"`
	Longitude    float64      `db:"longitude"`
	RadiusMeters int          `db:"radius_meters"`
}

// GeofenceEvent is a single, de-duplicated ENTER or EXIT transition record.
// One event is emitted per state change; subsequent readings while parked
// inside a zone produce no additional events.
type GeofenceEvent struct {
	ID           uuid.UUID    `db:"id"`
	WorkspaceID  uuid.UUID    `db:"workspace_id"`
	TruckID      uuid.UUID    `db:"truck_id"`
	TripID       *uuid.UUID   `db:"trip_id"`  // nil before migration 018 or for legacy rows
	OrderID      *uuid.UUID   `db:"order_id"` // nil for Mode B (dispatch-only) trips
	GeofenceID   uuid.UUID    `db:"geofence_id"`
	GeofenceType GeofenceType `db:"geofence_type"`
	EventType    EventType    `db:"event_type"`
	Latitude     *float64     `db:"latitude"`
	Longitude    *float64     `db:"longitude"`
	OccurredAt   time.Time    `db:"occurred_at"`
	CreatedAt    time.Time    `db:"created_at"`
}

// GeofenceInsideState tracks whether a truck is currently inside a specific
// zone. Persisted in geofence_state so detection survives Lambda cold starts.
type GeofenceInsideState struct {
	TruckID    uuid.UUID `db:"truck_id"`
	GeofenceID uuid.UUID `db:"geofence_id"`
	IsInside   bool      `db:"is_inside"`
	UpdatedAt  time.Time `db:"updated_at"`
}
