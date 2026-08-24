package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type syncedOrderRepo struct{ db *sqlx.DB }

// NewSyncedOrderRepository returns a SyncedOrderRepository backed by pool.
func NewSyncedOrderRepository(db *sqlx.DB) repository.SyncedOrderRepository {
	return &syncedOrderRepo{db: db}
}

func (r *syncedOrderRepo) IsEventSeen(ctx context.Context, workspaceID uuid.UUID, eventID string) (bool, error) {
	const q = `SELECT 1 FROM order_events WHERE workspace_id = $1 AND event_id = $2`
	var one int
	err := r.db.QueryRowContext(ctx, q, workspaceID, eventID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("synced_orders: check event %s: %w", eventID, err)
	}
	return true, nil
}

func (r *syncedOrderRepo) MarkEventSeen(ctx context.Context, workspaceID uuid.UUID, eventID string) error {
	const q = `
		INSERT INTO order_events (workspace_id, event_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`
	if _, err := r.db.ExecContext(ctx, q, workspaceID, eventID); err != nil {
		return fmt.Errorf("synced_orders: mark event seen %s: %w", eventID, err)
	}
	return nil
}

func (r *syncedOrderRepo) Upsert(ctx context.Context, o *domain.SyncedOrder) error {
	const q = `
		INSERT INTO synced_orders
		  (workspace_id, external_order_id, status, vehicle_id, trip_id,
		   product_code, quantity_ordered_l,
		   dest_lat, dest_lng, scheduled_from, scheduled_to,
		   raw, link_state)
		VALUES
		  ($1, $2, $3, $4, $5,
		   $6, $7,
		   $8, $9, $10, $11,
		   $12, $13)
		ON CONFLICT (workspace_id, external_order_id) DO UPDATE SET
		  status            = EXCLUDED.status,
		  vehicle_id        = COALESCE(EXCLUDED.vehicle_id, synced_orders.vehicle_id),
		  trip_id           = COALESCE(EXCLUDED.trip_id,    synced_orders.trip_id),
		  product_code      = COALESCE(EXCLUDED.product_code, synced_orders.product_code),
		  quantity_ordered_l = COALESCE(EXCLUDED.quantity_ordered_l, synced_orders.quantity_ordered_l),
		  dest_lat          = COALESCE(EXCLUDED.dest_lat,   synced_orders.dest_lat),
		  dest_lng          = COALESCE(EXCLUDED.dest_lng,   synced_orders.dest_lng),
		  scheduled_from    = COALESCE(EXCLUDED.scheduled_from, synced_orders.scheduled_from),
		  scheduled_to      = COALESCE(EXCLUDED.scheduled_to,   synced_orders.scheduled_to),
		  raw               = EXCLUDED.raw,
		  link_state        = EXCLUDED.link_state,
		  updated_at        = now()`

	if _, err := r.db.ExecContext(ctx, q,
		o.WorkspaceID, o.ExternalOrderID, o.Status, o.VehicleID, o.TripID,
		o.ProductCode, o.QuantityOrderedL,
		o.DestLat, o.DestLng, o.ScheduledFrom, o.ScheduledTo,
		o.Raw, o.LinkState,
	); err != nil {
		return fmt.Errorf("synced_orders: upsert %s: %w", o.ExternalOrderID, err)
	}
	return nil
}

func (r *syncedOrderRepo) FindTruckByIMEI(ctx context.Context, workspaceID uuid.UUID, imei string) (*uuid.UUID, error) {
	const q = `SELECT id FROM trucks WHERE workspace_id = $1 AND galileosky_device_id = $2`
	var id uuid.UUID
	if err := r.db.GetContext(ctx, &id, q, workspaceID, imei); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("synced_orders: find truck by imei %s: %w", imei, err)
	}
	return &id, nil
}
