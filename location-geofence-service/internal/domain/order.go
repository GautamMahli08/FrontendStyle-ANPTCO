package domain

import "github.com/google/uuid"

// OrderStatus tracks the lifecycle of a delivery order.
type OrderStatus string

const (
	OrderStatusEnRoute          OrderStatus = "EN_ROUTE"
	OrderStatusArrived          OrderStatus = "ARRIVED"
	OrderStatusDeliveryAccepted OrderStatus = "DELIVERY_ACCEPTED"
	OrderStatusCompleted        OrderStatus = "COMPLETED"
)

// ActiveTrip is the denormalized view the geofence module queries
// to resolve which destination to evaluate for a truck currently on a trip.
// It is populated directly from the trips table — no join through orders needed.
//
// OrderID is nil for Mode B (dispatch-only) trips.
// AssignmentID is nil for Mode B trips (order_assignments is a Mode A concept).
type ActiveTrip struct {
	TripID       uuid.UUID   `db:"trip_id"`
	OrderID      *uuid.UUID  `db:"order_id"`      // nil for Mode B
	AssignmentID *uuid.UUID  `db:"assignment_id"` // nil for Mode B
	TruckID      uuid.UUID   `db:"truck_id"`
	WorkspaceID  uuid.UUID   `db:"workspace_id"`
	TripStatus   OrderStatus `db:"trip_status"`
	GeofenceID   uuid.UUID   `db:"geofence_id"`
	DestLat      float64     `db:"dest_lat"`
	DestLon      float64     `db:"dest_lng"`
	RadiusMeters int         `db:"radius_meters"` // from geofences.radius_meters; 0 → fall back to env
}

// ActiveOrderAssignment is kept as a type alias for backward compatibility
// with any code that still references it. New code should use ActiveTrip.
type ActiveOrderAssignment = ActiveTrip
