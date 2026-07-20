// updateimei updates a truck's galileosky_device_id from a placeholder to the
// real device IMEI so the geofence service can match incoming flespi telemetry.
//
// Usage:
//
//	SECRETS_ARN=<arn> go run ./cmd/updateimei --old TEST-DEVICE-001 --new 865513072039759
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/anptco/core-api/internal/secrets"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	oldID := flag.String("old", "", "current galileosky_device_id to replace")
	newID := flag.String("new", "", "real IMEI to set")
	flag.Parse()

	if *oldID == "" || *newID == "" {
		log.Fatal("both --old and --new flags are required")
	}

	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		arn := os.Getenv("SECRETS_ARN")
		if arn == "" {
			log.Fatal("either DATABASE_URL or SECRETS_ARN env var is required")
		}
		sec, err := secrets.Fetch(ctx, arn)
		if err != nil {
			log.Fatalf("secrets: %v", err)
		}
		dbURL = sec.DatabaseURL
	}

	db, err := sqlx.ConnectContext(ctx, "postgres", dbURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer db.Close()

	result, err := db.ExecContext(ctx,
		`UPDATE trucks SET galileosky_device_id = $1 WHERE galileosky_device_id = $2`,
		*newID, *oldID,
	)
	if err != nil {
		log.Fatalf("update: %v", err)
	}

	n, _ := result.RowsAffected()
	if n == 0 {
		fmt.Printf("No truck found with device_id = %q\n", *oldID)
		return
	}
	fmt.Printf("✓ Updated %d truck(s): %q → %q\n", n, *oldID, *newID)
	fmt.Println("  The geofence service will now recognise incoming flespi telemetry")
	fmt.Println("  and update truck_live_state automatically.")
}
