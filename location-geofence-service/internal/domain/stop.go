package domain

import (
	"time"

	"github.com/google/uuid"
)

// VehicleStop is a recorded period during which a truck was stationary.
//
// Lifecycle:
//   - Open candidate: EndedAt == nil, written on the first stationary reading.
//   - Finalized: EndedAt set when movement resumes and duration ≥ MinStopDurationS.
//   - Discarded: deleted when movement resumes but duration < MinStopDurationS.
//
// The DedupKey is set at creation ("stop:{vehicleID}:{startedAt_unix}") so
// subsequent upserts update the same row rather than inserting duplicates.
type VehicleStop struct {
	ID             uuid.UUID  `db:"id"              json:"id"`
	WorkspaceID    uuid.UUID  `db:"workspace_id"    json:"workspace_id"`
	VehicleID      uuid.UUID  `db:"vehicle_id"      json:"vehicle_id"`
	TripID         *uuid.UUID `db:"trip_id"         json:"trip_id,omitempty"`
	Lat            float64    `db:"lat"             json:"lat"`
	Lng            float64    `db:"lng"             json:"lng"`
	StartedAt      time.Time  `db:"started_at"      json:"started_at"`
	EndedAt        *time.Time `db:"ended_at"        json:"ended_at,omitempty"`
	DurationS      *int       `db:"duration_s"      json:"duration_s,omitempty"`
	InsideGeofence bool       `db:"inside_geofence" json:"inside_geofence"`
	GeofenceID     *uuid.UUID `db:"geofence_id"     json:"geofence_id,omitempty"`
	GeofenceName   *string    `db:"geofence_name"   json:"geofence_name,omitempty"`
	Classification string     `db:"classification"  json:"classification"` // NORMAL | SUSPICIOUS
	Reasons        []string   `db:"reasons"         json:"reasons"`
	DedupKey       string     `db:"dedup_key"       json:"dedup_key"`
}
