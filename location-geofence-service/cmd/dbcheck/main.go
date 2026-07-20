package main

import (
    "context"; "fmt"; "log"; "os"
    "github.com/anptco/location-geofence-service/internal/secrets"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)
func main() {
    sec, err := secrets.Fetch(context.Background(), os.Getenv("SECRETS_ARN"))
    if err != nil { log.Fatal(err) }
    db, err := sqlx.Connect("postgres", sec.DatabaseURL)
    if err != nil { log.Fatal(err) }
    defer db.Close()
    rows, err := db.QueryContext(context.Background(),
        `SELECT id, COALESCE(license_plate,'?'), COALESCE(galileosky_device_id,'<none>') FROM trucks ORDER BY created_at`)
    if err != nil { log.Fatal(err) }
    defer rows.Close()
    for rows.Next() {
        var id, plate, imei string
        rows.Scan(&id, &plate, &imei)
        fmt.Printf("truck %s | %-12s | imei: %s\n", id[:8], plate, imei)
    }
}
