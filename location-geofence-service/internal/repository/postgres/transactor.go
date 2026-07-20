package postgres

import (
	"context"
	"fmt"

	dbtx "github.com/anptco/location-geofence-service/internal/db"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/jmoiron/sqlx"
)

type transactor struct {
	db *sqlx.DB
}

// NewTransactor returns a repository.Transactor backed by pool.
func NewTransactor(pool *sqlx.DB) repository.Transactor {
	return &transactor{db: pool}
}

// WithTx begins a transaction, embeds it in a child context, calls fn with
// that context, and commits on success or rolls back on error.
// Repository methods pick up the transaction via db.TxFromContext.
func (t *transactor) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := t.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	txCtx := dbtx.WithTx(ctx, tx)

	if err := fn(txCtx); err != nil {
		_ = tx.Rollback() // best-effort; original error takes precedence
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
