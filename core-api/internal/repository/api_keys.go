package repository

import (
	"context"
	"errors"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

// ErrAlreadyAssigned is returned when attempting to assign a device or sensor
// that is already bound to a truck, or binding a truck that already has one.
var ErrAlreadyAssigned = errors.New("already assigned")

// ErrMaxKeysReached is returned when a workspace already has 2 ACTIVE keys.
var ErrMaxKeysReached = errors.New("maximum of 2 active API keys reached")

// APIKeyRepository manages dispatch_api_keys for Mode B workspaces.
type APIKeyRepository interface {
	// ListKeys returns all API keys for the workspace (active and revoked).
	ListKeys(ctx context.Context, workspaceID uuid.UUID) ([]*domain.DispatchAPIKey, error)

	// CreateKey generates a new random key, stores its SHA-256 hash, and returns
	// the DispatchAPIKey with RawKey populated (only time the raw value is available).
	// Returns ErrMaxKeysReached when the workspace already has 2 ACTIVE keys.
	CreateKey(ctx context.Context, workspaceID uuid.UUID, description *string, actorID string) (*domain.DispatchAPIKey, error)

	// RevokeKey marks a key REVOKED. actorID is recorded in revoked_by.
	// Returns nil if the key was already revoked (idempotent).
	RevokeKey(ctx context.Context, keyID uuid.UUID, actorID string) error

	// GetWorkspaceByKeyHash returns the workspace for an active key hash, or nil.
	// Also updates last_used_at on the matching key row.
	GetWorkspaceByKeyHash(ctx context.Context, keyHash string) (*domain.Workspace, error)
}
