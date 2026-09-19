// One-off tool: backfills trip_id on existing asset_events rows recorded
// before migration 038 added the column (and before the ingest pipeline
// started tagging new events with it directly).
//
// Rule: for each event with trip_id still NULL, assign the trip (same
// truck) whose created_at is the latest one at-or-before the event's
// occurred_at. That is exactly "whichever trip was most recently
// dispatched for this truck at the moment this event happened" — the
// trip that was actually active then, regardless of what its status is
// now or whether a later trip has since superseded it.
//
// Events with no trip created yet at their timestamp (e.g. very early
// test data) are left NULL — there's nothing to assign them to.
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
        UPDATE asset_events ae
        SET    trip_id = t.id
        FROM   trips t
        WHERE  ae.trip_id IS NULL
          AND  t.truck_id = ae.truck_id
          AND  t.created_at = (
                 SELECT MAX(t2.created_at)
                 FROM   trips t2
                 WHERE  t2.truck_id = ae.truck_id
                   AND  t2.created_at <= ae.occurred_at
               )`

    res, err := db.ExecContext(context.Background(), q)
    if err != nil { log.Fatal("backfill trip_id: ", err) }
    n, _ := res.RowsAffected()
    fmt.Printf("backfilled trip_id on %d asset_events row(s).\n", n)

    var stillNull int
    if err := db.GetContext(context.Background(), &stillNull,
        `SELECT COUNT(*) FROM asset_events WHERE trip_id IS NULL`); err != nil {
        log.Fatal("count remaining: ", err)
    }
    fmt.Printf("%d row(s) still have no trip_id (no trip existed yet at their timestamp).\n", stillNull)
}
