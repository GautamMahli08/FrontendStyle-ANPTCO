package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMain is called once per test binary.  We could run migrations here, but
// since migrations use IF NOT EXISTS DDL they are safe to re-run inside each
// test that calls applyMigrations.  Keeping the call per-test makes it easier
// to run individual tests in isolation.

// reading is a concise constructor for domain.TelemetryReading used in the
// integration tests below.
func reading(deviceID string, ts time.Time, lat, lon float64) *domain.TelemetryReading {
	return &domain.TelemetryReading{
		DeviceID:  deviceID,
		Timestamp: ts,
		Latitude:  lat,
		Longitude: lon,
	}
}

// ── 1. Station arrival — happy path ──────────────────────────────────────────

// TestPipeline_StationArrival verifies the full ingestion path:
//   - telemetry row written
//   - live state upserted
//   - STATION ENTER event emitted
//   - EN_ROUTE order advances to ARRIVED
func TestPipeline_StationArrival(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)
	orderID, _ := seedOrder(t, db, truckID, "EN_ROUTE")

	svc := buildStack(db)
	ctx := context.Background()

	ts := baseTime
	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, ts, stationLat, stationLon),
	})
	require.NoError(t, err)

	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 0, result.Dropped)

	// One telemetry row and one live state row.
	assert.Equal(t, 1, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))
	assert.Equal(t, 1, countRows(t, db, "truck_live_state", "truck_id = $1", truckID))

	// STATION ENTER event emitted.
	assert.Equal(t, 1, countRows(t, db, "geofence_events",
		"truck_id = $1 AND event_type = 'ENTER' AND geofence_type = 'STATION'", truckID))

	// Order advanced to ARRIVED.
	assert.Equal(t, "ARRIVED", queryOrderStatus(t, db, orderID))
}

// ── 2. Out-of-order reading — geofence evaluation skipped ────────────────────

// TestPipeline_OutOfOrderRejected sends a current reading then an older one.
// The older reading must be written to truck_telemetry (for audit purposes) but
// must NOT update live state and must NOT trigger geofence evaluation.
func TestPipeline_OutOfOrderRejected(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)
	orderID, _ := seedOrder(t, db, truckID, "EN_ROUTE")

	svc := buildStack(db)
	ctx := context.Background()

	t0 := baseTime
	t1 := baseTime.Add(-10 * time.Minute) // deliberately older

	// First reading: truck far from any fence, sets live state to t0.
	_, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t0, farLat, farLon),
	})
	require.NoError(t, err)

	// Second reading: truck at station but with an older timestamp → stale.
	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t1, stationLat, stationLon),
	})
	require.NoError(t, err)

	// Both readings are accepted at the batch level (no unknown device).
	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 0, result.Dropped)

	// Two telemetry rows (both timestamps are recorded).
	assert.Equal(t, 2, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))

	// Zero geofence events — the stale station reading was not evaluated.
	assert.Equal(t, 0, countRows(t, db, "geofence_events", "truck_id = $1", truckID))

	// Order unchanged.
	assert.Equal(t, "EN_ROUTE", queryOrderStatus(t, db, orderID))
}

// ── 3. Unknown device — message dropped without error ─────────────────────────

// TestPipeline_UnknownDevice verifies that a message from an unregistered
// device is silently dropped: no error, no telemetry row, Dropped counter +1.
func TestPipeline_UnknownDevice(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	// Do NOT seed a truck — device is unknown.
	svc := buildStack(db)
	ctx := context.Background()

	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading("GHOST-DEVICE-999", baseTime, stationLat, stationLon),
	})
	require.NoError(t, err)

	assert.Equal(t, 0, result.Accepted)
	assert.Equal(t, 1, result.Dropped)

	// No rows anywhere.
	assert.Equal(t, 0, countRows(t, db, "truck_telemetry", "1 = 1"))
	assert.Equal(t, 0, countRows(t, db, "geofence_events", "1 = 1"))
}

// ── 4. ENTER idempotency — repeated position does not double-emit ─────────────

// TestPipeline_EnterIdempotency sends two readings at the same station
// coordinates.  The first transitions the geofence state from outside → inside
// (ENTER event emitted); the second sees inside → inside (no transition, no
// duplicate event).
func TestPipeline_EnterIdempotency(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)
	_, _ = seedOrder(t, db, truckID, "EN_ROUTE")

	svc := buildStack(db)
	ctx := context.Background()

	t0 := baseTime
	t1 := baseTime.Add(30 * time.Second)

	// First reading — ENTER fires.
	_, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t0, stationLat, stationLon),
	})
	require.NoError(t, err)

	// Second reading — same location, newer timestamp, already inside.
	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t1, stationLat, stationLon),
	})
	require.NoError(t, err)

	assert.Equal(t, 1, result.Accepted)

	// Two telemetry rows, but only one ENTER event.
	assert.Equal(t, 2, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))
	assert.Equal(t, 1, countRows(t, db, "geofence_events",
		"truck_id = $1 AND event_type = 'ENTER'", truckID))
}

// ── 5. Depot arrival — completes the assignment ───────────────────────────────

// TestPipeline_DepotArrival seeds an order in DELIVERY_ACCEPTED status and
// drives the truck to the depot.  The DEPOT ENTER event should:
//   - flip the assignment to JOURNEY_COMPLETE
//   - flip the order to COMPLETED (single-truck order)
//   - flip the truck back to IDLE
func TestPipeline_DepotArrival(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)
	orderID, assignID := seedOrder(t, db, truckID, "DELIVERY_ACCEPTED")

	svc := buildStack(db)
	ctx := context.Background()

	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, baseTime, depotLat, depotLon),
	})
	require.NoError(t, err)

	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 0, result.Dropped)

	// Telemetry and live state recorded.
	assert.Equal(t, 1, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))
	assert.Equal(t, 1, countRows(t, db, "truck_live_state", "truck_id = $1", truckID))

	// DEPOT ENTER event emitted.
	assert.Equal(t, 1, countRows(t, db, "geofence_events",
		"truck_id = $1 AND event_type = 'ENTER' AND geofence_type = 'DEPOT'", truckID))

	// Assignment closed and order completed.
	assert.Equal(t, "JOURNEY_COMPLETE", queryAssignmentStatus(t, db, assignID))
	assert.Equal(t, "COMPLETED", queryOrderStatus(t, db, orderID))
	assert.Equal(t, "IDLE", queryTruckStatus(t, db, truckID))
}

// ── 7. EXIT event — truck leaves a zone after entering ───────────────────────

// TestPipeline_ExitEvent confirms that leaving a station after entering emits
// an EXIT event and does NOT revert the order status.
func TestPipeline_ExitEvent(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)
	orderID, _ := seedOrder(t, db, truckID, "EN_ROUTE")

	svc := buildStack(db)
	ctx := context.Background()

	t0 := baseTime
	t1 := baseTime.Add(30 * time.Second)

	// First reading: inside station → ENTER, order advances to ARRIVED.
	_, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t0, stationLat, stationLon),
	})
	require.NoError(t, err)

	// Second reading: truck has left the station → EXIT emitted.
	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, t1, farLat, farLon),
	})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Accepted)

	// Both readings written to history.
	assert.Equal(t, 2, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))

	// Both ENTER and EXIT events recorded.
	assert.Equal(t, 1, countRows(t, db, "geofence_events",
		"truck_id = $1 AND event_type = 'ENTER' AND geofence_type = 'STATION'", truckID))
	assert.Equal(t, 1, countRows(t, db, "geofence_events",
		"truck_id = $1 AND event_type = 'EXIT' AND geofence_type = 'STATION'", truckID))

	// EXIT does not revert the order — it stays ARRIVED.
	assert.Equal(t, "ARRIVED", queryOrderStatus(t, db, orderID))
}

// ── 8. Multi-truck order — completes only when all trucks are done ────────────

// TestPipeline_MultiTruckOrder seeds an order with two truck assignments.
// The order must stay in DELIVERY_ACCEPTED after the first truck returns to the
// depot and only flip to COMPLETED once the second truck arrives as well.
func TestPipeline_MultiTruckOrder(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truck1ID := seedTruck(t, db)
	truck2ID := seedTruckWithDevice(t, db, testDevice2ID)
	_, _ = seedGeofences(t, db)

	orderID, assign1ID := seedOrder(t, db, truck1ID, "DELIVERY_ACCEPTED")
	assign2ID := seedAssignment(t, db, orderID, truck2ID, "DELIVERY_ACCEPTED")

	svc := buildStack(db)
	ctx := context.Background()

	// Truck 1 arrives at depot.
	_, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, baseTime, depotLat, depotLon),
	})
	require.NoError(t, err)

	// Assignment 1 closed but order must remain open — truck 2 is still active.
	assert.Equal(t, "JOURNEY_COMPLETE", queryAssignmentStatus(t, db, assign1ID))
	assert.Equal(t, "IDLE", queryTruckStatus(t, db, truck1ID))
	assert.Equal(t, "DELIVERY_ACCEPTED", queryOrderStatus(t, db, orderID),
		"order must not complete while truck 2 is still outstanding")

	// Truck 2 arrives at depot one minute later.
	_, err = svc.ProcessBatch(ctx, []*domain.TelemetryReading{{
		DeviceID:  testDevice2ID,
		Timestamp: baseTime.Add(time.Minute),
		Latitude:  depotLat,
		Longitude: depotLon,
	}})
	require.NoError(t, err)

	// Now both assignments are done — order flips to COMPLETED.
	assert.Equal(t, "JOURNEY_COMPLETE", queryAssignmentStatus(t, db, assign2ID))
	assert.Equal(t, "IDLE", queryTruckStatus(t, db, truck2ID))
	assert.Equal(t, "COMPLETED", queryOrderStatus(t, db, orderID))
}

// ── 9. Fuel data — compartment sensors persisted as JSONB ────────────────────

// TestPipeline_FuelDataPersisted verifies that per-compartment fuel readings
// are stored as JSONB in both truck_telemetry and truck_live_state.
func TestPipeline_FuelDataPersisted(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	svc := buildStack(db)
	ctx := context.Background()

	r := &domain.TelemetryReading{
		DeviceID:        testDeviceID,
		Timestamp:       baseTime,
		Latitude:        farLat,
		Longitude:       farLon,
		TotalFuelLiters: ptrFloat(850.5),
		CompartmentFuel: map[string]float64{"c1": 300.0, "c2": 550.5},
	}

	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{r})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Accepted)

	// compartment_sensors stored as JSONB in telemetry history.
	var sensorsJSON string
	err = db.QueryRowContext(ctx,
		"SELECT compartment_sensors::text FROM truck_telemetry WHERE truck_id = $1", truckID,
	).Scan(&sensorsJSON)
	require.NoError(t, err)
	assert.Contains(t, sensorsJSON, `"c1"`)
	assert.Contains(t, sensorsJSON, `"c2"`)
	assert.Contains(t, sensorsJSON, "300")

	// compartment_fuel stored as JSONB in live state.
	var fuelJSON string
	err = db.QueryRowContext(ctx,
		"SELECT compartment_fuel::text FROM truck_live_state WHERE truck_id = $1", truckID,
	).Scan(&fuelJSON)
	require.NoError(t, err)
	assert.Contains(t, fuelJSON, `"c1"`)
	assert.Contains(t, fuelJSON, `"c2"`)
}

// ── 6. Mixed batch — accepted and dropped in the same call ───────────────────

// TestPipeline_MixedBatch submits a batch containing one message from a known
// device and one from an unknown device.  The known message is fully processed;
// the unknown one is dropped without failing the whole batch.
func TestPipeline_MixedBatch(t *testing.T) {
	db := openTestDB(t)
	applyMigrations(t, db)
	cleanTables(t, db)

	truckID := seedTruck(t, db)
	_, _ = seedGeofences(t, db)

	svc := buildStack(db)
	ctx := context.Background()

	result, err := svc.ProcessBatch(ctx, []*domain.TelemetryReading{
		reading(testDeviceID, baseTime, farLat, farLon),
		reading("GHOST-XYZ", baseTime.Add(time.Second), farLat, farLon),
	})
	require.NoError(t, err)

	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 1, result.Dropped)

	// Only the known truck has a telemetry row.
	assert.Equal(t, 1, countRows(t, db, "truck_telemetry", "truck_id = $1", truckID))
}
