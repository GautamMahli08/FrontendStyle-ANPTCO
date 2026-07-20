package postgres

import (
	"context"
	"database/sql"
	"fmt"

	dbtx "github.com/anptco/location-geofence-service/internal/db"
	"github.com/jmoiron/sqlx"
)

// querier is satisfied by both *sqlx.DB and *sqlx.Tx, allowing repository
// methods to participate in transactions transparently. Using a narrow
// interface rather than the concrete types keeps repository implementations
// independent of whether they run inside or outside a transaction.
type querier interface {
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	SelectContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// fromCtx returns the transaction embedded in ctx when one is active, falling
// back to db for direct (non-transactional) execution.
func fromCtx(ctx context.Context, db *sqlx.DB) querier {
	if tx := dbtx.TxFromContext(ctx); tx != nil {
		return tx
	}
	return db
}

// namedExec converts a named-parameter query (using `:field` syntax) to a
// positional-parameter query compatible with PostgreSQL, then executes it.
// This allows named queries to work with both *sqlx.DB and *sqlx.Tx via the
// querier interface, since NamedExecContext is not part of that interface.
func namedExec(ctx context.Context, q querier, query string, arg interface{}) error {
	named, args, err := sqlx.Named(query, arg)
	if err != nil {
		return fmt.Errorf("build named query: %w", err)
	}
	named = sqlx.Rebind(sqlx.DOLLAR, named)
	if _, err := q.ExecContext(ctx, named, args...); err != nil {
		return err
	}
	return nil
}
