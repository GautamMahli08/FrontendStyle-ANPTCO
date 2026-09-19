// One-off cleanup tool: marks every non-terminal trip (status not
// COMPLETED/CANCELLED) as CANCELLED, except the single most recently
// created trip per truck — that one is left alone since it may still be
// genuinely in progress.
//
// This is a one-time manual cleanup of trips accumulated while
// auto-cancel-on-redispatch was active (now removed in favor of trips
// completing naturally on arrival). Safe to re-run.
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

    fmt.Println("--- trips that will be marked CANCELLED ---")
    rows, err := db.QueryContext(context.Background(), `
        SELECT id, truck_id, dest_name, status, created_at
        FROM   trips t
        WHERE  status NOT IN ('COMPLETED', 'CANCELLED')
          AND  created_at < (
                 SELECT MAX(t2.created_at) FROM trips t2 WHERE t2.truck_id = t.truck_id
               )
        ORDER  BY created_at`)
    if err != nil { log.Fatal(err) }
    var ids []string
    for rows.Next() {
        var id, truckID, destName, status, createdAt string
        if err := rows.Scan(&id, &truckID, &destName, &status, &createdAt); err != nil {
            log.Fatal("scan: ", err)
        }
        fmt.Printf("trip %s | truck %s | %-12s | %-10s | created=%s\n", id[:8], truckID[:8], destName, status, createdAt)
        ids = append(ids, id)
    }
    rows.Close()

    if len(ids) == 0 {
        fmt.Println("(nothing to cancel)")
        return
    }

    res, err := db.ExecContext(context.Background(), `
        UPDATE trips t
        SET    status = 'CANCELLED', updated_at = now()
        WHERE  status NOT IN ('COMPLETED', 'CANCELLED')
          AND  created_at < (
                 SELECT MAX(t2.created_at) FROM trips t2 WHERE t2.truck_id = t.truck_id
               )`)
    if err != nil { log.Fatal("cancel: ", err) }
    n, _ := res.RowsAffected()
    fmt.Printf("\nmarked %d trip(s) as CANCELLED.\n", n)
}
