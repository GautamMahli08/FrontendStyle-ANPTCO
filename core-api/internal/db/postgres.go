package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const (
	maxOpenConns    = 5
	maxIdleConns    = 2
	connMaxLifetime = 5 * time.Minute
	connMaxIdleTime = 30 * time.Second
)

func Connect(ctx context.Context, dsn string) (*sqlx.DB, error) {
	db, err := sqlx.ConnectContext(ctx, "postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres connection: %w", err)
	}

	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxIdleConns)
	db.SetConnMaxLifetime(connMaxLifetime)
	db.SetConnMaxIdleTime(connMaxIdleTime)

	return db, nil
}

// SetWorkspace sets the app.workspace_id GUC on the given connection so that
// the RLS ws_isolation policies apply. Call once at the top of every request.
// Safe in a pool: subsequent invocations in the same container overwrite it.
func SetWorkspace(ctx context.Context, db *sqlx.DB, workspaceID string) error {
	if _, err := db.ExecContext(ctx, "SELECT set_config('app.workspace_id', $1, false)", workspaceID); err != nil {
		return fmt.Errorf("set app.workspace_id: %w", err)
	}
	return nil
}
