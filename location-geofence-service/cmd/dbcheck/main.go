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
}
