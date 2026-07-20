package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type geofenceRepository struct {
	db *sqlx.DB
}

// NewGeofenceRepository returns a repository.GeofenceRepository backed by pool.
func NewGeofenceRepository(pool *sqlx.DB) repository.GeofenceRepository {
	return &geofenceRepository{db: pool}
}

func (r *geofenceRepository) FindDepotByWorkspace(ctx context.Context, workspaceID uuid.UUID) (*domain.Geofence, error) {
	const q = `
		SELECT id, workspace_id, type, ref_id, name, latitude, longitude, radius_meters
		FROM   geofences
		WHERE  workspace_id = $1 AND type = 'DEPOT'
		LIMIT  1`

	var g domain.Geofence
	if err := fromCtx(ctx, r.db).GetContext(ctx, &g, q, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("geofence: find depot for workspace %s: %w", workspaceID, err)
	}
	return &g, nil
}

func (r *geofenceRepository) FindActiveTripForTruck(ctx context.Context, truckID uuid.UUID) (*domain.ActiveTrip, error) {
	// Join geofences to read the UI-configured radius_meters so detection uses
	// the same radius the operator set when placing the destination pin.
	const q = `
		SELECT
			t.id               AS trip_id,
			t.order_id,
			oa.id              AS assignment_id,
			t.truck_id,
			t.workspace_id,
			t.status           AS trip_status,
			t.dest_geofence_id AS geofence_id,
			t.dest_lat,
			t.dest_lng,
			COALESCE(g.radius_meters, 0) AS radius_meters
		FROM  trips t
		LEFT  JOIN geofences g
		      ON  g.id = t.dest_geofence_id
		LEFT  JOIN order_assignments oa
		      ON  oa.order_id  = t.order_id
		      AND oa.truck_id  = t.truck_id
		      AND oa.status   != 'JOURNEY_COMPLETE'
		WHERE t.truck_id = $1
		  AND t.status   IN ('EN_ROUTE', 'ARRIVED', 'DELIVERY_ACCEPTED')
		ORDER BY t.created_at DESC
		LIMIT 1`

	var a domain.ActiveTrip
	if err := fromCtx(ctx, r.db).GetContext(ctx, &a, q, truckID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("geofence: find active trip for truck %s: %w", truckID, err)
	}
	return &a, nil
}

func (r *geofenceRepository) GetState(ctx context.Context, truckID, geofenceID uuid.UUID) (bool, error) {
	const q = `SELECT is_inside FROM geofence_state WHERE truck_id = $1 AND geofence_id = $2`

	var inside bool
	err := fromCtx(ctx, r.db).QueryRowContext(ctx, q, truckID, geofenceID).Scan(&inside)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil // missing row → OUTSIDE (safe default)
	}
	if err != nil {
		return false, fmt.Errorf("geofence: get state (%s, %s): %w", truckID, geofenceID, err)
	}
	return inside, nil
}

func (r *geofenceRepository) SetState(ctx context.Context, truckID, geofenceID uuid.UUID, inside bool) error {
	const q = `
		INSERT INTO geofence_state (truck_id, geofence_id, is_inside, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (truck_id, geofence_id) DO UPDATE SET
			is_inside  = EXCLUDED.is_inside,
			updated_at = now()`

	if _, err := fromCtx(ctx, r.db).ExecContext(ctx, q, truckID, geofenceID, inside); err != nil {
		return fmt.Errorf("geofence: set state (%s, %s): %w", truckID, geofenceID, err)
	}
	return nil
}
