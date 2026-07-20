package repository

import (
	"context"

	"github.com/anptco/location-geofence-service/internal/domain"
)

// TruckRepository provides read access to the trucks master table.
// Implementations must be safe for concurrent use and must propagate any
// transaction present in ctx (see internal/db.WithTx / TxFromContext).
type TruckRepository interface {
	// FindByDeviceID returns the truck whose galileosky_device_id matches.
	// Returns (nil, nil) — no error — when the device is not registered.
	FindByDeviceID(ctx context.Context, deviceID string) (*domain.Truck, error)
}
