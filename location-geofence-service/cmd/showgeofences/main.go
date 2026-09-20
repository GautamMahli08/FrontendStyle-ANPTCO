// Read-only diagnostic: lists all geofences (depot + stations), and can be
// pointed at a workspace's alerts table by editing the query below.
package main
import (
    "context"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)
func main() {
    db, err := sqlx.Connect("postgres", os.Getenv("DATABASE_URL"))
    if err != nil { log.Fatal(err) }
    defer db.Close()
    rows, err := db.QueryContext(context.Background(),
        `SELECT type, name, latitude, longitude, radius_meters FROM geofences ORDER BY type`)
    if err != nil { log.Fatal(err) }
    for rows.Next() {
        var typ, name string
        var lat, lng float64
        var radius int
        rows.Scan(&typ, &name, &lat, &lng, &radius)
        fmt.Printf("%s | %s | lat=%v lng=%v radius=%dm\n", typ, name, lat, lng, radius)
    }
}
