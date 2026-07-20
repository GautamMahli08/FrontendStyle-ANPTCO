package domain

import (
	"time"

	"github.com/google/uuid"
)

type OrderStatus string

const (
	// Pre-trip stages (Core API driven)
	OrderStatusPlaced           OrderStatus = "PLACED"
	OrderStatusAcceptedBySeller OrderStatus = "ACCEPTED_BY_SELLER"
	OrderStatusAssignedToTSP    OrderStatus = "ASSIGNED_TO_TSP"
	OrderStatusAssigned         OrderStatus = "ASSIGNED"
	OrderStatusLoading          OrderStatus = "LOADING"
	OrderStatusLoaded           OrderStatus = "LOADED"
	// In-trip stages (Geofence Lambda + Core API driven)
	OrderStatusEnRoute          OrderStatus = "EN_ROUTE"
	OrderStatusArrived          OrderStatus = "ARRIVED"
	OrderStatusDeliveryAccepted OrderStatus = "DELIVERY_ACCEPTED"
	OrderStatusCompleted        OrderStatus = "COMPLETED"
)

type Order struct {
	ID                   uuid.UUID  `db:"id"                     json:"id"`
	WorkspaceID          uuid.UUID  `db:"workspace_id"           json:"workspace_id"`
	ClientWorkspaceID    *uuid.UUID `db:"client_workspace_id"    json:"client_workspace_id,omitempty"`
	Status               OrderStatus `db:"status"                json:"status"`
	DestinationStationID *string    `db:"destination_station_id" json:"destination_station_id,omitempty"`
	TransporterID        *string    `db:"transporter_id"         json:"transporter_id,omitempty"`
	VolumeLiters         *int       `db:"volume_liters"          json:"volume_liters,omitempty"`
	FuelType             *string    `db:"fuel_type"              json:"fuel_type,omitempty"`
	CreatedAt            time.Time  `db:"created_at"             json:"created_at"`
	UpdatedAt            time.Time  `db:"updated_at"             json:"updated_at"`
}

// OrderAssignment links an order to the truck executing it.
type OrderAssignment struct {
	ID        uuid.UUID   `db:"id"         json:"id"`
	OrderID   uuid.UUID   `db:"order_id"   json:"order_id"`
	TruckID   uuid.UUID   `db:"truck_id"   json:"truck_id"`
	Status    OrderStatus `db:"status"     json:"status"`
	CreatedAt time.Time   `db:"created_at" json:"created_at"`
}

// CreateOrderInput is the request body for POST /v1/orders.
// When a CLIENT calls this endpoint, SellerWorkspaceID must be provided;
// the order will be created inside the seller's workspace.
type CreateOrderInput struct {
	SellerWorkspaceID    string     `json:"seller_workspace_id"`
	DestinationStationID *string    `json:"destination_station_id"`
	VolumeLiters         *int       `json:"volume_liters"`
	FuelType             *string    `json:"fuel_type"`
	TruckID              *uuid.UUID `json:"truck_id"`
}
