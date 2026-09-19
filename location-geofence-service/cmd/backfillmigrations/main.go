// One-off tool: this database's schema was already evolved to reflect
// migrations 001–036 (via some process outside this repo's migrations
// runner), but schema_migrations has no record of them being applied.
// Running the real MigrateFunction tries to replay 010_create_workspaces.sql
// from scratch and fails, because the live workspaces table already has
// columns (e.g. "type") that migration doesn't know about.
//
// This backfills schema_migrations with 001–036 as already-applied (does NOT
// run their SQL — the schema already reflects it), so the next real migrate
// invocation only attempts 037_trip_cancelled_status.sql, which is genuinely
// new. Safe to run more than once: INSERT ... ON CONFLICT DO NOTHING.
package main

import (
    "context"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)

var alreadyApplied = []string{
    "001_create_trucks.sql", "002_create_geofences.sql", "003_create_truck_live_state.sql",
    "004_create_truck_telemetry.sql", "005_create_geofence_state.sql", "006_create_geofence_events.sql",
    "007_create_orders.sql", "008_drop_current_geofence_id.sql", "009_extend_telemetry_partitions.sql",
    "010_create_workspaces.sql", "011_add_loading_statuses.sql", "012_tsp_onboarding.sql",
    "013_sensor_integration.sql", "014_trucks_qr_url.sql", "015_rls_workspace_isolation.sql",
    "016_full_order_lifecycle.sql", "017_client_onboarding.sql", "018_create_trips.sql",
    "019_dispatch_api.sql", "020_source_is_sandbox.sql", "021_trips_idempotency.sql",
    "022_audit_log.sql", "023_workspace_profile.sql", "024_fleet_drivers.sql",
    "025_device_inventory.sql", "026_device_assignments.sql", "027_dispatch_api_keys.sql",
    "028_erp_integration.sql", "029_asset_events.sql", "030_live_state_ignition.sql",
    "031_qr_codes.sql", "032_delivery_notes.sql", "033_fuel_theft_constraint.sql",
    "034_monitoring_alerts.sql", "035_vehicle_stops.sql", "036_synced_orders.sql",
}

func main() {
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" { log.Fatal("DATABASE_URL env var is not set") }
    db, err := sqlx.Connect("postgres", dbURL)
    if err != nil { log.Fatal(err) }
    defer db.Close()

    if _, err := db.ExecContext(context.Background(), `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT        PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`); err != nil {
        log.Fatal("create schema_migrations: ", err)
    }

    var already []string
    if err := db.SelectContext(context.Background(), &already, `SELECT filename FROM schema_migrations ORDER BY filename`); err != nil {
        log.Fatal("list existing: ", err)
    }
    fmt.Printf("schema_migrations currently has %d entries: %v\n\n", len(already), already)

    inserted := 0
    for _, f := range alreadyApplied {
        res, err := db.ExecContext(context.Background(),
            `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`, f)
        if err != nil {
            log.Fatalf("insert %s: %v", f, err)
        }
        if n, _ := res.RowsAffected(); n > 0 {
            inserted++
            fmt.Printf("marked applied: %s\n", f)
        }
    }
    fmt.Printf("\nDone — newly marked %d of %d migrations as already-applied.\n", inserted, len(alreadyApplied))
    fmt.Println("037_trip_cancelled_status.sql was NOT touched — it will run for real on the next MigrateFunction invoke.")
}
