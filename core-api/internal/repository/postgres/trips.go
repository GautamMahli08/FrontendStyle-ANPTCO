package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type tripRepo struct{ db *sqlx.DB }

func NewTripRepository(db *sqlx.DB) repository.TripRepository {
	return &tripRepo{db: db}
}

const tripCols = `
	id, workspace_id, truck_id, order_id, order_ref,
	driver_name, origin_name, origin_lat, origin_lng,
	dest_name, dest_lat, dest_lng, dest_geofence_id,
	source, status, compartments, fuel_loaded, fuel_delivered,
	scanned_at, created_at, updated_at`

func (r *tripRepo) Create(ctx context.Context, t *domain.Trip) error {
	const q = `
		INSERT INTO trips
		  (id, workspace_id, truck_id, order_id, order_ref,
		   driver_name, origin_name, origin_lat, origin_lng,
		   dest_name, dest_lat, dest_lng, dest_geofence_id,
		   source, status, compartments, fuel_loaded, fuel_delivered)
		VALUES
		  ($1,$2,$3,$4,$5,
		   $6,$7,$8,$9,
		   $10,$11,$12,$13,
		   $14,$15,$16,$17,$18)`

	_, err := r.db.ExecContext(ctx, q,
		t.ID, t.WorkspaceID, t.TruckID, t.OrderID, t.OrderRef,
		t.DriverName, t.OriginName, t.OriginLat, t.OriginLng,
		t.DestName, t.DestLat, t.DestLng, t.DestGeofenceID,
		t.Source, t.Status, nullJSON(t.Compartments), nullJSON(t.FuelLoaded), nullJSON(t.FuelDelivered),
	)
	if err != nil {
		return fmt.Errorf("trips: create: %w", err)
	}
	return nil
}

func (r *tripRepo) GetByID(ctx context.Context, id, workspaceID uuid.UUID) (*domain.Trip, error) {
	const q = `SELECT ` + tripCols + ` FROM trips WHERE id = $1 AND workspace_id = $2`
	var t domain.Trip
	if err := r.db.GetContext(ctx, &t, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trips: get %s: %w", id, err)
	}
	return &t, nil
}

func (r *tripRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Trip, error) {
	const q = `SELECT ` + tripCols + ` FROM trips WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`
	var rows []*domain.Trip
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID, limit); err != nil {
		return nil, fmt.Errorf("trips: list: %w", err)
	}
	return rows, nil
}

func (r *tripRepo) GetByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.Trip, error) {
	const q = `SELECT ` + tripCols + ` FROM trips WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`
	var t domain.Trip
	if err := r.db.GetContext(ctx, &t, q, orderID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trips: get by order %s: %w", orderID, err)
	}
	return &t, nil
}

func (r *tripRepo) UpdateStatus(ctx context.Context, tripID uuid.UUID, status domain.TripStatus) error {
	const q = `UPDATE trips SET status = $2, updated_at = now() WHERE id = $1`
	if _, err := r.db.ExecContext(ctx, q, tripID, status); err != nil {
		return fmt.Errorf("trips: update status %s: %w", tripID, err)
	}
	return nil
}

func (r *tripRepo) ScanDelivery(ctx context.Context, tripID, workspaceID uuid.UUID, fuelDelivered map[string]float64) error {
	var fuelJSON interface{}
	if len(fuelDelivered) > 0 {
		b, err := json.Marshal(fuelDelivered)
		if err != nil {
			return fmt.Errorf("trips: marshal fuel_delivered: %w", err)
		}
		fuelJSON = b
	}
	const q = `
		UPDATE trips
		SET    status = 'DELIVERY_ACCEPTED',
		       scanned_at = now(),
		       fuel_delivered = COALESCE($3, fuel_delivered),
		       updated_at = now()
		WHERE  id = $1
		  AND  workspace_id = $2
		  AND  status = 'ARRIVED'`
	res, err := r.db.ExecContext(ctx, q, tripID, workspaceID, fuelJSON)
	if err != nil {
		return fmt.Errorf("trips: scan delivery %s: %w", tripID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return repository.ErrWrongStatus
	}
	return nil
}

func (r *tripRepo) GetByWorkspaceAndOrderRef(ctx context.Context, workspaceID uuid.UUID, orderRef string) (*domain.Trip, error) {
	const q = `SELECT ` + tripCols + ` FROM trips WHERE workspace_id = $1 AND order_ref = $2 LIMIT 1`
	var t domain.Trip
	if err := r.db.GetContext(ctx, &t, q, workspaceID, orderRef); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trips: get by workspace+orderref: %w", err)
	}
	return &t, nil
}

// nullJSON returns nil when b is empty so the DB column stays NULL.
func nullJSON(b domain.JSONB) interface{} {
	if len(b) == 0 {
		return nil
	}
	return []byte(b)
}
