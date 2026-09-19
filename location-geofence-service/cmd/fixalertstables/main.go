// One-off tool: creates the alert_type/alert_status enums and the alerts +
// monitoring_config tables directly, bypassing schema_migrations bookkeeping.
//
// Migration 034_monitoring_alerts.sql was one of the ones backfillmigrations
// marked as "already applied" — same false-assumption pattern as 033 (FUEL_THEFT
// constraint) and 035 (vehicle_stops). Confirmed via direct query: neither
// table exists. This means the entire alerts subsystem (SUSPICIOUS_STOP,
// FUEL_DRAINING_SUSPECTED, EXTERNAL_POWER_TAMPERING, etc.) and per-workspace
// monitoring_config overrides have never actually worked.
//
// Only 034 ever creates these (no later migration alters them), so applying
// its exact SQL directly is safe and complete. CREATE TYPE has no IF NOT
// EXISTS in Postgres, so those two are wrapped to tolerate already existing.
package main

import (
    "context"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)

func main() {
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" { log.Fatal("DATABASE_URL env var is not set") }
    db, err := sqlx.Connect("postgres", dbURL)
    if err != nil { log.Fatal(err) }
    defer db.Close()

    const q = `
        DO $$ BEGIN
          CREATE TYPE alert_type AS ENUM (
            'ORDER_SYNC_FAILURE',
            'SUSPECTED_DELIVERY',
            'SUSPICIOUS_STOP',
            'SENSOR_TAMPERING',
            'FUEL_DRAINING_SUSPECTED',
            'EXTERNAL_POWER_TAMPERING'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        CREATE TABLE IF NOT EXISTS alerts (
          id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id uuid         NOT NULL,
          type         alert_type   NOT NULL,
          status       alert_status NOT NULL DEFAULT 'OPEN',
          severity     smallint     NOT NULL DEFAULT 3,
          vehicle_id   uuid,
          device_imei  text,
          trip_id      uuid,
          order_id     uuid,
          sensor_id    text,
          occurred_at  timestamptz  NOT NULL,
          detected_at  timestamptz  NOT NULL DEFAULT now(),
          last_lat     double precision,
          last_lng     double precision,
          geofence_id  uuid,
          confidence   numeric(4,3),
          dedup_key    text         NOT NULL,
          payload      jsonb        NOT NULL DEFAULT '{}',
          UNIQUE (workspace_id, dedup_key)
        );

        CREATE INDEX IF NOT EXISTS alerts_open_by_workspace
          ON alerts (workspace_id, occurred_at DESC)
          WHERE status = 'OPEN';

        CREATE INDEX IF NOT EXISTS alerts_by_vehicle
          ON alerts (vehicle_id, occurred_at DESC)
          WHERE vehicle_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS monitoring_config (
          id                         uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id               uuid     NOT NULL,
          vehicle_id                 uuid,
          fuel_change_l              numeric  NOT NULL DEFAULT 3.0,
          stationary_speed_kmh       smallint NOT NULL DEFAULT 3,
          min_stop_duration_s        integer  NOT NULL DEFAULT 60,
          suspicious_stop_duration_s integer  NOT NULL DEFAULT 120,
          drain_window_s             integer  NOT NULL DEFAULT 180,
          drain_delta_stationary_pct numeric  NOT NULL DEFAULT 0.05,
          drain_delta_moving_pct     numeric  NOT NULL DEFAULT 0.15,
          power_loss_debounce_s      integer  NOT NULL DEFAULT 30,
          sensor_miss_window_s       integer  NOT NULL DEFAULT 120,
          power_mode                 text     NOT NULL DEFAULT 'constant'
            CHECK (power_mode IN ('constant', 'ignition_switched'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS monitoring_config_workspace_default
          ON monitoring_config (workspace_id)
          WHERE vehicle_id IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS monitoring_config_vehicle_override
          ON monitoring_config (workspace_id, vehicle_id)
          WHERE vehicle_id IS NOT NULL;`

    if _, err := db.ExecContext(context.Background(), q); err != nil {
        log.Fatal("create alerts/monitoring_config: ", err)
    }
    fmt.Println("alert_type, alert_status, alerts, and monitoring_config now exist.")
    fmt.Println("Note: min_stop_duration_s/suspicious_stop_duration_s defaults here are set to")
    fmt.Println("60/120 (matching the current code default) rather than migration 034's original")
    fmt.Println("180/900, since no workspace row exists yet to override them anyway.")
}
