package postgres

import (
	"context"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/jmoiron/sqlx"
)

type telemetryRepository struct {
	db *sqlx.DB
}

// NewTelemetryRepository returns a repository.TelemetryRepository backed by pool.
func NewTelemetryRepository(pool *sqlx.DB) repository.TelemetryRepository {
	return &telemetryRepository{db: pool}
}

func (r *telemetryRepository) Insert(ctx context.Context, t *domain.TruckTelemetry) error {
	const q = `
		INSERT INTO truck_telemetry (
			truck_id, workspace_id, timestamp,
			latitude, longitude, speed, ignition_on,
			compartment_sensors, total_fuel_liters, external_power_voltage
		) VALUES (
			:truck_id, :workspace_id, :timestamp,
			:latitude, :longitude, :speed, :ignition_on,
			:compartment_sensors, :total_fuel_liters, :external_power_voltage
		)`

	// json.RawMessage is a named type; pq's type switch only matches []byte,
	// so a nil json.RawMessage is not recognised as SQL NULL. Cast explicitly:
	// nil []byte → SQL NULL, non-nil → valid JSON bytes.
	var sensors interface{}
	if len(t.CompartmentSensors) > 0 {
		sensors = []byte(t.CompartmentSensors)
	}

	arg := map[string]interface{}{
		"truck_id":               t.TruckID,
		"workspace_id":           t.WorkspaceID,
		"timestamp":              t.Timestamp,
		"latitude":               t.Latitude,
		"longitude":              t.Longitude,
		"speed":                  t.Speed,
		"ignition_on":            t.IgnitionOn,
		"compartment_sensors":    sensors,
		"total_fuel_liters":      t.TotalFuelLiters,
		"external_power_voltage": t.ExternalPowerVoltage,
	}

	if err := namedExec(ctx, fromCtx(ctx, r.db), q, arg); err != nil {
		return fmt.Errorf("telemetry: insert for truck %s: %w", t.TruckID, err)
	}
	return nil
}
