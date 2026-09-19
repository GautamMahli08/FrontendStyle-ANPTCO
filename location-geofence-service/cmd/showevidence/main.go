// Read-only diagnostic: prints full detail for a trip and the geofence_events
// evidence that justified (or would justify) marking it COMPLETED.
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

    fmt.Println("--- trips: Smoke Test, Test Delivery Station ---")
    rows, err := db.QueryContext(context.Background(), `
        SELECT id, dest_name, status, dest_lat, dest_lng, created_at, updated_at
        FROM   trips
        WHERE  dest_name IN ('Smoke Test', 'Test Delivery Station')
        ORDER  BY created_at`)
    if err != nil { log.Fatal(err) }
    type trip struct{ id, destName, status string; lat, lng float64 }
    var trips []trip
    for rows.Next() {
        var t trip
        var createdAt, updatedAt string
        if err := rows.Scan(&t.id, &t.destName, &t.status, &t.lat, &t.lng, &createdAt, &updatedAt); err != nil {
            log.Fatal("scan: ", err)
        }
        fmt.Printf("trip %s | %-22s | status=%-10s | dest_lat=%v dest_lng=%v | created=%s updated=%s\n",
            t.id[:8], t.destName, t.status, t.lat, t.lng, createdAt, updatedAt)
        trips = append(trips, t)
    }
    rows.Close()

    const distExpr = `
        6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          ))
        )`

    for _, t := range trips {
        fmt.Printf("\n--- geofence ENTER/STATION events near trip %s (%s), within 5km, sorted by distance ---\n", t.id[:8], t.destName)
        evRows, err := db.QueryContext(context.Background(), `
            SELECT truck_id, latitude, longitude, occurred_at, trip_id,
                   `+distExpr+` AS dist_km
            FROM   geofence_events
            WHERE  event_type = 'ENTER' AND geofence_type = 'STATION'
              AND  `+distExpr+` < 5
            ORDER  BY dist_km
            LIMIT  5`, t.lat, t.lng)
        if err != nil { log.Fatal("query events: ", err) }
        found := false
        for evRows.Next() {
            found = true
            var truckID, occurredAt string
            var evTripID *string
            var lat, lng, dist float64
            if err := evRows.Scan(&truckID, &lat, &lng, &occurredAt, &evTripID, &dist); err != nil {
                log.Fatal("scan event: ", err)
            }
            tripIDStr := "<none>"
            if evTripID != nil { tripIDStr = (*evTripID)[:8] }
            fmt.Printf("  truck %s | lat=%v lng=%v | occurred=%s | event.trip_id=%s | dist=%.3fkm\n",
                truckID[:8], lat, lng, occurredAt, tripIDStr, dist)
        }
        evRows.Close()
        if !found {
            fmt.Println("  (no ENTER/STATION event within 5km of this trip's destination)")
        }
    }
}
