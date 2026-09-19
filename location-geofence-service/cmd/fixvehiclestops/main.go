// One-off tool: creates the vehicle_stops table directly, bypassing
// schema_migrations bookkeeping.
//
// Migration 035_vehicle_stops.sql was one of the ones backfillmigrations
// marked as "already applied" on the assumption the live schema already
// reflected everything through 036. That assumption was wrong here too
// (same pattern as 033's FUEL_THEFT constraint): the table was never
// actually created, so every telemetry message has been silently failing
// stop-detection ("stop: get open for vehicle ...: relation \"vehicle_stops\"
// does not exist") since the monitoring feature was added.
//
// Only 035 ever creates this table (no later migration alters it), so
// applying its exact SQL directly is safe and complete.
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
        CREATE TABLE IF NOT EXISTS vehicle_stops (
          id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id    uuid     NOT NULL,
          vehicle_id      uuid     NOT NULL REFERENCES trucks(id),
          trip_id         uuid,
          lat             double precision NOT NULL,
          lng             double precision NOT NULL,
          started_at      timestamptz NOT NULL,
          ended_at        timestamptz,
          duration_s      integer,
          inside_geofence boolean  NOT NULL DEFAULT false,
          geofence_id     uuid,
          geofence_name   text,
          classification  text     NOT NULL DEFAULT 'NORMAL'
            CHECK (classification IN ('NORMAL', 'SUSPICIOUS')),
          reasons         text[]   NOT NULL DEFAULT '{}',
          dedup_key       text     NOT NULL,
          UNIQUE (workspace_id, dedup_key)
        );

        CREATE INDEX IF NOT EXISTS vehicle_stops_by_vehicle
          ON vehicle_stops (vehicle_id, started_at DESC);

        CREATE INDEX IF NOT EXISTS vehicle_stops_open
          ON vehicle_stops (vehicle_id)
          WHERE ended_at IS NULL;`

    if _, err := db.ExecContext(context.Background(), q); err != nil {
        log.Fatal("create vehicle_stops: ", err)
    }
    fmt.Println("vehicle_stops table (and its indexes) now exist.")
}
