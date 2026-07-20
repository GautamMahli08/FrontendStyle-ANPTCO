package domain

import (
	"time"

	"github.com/google/uuid"
)

type GeofenceType string

const (
	GeofenceTypeStation GeofenceType = "STATION"
	GeofenceTypeDepot   GeofenceType = "DEPOT"
)

// Geofence is a named geographic zone stored in the shared geofences table.
// STATION rows are owned by CLIENT workspaces (delivery destinations).
// DEPOT rows are owned by TSP workspaces (truck home bases).
type Geofence struct {
	ID           uuid.UUID    `db:"id"            json:"id"`
	WorkspaceID  uuid.UUID    `db:"workspace_id"  json:"workspace_id"`
	Type         GeofenceType `db:"type"          json:"type"`
	RefID        *string      `db:"ref_id"        json:"ref_id,omitempty"`
	Name         string       `db:"name"          json:"name"`
	Latitude     float64      `db:"latitude"      json:"latitude"`
	Longitude    float64      `db:"longitude"     json:"longitude"`
	RadiusMeters int          `db:"radius_meters" json:"radius_meters"`
	CreatedAt    time.Time    `db:"created_at"    json:"created_at"`
}

type CreateStationInput struct {
	Name         string  `json:"name"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	RadiusMeters int     `json:"radius_meters"`
}

type CreateDepotInput struct {
	Name         string  `json:"name"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	RadiusMeters int     `json:"radius_meters"`
}
