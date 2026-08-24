package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// AlertRepository persists and updates monitoring alerts.
// Upsert is the only write path — the dedup_key unique constraint makes
// writes idempotent so re-processing a telemetry batch never spawns duplicates.
type AlertRepository interface {
	// Upsert inserts the alert or, on a dedup_key conflict, merges its payload
	// and keeps the lowest (most severe) severity seen. Alert status is never
	// downgraded by an upsert.
	Upsert(ctx context.Context, a *domain.Alert) error

	// GetConfig returns the monitoring thresholds for the given workspace,
	// preferring a vehicle-specific row over the workspace default.
	// Returns domain.DefaultMonitoringConfig when no row exists at all.
	GetConfig(ctx context.Context, workspaceID, vehicleID uuid.UUID) (*domain.MonitoringConfig, error)
}
