// Strict re-verification: a COMPLETED trip is only trusted if there's a real
// geofence_events row whose trip_id matches THIS trip's own id exactly.
// Proximity alone is not enough — when two trips share a near-identical
// destination (common in repeated test dispatches), a proximity-only check
// can credit trip A with an arrival event that actually belongs to trip B.
package main

import (
    "context"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; "github.com/lib/pq"
)

func main() {
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" { log.Fatal("DATABASE_URL env var is not set") }
    db, err := sqlx.Connect("postgres", dbURL)
    if err != nil { log.Fatal(err) }
    defer db.Close()

    fmt.Println("--- COMPLETED trips: strict trip_id-matched evidence only ---")
    rows, err := db.QueryContext(context.Background(), `
        SELECT t.id, t.dest_name,
               EXISTS (
                 SELECT 1 FROM geofence_events ge
                 WHERE ge.trip_id = t.id AND ge.event_type='ENTER' AND ge.geofence_type='STATION'
               ) AS has_own_arrival
        FROM   trips t
        WHERE  t.status = 'COMPLETED'
        ORDER  BY t.created_at`)
    if err != nil { log.Fatal(err) }
    var toRevert []string
    for rows.Next() {
        var id, destName string
        var hasOwn bool
        if err := rows.Scan(&id, &destName, &hasOwn); err != nil { log.Fatal("scan: ", err) }
        fmt.Printf("trip %s | %-22s | has_own_arrival_event=%v\n", id[:8], destName, hasOwn)
        if !hasOwn { toRevert = append(toRevert, id) }
    }
    rows.Close()

    if len(toRevert) == 0 {
        fmt.Println("\nAll COMPLETED trips have their own genuine arrival event. Nothing to revert.")
        return
    }
    fmt.Printf("\nReverting %d trip(s) with no genuinely-own arrival event:\n", len(toRevert))
    for _, id := range toRevert { fmt.Println(" -", id) }
    res, err := db.ExecContext(context.Background(), `
        UPDATE trips SET status = 'CANCELLED' WHERE status = 'COMPLETED' AND id = ANY($1)`,
        pq.Array(toRevert))
    if err != nil { log.Fatal("revert: ", err) }
    n, _ := res.RowsAffected()
    fmt.Printf("reverted %d trip(s).\n", n)
}
