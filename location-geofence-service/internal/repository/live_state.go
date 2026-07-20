package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// LiveStateRepository manages the truck_live_state table — one row per truck
// holding the latest known position for O(1) "where is truck X now" reads.
// Implementations must be safe for concurrent use and must propagate any
// transaction present in ctx.
type LiveStateRepository interface {
	// Upsert writes s only when s.LastMessageAt is strictly newer than the
	// value already stored for the truck (or when no row exists yet).
	// Returns true when the row was actually inserted or updated; false means
	// the incoming reading was stale or a duplicate and was silently discarded.
	Upsert(ctx context.Context, s *domain.TruckLiveState) (updated bool, err error)

	// Get returns the current live state for a truck, or nil when no row exists.
	Get(ctx context.Context, truckID uuid.UUID) (*domain.TruckLiveState, error)
}
