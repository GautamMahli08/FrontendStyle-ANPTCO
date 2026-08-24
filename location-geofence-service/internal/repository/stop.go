package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// StopRepository persists vehicle stop candidates and finalized stops.
// The open/finalize/discard lifecycle is driven by the events.ProcessStop
// pure function; this interface handles only the DB side.
type StopRepository interface {
	// Upsert inserts a new open stop candidate or updates the existing row
	// (identified by dedup_key) with finalization data.
	Upsert(ctx context.Context, s *domain.VehicleStop) error

	// GetOpen returns the current open stop (ended_at IS NULL) for the vehicle,
	// or nil when no candidate exists. At most one open stop exists per vehicle.
	GetOpen(ctx context.Context, vehicleID uuid.UUID) (*domain.VehicleStop, error)

	// DeleteOpen removes the open candidate when it is too short to record.
	DeleteOpen(ctx context.Context, vehicleID uuid.UUID) error
}
