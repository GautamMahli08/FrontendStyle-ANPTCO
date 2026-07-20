package domain

import (
	"time"

	"github.com/google/uuid"
)

type TripStatus string

const (
	TripStatusLoading          TripStatus = "LOADING"
	TripStatusLoaded           TripStatus = "LOADED"
	TripStatusEnRoute          TripStatus = "EN_ROUTE"
	TripStatusArrived          TripStatus = "ARRIVED"
	TripStatusDeliveryAccepted TripStatus = "DELIVERY_ACCEPTED"
	TripStatusCompleted        TripStatus = "COMPLETED"
)

// TripSource records how a trip was created.
// ORDERING — created by the full ordering workflow (Mode A).
// DISPATCH  — created via the machine-to-machine Dispatch API (Mode B).
type TripSource string

const (
	TripSourceOrdering TripSource = "ORDERING"
	TripSourceDispatch TripSource = "DISPATCH"
)

// Trip is the physical unit the monitoring engine runs on.
// Mode A (full product): created from an order when loading completes.
//                        OrderID is set; the order's lifecycle is mirrored here.
// Mode B (monitoring-only): created directly by the Dispatch API.
//                            OrderID is nil; OrderRef carries the client's ref.
type Trip struct {
	ID             uuid.UUID  `db:"id"               json:"id"`
	WorkspaceID    uuid.UUID  `db:"workspace_id"     json:"workspace_id"`
	TruckID        uuid.UUID  `db:"truck_id"         json:"truck_id"`
	OrderID        *uuid.UUID `db:"order_id"         json:"order_id,omitempty"`
	OrderRef       *string    `db:"order_ref"        json:"order_ref,omitempty"`
	DriverName     *string    `db:"driver_name"      json:"driver_name,omitempty"`
	OriginName     *string    `db:"origin_name"      json:"origin_name,omitempty"`
	OriginLat      *float64   `db:"origin_lat"       json:"origin_lat,omitempty"`
	OriginLng      *float64   `db:"origin_lng"       json:"origin_lng,omitempty"`
	DestName       string     `db:"dest_name"        json:"dest_name"`
	DestLat        float64    `db:"dest_lat"         json:"dest_lat"`
	DestLng        float64    `db:"dest_lng"         json:"dest_lng"`
	DestGeofenceID *uuid.UUID `db:"dest_geofence_id" json:"dest_geofence_id,omitempty"`
	Source         TripSource `db:"source"           json:"source"`
	Status         TripStatus `db:"status"           json:"status"`
	Compartments   JSONB      `db:"compartments"     json:"compartments,omitempty"`
	FuelLoaded     JSONB      `db:"fuel_loaded"      json:"fuel_loaded,omitempty"`
	FuelDelivered  JSONB      `db:"fuel_delivered"   json:"fuel_delivered,omitempty"`
	ScannedAt      *time.Time `db:"scanned_at"       json:"scanned_at,omitempty"`
	CreatedAt      time.Time  `db:"created_at"       json:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"       json:"updated_at"`
}

// CreateTripFromOrderInput is used by handleFinishLoading to create a Mode A trip.
type CreateTripFromOrderInput struct {
	WorkspaceID    uuid.UUID
	TruckID        uuid.UUID
	OrderID        uuid.UUID
	DestName       string
	DestLat        float64
	DestLng        float64
	DestGeofenceID *uuid.UUID
	FuelLoaded     map[string]float64 // compartment label → litres (from finish-loading body)
}

// DispatchTripInput is the body for POST /v1/trips/dispatch (Mode B, machine auth).
type DispatchTripInput struct {
	TruckID           uuid.UUID              `json:"truck_id"`
	OrderRef          string                 `json:"order_ref"`
	DriverName        string                 `json:"driver_name"`
	OriginName        string                 `json:"origin_name"`
	OriginLat         float64                `json:"origin_lat"`
	OriginLng         float64                `json:"origin_lng"`
	DestName          string                 `json:"dest_name"`
	DestLat           float64                `json:"dest_lat"`
	DestLng           float64                `json:"dest_lng"`
	// DestGeofenceRefID: if non-empty, the existing STATION geofence ref_id to link.
	// If empty, a new STATION geofence is created from the dest coordinates.
	DestGeofenceRefID string                   `json:"dest_geofence_ref_id"`
	DestRadiusMeters  int                      `json:"dest_radius_meters"` // default 200 if 0
	Compartments      []map[string]interface{} `json:"compartments"`
}
