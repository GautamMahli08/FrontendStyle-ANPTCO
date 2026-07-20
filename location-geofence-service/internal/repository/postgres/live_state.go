package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type liveStateRepository struct {
	db *sqlx.DB
}

// NewLiveStateRepository returns a repository.LiveStateRepository backed by pool.
func NewLiveStateRepository(pool *sqlx.DB) repository.LiveStateRepository {
	return &liveStateRepository{db: pool}
}

func (r *liveStateRepository) Upsert(ctx context.Context, s *domain.TruckLiveState) (bool, error) {
	// The WHERE clause on DO UPDATE is the primary guard against out-of-order
	// delivery: it rejects the upsert when the stored timestamp is already
	// newer. RowsAffected = 0 signals a stale/duplicate reading to the caller.
	const q = `
		INSERT INTO truck_live_state (
			truck_id, workspace_id, latitude, longitude, speed,
			total_fuel_liters, external_power_voltage, ignition_on, compartment_fuel, last_message_at, updated_at
		) VALUES (
			:truck_id, :workspace_id, :latitude, :longitude, :speed,
			:total_fuel_liters, :external_power_voltage, :ignition_on, :compartment_fuel, :last_message_at, now()
		)
		ON CONFLICT (truck_id) DO UPDATE SET
			latitude               = EXCLUDED.latitude,
			longitude              = EXCLUDED.longitude,
			speed                  = EXCLUDED.speed,
			total_fuel_liters      = EXCLUDED.total_fuel_liters,
			external_power_voltage = EXCLUDED.external_power_voltage,
			ignition_on            = EXCLUDED.ignition_on,
			compartment_fuel       = EXCLUDED.compartment_fuel,
			last_message_at        = EXCLUDED.last_message_at,
			updated_at             = now()
		WHERE truck_live_state.last_message_at IS NULL
		   OR EXCLUDED.last_message_at > truck_live_state.last_message_at`

	// json.RawMessage is a named type; pq's type switch only matches []byte,
	// so a nil json.RawMessage is not recognised as SQL NULL. Cast explicitly.
	var fuel interface{}
	if len(s.CompartmentFuel) > 0 {
		fuel = []byte(s.CompartmentFuel)
	}

	arg := map[string]interface{}{
		"truck_id":               s.TruckID,
		"workspace_id":           s.WorkspaceID,
		"latitude":               s.Latitude,
		"longitude":              s.Longitude,
		"speed":                  s.Speed,
		"total_fuel_liters":      s.TotalFuelLiters,
		"external_power_voltage": s.ExternalPowerVoltage,
		"ignition_on":            s.IgnitionOn,
		"compartment_fuel":       fuel,
		"last_message_at":        s.LastMessageAt,
	}

	named, args, err := sqlx.Named(q, arg)
	if err != nil {
		return false, fmt.Errorf("live_state: build named query: %w", err)
	}
	named = sqlx.Rebind(sqlx.DOLLAR, named)

	result, err := fromCtx(ctx, r.db).ExecContext(ctx, named, args...)
	if err != nil {
		return false, fmt.Errorf("live_state: upsert for truck %s: %w", s.TruckID, err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("live_state: rows affected: %w", err)
	}
	return n > 0, nil
}

func (r *liveStateRepository) Get(ctx context.Context, truckID uuid.UUID) (*domain.TruckLiveState, error) {
	const q = `
		SELECT truck_id, workspace_id, latitude, longitude, speed,
		       total_fuel_liters, external_power_voltage, ignition_on, compartment_fuel, last_message_at, updated_at
		FROM   truck_live_state
		WHERE  truck_id = $1`
	var s domain.TruckLiveState
	var fuelBytes []byte // scan as plain []byte so SQL NULL → nil without type-switch issues
	row := fromCtx(ctx, r.db).QueryRowContext(ctx, q, truckID)
	err := row.Scan(
		&s.TruckID, &s.WorkspaceID, &s.Latitude, &s.Longitude, &s.Speed,
		&s.TotalFuelLiters, &s.ExternalPowerVoltage, &s.IgnitionOn, &fuelBytes,
		&s.LastMessageAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("live_state: get truck %s: %w", truckID, err)
	}
	s.CompartmentFuel = json.RawMessage(fuelBytes)
	return &s, nil
}
