package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jmoiron/sqlx"
)

//go:embed *.sql
var sqlFiles embed.FS

// Run applies any SQL migration files in this package that have not yet been
// recorded in schema_migrations. Files are applied in lexicographic order
// (001_, 002_, …) inside individual transactions. Returns the count of newly
// applied migrations.
func Run(ctx context.Context, db *sqlx.DB) (int, error) {
	if _, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return 0, fmt.Errorf("create schema_migrations: %w", err)
	}

	var done []string
	if err := db.SelectContext(ctx, &done,
		`SELECT filename FROM schema_migrations ORDER BY filename`); err != nil {
		return 0, fmt.Errorf("list applied: %w", err)
	}
	doneSet := make(map[string]bool, len(done))
	for _, f := range done {
		doneSet[f] = true
	}

	entries, err := fs.ReadDir(sqlFiles, ".")
	if err != nil {
		return 0, fmt.Errorf("read embed dir: %w", err)
	}
	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	applied := 0
	for _, name := range names {
		if doneSet[name] {
			continue
		}
		sql, err := sqlFiles.ReadFile(name)
		if err != nil {
			return applied, fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := db.BeginTxx(ctx, nil)
		if err != nil {
			return applied, fmt.Errorf("begin tx %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			tx.Rollback() //nolint:errcheck
			return applied, fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (filename) VALUES ($1)`, name); err != nil {
			tx.Rollback() //nolint:errcheck
			return applied, fmt.Errorf("record %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return applied, fmt.Errorf("commit %s: %w", name, err)
		}
		applied++
	}
	return applied, nil
}
