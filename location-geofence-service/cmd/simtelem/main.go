// simtelem sends simulated flespi telemetry to the deployed geofence service
// to trigger EN_ROUTE→ARRIVED (mode=station) or DELIVERY_ACCEPTED→COMPLETED (mode=depot).
//
// Usage:
//
//	SECRETS_ARN=<arn> go run ./cmd/simtelem --mode station
//	SECRETS_ARN=<arn> go run ./cmd/simtelem --mode depot
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/anptco/location-geofence-service/internal/secrets"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

const (
	ingestURL     = "https://ypiw5y4iu4.execute-api.ap-south-1.amazonaws.com/ingest/telemetry"
	webhookSecret = "production-secret"
)

func main() {
	mode    := flag.String("mode", "station", "station = trigger ARRIVED, depot = trigger COMPLETED, seed = just update live position")
	seedLat := flag.Float64("lat", 0, "latitude for seed mode (required with --mode seed)")
	seedLng := flag.Float64("lng", 0, "longitude for seed mode (required with --mode seed)")
	flag.Parse()

	ctx := context.Background()

	// ── DB connection ─────────────────────────────────────────────────────────
	arn := os.Getenv("SECRETS_ARN")
	if arn == "" {
		log.Fatal("SECRETS_ARN env var is required")
	}
	sec, err := secrets.Fetch(ctx, arn)
	if err != nil {
		log.Fatalf("secrets: %v", err)
	}

	db, err := sqlx.ConnectContext(ctx, "postgres", sec.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer db.Close()

	// ── Look up truck IMEI ────────────────────────────────────────────────────
	var ident string
	if err := db.QueryRowContext(ctx,
		`SELECT galileosky_device_id FROM trucks ORDER BY created_at LIMIT 1`,
	).Scan(&ident); err != nil {
		log.Fatalf("truck IMEI: %v", err)
	}
	fmt.Printf("Truck IMEI: %s\n", ident)

	// ── Look up target coordinates ────────────────────────────────────────────
	var lat, lng float64
	var zoneName string

	switch *mode {
	case "seed":
		if *seedLat == 0 || *seedLng == 0 {
			log.Fatal("--mode seed requires --lat and --lng flags\nExample: go run ./cmd/simtelem --mode seed --lat 17.3850 --lng 78.4867")
		}
		lat, lng, zoneName = *seedLat, *seedLng, "seed position"

	case "station":
		// Find the station geofence linked to an active EN_ROUTE order
		err = db.QueryRowContext(ctx, `
			SELECT g.latitude, g.longitude, COALESCE(g.name, 'station') AS name
			FROM   geofences g
			JOIN   orders    o ON o.destination_station_id = g.ref_id
			                   AND g.type = 'STATION'
			WHERE  o.status = 'EN_ROUTE'
			LIMIT  1`,
		).Scan(&lat, &lng, &zoneName)
		if err != nil {
			log.Fatalf("station geofence: %v\nMake sure an order is in EN_ROUTE status first.", err)
		}

	case "depot":
		// Find the DEPOT geofence in the transporter's workspace
		err = db.QueryRowContext(ctx, `
			SELECT g.latitude, g.longitude, COALESCE(g.name, 'depot') AS name
			FROM   geofences g
			WHERE  g.type = 'DEPOT'
			LIMIT  1`,
		).Scan(&lat, &lng, &zoneName)
		if err != nil {
			log.Fatalf("depot geofence: %v\nMake sure TRANSPORT_ADMIN has registered a depot.", err)
		}

	default:
		log.Fatalf("unknown mode %q — use 'seed', 'station', or 'depot'", *mode)
	}

	fmt.Printf("Target zone: %s (%.6f, %.6f)\n", zoneName, lat, lng)

	// ── Build flespi-format payload ────────────────────────────────────────────
	// Place the truck exactly at the geofence centre — well within any radius.
	msg := map[string]interface{}{
		"ident":             ident,
		"timestamp":         float64(time.Now().Unix()),
		"position.latitude": lat,
		"position.longitude": lng,
		"position.speed":    0.0,
	}
	body, _ := json.Marshal([]interface{}{msg})

	fmt.Printf("Payload: %s\n", body)

	// ── Sign and send ─────────────────────────────────────────────────────────
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, ingestURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Flespi-Signature", sig)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	fmt.Printf("HTTP %d — %v\n", resp.StatusCode, result)

	if resp.StatusCode == http.StatusOK {
		switch *mode {
		case "seed":
			fmt.Println("\n✓ Live position updated. Truck will now appear on the fleet map.")
		case "station":
			fmt.Println("\n✓ Telemetry accepted. Order should now be ARRIVED.")
			fmt.Println("  → CLIENT can now scan the truck QR to confirm delivery.")
		case "depot":
			fmt.Println("\n✓ Telemetry accepted. Order should now be COMPLETED.")
		}
	}
}
