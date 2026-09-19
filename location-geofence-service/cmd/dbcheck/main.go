package main

import (
    "context"; "database/sql"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)
func main() {
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" { log.Fatal("DATABASE_URL env var is not set") }
    db, err := sqlx.Connect("postgres", dbURL)
    if err != nil { log.Fatal(err) }
    defer db.Close()
    rows, err := db.QueryContext(context.Background(),
        `SELECT id, COALESCE(license_plate,'?'), COALESCE(galileosky_device_id,'<none>') FROM trucks ORDER BY created_at`)
    if err != nil { log.Fatal(err) }
    for rows.Next() {
        var id, plate, imei string
        rows.Scan(&id, &plate, &imei)
        fmt.Printf("truck %s | %-12s | imei: %s\n", id[:8], plate, imei)
    }
    rows.Close()

    fmt.Println("\n--- active trips (not COMPLETED/CANCELLED) ---")
    tripRows, err := db.QueryContext(context.Background(),
        `SELECT id, truck_id, dest_name, status, dest_lat, dest_lng, created_at, updated_at
         FROM trips WHERE status NOT IN ('COMPLETED','CANCELLED') ORDER BY created_at`)
    if err != nil { log.Fatal(err) }
    defer tripRows.Close()
    for tripRows.Next() {
        var id, truckID, destName, status string
        var destLat, destLng float64
        var createdAt, updatedAt string
        if err := tripRows.Scan(&id, &truckID, &destName, &status, &destLat, &destLng, &createdAt, &updatedAt); err != nil {
            fmt.Println("scan error:", err)
            continue
        }
        fmt.Printf("trip %s | truck %s | %-12s | %-10s | lat=%v lng=%v | created=%s updated=%s\n",
            id[:8], truckID[:8], destName, status, destLat, destLng, createdAt, updatedAt)
    }
    tripRows.Close()

    fmt.Println("\n--- truck_live_state (raw telemetry snapshot per truck) ---")
    lsRows, err := db.QueryContext(context.Background(),
        `SELECT truck_id, latitude, longitude, speed, last_message_at, updated_at,
                now() - last_message_at AS age
         FROM truck_live_state ORDER BY updated_at DESC`)
    if err != nil { log.Fatal(err) }
    defer lsRows.Close()
    found := false
    for lsRows.Next() {
        found = true
        var truckID string
        var lat, lng, speed sql.NullFloat64
        var lastMsgAt, updatedAt sql.NullTime
        var age sql.NullString
        if err := lsRows.Scan(&truckID, &lat, &lng, &speed, &lastMsgAt, &updatedAt, &age); err != nil {
            fmt.Println("scan error:", err)
            continue
        }
        fmt.Printf("truck %s | lat=%v lng=%v speed=%v | last_message_at=%v (age: %v) | row_updated_at=%v\n",
            truckID[:8], lat.Float64, lng.Float64, speed.Float64, lastMsgAt.Time, age.String, updatedAt.Time)
    }
    if !found {
        fmt.Println("(no rows in truck_live_state at all)")
    }

    fmt.Println("\n--- all trips with GPS-carrying event count (helps explain straight-line routes) ---")
    allRows, err := db.QueryContext(context.Background(), `
        SELECT t.id, t.dest_name, t.status,
               COUNT(e.id) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL) AS gps_events,
               MIN(e.occurred_at) AS first_event, MAX(e.occurred_at) AS last_event
        FROM trips t
        LEFT JOIN asset_events e ON e.truck_id = t.truck_id
            AND e.occurred_at >= t.created_at AND e.occurred_at <= t.updated_at
        GROUP BY t.id, t.dest_name, t.status, t.created_at
        ORDER BY t.created_at`)
    if err != nil { log.Fatal(err) }
    defer allRows.Close()
    for allRows.Next() {
        var id, destName, status string
        var gpsEvents int
        var firstEvent, lastEvent sql.NullTime
        if err := allRows.Scan(&id, &destName, &status, &gpsEvents, &firstEvent, &lastEvent); err != nil {
            fmt.Println("scan error:", err)
            continue
        }
        fmt.Printf("trip %s | %-12s | %-10s | gps_events=%d | first=%v last=%v\n",
            id[:8], destName, status, gpsEvents, firstEvent.Time, lastEvent.Time)
    }
}
