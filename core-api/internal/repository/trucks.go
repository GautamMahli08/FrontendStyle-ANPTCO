package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type TruckRepository interface {
	// ListWithPosition returns all trucks in the workspace joined with their
	// latest known position. Position fields are nil when no telemetry received yet.
	ListWithPosition(ctx context.Context, workspaceID uuid.UUID) ([]*domain.TruckWithPosition, error)

	// ListAllWithPosition returns every truck across all workspaces (no RLS filter).
	// Callers must bypass RLS before invoking this.
	ListAllWithPosition(ctx context.Context) ([]*domain.TruckWithPosition, error)

	// ListForSellerWithPosition returns trucks that are actively working on orders
	// belonging to the given seller workspace. Callers must bypass RLS.
	ListForSellerWithPosition(ctx context.Context, sellerWorkspaceID uuid.UUID) ([]*domain.TruckWithPosition, error)

	// GetByID returns a single truck, or nil when not found in this workspace.
	GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Truck, error)

	// GetPosition returns the latest known position for a truck, or nil if no
	// telemetry has been received.
	GetPosition(ctx context.Context, truckID uuid.UUID) (*domain.TruckPosition, error)

	// Create inserts a new IDLE truck with the given device IMEI into the workspace.
	// Called automatically when a sensor request is fully approved.
	Create(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string) error

	// GetByDeviceIMEI returns the truck row for the given IMEI, or nil if not found.
	GetByDeviceIMEI(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string) (*domain.Truck, error)

	// UpdateQRUrl persists the CloudFront QR PNG URL on the truck row.
	UpdateQRUrl(ctx context.Context, truckID uuid.UUID, qrURL string) error

	// SeedPosition writes an initial lat/lng into truck_live_state only when no
	// real telemetry has been received yet (last_message_at IS NULL). Real device
	// readings always take priority once they arrive.
	SeedPosition(ctx context.Context, truckID, workspaceID uuid.UUID, lat, lng float64) error

	// SetFuel updates the compartment fuel snapshot in truck_live_state.
	// Unlike SeedPosition this always overwrites regardless of last_message_at.
	SetFuel(ctx context.Context, truckID, workspaceID uuid.UUID, compartmentFuel map[string]float64, totalLiters float64) error
}
