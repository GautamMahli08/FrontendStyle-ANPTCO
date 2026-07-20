package notify

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Notifier publishes domain lifecycle events to external consumers.
// Implementations must be safe for concurrent use.
type Notifier interface {
	// OrderArrived is called after an EN_ROUTE order transitions to ARRIVED
	// because the truck physically entered the delivery station geofence.
	OrderArrived(ctx context.Context, p OrderArrivedPayload) error

	// OrderCompleted is called after all truck assignments for an order have
	// returned to the depot and the order transitions to COMPLETED.
	OrderCompleted(ctx context.Context, p OrderCompletedPayload) error
}

// OrderArrivedPayload carries the context of an EN_ROUTE → ARRIVED transition.
type OrderArrivedPayload struct {
	TripID      uuid.UUID  `json:"trip_id"`
	OrderID     *uuid.UUID `json:"order_id,omitempty"` // nil for Mode B (dispatch-only) trips
	TruckID     uuid.UUID  `json:"truck_id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	GeofenceID  uuid.UUID  `json:"geofence_id"`
	Latitude    float64    `json:"latitude"`
	Longitude   float64    `json:"longitude"`
	OccurredAt  time.Time  `json:"occurred_at"`
}

// OrderCompletedPayload carries the context of a → COMPLETED transition.
type OrderCompletedPayload struct {
	TripID      uuid.UUID  `json:"trip_id"`
	OrderID     *uuid.UUID `json:"order_id,omitempty"` // nil for Mode B (dispatch-only) trips
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	OccurredAt  time.Time  `json:"occurred_at"`
}
