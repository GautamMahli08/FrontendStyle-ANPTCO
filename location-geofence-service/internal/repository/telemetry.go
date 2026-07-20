package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// TelemetryRepository appends records to the partitioned truck_telemetry table.
// The table is append-only: Insert never deduplicates or overwrites rows.
// Implementations must be safe for concurrent use and must propagate any
// transaction present in ctx.
type TelemetryRepository interface {
	// Insert appends t as a new history row. The caller is responsible for
	// ensuring t.TruckID and t.Timestamp are populated.
	Insert(ctx context.Context, t *domain.TruckTelemetry) error
}
