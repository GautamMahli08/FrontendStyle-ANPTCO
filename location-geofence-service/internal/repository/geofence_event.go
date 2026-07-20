package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// GeofenceEventRepository records ENTER/EXIT boundary transitions.
// Every call to Insert must happen inside the same transaction as the
// corresponding GeofenceRepository.SetState call so that the event record and
// the updated inside/outside state are always consistent.
// Implementations must be safe for concurrent use and must propagate any
// transaction present in ctx.
type GeofenceEventRepository interface {
	// Insert appends one geofence event. The caller is responsible for
	// ensuring evt.TruckID, evt.GeofenceID, evt.EventType, and evt.OccurredAt
	// are populated.
	Insert(ctx context.Context, evt *domain.GeofenceEvent) error
}
