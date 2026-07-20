package maintenance

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"go.uber.org/zap"
)

// EnsureUpcomingPartitions creates monthly truck_telemetry partitions for the
// current month and the next `ahead` months. IF NOT EXISTS makes re-runs safe.
func EnsureUpcomingPartitions(ctx context.Context, db *sqlx.DB, ahead int, log *zap.Logger) error {
	now := time.Now().UTC()
	for i := 0; i <= ahead; i++ {
		t := now.AddDate(0, i, 0)
		year, month := t.Year(), int(t.Month())
		name := partitionName(year, month)
		if err := createPartition(ctx, db, year, month); err != nil {
			return fmt.Errorf("create partition %s: %w", name, err)
		}
		log.Info("partition ensured", zap.String("name", name))
	}
	return nil
}

// DropOldPartitions drops truck_telemetry child partitions whose entire date
// range lies before now-retentionDays. Errors on individual drops are logged
// but do not abort the loop so one stuck partition never blocks the rest.
func DropOldPartitions(ctx context.Context, db *sqlx.DB, retentionDays int, log *zap.Logger) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)

	rows, err := db.QueryContext(ctx, `
		SELECT c.relname
		FROM   pg_inherits  i
		JOIN   pg_class      c ON c.oid = i.inhrelid
		JOIN   pg_class      p ON p.oid = i.inhparent
		WHERE  p.relname = 'truck_telemetry'
		ORDER  BY c.relname`)
	if err != nil {
		return fmt.Errorf("list partitions: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return fmt.Errorf("scan partition name: %w", err)
		}

		year, month, ok := parsePartitionName(raw)
		if !ok {
			continue
		}

		// The partition holds data up to but not including the first day of the
		// following month. If that boundary is still within the retention window
		// keep the partition.
		partitionEnd := time.Date(year, time.Month(month)+1, 1, 0, 0, 0, 0, time.UTC)
		if !partitionEnd.Before(cutoff) {
			continue
		}

		// Reconstruct the safe name from validated integers — never use the raw
		// DB string in a DDL statement.
		safe := partitionName(year, month)
		if _, err := db.ExecContext(ctx, "DROP TABLE IF EXISTS "+safe); err != nil {
			log.Error("drop partition failed",
				zap.String("name", safe),
				zap.Error(err),
			)
			continue
		}
		log.Info("partition dropped",
			zap.String("name", safe),
			zap.Time("partition_end", partitionEnd),
			zap.Int("retention_days", retentionDays),
		)
	}
	return rows.Err()
}

func createPartition(ctx context.Context, db *sqlx.DB, year, month int) error {
	name := partitionName(year, month)
	from := fmt.Sprintf("%04d-%02d-01", year, month)
	to := time.Date(year, time.Month(month)+1, 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	_, err := db.ExecContext(ctx, fmt.Sprintf(
		`CREATE TABLE IF NOT EXISTS %s PARTITION OF truck_telemetry FOR VALUES FROM ('%s') TO ('%s')`,
		name, from, to,
	))
	return err
}

func partitionName(year, month int) string {
	return fmt.Sprintf("truck_telemetry_%04d_%02d", year, month)
}

// parsePartitionName extracts (year, month) from a name like "truck_telemetry_2026_06".
func parsePartitionName(name string) (year, month int, ok bool) {
	n, err := fmt.Sscanf(name, "truck_telemetry_%d_%d", &year, &month)
	if err != nil || n != 2 || month < 1 || month > 12 {
		return 0, 0, false
	}
	return year, month, true
}
