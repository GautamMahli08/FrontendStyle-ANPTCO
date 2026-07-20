package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const (
	// Lambda instances do not share connections, so the pool is intentionally small.
	maxOpenConns    = 5
	maxIdleConns    = 2
	connMaxLifetime = 5 * time.Minute
	// Short idle timeout avoids holding connections across Lambda idle periods.
	connMaxIdleTime = 30 * time.Second
)

// Connect opens and pings a PostgreSQL connection pool using the given DSN.
// The returned *sqlx.DB is safe for concurrent use and should be reused across
// Lambda invocations (initialised once at cold-start outside the handler).
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
