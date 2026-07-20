package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type OnboardingRepository interface {
	// ─── Seller connections ───────────────────────────────────────────────────

	// CreateConnection inserts a new PENDING connection request.
	CreateConnection(ctx context.Context, c *domain.SellerConnection) error

	// ListConnections returns connections visible to the caller's workspace.
	ListConnections(ctx context.Context, workspaceID uuid.UUID) ([]*domain.SellerConnection, error)

	// GetConnectionByID returns a single connection or nil.
	GetConnectionByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.SellerConnection, error)

	// ResolveConnection sets status to APPROVED or REJECTED.
	ResolveConnection(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, status string, resolvedBy string) error

	// GetWorkspaceBySellerCode resolves the workspace that owns the given seller code.
	GetWorkspaceBySellerCode(ctx context.Context, code string) (uuid.UUID, error)

	// ─── Sensor requests ─────────────────────────────────────────────────────

	// CreateSensorRequest inserts a new PENDING_SELLER sensor request.
	CreateSensorRequest(ctx context.Context, r *domain.SensorRequest) error

	// ListSensorRequests returns requests for the workspace, optionally filtered by status.
	ListSensorRequests(ctx context.Context, workspaceID uuid.UUID, status string) ([]*domain.SensorRequest, error)

	// GetSensorRequestByID returns a single sensor request or nil.
	GetSensorRequestByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.SensorRequest, error)

	// AdvanceSensorRequest moves the request to the next status and records the reviewer.
	AdvanceSensorRequest(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, newStatus string, reviewerSub string) error
}
