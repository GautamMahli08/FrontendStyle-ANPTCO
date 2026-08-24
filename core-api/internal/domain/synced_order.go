package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// SyncedOrder is an order record received from an external ordering system.
// We are a consumer — the external system is authoritative.
type SyncedOrder struct {
	ID                uuid.UUID       `db:"id"                  json:"id"`
	WorkspaceID       uuid.UUID       `db:"workspace_id"        json:"workspace_id"`
	ExternalOrderID   string          `db:"external_order_id"   json:"external_order_id"`
	Status            string          `db:"status"              json:"status"`
	VehicleID         *uuid.UUID      `db:"vehicle_id"          json:"vehicle_id,omitempty"`
	TripID            *uuid.UUID      `db:"trip_id"             json:"trip_id,omitempty"`
	ProductCode       *string         `db:"product_code"        json:"product_code,omitempty"`
	QuantityOrderedL  *float64        `db:"quantity_ordered_l"  json:"quantity_ordered_l,omitempty"`
	SourceGeofenceID  *uuid.UUID      `db:"source_geofence_id"  json:"source_geofence_id,omitempty"`
	DestGeofenceID    *uuid.UUID      `db:"dest_geofence_id"    json:"dest_geofence_id,omitempty"`
	DestLat           *float64        `db:"dest_lat"            json:"dest_lat,omitempty"`
	DestLng           *float64        `db:"dest_lng"            json:"dest_lng,omitempty"`
	ScheduledFrom     *time.Time      `db:"scheduled_from"      json:"scheduled_from,omitempty"`
	ScheduledTo       *time.Time      `db:"scheduled_to"        json:"scheduled_to,omitempty"`
	Raw               json.RawMessage `db:"raw"                 json:"raw"`
	LinkState         string          `db:"link_state"          json:"link_state"` // LINKED | UNLINKED
	FirstSeenAt       time.Time       `db:"first_seen_at"       json:"first_seen_at"`
	UpdatedAt         time.Time       `db:"updated_at"          json:"updated_at"`
}

// InboundOrderEvent is the webhook payload shape we accept from the external
// ordering system. Fields map to the data contract in the design doc §1.3.
type InboundOrderEvent struct {
	EventID     string          `json:"event_id"`    // idempotency key
	EventType   string          `json:"event_type"`  // order.dispatched | order.updated | order.cancelled
	OccurredAt  time.Time       `json:"occurred_at"`
	WorkspaceID string          `json:"workspace_id"` // which workspace this order belongs to
	Order       InboundOrder    `json:"order"`
}

type InboundOrder struct {
	ExternalOrderID  string          `json:"external_order_id"`
	Status           string          `json:"status"`
	ProductCode      *string         `json:"product_code,omitempty"`
	QuantityL        *float64        `json:"quantity_ordered_l,omitempty"`
	Source           *InboundSite    `json:"source,omitempty"`
	Destination      *InboundSite    `json:"destination,omitempty"`
	Vehicle          *InboundVehicle `json:"vehicle,omitempty"`
	ScheduledFrom    *time.Time      `json:"scheduled_from,omitempty"`
	ScheduledTo      *time.Time      `json:"scheduled_to,omitempty"`
}

type InboundSite struct {
	ID          string   `json:"id"`
	Name        string   `json:"name,omitempty"`
	Lat         *float64 `json:"lat,omitempty"`
	Lon         *float64 `json:"lon,omitempty"`
	GeofenceRef *string  `json:"geofence_ref,omitempty"`
}

type InboundVehicle struct {
	Plate      string `json:"plate,omitempty"`
	DeviceIMEI string `json:"device_imei,omitempty"`
}
