package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/jmoiron/sqlx"
)

type workspaceRepo struct{ db *sqlx.DB }

func NewWorkspaceRepository(db *sqlx.DB) repository.WorkspaceRepository {
	return &workspaceRepo{db: db}
}

func (r *workspaceRepo) ListSellers(ctx context.Context) ([]*domain.Workspace, error) {
	const q = `
		SELECT id::text, slug, name, type, seller_code, created_at
		FROM   workspaces
		WHERE  type IN ('SELLER', 'PLATFORM') OR seller_code IS NOT NULL
		ORDER  BY name`
	var rows []*domain.Workspace
	if err := r.db.SelectContext(ctx, &rows, q); err != nil {
		return nil, fmt.Errorf("workspaces: list sellers: %w", err)
	}
	return rows, nil
}

func (r *workspaceRepo) Upsert(ctx context.Context, id, slug, name string, wtype domain.WorkspaceType) error {
	const q = `
		INSERT INTO workspaces (id, slug, name, type)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type`
	if _, err := r.db.ExecContext(ctx, q, id, slug, name, wtype); err != nil {
		return fmt.Errorf("workspaces: upsert: %w", err)
	}
	return nil
}

func (r *workspaceRepo) GetByID(ctx context.Context, id string) (*domain.Workspace, error) {
	const q = `
		SELECT id::text, slug, name, type, seller_code, modules, is_sandbox, created_at
		FROM   workspaces
		WHERE  id = $1`
	var w domain.Workspace
	if err := r.db.GetContext(ctx, &w, q, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("workspaces: get %s: %w", id, err)
	}
	return &w, nil
}

func (r *workspaceRepo) GetByDispatchKey(ctx context.Context, key string) (*domain.Workspace, error) {
	const q = `
		SELECT id::text, slug, name, type, seller_code, modules, is_sandbox, created_at
		FROM   workspaces
		WHERE  dispatch_api_key = $1`
	var w domain.Workspace
	if err := r.db.GetContext(ctx, &w, q, key); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("workspaces: get by dispatch key: %w", err)
	}
	return &w, nil
}
