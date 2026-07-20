package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type truckRepo struct{ db *sqlx.DB }

func NewTruckRepository(db *sqlx.DB) repository.TruckRepository {
	return &truckRepo{db: db}
}

func (r *truckRepo) ListWithPosition(ctx context.Context, workspaceID uuid.UUID) ([]*domain.TruckWithPosition, error) {
	const q = `
		SELECT
			t.id,
			t.workspace_id,
			t.galileosky_device_id AS device_id,
			t.status,
			t.created_at,
			ls.latitude,
			ls.longitude,
			ls.speed,
			ls.last_message_at    AS last_seen_at,
			ls.total_fuel_liters,
			ls.compartment_fuel
		FROM   trucks t
		LEFT   JOIN truck_live_state ls ON ls.truck_id = t.id
		WHERE  t.workspace_id = $1
		ORDER  BY t.created_at`

	var rows []*domain.TruckWithPosition
	if err := r.db.SelectContext(ctx, &rows, q, workspaceID); err != nil {
		return nil, fmt.Errorf("trucks: list: %w", err)
	}
	return rows, nil
}

func (r *truckRepo) GetByID(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*domain.Truck, error) {
	const q = `
		SELECT id, workspace_id, galileosky_device_id, status, created_at
		FROM   trucks
		WHERE  id = $1 AND workspace_id = $2`

	var t domain.Truck
	if err := r.db.GetContext(ctx, &t, q, id, workspaceID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trucks: get %s: %w", id, err)
	}
	return &t, nil
}

func (r *truckRepo) Create(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string) error {
	const q = `
		INSERT INTO trucks (workspace_id, galileosky_device_id, status)
		VALUES ($1, $2, 'IDLE')
		ON CONFLICT (galileosky_device_id) DO NOTHING`
	if _, err := r.db.ExecContext(ctx, q, workspaceID, deviceIMEI); err != nil {
		return fmt.Errorf("trucks: create: %w", err)
	}
	return nil
}

func (r *truckRepo) GetByDeviceIMEI(ctx context.Context, workspaceID uuid.UUID, deviceIMEI string) (*domain.Truck, error) {
	const q = `
		SELECT id, workspace_id, galileosky_device_id, status, created_at
		FROM   trucks
		WHERE  workspace_id = $1 AND galileosky_device_id = $2`

	var t domain.Truck
	if err := r.db.GetContext(ctx, &t, q, workspaceID, deviceIMEI); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trucks: get by imei %s: %w", deviceIMEI, err)
	}
	return &t, nil
}

func (r *truckRepo) UpdateQRUrl(ctx context.Context, truckID uuid.UUID, qrURL string) error {
	const q = `UPDATE trucks SET qr_url = $1 WHERE id = $2`
	if _, err := r.db.ExecContext(ctx, q, qrURL, truckID); err != nil {
		return fmt.Errorf("trucks: update qr_url %s: %w", truckID, err)
	}
	return nil
}

func (r *truckRepo) ListAllWithPosition(ctx context.Context) ([]*domain.TruckWithPosition, error) {
	const q = `
		SELECT
			t.id,
			t.workspace_id,
			t.galileosky_device_id AS device_id,
			t.status,
			t.created_at,
			ls.latitude,
			ls.longitude,
			ls.speed,
			ls.last_message_at    AS last_seen_at,
			ls.total_fuel_liters,
			ls.compartment_fuel
		FROM   trucks t
		LEFT   JOIN truck_live_state ls ON ls.truck_id = t.id
		ORDER  BY t.created_at`

	var rows []*domain.TruckWithPosition
	if err := r.db.SelectContext(ctx, &rows, q); err != nil {
		return nil, fmt.Errorf("trucks: list all: %w", err)
	}
	return rows, nil
}

func (r *truckRepo) ListForSellerWithPosition(ctx context.Context, sellerWorkspaceID uuid.UUID) ([]*domain.TruckWithPosition, error) {
	const q = `
		SELECT DISTINCT ON (t.id)
			t.id,
			t.workspace_id,
			t.galileosky_device_id AS device_id,
			t.status,
			t.created_at,
			ls.latitude,
			ls.longitude,
			ls.speed,
			ls.last_message_at    AS last_seen_at,
			ls.total_fuel_liters,
			ls.compartment_fuel
		FROM   trucks t
		JOIN   order_assignments oa ON oa.truck_id = t.id
		JOIN   orders o             ON o.id         = oa.order_id
		LEFT   JOIN truck_live_state ls ON ls.truck_id = t.id
		WHERE  o.workspace_id = $1
		  AND  o.status IN ('ASSIGNED','LOADING','LOADED','EN_ROUTE','ARRIVED')
		ORDER  BY t.id, t.created_at`

	var rows []*domain.TruckWithPosition
	if err := r.db.SelectContext(ctx, &rows, q, sellerWorkspaceID); err != nil {
		return nil, fmt.Errorf("trucks: list for seller: %w", err)
	}
	return rows, nil
}

func (r *truckRepo) GetPosition(ctx context.Context, truckID uuid.UUID) (*domain.TruckPosition, error) {
	const q = `
		SELECT truck_id, latitude, longitude, speed, last_message_at,
		       total_fuel_liters, compartment_fuel
		FROM   truck_live_state
		WHERE  truck_id = $1`

	var p domain.TruckPosition
	if err := r.db.GetContext(ctx, &p, q, truckID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("trucks: get position for %s: %w", truckID, err)
	}
	return &p, nil
}

func (r *truckRepo) SeedPosition(ctx context.Context, truckID, workspaceID uuid.UUID, lat, lng float64) error {
	// last_message_at = NULL signals "no real telemetry yet".
	// The DO UPDATE only fires while last_message_at remains NULL, so real device
	// readings (which always carry a non-NULL timestamp) can never be overwritten.
	const q = `
		INSERT INTO truck_live_state (truck_id, workspace_id, latitude, longitude, last_message_at, updated_at)
		VALUES ($1, $2, $3, $4, NULL, now())
		ON CONFLICT (truck_id) DO UPDATE SET
			latitude   = EXCLUDED.latitude,
			longitude  = EXCLUDED.longitude,
			updated_at = now()
		WHERE truck_live_state.last_message_at IS NULL`

	if _, err := r.db.ExecContext(ctx, q, truckID, workspaceID, lat, lng); err != nil {
		return fmt.Errorf("trucks: seed position for %s: %w", truckID, err)
	}
	return nil
}

func (r *truckRepo) SetFuel(ctx context.Context, truckID, workspaceID uuid.UUID, compartmentFuel map[string]float64, totalLiters float64) error {
	fuelJSON, err := json.Marshal(compartmentFuel)
	if err != nil {
		return fmt.Errorf("trucks: marshal compartment fuel: %w", err)
	}
	const q = `
		INSERT INTO truck_live_state (truck_id, workspace_id, total_fuel_liters, compartment_fuel, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (truck_id) DO UPDATE SET
			total_fuel_liters = EXCLUDED.total_fuel_liters,
			compartment_fuel  = EXCLUDED.compartment_fuel,
			updated_at        = now()`
	if _, err := r.db.ExecContext(ctx, q, truckID, workspaceID, totalLiters, fuelJSON); err != nil {
		return fmt.Errorf("trucks: set fuel for %s: %w", truckID, err)
	}
	return nil
}
