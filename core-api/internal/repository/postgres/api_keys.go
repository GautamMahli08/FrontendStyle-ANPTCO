package postgres

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type apiKeyRepo struct{ db *sqlx.DB }

func NewAPIKeyRepository(db *sqlx.DB) repository.APIKeyRepository {
	return &apiKeyRepo{db: db}
}

func (r *apiKeyRepo) ListKeys(ctx context.Context, workspaceID uuid.UUID) ([]*domain.DispatchAPIKey, error) {
	const q = `
		SELECT id, workspace_id, description, status, created_by, revoked_by,
		       created_at, revoked_at, last_used_at
		FROM   dispatch_api_keys
		WHERE  workspace_id=$1
		ORDER  BY created_at DESC`
	var rows []*domain.DispatchAPIKey
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("api_keys: list: %w", err)
	}
	return rows, nil
}

func (r *apiKeyRepo) CreateKey(ctx context.Context, workspaceID uuid.UUID, description *string, actorID string) (*domain.DispatchAPIKey, error) {
	// Enforce max 2 active keys.
	var activeCount int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM dispatch_api_keys WHERE workspace_id=$1 AND status='ACTIVE'`,
		workspaceID,
	).Scan(&activeCount); err != nil {
		return nil, fmt.Errorf("api_keys: create: count active: %w", err)
	}
	if activeCount >= 2 {
		return nil, repository.ErrMaxKeysReached
	}

	// Generate 32 random bytes → hex string (64 chars).
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return nil, fmt.Errorf("api_keys: create: rand: %w", err)
	}
	rawKey := "dk_" + hex.EncodeToString(rawBytes)

	// SHA-256 hash to store.
	sum := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(sum[:])

	key := &domain.DispatchAPIKey{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Description: description,
		Status:      "ACTIVE",
		CreatedBy:   actorID,
	}

	const q = `
		INSERT INTO dispatch_api_keys (id, workspace_id, key_hash, description, created_by)
		VALUES ($1,$2,$3,$4,$5)`
	if _, err := r.db.ExecContext(ctx, q, key.ID, key.WorkspaceID, keyHash, key.Description, key.CreatedBy); err != nil {
		return nil, fmt.Errorf("api_keys: create: insert: %w", err)
	}

	key.RawKey = &rawKey
	return key, nil
}

func (r *apiKeyRepo) RevokeKey(ctx context.Context, keyID uuid.UUID, actorID string) error {
	const q = `
		UPDATE dispatch_api_keys
		SET    status='REVOKED', revoked_by=$1, revoked_at=now()
		WHERE  id=$2 AND status='ACTIVE'`
	if _, err := r.db.ExecContext(ctx, q, actorID, keyID); err != nil {
		return fmt.Errorf("api_keys: revoke: %w", err)
	}
	return nil
}

func (r *apiKeyRepo) GetWorkspaceByKeyHash(ctx context.Context, keyHash string) (*domain.Workspace, error) {
	// First try new dispatch_api_keys table.
	const q1 = `
		SELECT w.id::text, w.slug, w.name, w.type, w.seller_code, w.modules, w.is_sandbox, w.created_at,
		       k.id AS key_id
		FROM   dispatch_api_keys k
		JOIN   workspaces w ON w.id = k.workspace_id
		WHERE  k.key_hash=$1 AND k.status='ACTIVE'`

	var row struct {
		domain.Workspace
		KeyID uuid.UUID `db:"key_id"`
	}
	err := r.db.GetContext(ctx, &row, q1, keyHash)
	if err == nil {
		// Touch last_used_at in background — failure is non-fatal.
		go func() { //nolint:errcheck
			r.db.ExecContext(context.Background(),
				`UPDATE dispatch_api_keys SET last_used_at=now() WHERE id=$1`, row.KeyID)
		}()
		return &row.Workspace, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("api_keys: lookup by hash: %w", err)
	}
	return nil, nil
}
