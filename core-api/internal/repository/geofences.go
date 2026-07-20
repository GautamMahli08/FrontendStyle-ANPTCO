package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type GeofenceRepository interface {
	// Create inserts a new geofence row. g.ID is set by the DB.
	Create(ctx context.Context, g *domain.Geofence) error

	// ListByWorkspace returns all geofences for the given workspace and type.
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, gtype domain.GeofenceType) ([]*domain.Geofence, error)

	// GetByID returns a single geofence, or nil when not found.
	GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Geofence, error)

	// GetByRefID returns the STATION geofence whose ref_id matches the given
	// station ID string, or nil when not found. Used to resolve destination
	// coordinates when creating a Trip from an order.
	GetByRefID(ctx context.Context, refID string) (*domain.Geofence, error)
}
