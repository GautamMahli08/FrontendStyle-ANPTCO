package repository

import (
	"context"

	"github.com/google/uuid"
)

// TripRepository applies state-machine transitions to trips (and, in Phase 1
// for Mode A trips, also syncs the legacy orders table so existing clients see
// the correct status on their orders).
//
// All mutations must be called within a transaction alongside the geofence event
// insert (see repository.Transactor) so the event and the state change are
// always co-visible.
type TripRepository interface {
	// AdvanceToArrived sets trip.status = ARRIVED when currently EN_ROUTE.
	// For Mode A trips (order_id IS NOT NULL) it also sets orders.status = ARRIVED.
	AdvanceToArrived(ctx context.Context, tripID uuid.UUID) error

	// CompleteAssignment sets order_assignments.status = JOURNEY_COMPLETE and
	// trucks.status = IDLE. Only called for Mode A trips that have an assignment row.
	// assignmentID may be nil (Mode B) — in that case only the truck is set to IDLE.
	CompleteAssignment(ctx context.Context, assignmentID *uuid.UUID, truckID uuid.UUID) error

	// TryComplete transitions trip.status to COMPLETED when all conditions are met.
	// For Mode A trips it also attempts to complete the linked order.
	// Returns true when the transition occurred.
	TryComplete(ctx context.Context, tripID uuid.UUID, orderID *uuid.UUID) (bool, error)
}
