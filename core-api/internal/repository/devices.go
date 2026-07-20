package repository

import (
	"context"

	"github.com/anptco/core-api/internal/domain"
	"github.com/google/uuid"
)

// DeviceRepository manages the platform's GPS device and fuel sensor inventory.
type DeviceRepository interface {
	// ── GPS Devices ───────────────────────────────────────────────────────────

	// ListDevices returns all devices, optionally filtered by status.
	ListDevices(ctx context.Context, status string) ([]*domain.Device, error)

	// GetDevice returns a device by ID, or nil when not found.
	GetDevice(ctx context.Context, id uuid.UUID) (*domain.Device, error)

	// CreateDevice inserts a new device record.
	CreateDevice(ctx context.Context, d *domain.Device) error

	// UpdateDevice updates mutable device fields (model, firmware, SIM, notes, status).
	UpdateDevice(ctx context.Context, d *domain.Device) error

	// AssignDevice creates a device_assignment row, updates device.status = ASSIGNED,
	// and writes the IMEI into trucks.galileosky_device_id.
	// Returns ErrAlreadyAssigned if device or truck already has an active assignment.
	AssignDevice(ctx context.Context, deviceID, truckID uuid.UUID, actorID string, notes *string) (*domain.DeviceAssignment, error)

	// UnassignDevice closes the active assignment row and sets device.status = AVAILABLE.
	UnassignDevice(ctx context.Context, deviceID uuid.UUID, actorID string) error

	// ListDeviceAssignments returns the assignment history for a truck.
	ListDeviceAssignments(ctx context.Context, truckID uuid.UUID) ([]*domain.DeviceAssignment, error)

	// ── Fuel Sensors ──────────────────────────────────────────────────────────

	// ListSensors returns all fuel sensors, optionally filtered by status.
	ListSensors(ctx context.Context, status string) ([]*domain.FuelSensor, error)

	// GetSensor returns a sensor by ID, or nil when not found.
	GetSensor(ctx context.Context, id uuid.UUID) (*domain.FuelSensor, error)

	// CreateSensor inserts a new fuel sensor record.
	CreateSensor(ctx context.Context, s *domain.FuelSensor) error

	// UpdateSensor updates mutable sensor fields.
	UpdateSensor(ctx context.Context, s *domain.FuelSensor) error

	// AssignSensor creates a fuel_sensor_assignment row and sets sensor.status = ASSIGNED.
	AssignSensor(ctx context.Context, sensorID, truckID uuid.UUID, compartmentNo int, actorID string, notes *string) (*domain.FuelSensorAssignment, error)

	// UnassignSensor closes the active sensor assignment and sets status = AVAILABLE.
	UnassignSensor(ctx context.Context, sensorID uuid.UUID, actorID string) error

	// ListSensorAssignments returns the fuel sensor assignment history for a truck.
	ListSensorAssignments(ctx context.Context, truckID uuid.UUID) ([]*domain.FuelSensorAssignment, error)
}
