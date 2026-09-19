// Diagnostic tool: prints the current definition of a few CHECK constraints
// this session repeatedly found falsely marked "applied" without actually
// having taken effect. Read-only.
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

    for _, name := range []string{"asset_events_event_type_check", "trips_status_check"} {
        var def string
        err := db.GetContext(context.Background(), &def,
            `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = $1`, name)
        if err != nil {
            fmt.Printf("%s: (not found / error: %v)\n", name, err)
            continue
        }
        fmt.Printf("%s: %s\n", name, def)
    }
}
