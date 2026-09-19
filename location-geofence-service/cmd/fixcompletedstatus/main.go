// One-off corrective tool: some trips got marked CANCELLED by the old
// auto-cancel-on-redispatch logic (removed this session) even though they
// had genuinely already reached their destination — they were stuck at
// ARRIVED (Mode B trips couldn't complete without a QR scan, also fixed
// this session) when the unrelated cancel swept them up.
//
// Finds every CANCELLED trip that has a real geofence_events row proving
// it entered its destination (STATION) geofence, and flips those back to
// COMPLETED. Trips with no such evidence are left CANCELLED — they never
// actually arrived.
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

    fmt.Println("--- CANCELLED trips with evidence of reaching their destination ---")
    rows, err := db.QueryContext(context.Background(), `
        SELECT t.id, t.dest_name, t.created_at
        FROM   trips t
        WHERE  t.status = 'CANCELLED'
          AND  EXISTS (
                 SELECT 1 FROM geofence_events ge
                 WHERE ge.trip_id = t.id
                   AND ge.event_type = 'ENTER'
                   AND ge.geofence_type = 'STATION'
               )
        ORDER  BY t.created_at`)
    if err != nil { log.Fatal(err) }
    var ids []string
    for rows.Next() {
        var id, destName, createdAt string
        if err := rows.Scan(&id, &destName, &createdAt); err != nil { log.Fatal("scan: ", err) }
        fmt.Printf("trip %s | %-12s | created=%s\n", id[:8], destName, createdAt)
        ids = append(ids, id)
    }
    rows.Close()

    if len(ids) == 0 {
        fmt.Println("(none found via geofence_events.trip_id — trying fallback: trips whose")
        fmt.Println(" destination coords have an ENTER/STATION event from the same truck")
        fmt.Println(" within the trip's own created_at..updated_at window)")
        rows2, err := db.QueryContext(context.Background(), `
            SELECT t.id, t.dest_name, t.created_at
            FROM   trips t
            WHERE  t.status = 'CANCELLED'
              AND  EXISTS (
                     SELECT 1 FROM geofence_events ge
                     WHERE ge.truck_id = t.truck_id
                       AND ge.event_type = 'ENTER'
                       AND ge.geofence_type = 'STATION'
                       AND ge.occurred_at >= t.created_at
                       AND ge.occurred_at <= t.updated_at
                   )
            ORDER  BY t.created_at`)
        if err != nil { log.Fatal(err) }
        for rows2.Next() {
            var id, destName, createdAt string
            if err := rows2.Scan(&id, &destName, &createdAt); err != nil { log.Fatal("scan: ", err) }
            fmt.Printf("trip %s | %-12s | created=%s\n", id[:8], destName, createdAt)
            ids = append(ids, id)
        }
        rows2.Close()
    }

    if len(ids) == 0 {
        fmt.Println("(nothing to fix — no CANCELLED trip has evidence of reaching its destination)")
        return
    }

    res, err := db.ExecContext(context.Background(), `
        UPDATE trips
        SET    status = 'COMPLETED'
        WHERE  status = 'CANCELLED'
          AND  (
                 EXISTS (SELECT 1 FROM geofence_events ge WHERE ge.trip_id = trips.id
                         AND ge.event_type='ENTER' AND ge.geofence_type='STATION')
              OR EXISTS (SELECT 1 FROM geofence_events ge WHERE ge.truck_id = trips.truck_id
                         AND ge.event_type='ENTER' AND ge.geofence_type='STATION'
                         AND ge.occurred_at >= trips.created_at AND ge.occurred_at <= trips.updated_at)
               )`)
    if err != nil { log.Fatal("update: ", err) }
    n, _ := res.RowsAffected()
    fmt.Printf("\ncorrected %d trip(s) from CANCELLED to COMPLETED.\n", n)
}
