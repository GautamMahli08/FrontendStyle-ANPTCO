package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
)

type WorkspaceRepository interface {
	// ListSellers returns all workspaces with type = SELLER.
	ListSellers(ctx context.Context) ([]*domain.Workspace, error)

	// Upsert inserts a workspace row if the id doesn't exist yet.
	// Used by the invite handler to ensure the workspace record exists.
	Upsert(ctx context.Context, id, slug, name string, wtype domain.WorkspaceType) error

	// GetByID returns a workspace by its UUID string, or nil when not found.
	// Includes the modules JSONB column.
	GetByID(ctx context.Context, id string) (*domain.Workspace, error)

	// GetByDispatchKey looks up a workspace by its dispatch_api_key.
	// Returns nil when the key is not found (caller should return 401).
	GetByDispatchKey(ctx context.Context, key string) (*domain.Workspace, error)
}
