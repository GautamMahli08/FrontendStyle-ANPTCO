package domain

import (
	"time"

	"github.com/google/uuid"
)

// ── Asset events ──────────────────────────────────────────────────────────────

type AssetEvent struct {
	ID          uuid.UUID `db:"id"           json:"id"`
	TruckID     uuid.UUID `db:"truck_id"     json:"truck_id"`
	WorkspaceID uuid.UUID `db:"workspace_id" json:"workspace_id"`
	EventType   string    `db:"event_type"   json:"event_type"`
	Latitude    *float64  `db:"latitude"     json:"latitude,omitempty"`
	Longitude   *float64  `db:"longitude"    json:"longitude,omitempty"`
	ValueBefore *float64  `db:"value_before" json:"value_before,omitempty"`
	ValueAfter  *float64  `db:"value_after"  json:"value_after,omitempty"`
	OccurredAt  time.Time `db:"occurred_at"  json:"occurred_at"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
}

// UnifiedFeedEvent is the merged view returned by GET /v1/events.
// It combines asset_events (fuel, battery, ignition, movement) with
// geofence_events (ENTER/EXIT). The event_type field distinguishes source:
//
//	asset events:    FUEL_FILL, FUEL_DRAIN, BATTERY_ON, BATTERY_OFF,
//	                 IGNITION_ON, IGNITION_OFF, MOVEMENT_START, MOVEMENT_STOP
//	geofence events: GEOFENCE_ENTER_STATION, GEOFENCE_EXIT_STATION,
//	                 GEOFENCE_ENTER_DEPOT,   GEOFENCE_EXIT_DEPOT
type UnifiedFeedEvent struct {
	ID           uuid.UUID  `db:"id"            json:"id"`
	TruckID      uuid.UUID  `db:"truck_id"      json:"truck_id"`
	WorkspaceID  uuid.UUID  `db:"workspace_id"  json:"workspace_id"`
	EventType    string     `db:"event_type"    json:"event_type"`
	Latitude     *float64   `db:"latitude"      json:"latitude,omitempty"`
	Longitude    *float64   `db:"longitude"     json:"longitude,omitempty"`
	ValueBefore  *float64   `db:"value_before"  json:"value_before,omitempty"`
	ValueAfter   *float64   `db:"value_after"   json:"value_after,omitempty"`
	GeofenceType *string    `db:"geofence_type" json:"geofence_type,omitempty"`
	GeofenceZone *string    `db:"geofence_zone" json:"geofence_zone,omitempty"` // geofence name
	TripID       *uuid.UUID `db:"trip_id"       json:"trip_id,omitempty"`
	OccurredAt   time.Time  `db:"occurred_at"   json:"occurred_at"`
	CreatedAt    time.Time  `db:"created_at"    json:"created_at"`
}

// ── Audit log ─────────────────────────────────────────────────────────────────

type AuditLog struct {
	ID         uuid.UUID `db:"id"          json:"id"`
	ActorID    string    `db:"actor_id"    json:"actor_id"`
	Action     string    `db:"action"      json:"action"`
	TargetType string    `db:"target_type" json:"target_type"`
	TargetID   string    `db:"target_id"   json:"target_id"`
	Payload    JSONB     `db:"payload"     json:"payload,omitempty"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
}

// ── Workspace profile ─────────────────────────────────────────────────────────

type WorkspaceProfile struct {
	WorkspaceID  uuid.UUID `db:"workspace_id"  json:"workspace_id"`
	CompanyName  string    `db:"company_name"  json:"company_name"`
	CompanyRegNo *string   `db:"company_reg_no" json:"company_reg_no,omitempty"`
	TaxID        *string   `db:"tax_id"        json:"tax_id,omitempty"`
	Country      string    `db:"country"       json:"country"`
	City         *string   `db:"city"          json:"city,omitempty"`
	Address      *string   `db:"address"       json:"address,omitempty"`
	ContactName  *string   `db:"contact_name"  json:"contact_name,omitempty"`
	ContactEmail *string   `db:"contact_email" json:"contact_email,omitempty"`
	ContactPhone *string   `db:"contact_phone" json:"contact_phone,omitempty"`
	Notes        *string   `db:"notes"         json:"notes,omitempty"`
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"    json:"updated_at"`
}

// ── Subscription ──────────────────────────────────────────────────────────────

type SubscriptionPlan struct {
	ID        uuid.UUID `db:"id"         json:"id"`
	Key       string    `db:"key"        json:"key"`
	Name      string    `db:"name"       json:"name"`
	MaxTrucks int       `db:"max_trucks" json:"max_trucks"`
	PriceUSD  float64   `db:"price_usd"  json:"price_usd"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type WorkspaceSubscription struct {
	ID          uuid.UUID  `db:"id"           json:"id"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	PlanID      uuid.UUID  `db:"plan_id"      json:"plan_id"`
	Status      string     `db:"status"       json:"status"`
	StartedAt   time.Time  `db:"started_at"   json:"started_at"`
	EndsAt      *time.Time `db:"ends_at"      json:"ends_at,omitempty"`
	CreatedAt   time.Time  `db:"created_at"   json:"created_at"`
}

// ── Driver ────────────────────────────────────────────────────────────────────

type Driver struct {
	ID          uuid.UUID `db:"id"           json:"id"`
	WorkspaceID uuid.UUID `db:"workspace_id" json:"workspace_id"`
	FullName    string    `db:"full_name"    json:"full_name"`
	Phone       *string   `db:"phone"        json:"phone,omitempty"`
	LicenseNo   *string   `db:"license_no"   json:"license_no,omitempty"`
	Notes       *string   `db:"notes"        json:"notes,omitempty"`
	IsActive    bool      `db:"is_active"    json:"is_active"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"   json:"updated_at"`
}

// ── Truck compartment ─────────────────────────────────────────────────────────

type TruckCompartment struct {
	ID             uuid.UUID `db:"id"              json:"id"`
	TruckID        uuid.UUID `db:"truck_id"        json:"truck_id"`
	CompartmentNo  int       `db:"compartment_no"  json:"compartment_no"`
	CapacityLiters float64   `db:"capacity_liters" json:"capacity_liters"`
	ProductType    string    `db:"product_type"    json:"product_type"`
	CreatedAt      time.Time `db:"created_at"      json:"created_at"`
}

// ── Device inventory ──────────────────────────────────────────────────────────

type DeviceStatus string

const (
	DeviceStatusAvailable   DeviceStatus = "AVAILABLE"
	DeviceStatusAssigned    DeviceStatus = "ASSIGNED"
	DeviceStatusMaintenance DeviceStatus = "MAINTENANCE"
	DeviceStatusRetired     DeviceStatus = "RETIRED"
)

type Device struct {
	ID          uuid.UUID    `db:"id"           json:"id"`
	IMEI        string       `db:"imei"         json:"imei"`
	Model       string       `db:"model"        json:"model"`
	Firmware    *string      `db:"firmware"     json:"firmware,omitempty"`
	SIMICCID    *string      `db:"sim_iccid"    json:"sim_iccid,omitempty"`
	SIMPhone    *string      `db:"sim_phone"    json:"sim_phone,omitempty"`
	Status      DeviceStatus `db:"status"       json:"status"`
	PurchasedAt *time.Time   `db:"purchased_at" json:"purchased_at,omitempty"`
	Notes       *string      `db:"notes"        json:"notes,omitempty"`
	CreatedAt   time.Time    `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time    `db:"updated_at"   json:"updated_at"`
}

type FuelSensor struct {
	ID          uuid.UUID    `db:"id"           json:"id"`
	SerialNo    string       `db:"serial_no"    json:"serial_no"`
	Model       string       `db:"model"        json:"model"`
	Status      DeviceStatus `db:"status"       json:"status"`
	PurchasedAt *time.Time   `db:"purchased_at" json:"purchased_at,omitempty"`
	Notes       *string      `db:"notes"        json:"notes,omitempty"`
	CreatedAt   time.Time    `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time    `db:"updated_at"   json:"updated_at"`
}

// ── Device assignments ────────────────────────────────────────────────────────

type DeviceAssignment struct {
	ID           uuid.UUID  `db:"id"            json:"id"`
	DeviceID     uuid.UUID  `db:"device_id"     json:"device_id"`
	TruckID      uuid.UUID  `db:"truck_id"      json:"truck_id"`
	AssignedBy   string     `db:"assigned_by"   json:"assigned_by"`
	UnassignedBy *string    `db:"unassigned_by" json:"unassigned_by,omitempty"`
	AssignedAt   time.Time  `db:"assigned_at"   json:"assigned_at"`
	UnassignedAt *time.Time `db:"unassigned_at" json:"unassigned_at,omitempty"`
	Notes        *string    `db:"notes"         json:"notes,omitempty"`
}

type FuelSensorAssignment struct {
	ID            uuid.UUID  `db:"id"             json:"id"`
	SensorID      uuid.UUID  `db:"sensor_id"      json:"sensor_id"`
	TruckID       uuid.UUID  `db:"truck_id"       json:"truck_id"`
	CompartmentNo int        `db:"compartment_no" json:"compartment_no"`
	AssignedBy    string     `db:"assigned_by"    json:"assigned_by"`
	UnassignedBy  *string    `db:"unassigned_by"  json:"unassigned_by,omitempty"`
	AssignedAt    time.Time  `db:"assigned_at"    json:"assigned_at"`
	UnassignedAt  *time.Time `db:"unassigned_at"  json:"unassigned_at,omitempty"`
	Notes         *string    `db:"notes"          json:"notes,omitempty"`
}

// ── Dispatch API keys ─────────────────────────────────────────────────────────

type DispatchAPIKey struct {
	ID          uuid.UUID  `db:"id"           json:"id"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	Description *string    `db:"description"  json:"description,omitempty"`
	Status      string     `db:"status"       json:"status"`
	CreatedBy   string     `db:"created_by"   json:"created_by"`
	RevokedBy   *string    `db:"revoked_by"   json:"revoked_by,omitempty"`
	CreatedAt   time.Time  `db:"created_at"   json:"created_at"`
	RevokedAt   *time.Time `db:"revoked_at"   json:"revoked_at,omitempty"`
	LastUsedAt  *time.Time `db:"last_used_at" json:"last_used_at,omitempty"`
	// RawKey is populated only on key creation and never stored.
	RawKey *string `db:"-" json:"key,omitempty"`
}

// ── ERP integration ───────────────────────────────────────────────────────────

type WorkspaceIntegration struct {
	ID          uuid.UUID  `db:"id"           json:"id"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	SystemType  string     `db:"system_type"  json:"system_type"`
	BaseURL     *string    `db:"base_url"     json:"base_url,omitempty"`
	AuthType    string     `db:"auth_type"    json:"auth_type"`
	Status      string     `db:"status"       json:"status"`
	VerifiedAt  *time.Time `db:"verified_at"  json:"verified_at,omitempty"`
	Notes       *string    `db:"notes"        json:"notes,omitempty"`
	CreatedAt   time.Time  `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at"   json:"updated_at"`
}

// ── Readiness check ───────────────────────────────────────────────────────────

// ReadinessReport is the response body for GET /admin/v1/workspaces/{id}/readiness.
type ReadinessReport struct {
	WorkspaceID uuid.UUID        `json:"workspace_id"`
	Ready       bool             `json:"ready"`
	Checks      []ReadinessCheck `json:"checks"`
}

type ReadinessCheck struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Passed  bool   `json:"passed"`
	Message string `json:"message,omitempty"`
}

// ── Client portal read models ─────────────────────────────────────────────────

// ClientTruck is returned by GET /v1/client/trucks.
// Combines truck metadata with the current live state (position, speed, fuel).
// Never exposes IMEI or internal device IDs.
type ClientTruck struct {
	ID           uuid.UUID  `db:"id"                json:"id"`
	LicensePlate *string    `db:"license_plate"     json:"license_plate,omitempty"`
	Make         *string    `db:"make"              json:"make,omitempty"`
	Model        *string    `db:"model"             json:"model,omitempty"`
	Year         *int       `db:"year"              json:"year,omitempty"`
	// Live state — nil when no telemetry received yet
	Latitude     *float64   `db:"latitude"          json:"latitude,omitempty"`
	Longitude    *float64   `db:"longitude"         json:"longitude,omitempty"`
	Speed        *int       `db:"speed"             json:"speed,omitempty"`
	TotalFuel    *float64   `db:"total_fuel_liters" json:"total_fuel_liters,omitempty"`
	IgnitionOn   *bool      `db:"ignition_on"       json:"ignition_on,omitempty"`
	LastSeenAt   *time.Time `db:"last_message_at"   json:"last_seen_at,omitempty"`
}

// ── ERP read models ───────────────────────────────────────────────────────────

// ERPTruck is the operator-visible truck record returned by GET /v1/erp/trucks.
// Never exposes IMEI, galileosky_device_id, or internal device assignments.
type ERPTruck struct {
	ID           uuid.UUID          `db:"id"            json:"id"`
	WorkspaceID  uuid.UUID          `db:"workspace_id"  json:"workspace_id"`
	LicensePlate *string            `db:"license_plate" json:"license_plate,omitempty"`
	Make         *string            `db:"make"          json:"make,omitempty"`
	Model        *string            `db:"model"         json:"model,omitempty"`
	Year         *int               `db:"year"          json:"year,omitempty"`
	Compartments []*TruckCompartment `db:"-"            json:"compartments"`
}
