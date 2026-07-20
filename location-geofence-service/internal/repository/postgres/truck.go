package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/jmoiron/sqlx"
)

type truckRepository struct {
	db *sqlx.DB
}

// NewTruckRepository returns a repository.TruckRepository backed by pool.
func NewTruckRepository(pool *sqlx.DB) repository.TruckRepository {
	return &truckRepository{db: pool}
}

func (r *truckRepository) FindByDeviceID(ctx context.Context, deviceID string) (*domain.Truck, error) {
	const q = `
		SELECT id, workspace_id, galileosky_device_id, status
		FROM   trucks
		WHERE  galileosky_device_id = $1
		LIMIT  1`

	var t domain.Truck
	if err := fromCtx(ctx, r.db).GetContext(ctx, &t, q, deviceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("truck: find by device_id %q: %w", deviceID, err)
	}
	return &t, nil
}
