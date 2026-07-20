package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// GeofenceRepository manages zone definitions and the per-(truck, geofence)
// inside/outside state that makes detection stateful.
// Implementations must be safe for concurrent use and must propagate any
// transaction present in ctx.
type GeofenceRepository interface {
	// FindDepotByWorkspace returns the DEPOT zone for the workspace.
	// Returns (nil, nil) when none has been configured.
	FindDepotByWorkspace(ctx context.Context, workspaceID uuid.UUID) (*domain.Geofence, error)

	// FindActiveTripForTruck returns the current active trip and its resolved
	// destination geofence for the given truck.
	// Returns (nil, nil) when the truck has no active trip.
	FindActiveTripForTruck(ctx context.Context, truckID uuid.UUID) (*domain.ActiveTrip, error)

	// GetState returns whether the truck is currently recorded as inside the zone.
	// Returns false (OUTSIDE) when no state row exists — the safe default that
	// may generate one spurious ENTER on the next reading, but never a false EXIT.
	GetState(ctx context.Context, truckID, geofenceID uuid.UUID) (bool, error)

	// SetState persists the truck's inside/outside state for the zone.
	// Must be called within the same transaction as InsertEvent so the two
	// writes are atomic (see repository.Transactor).
	SetState(ctx context.Context, truckID, geofenceID uuid.UUID, inside bool) error
}
