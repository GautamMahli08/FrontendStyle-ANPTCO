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

type geofenceRepo struct{ db *sqlx.DB }

func NewGeofenceRepository(db *sqlx.DB) repository.GeofenceRepository {
	return &geofenceRepo{db: db}
}

func (r *geofenceRepo) Create(ctx context.Context, g *domain.Geofence) error {
	const q = `
		INSERT INTO geofences (workspace_id, type, ref_id, name, latitude, longitude, radius_meters)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, q,
		g.WorkspaceID, g.Type, g.RefID, g.Name,
		g.Latitude, g.Longitude, g.RadiusMeters,
	).Scan(&g.ID, &g.CreatedAt)
}

func (r *geofenceRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, gtype domain.GeofenceType) ([]*domain.Geofence, error) {
	const q = `
		SELECT id, workspace_id, type, ref_id, name, latitude, longitude, radius_meters, created_at
		FROM   geofences
		WHERE  workspace_id = $1 AND type = $2
		ORDER  BY created_at DESC`
	var rows []*domain.Geofence
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID, gtype); err != nil {
		return nil, fmt.Errorf("geofences: list: %w", err)
	}
	return rows, nil
}

func (r *geofenceRepo) GetByRefID(ctx context.Context, refID string) (*domain.Geofence, error) {
	const q = `
		SELECT id, workspace_id, type, ref_id, name, latitude, longitude, radius_meters, created_at
		FROM   geofences
		WHERE  ref_id = $1 AND type = 'STATION'
		LIMIT  1`
	var g domain.Geofence
	if err := r.db.GetContext(ctx, &g, q, refID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("geofences: get by ref_id %s: %w", refID, err)
	}
	return &g, nil
}

func (r *geofenceRepo) GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Geofence, error) {
	const q = `
		SELECT id, workspace_id, type, ref_id, name, latitude, longitude, radius_meters, created_at
		FROM   geofences
		WHERE  id = $1 AND workspace_id = $2`
	var g domain.Geofence
	if err := r.db.GetContext(ctx, &g, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("geofences: get %s: %w", id, err)
	}
	return &g, nil
}
