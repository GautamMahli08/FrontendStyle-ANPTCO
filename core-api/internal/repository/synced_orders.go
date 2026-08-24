package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

// SyncedOrderRepository persists inbound orders from the external ordering system.
type SyncedOrderRepository interface {
	// IsEventSeen returns true when event_id has already been processed,
	// enabling idempotent webhook handling.
	IsEventSeen(ctx context.Context, workspaceID uuid.UUID, eventID string) (bool, error)

	// MarkEventSeen records event_id so subsequent deliveries are no-ops.
	MarkEventSeen(ctx context.Context, workspaceID uuid.UUID, eventID string) error

	// Upsert inserts or updates a synced_orders row keyed on
	// (workspace_id, external_order_id). Out-of-order updates (where the
	// incoming occurred_at is older than updated_at) are silently skipped.
	Upsert(ctx context.Context, o *domain.SyncedOrder) error

	// FindTruckByIMEI looks up the truck whose galileosky_device_id matches
	// the given IMEI string within the workspace, for order→vehicle linking.
	// Returns (nil, nil) when not found.
	FindTruckByIMEI(ctx context.Context, workspaceID uuid.UUID, imei string) (*uuid.UUID, error)
}
