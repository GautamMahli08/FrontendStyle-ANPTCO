// One-time backfill: populate fuel_level on existing geofence_events rows
// (added by migration 039) using the nearest-in-time truck_telemetry reading
// for that truck. New rows get fuel_level set at insert time by the geofence
// service going forward — this tool only fills in history.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type geofenceEventRow struct {
	ID         string `db:"id"`
	TruckID    string `db:"truck_id"`
	OccurredAt string `db:"occurred_at"`
}

type nearestTelemetry struct {
	TotalFuelLiters    *float64 `db:"total_fuel_liters"`
	CompartmentSensors []byte   `db:"compartment_sensors"`
}

func fuelFromTelemetry(t nearestTelemetry) *float64 {
	if t.TotalFuelLiters != nil {
		return t.TotalFuelLiters
	}
	if len(t.CompartmentSensors) == 0 {
		return nil
	}
	var m map[string]float64
	if err := json.Unmarshal(t.CompartmentSensors, &m); err != nil {
		return nil
	}
	for _, v := range m {
		return &v
	}
	return nil
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL env var is not set")
	}
	db, err := sqlx.Connect("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()

	var rows []geofenceEventRow
	if err := db.SelectContext(ctx, &rows, `
		SELECT id, truck_id, occurred_at
		FROM   geofence_events
		WHERE  fuel_level IS NULL
		ORDER  BY occurred_at`); err != nil {
		log.Fatal("select geofence_events: ", err)
	}
	fmt.Printf("found %d geofence_events rows missing fuel_level\n", len(rows))

	updated, noMatch := 0, 0
	for _, r := range rows {
		var nearest nearestTelemetry
		err := db.GetContext(ctx, &nearest, `
			SELECT total_fuel_liters, compartment_sensors
			FROM   truck_telemetry
			WHERE  truck_id = $1
			ORDER  BY ABS(EXTRACT(EPOCH FROM (timestamp - $2::timestamptz)))
			LIMIT  1`, r.TruckID, r.OccurredAt)
		if err != nil {
			noMatch++
			continue
		}
		fuel := fuelFromTelemetry(nearest)
		if fuel == nil {
			noMatch++
			continue
		}
		if _, err := db.ExecContext(ctx, `UPDATE geofence_events SET fuel_level = $1 WHERE id = $2`, *fuel, r.ID); err != nil {
			log.Fatalf("update %s: %v", r.ID, err)
		}
		updated++
	}

	fmt.Printf("backfilled %d rows, %d had no matching telemetry\n", updated, noMatch)
}
