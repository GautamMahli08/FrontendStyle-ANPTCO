package postgres

import (
	"context"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type assetEventRepository struct{ db *sqlx.DB }

func NewAssetEventRepository(pool *sqlx.DB) repository.AssetEventRepository {
	return &assetEventRepository{db: pool}
}

func (r *assetEventRepository) Insert(ctx context.Context, e *domain.AssetEvent) error {
	if e.ID == (uuid.UUID{}) {
		e.ID = uuid.New()
	}
	const q = `
		INSERT INTO asset_events
			(id, truck_id, workspace_id, event_type, latitude, longitude,
			 value_before, value_after, occurred_at)
		VALUES
			($1,$2,$3,$4,$5,$6,$7,$8,$9)`
	if _, err := r.db.ExecContext(ctx, q,
		e.ID, e.TruckID, e.WorkspaceID, e.EventType,
		e.Latitude, e.Longitude,
		e.ValueBefore, e.ValueAfter,
		e.OccurredAt,
	); err != nil {
		return fmt.Errorf("asset_event: insert %s for truck %s: %w", e.EventType, e.TruckID, err)
	}
	return nil
}

func (r *assetEventRepository) ListByTruck(ctx context.Context, truckID uuid.UUID, limit int) ([]*domain.AssetEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	const q = `
		SELECT id, truck_id, workspace_id, event_type, latitude, longitude,
		       value_before, value_after, occurred_at, created_at
		FROM   asset_events
		WHERE  truck_id = $1
		ORDER  BY occurred_at DESC
		LIMIT  $2`
	var rows []*domain.AssetEvent
	if err := r.db.SelectContext(ctx, &rows, q, truckID, limit); err != nil {
		return nil, fmt.Errorf("asset_event: list by truck %s: %w", truckID, err)
	}
	return rows, nil
}

func (r *assetEventRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.AssetEvent, error) {
	if limit <= 0 {
		limit = 200
	}
	const q = `
		SELECT id, truck_id, workspace_id, event_type, latitude, longitude,
		       value_before, value_after, occurred_at, created_at
		FROM   asset_events
		WHERE  workspace_id = $1
		ORDER  BY occurred_at DESC
		LIMIT  $2`
	var rows []*domain.AssetEvent
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID, limit); err != nil {
		return nil, fmt.Errorf("asset_event: list by workspace %s: %w", workspaceID, err)
	}
	return rows, nil
}
