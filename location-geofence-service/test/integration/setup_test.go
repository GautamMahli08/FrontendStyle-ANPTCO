// Package integration_test exercises the full ingestion pipeline against a real
// PostgreSQL database.  Tests are skipped when INTEGRATION_DATABASE_URL is not
// set so they never run accidentally in environments that lack a database.
//
// To run locally:
//
//	make test-integration
//
// Which starts the postgres-test container, exports the DSN, runs the tests,
// and tears the container down.
package integration_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/geofence"
	"github.com/anptco/location-geofence-service/internal/ingestion"
	"github.com/anptco/location-geofence-service/internal/location"
	"github.com/anptco/location-geofence-service/internal/notify"
	pgrepo "github.com/anptco/location-geofence-service/internal/repository/postgres"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

// ── Shared fixtures ───────────────────────────────────────────────────────────

var (
	testWorkspaceID = uuid.MustParse("aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa")
	testDeviceID    = "INTTEST-DEVICE-001"
	testDevice2ID   = "INTTEST-DEVICE-002"
	stationRefID    = "station-inttest"

	// Coordinates used across tests.
	stationLat, stationLon = 55.7500, 37.6200 // inside station fence (r=100 m)
	depotLat, depotLon     = 55.8000, 37.6000 // inside depot fence (r=200 m)
	farLat, farLon         = 56.0000, 38.5000 // far from all fences

	// Base timestamp — must fall in an existing partition (2026-06 to 2026-09).
	baseTime = time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
)

// ── DB helpers ────────────────────────────────────────────────────────────────

// openTestDB returns a connected pool, skipping the test if
// INTEGRATION_DATABASE_URL is not set.
func openTestDB(t *testing.T) *sqlx.DB {
	t.Helper()
	dsn := os.Getenv("INTEGRATION_DATABASE_URL")
	if dsn == "" {
		t.Skip("INTEGRATION_DATABASE_URL not set — skipping integration test")
	}
	pool, err := sqlx.ConnectContext(context.Background(), "postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	return pool
}

// applyMigrations executes every *.sql file from the migrations directory in
// lexical order. All DDL is written with IF NOT EXISTS so repeated calls are safe.
func applyMigrations(t *testing.T, db *sqlx.DB) {
	t.Helper()
	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = "../../migrations"
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read migrations dir %q: %v", dir, err)
	}
	var paths []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			paths = append(paths, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(paths)
	for _, p := range paths {
		sql, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("read %s: %v", p, err)
		}
		if _, err := db.ExecContext(context.Background(), string(sql)); err != nil {
			t.Fatalf("apply %s: %v", p, err)
		}
	}
}

// cleanTables removes all rows from every table used by the service, in an
// order that respects foreign-key constraints.
func cleanTables(t *testing.T, db *sqlx.DB) {
	t.Helper()
	ctx := context.Background()
	// geofence_events references trip_id (FK) — delete before trips.
	// trips reference orders, trucks, geofences — delete before those.
	for _, stmt := range []string{
		"DELETE FROM geofence_events",
		"DELETE FROM geofence_state",
		"DELETE FROM truck_telemetry",
		"DELETE FROM truck_live_state",
		"DELETE FROM trips",
		"DELETE FROM order_assignments",
		"DELETE FROM orders",
		"DELETE FROM trucks",
		"DELETE FROM geofences",
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("clean: %s: %v", stmt, err)
		}
	}
}

// ── Service stack ─────────────────────────────────────────────────────────────

// buildStack wires the full ingestion service against the given pool.
// Uses a no-op logger so test output isn't polluted.
func buildStack(db *sqlx.DB) *ingestion.Service {
	log := zap.NewNop()

	truckRepo := pgrepo.NewTruckRepository(db)
	telemetryRepo := pgrepo.NewTelemetryRepository(db)
	liveStateRepo := pgrepo.NewLiveStateRepository(db)
	geofenceRepo := pgrepo.NewGeofenceRepository(db)
	eventRepo := pgrepo.NewGeofenceEventRepository(db)
	tripRepo := pgrepo.NewTripRepository(db)
	tx := pgrepo.NewTransactor(db)

	cache := location.NewDeviceCache()
	locSvc := location.NewService(truckRepo, telemetryRepo, liveStateRepo, cache, log)
	geoSvc := geofence.NewService(geofenceRepo, eventRepo, tripRepo, tx, log, 100, 200, notify.NoopNotifier{})

	return ingestion.NewService(locSvc, geoSvc, log)
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

type seedIDs struct {
	truckID          uuid.UUID
	stationGeofenceID uuid.UUID
	depotGeofenceID  uuid.UUID
}

// seedTruck inserts a truck with testDeviceID and returns its UUID.
func seedTruck(t *testing.T, db *sqlx.DB) uuid.UUID {
	return seedTruckWithDevice(t, db, testDeviceID)
}

// seedTruckWithDevice inserts a truck with the given device ID and returns its UUID.
func seedTruckWithDevice(t *testing.T, db *sqlx.DB, deviceID string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO trucks (id, workspace_id, galileosky_device_id, status)
		VALUES ($1, $2, $3, 'IDLE')`,
		id, testWorkspaceID, deviceID,
	)
	if err != nil {
		t.Fatalf("seed truck (device=%s): %v", deviceID, err)
	}
	return id
}

// seedAssignment inserts an order_assignment and a corresponding trip for an
// additional truck on an existing order.  Each truck on a multi-truck order
// needs its own trip so the geofence service can find an active trip per truck.
func seedAssignment(t *testing.T, db *sqlx.DB, orderID, truckID uuid.UUID, status string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO order_assignments (id, order_id, truck_id, status)
		VALUES ($1, $2, $3, $4)`,
		id, orderID, truckID, status,
	)
	if err != nil {
		t.Fatalf("seed assignment: %v", err)
	}
	ensureWorkspace(t, db)
	seedTripForOrder(t, db, truckID, orderID, status)
	return id
}

// seedGeofences inserts a STATION and a DEPOT geofence and returns their IDs.
func seedGeofences(t *testing.T, db *sqlx.DB) (stationID, depotID uuid.UUID) {
	t.Helper()
	stationID = uuid.New()
	depotID = uuid.New()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO geofences (id, workspace_id, type, ref_id, name, latitude, longitude, radius_meters)
		VALUES
		  ($1, $2, 'STATION', $3, 'Test Station', $4, $5, 100),
		  ($6, $2, 'DEPOT',   NULL, 'Test Depot',  $7, $8, 200)`,
		stationID, testWorkspaceID, stationRefID, stationLat, stationLon,
		depotID, depotLat, depotLon,
	)
	if err != nil {
		t.Fatalf("seed geofences: %v", err)
	}
	return stationID, depotID
}

// ensureWorkspace inserts the test workspace if it does not already exist.
// trips.workspace_id is a FK to workspaces, so a row must exist before trip insertion.
func ensureWorkspace(t *testing.T, db *sqlx.DB) {
	t.Helper()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO workspaces (id, slug, name, type)
		VALUES ($1, 'test-workspace', 'Test Workspace', 'SELLER')
		ON CONFLICT (id) DO NOTHING`,
		testWorkspaceID,
	)
	if err != nil {
		t.Fatalf("ensure workspace: %v", err)
	}
}

// seedTripForOrder inserts a trip row linked to the given order and truck.
// It looks up the test station geofence by stationRefID to set dest_geofence_id
// (falls back to NULL if the geofence has not been seeded yet).
func seedTripForOrder(t *testing.T, db *sqlx.DB, truckID, orderID uuid.UUID, status string) uuid.UUID {
	t.Helper()
	tripID := uuid.New()

	// Look up the station geofence for dest_geofence_id (may be absent).
	var stationID *uuid.UUID
	var sid uuid.UUID
	if err := db.QueryRowContext(context.Background(),
		`SELECT id FROM geofences WHERE workspace_id = $1 AND type = 'STATION' AND ref_id = $2 LIMIT 1`,
		testWorkspaceID, stationRefID,
	).Scan(&sid); err == nil {
		stationID = &sid
	}

	_, err := db.ExecContext(context.Background(), `
		INSERT INTO trips
		  (id, workspace_id, truck_id, order_id, dest_geofence_id,
		   dest_lat, dest_lng, dest_name, status, source)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'Test Station', $8, 'ORDERING')`,
		tripID, testWorkspaceID, truckID, orderID, stationID,
		stationLat, stationLon, status,
	)
	if err != nil {
		t.Fatalf("seed trip for order: %v", err)
	}
	return tripID
}

// seedOrder inserts an order, an assignment, and a trip for the given truck
// with destination_station_id = stationRefID, and returns (orderID, assignmentID).
func seedOrder(t *testing.T, db *sqlx.DB, truckID uuid.UUID, status string) (orderID, assignID uuid.UUID) {
	t.Helper()
	orderID = uuid.New()
	assignID = uuid.New()
	_, err := db.ExecContext(context.Background(), `
		INSERT INTO orders (id, workspace_id, status, destination_station_id)
		VALUES ($1, $2, $3, $4)`,
		orderID, testWorkspaceID, status, stationRefID,
	)
	if err != nil {
		t.Fatalf("seed order: %v", err)
	}
	_, err = db.ExecContext(context.Background(), `
		INSERT INTO order_assignments (id, order_id, truck_id, status)
		VALUES ($1, $2, $3, $4)`,
		assignID, orderID, truckID, status,
	)
	if err != nil {
		t.Fatalf("seed order_assignment: %v", err)
	}

	// Every Mode A order needs a trip so the geofence service can advance it.
	ensureWorkspace(t, db)
	seedTripForOrder(t, db, truckID, orderID, status)

	return orderID, assignID
}

// ── Query helpers ─────────────────────────────────────────────────────────────

func countRows(t *testing.T, db *sqlx.DB, table, where string, args ...interface{}) int {
	t.Helper()
	var n int
	q := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s", table, where)
	if err := db.QueryRowContext(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatalf("count %s WHERE %s: %v", table, where, err)
	}
	return n
}

func queryOrderStatus(t *testing.T, db *sqlx.DB, orderID uuid.UUID) string {
	t.Helper()
	var status string
	err := db.QueryRowContext(context.Background(),
		"SELECT status FROM orders WHERE id = $1", orderID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("query order status: %v", err)
	}
	return status
}

func queryAssignmentStatus(t *testing.T, db *sqlx.DB, assignID uuid.UUID) string {
	t.Helper()
	var status string
	err := db.QueryRowContext(context.Background(),
		"SELECT status FROM order_assignments WHERE id = $1", assignID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("query assignment status: %v", err)
	}
	return status
}

func queryTruckStatus(t *testing.T, db *sqlx.DB, truckID uuid.UUID) string {
	t.Helper()
	var status string
	err := db.QueryRowContext(context.Background(),
		"SELECT status FROM trucks WHERE id = $1", truckID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("query truck status: %v", err)
	}
	return status
}

func ptrFloat(v float64) *float64 { return &v }

// ── flespi message builder ────────────────────────────────────────────────────

// flespiMsg returns a single-message JSON array body in the flespi flat format.
func flespiMsg(deviceID string, ts time.Time, lat, lon float64) string {
	return fmt.Sprintf(
		`[{"ident":%q,"timestamp":%f,"position.latitude":%f,"position.longitude":%f}]`,
		deviceID, float64(ts.Unix())+float64(ts.Nanosecond())/1e9, lat, lon,
	)
}
