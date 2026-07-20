package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
)

// AssetEventRepository persists detected truck asset events.
type AssetEventRepository interface {
	// Insert writes a single detected event row.
	Insert(ctx context.Context, e *domain.AssetEvent) error

	// ListByTruck returns events for a truck ordered newest-first.
	ListByTruck(ctx context.Context, truckID uuid.UUID, limit int) ([]*domain.AssetEvent, error)

	// ListByWorkspace returns events for all trucks in a workspace ordered newest-first.
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.AssetEvent, error)
}
