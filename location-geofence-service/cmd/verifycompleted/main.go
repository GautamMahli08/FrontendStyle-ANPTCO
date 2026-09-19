// Verification/correction tool for the trips fixcompletedstatus touched.
//
// fixcompletedstatus's fallback check only verified "some station geofence
// was entered sometime within this trip's [created_at, updated_at] window" —
// too loose, since a cancelled trip's updated_at is stale (set whenever an
// unrelated later dispatch cancelled it, not when the trip's own activity
// ended). That could match a trip to a station entry that belongs to a
// DIFFERENT destination entirely, as long as it happened before the trip
// got cancelled weeks later.
//
// This re-checks properly: for each currently-COMPLETED trip, is there a
// real geofence_events (ENTER, STATION) row within ~1km of THIS TRIP'S OWN
// dest_lat/dest_lng, at or after its own created_at? Trips that fail this
// stricter, coordinate-based check are reverted back to CANCELLED.
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

    // Haversine distance in km between the geofence event and the trip's own
    // destination coordinates.
    const distExpr = `
        6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians(t.dest_lat)) * cos(radians(ge.latitude)) *
            cos(radians(ge.longitude) - radians(t.dest_lng)) +
            sin(radians(t.dest_lat)) * sin(radians(ge.latitude))
          ))
        )`

    fmt.Println("--- COMPLETED trips checked against their OWN destination coordinates ---")
    rows, err := db.QueryContext(context.Background(), `
        SELECT t.id, t.dest_name, t.dest_lat, t.dest_lng,
               MIN(`+distExpr+`) AS min_dist_km
        FROM   trips t
        LEFT   JOIN geofence_events ge
               ON ge.truck_id = t.truck_id
              AND ge.event_type = 'ENTER'
              AND ge.geofence_type = 'STATION'
              AND ge.occurred_at >= t.created_at
        WHERE  t.status = 'COMPLETED'
        GROUP  BY t.id, t.dest_name, t.dest_lat, t.dest_lng
        ORDER  BY t.created_at`)
    if err != nil { log.Fatal(err) }
    type result struct{ id, destName string; dist *float64 }
    var results []result
    for rows.Next() {
        var id, destName string
        var destLat, destLng float64
        var dist *float64
        if err := rows.Scan(&id, &destName, &destLat, &destLng, &dist); err != nil { log.Fatal("scan: ", err) }
        results = append(results, result{id, destName, dist})
        distStr := "no station-entry event at all"
        if dist != nil {
            distStr = fmt.Sprintf("%.3f km from its own destination", *dist)
        }
        fmt.Printf("trip %s | %-14s | %s\n", id[:8], destName, distStr)
    }
    rows.Close()

    var toRevert []string
    const thresholdKm = 1.0
    for _, r := range results {
        if r.dist == nil || *r.dist > thresholdKm {
            toRevert = append(toRevert, r.id)
        }
    }

    fmt.Printf("\n%d of %d COMPLETED trips verified within %.1fkm of their own destination.\n",
        len(results)-len(toRevert), len(results), thresholdKm)

    if len(toRevert) == 0 {
        fmt.Println("Nothing to revert.")
        return
    }

    fmt.Printf("Reverting %d trip(s) back to CANCELLED (no evidence they reached THEIR OWN destination):\n", len(toRevert))
    for _, id := range toRevert {
        fmt.Println(" -", id)
    }
    res, err := db.ExecContext(context.Background(), `
        UPDATE trips
        SET    status = 'CANCELLED'
        WHERE  status = 'COMPLETED'
          AND  id = ANY($1)`, pq.Array(toRevert))
    if err != nil { log.Fatal("revert: ", err) }
    n, _ := res.RowsAffected()
    fmt.Printf("reverted %d trip(s).\n", n)
}
