// One-off tool: applies migrations/033_fuel_theft_constraint.sql's exact SQL
// directly, bypassing schema_migrations bookkeeping.
//
// That migration was one of the ones backfillmigrations marked as
// "already applied" on the assumption the live schema already reflected
// everything through 036 (since higher-level tables like trips/asset_events
// clearly existed). That assumption was wrong for this specific constraint:
// asset_events' CHECK constraint never actually got the FUEL_THEFT value
// added, so every FUEL_THEFT insert has been silently failing since the
// detector started emitting that event type. Confirmed live via a real
// injected telemetry drop that correctly triggered FUEL_THEFT detection but
// failed on insert with "violates check constraint asset_events_event_type_check".
//
// Only 029_asset_events.sql (creation) and 033 (this fix) ever touch this
// constraint, so applying 033's SQL directly is safe and complete — nothing
// added it to since. Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
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
        ALTER TABLE asset_events
          DROP CONSTRAINT IF EXISTS asset_events_event_type_check;

        ALTER TABLE asset_events
          ADD CONSTRAINT asset_events_event_type_check
          CHECK (event_type IN (
            'FUEL_FILL', 'FUEL_DRAIN', 'FUEL_THEFT',
            'BATTERY_ON', 'BATTERY_OFF',
            'IGNITION_ON', 'IGNITION_OFF',
            'MOVEMENT_START', 'MOVEMENT_STOP'
          ));`

    if _, err := db.ExecContext(context.Background(), q); err != nil {
        log.Fatal("apply constraint: ", err)
    }
    fmt.Println("asset_events_event_type_check now allows FUEL_THEFT.")
}
