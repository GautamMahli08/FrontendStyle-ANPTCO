package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

// TripRepository manages the trips table.
// Trips are the physical unit the monitoring engine runs on.
type TripRepository interface {
	// Create inserts a new trip row.
	Create(ctx context.Context, t *domain.Trip) error

	// GetByID returns the trip or nil if not found in this workspace.
	GetByID(ctx context.Context, id, workspaceID uuid.UUID) (*domain.Trip, error)

	// ListByWorkspace returns recent trips for the workspace.
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Trip, error)

	// GetByOrderID returns the trip linked to an order, or nil.
	GetByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.Trip, error)

	// UpdateStatus sets the trip's status. Used by Core API transitions
	// (e.g. depart → EN_ROUTE) that mirror the order state machine.
	UpdateStatus(ctx context.Context, tripID uuid.UUID, status domain.TripStatus) error

	// ScanDelivery transitions ARRIVED → DELIVERY_ACCEPTED, records scanned_at,
	// and optionally writes fuel_delivered. Returns ErrWrongStatus if the trip
	// is not in ARRIVED status.
	ScanDelivery(ctx context.Context, tripID, workspaceID uuid.UUID, fuelDelivered map[string]float64) error

	// GetByWorkspaceAndOrderRef returns the trip matching (workspace_id, order_ref),
	// or nil if none exists. Used by handleDispatchTrip to detect duplicate dispatches
	// and return 409 before inserting a duplicate row.
	GetByWorkspaceAndOrderRef(ctx context.Context, workspaceID uuid.UUID, orderRef string) (*domain.Trip, error)
}
