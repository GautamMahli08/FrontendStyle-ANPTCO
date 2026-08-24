package repository

import (
	"context"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

type OrderRepository interface {
	// List returns orders for the workspace. When activeOnly is true, COMPLETED
	// orders are excluded.
	List(ctx context.Context, workspaceID uuid.UUID, activeOnly bool) ([]*domain.Order, error)

	// ListByClient returns orders placed by the given client workspace across
	// all seller workspaces (RLS bypass via empty workspace_id).
	ListByClient(ctx context.Context, clientWorkspaceID uuid.UUID, activeOnly bool) ([]*domain.Order, error)

	// ListByTransporter returns orders assigned to the given transporter (Cognito sub)
	// across all seller workspaces (RLS bypass required before calling).
	ListByTransporter(ctx context.Context, transporterID string, activeOnly bool) ([]*domain.Order, error)

	// GetByID returns a single order, or nil when not found in this workspace.
	GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Order, error)

	// GetByIDRaw returns a single order by ID with no workspace filter
	// (RLS bypass required before calling).
	GetByIDRaw(ctx context.Context, id uuid.UUID) (*domain.Order, error)

	// GetByTransporter returns a single order by ID where transporter_id matches,
	// or nil when not found (RLS bypass required before calling).
	GetByTransporter(ctx context.Context, id uuid.UUID, transporterID string) (*domain.Order, error)

	// Create inserts a new order row; o.ID is set on return.
	Create(ctx context.Context, o *domain.Order) error

	// AssignTruck inserts an order_assignments row linking order → truck.
	AssignTruck(ctx context.Context, a *domain.OrderAssignment) error

	// UpdateStatus transitions an order to the given status. Returns an error
	// when the order is not found in the workspace.
	UpdateStatus(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, status domain.OrderStatus) error

	// AdvanceStatus transitions from → to only when the current status matches
	// from. Returns ErrWrongStatus when the order is in a different state.
	AdvanceStatus(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, from, to domain.OrderStatus) error

	// AdvanceStatusByTransporter transitions from → to only when transporter_id
	// matches and current status matches from (RLS bypass required before calling).
	AdvanceStatusByTransporter(ctx context.Context, id uuid.UUID, transporterID string, from, to domain.OrderStatus) error

	// AssignTransporter sets transporter_id and advances status to ASSIGNED_TO_TSP.
	// The from status must be ACCEPTED_BY_SELLER.
	AssignTransporter(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID, transporterID string) error

	// GetTruckForOrder returns the truck_id from the most recent order_assignment
	// for the given order, or uuid.Nil if no assignment exists.
	GetTruckForOrder(ctx context.Context, orderID uuid.UUID) (uuid.UUID, error)
}

// ErrWrongStatus is returned when AdvanceStatus finds the order in an
// unexpected state (i.e. the transition is not valid from the current status).
var ErrWrongStatus = fmt.Errorf("order is not in the expected status for this transition")

// ErrNotFound is returned when a delete or update targets a row that does not exist.
var ErrNotFound = fmt.Errorf("not found")
