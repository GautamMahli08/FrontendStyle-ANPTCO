package postgres

import (
	"context"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/jmoiron/sqlx"
)

type geofenceEventRepository struct {
	db *sqlx.DB
}

// NewGeofenceEventRepository returns a repository.GeofenceEventRepository backed by pool.
func NewGeofenceEventRepository(pool *sqlx.DB) repository.GeofenceEventRepository {
	return &geofenceEventRepository{db: pool}
}

func (r *geofenceEventRepository) Insert(ctx context.Context, evt *domain.GeofenceEvent) error {
	const q = `
		INSERT INTO geofence_events (
			workspace_id, truck_id, trip_id, order_id, geofence_id,
			geofence_type, event_type, latitude, longitude, occurred_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

	_, err := fromCtx(ctx, r.db).ExecContext(ctx, q,
		evt.WorkspaceID, evt.TruckID, evt.TripID, evt.OrderID, evt.GeofenceID,
		evt.GeofenceType, evt.EventType, evt.Latitude, evt.Longitude, evt.OccurredAt,
	)
	if err != nil {
		return fmt.Errorf("geofence_event: insert for truck %s: %w", evt.TruckID, err)
	}
	return nil
}
