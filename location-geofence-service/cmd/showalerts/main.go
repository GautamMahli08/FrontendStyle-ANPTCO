// Read-only diagnostic: prints the most recent rows from the alerts table.
package main
import (
    "context"; "encoding/json"; "fmt"; "log"; "os"
    "github.com/jmoiron/sqlx"; _ "github.com/lib/pq"
)
func main() {
    db, err := sqlx.Connect("postgres", os.Getenv("DATABASE_URL"))
    if err != nil { log.Fatal(err) }
    defer db.Close()
    rows, err := db.QueryContext(context.Background(),
        `SELECT type, status, severity, occurred_at, payload FROM alerts ORDER BY occurred_at DESC LIMIT 20`)
    if err != nil { log.Fatal(err) }
    found := false
    for rows.Next() {
        found = true
        var typ, status, occurredAt string
        var severity int
        var payload json.RawMessage
        rows.Scan(&typ, &status, &severity, &occurredAt, &payload)
        fmt.Printf("%s | %s | sev=%d | %s | %s\n", typ, status, severity, occurredAt, string(payload))
    }
    if !found { fmt.Println("(no alerts in table)") }
}
