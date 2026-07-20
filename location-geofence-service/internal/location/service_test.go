package location

// White-box tests: same package so mock types can satisfy package-private
// constructor parameters without exporting them.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---- minimal mock implementations -------------------------------------------

type mockTruckRepo struct {
	findFn func(ctx context.Context, deviceID string) (*domain.Truck, error)
	calls  int
}

func (m *mockTruckRepo) FindByDeviceID(ctx context.Context, deviceID string) (*domain.Truck, error) {
	m.calls++
	return m.findFn(ctx, deviceID)
}

type mockTelemetryRepo struct {
	insertFn func(ctx context.Context, t *domain.TruckTelemetry) error
	calls    int
}

func (m *mockTelemetryRepo) Insert(ctx context.Context, t *domain.TruckTelemetry) error {
	m.calls++
	return m.insertFn(ctx, t)
}

type mockLiveStateRepo struct {
	upsertFn func(ctx context.Context, s *domain.TruckLiveState) (bool, error)
	calls    int
}

func (m *mockLiveStateRepo) Upsert(ctx context.Context, s *domain.TruckLiveState) (bool, error) {
	m.calls++
	return m.upsertFn(ctx, s)
}

// ---- fixtures ----------------------------------------------------------------

var (
	truckID     = uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	workspaceID = uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	fixtureTruck = &domain.Truck{
		ID:                 truckID,
		WorkspaceID:        workspaceID,
		GalileoskyDeviceID: "device-xyz",
		Status:             "IDLE",
	}

	fixtureReading = &domain.TelemetryReading{
		DeviceID:  "device-xyz",
		Timestamp: time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC),
		Latitude:  55.7558,
		Longitude: 37.6176,
	}
)

func newSvc(trucks *mockTruckRepo, telemetry *mockTelemetryRepo, live *mockLiveStateRepo) *Service {
	return NewService(trucks, telemetry, live, NewDeviceCache(), zap.NewNop())
}

// ---- tests -------------------------------------------------------------------

func TestProcessMessage_UnknownDevice_ReturnsNilNoError(t *testing.T) {
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return nil, nil // not registered
	}}
	telemetry := &mockTelemetryRepo{}
	live := &mockLiveStateRepo{}
	svc := newSvc(trucks, telemetry, live)

	result, err := svc.ProcessMessage(context.Background(), fixtureReading)
	require.NoError(t, err)
	assert.Nil(t, result, "unknown device should return nil result, not an error")
	assert.Equal(t, 0, telemetry.calls, "telemetry should not be inserted for unknown device")
	assert.Equal(t, 0, live.calls, "live state should not be upserted for unknown device")
}

func TestProcessMessage_CacheHit_TruckRepoNotCalledAgain(t *testing.T) {
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return fixtureTruck, nil
	}}
	telemetry := &mockTelemetryRepo{insertFn: func(_ context.Context, _ *domain.TruckTelemetry) error { return nil }}
	live := &mockLiveStateRepo{upsertFn: func(_ context.Context, _ *domain.TruckLiveState) (bool, error) { return true, nil }}
	svc := newSvc(trucks, telemetry, live)

	ctx := context.Background()
	_, err := svc.ProcessMessage(ctx, fixtureReading)
	require.NoError(t, err)
	assert.Equal(t, 1, trucks.calls)

	// Second message for same device → cache hit, repo not called.
	_, err = svc.ProcessMessage(ctx, fixtureReading)
	require.NoError(t, err)
	assert.Equal(t, 1, trucks.calls, "truck repo should only be called once; second call hits cache")
}

func TestProcessMessage_UnknownDevice_NegativelyCached(t *testing.T) {
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return nil, nil
	}}
	telemetry := &mockTelemetryRepo{}
	live := &mockLiveStateRepo{}
	svc := newSvc(trucks, telemetry, live)

	ctx := context.Background()
	reading := &domain.TelemetryReading{DeviceID: "ghost", Timestamp: time.Now(), Latitude: 0, Longitude: 0}

	_, _ = svc.ProcessMessage(ctx, reading)
	_, _ = svc.ProcessMessage(ctx, reading)

	assert.Equal(t, 1, trucks.calls, "nil result should be negative-cached so repo is only hit once")
}

func TestProcessMessage_TruckRepoError_Propagated(t *testing.T) {
	dbErr := errors.New("connection refused")
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return nil, dbErr
	}}
	svc := newSvc(trucks, &mockTelemetryRepo{}, &mockLiveStateRepo{})

	_, err := svc.ProcessMessage(context.Background(), fixtureReading)
	assert.ErrorIs(t, err, dbErr)
}

func TestProcessMessage_TelemetryInsertError_Propagated(t *testing.T) {
	insertErr := errors.New("partition not found")
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return fixtureTruck, nil
	}}
	telemetry := &mockTelemetryRepo{insertFn: func(_ context.Context, _ *domain.TruckTelemetry) error {
		return insertErr
	}}
	svc := newSvc(trucks, telemetry, &mockLiveStateRepo{})

	_, err := svc.ProcessMessage(context.Background(), fixtureReading)
	assert.ErrorIs(t, err, insertErr)
}

func TestProcessMessage_StaleReading_UpdatedFalse(t *testing.T) {
	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return fixtureTruck, nil
	}}
	telemetry := &mockTelemetryRepo{insertFn: func(_ context.Context, _ *domain.TruckTelemetry) error { return nil }}
	live := &mockLiveStateRepo{upsertFn: func(_ context.Context, _ *domain.TruckLiveState) (bool, error) {
		return false, nil // timestamp guard rejected the upsert
	}}
	svc := newSvc(trucks, telemetry, live)

	result, err := svc.ProcessMessage(context.Background(), fixtureReading)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.False(t, result.Updated, "stale reading should result in Updated=false")
	assert.Equal(t, fixtureTruck, result.Truck)
}

func TestProcessMessage_SuccessPath(t *testing.T) {
	speed := 72
	ignOn := true
	fuel := 300.5
	reading := &domain.TelemetryReading{
		DeviceID:        "device-xyz",
		Timestamp:       time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC),
		Latitude:        55.7558,
		Longitude:       37.6176,
		Speed:           &speed,
		IgnitionOn:      &ignOn,
		TotalFuelLiters: &fuel,
		CompartmentFuel: map[string]float64{"c1": 100.0, "c2": 200.5},
	}

	var capturedTelemetry *domain.TruckTelemetry
	var capturedLiveState *domain.TruckLiveState

	trucks := &mockTruckRepo{findFn: func(_ context.Context, _ string) (*domain.Truck, error) {
		return fixtureTruck, nil
	}}
	telemetry := &mockTelemetryRepo{insertFn: func(_ context.Context, t *domain.TruckTelemetry) error {
		capturedTelemetry = t
		return nil
	}}
	live := &mockLiveStateRepo{upsertFn: func(_ context.Context, s *domain.TruckLiveState) (bool, error) {
		capturedLiveState = s
		return true, nil
	}}

	svc := newSvc(trucks, telemetry, live)
	result, err := svc.ProcessMessage(context.Background(), reading)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.Updated)
	assert.Equal(t, fixtureTruck, result.Truck)

	// Verify telemetry row fields.
	require.NotNil(t, capturedTelemetry)
	assert.Equal(t, truckID, capturedTelemetry.TruckID)
	assert.Equal(t, workspaceID, capturedTelemetry.WorkspaceID)
	assert.Equal(t, reading.Timestamp, capturedTelemetry.Timestamp)
	assert.Equal(t, reading.Latitude, capturedTelemetry.Latitude)
	assert.Equal(t, reading.Longitude, capturedTelemetry.Longitude)
	assert.Equal(t, &speed, capturedTelemetry.Speed)
	assert.Equal(t, &ignOn, capturedTelemetry.IgnitionOn)
	assert.NotEmpty(t, capturedTelemetry.CompartmentSensors)

	// Verify live state row fields.
	require.NotNil(t, capturedLiveState)
	assert.Equal(t, truckID, capturedLiveState.TruckID)
	assert.Equal(t, &reading.Latitude, capturedLiveState.Latitude)
	assert.Equal(t, &reading.Longitude, capturedLiveState.Longitude)
	assert.Equal(t, &reading.Timestamp, capturedLiveState.LastMessageAt)
}
