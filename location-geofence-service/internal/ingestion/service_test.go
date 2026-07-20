package ingestion

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/location"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---- mock implementations ---------------------------------------------------

type mockMessageProcessor struct {
	processFn func(ctx context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error)
	calls     int
}

func (m *mockMessageProcessor) ProcessMessage(ctx context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error) {
	m.calls++
	return m.processFn(ctx, r)
}

type mockGeofenceEvaluator struct {
	evaluateFn func(ctx context.Context, truck *domain.Truck, lat, lon float64, ts time.Time) error
	calls      int
}

func (m *mockGeofenceEvaluator) EvaluateReading(ctx context.Context, truck *domain.Truck, lat, lon float64, ts time.Time) error {
	m.calls++
	if m.evaluateFn != nil {
		return m.evaluateFn(ctx, truck, lat, lon, ts)
	}
	return nil
}

// ---- fixtures ---------------------------------------------------------------

var (
	svcTruck = &domain.Truck{
		ID:          uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
		WorkspaceID: uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
	}

	reading1 = &domain.TelemetryReading{
		DeviceID:  "dev-1",
		Timestamp: time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC),
		Latitude:  55.75,
		Longitude: 37.62,
	}

	reading2 = &domain.TelemetryReading{
		DeviceID:  "dev-2",
		Timestamp: time.Date(2026, 6, 1, 10, 0, 1, 0, time.UTC),
		Latitude:  55.76,
		Longitude: 37.63,
	}
)

func newIngestSvc(loc *mockMessageProcessor, geo *mockGeofenceEvaluator) *Service {
	return NewService(loc, geo, zap.NewNop())
}

// ---- tests ------------------------------------------------------------------

func TestProcessBatch_Empty(t *testing.T) {
	loc := &mockMessageProcessor{}
	geo := &mockGeofenceEvaluator{}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), nil)
	require.NoError(t, err)
	assert.Equal(t, 0, result.Accepted)
	assert.Equal(t, 0, result.Dropped)
	assert.Equal(t, 0, loc.calls)
}

func TestProcessBatch_UnknownDevice_IncrementsDrop_ContinuesBatch(t *testing.T) {
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, _ *domain.TelemetryReading) (*location.ProcessResult, error) {
			return nil, nil // unknown device
		},
	}
	geo := &mockGeofenceEvaluator{}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), []*domain.TelemetryReading{reading1, reading2})
	require.NoError(t, err)
	assert.Equal(t, 0, result.Accepted)
	assert.Equal(t, 2, result.Dropped)
	assert.Equal(t, 2, loc.calls, "both messages should be processed even when first device is unknown")
	assert.Equal(t, 0, geo.calls, "geofence should not be called for unknown devices")
}

func TestProcessBatch_StaleReading_AcceptedButGeofenceSkipped(t *testing.T) {
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, _ *domain.TelemetryReading) (*location.ProcessResult, error) {
			return &location.ProcessResult{Truck: svcTruck, Updated: false}, nil
		},
	}
	geo := &mockGeofenceEvaluator{}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), []*domain.TelemetryReading{reading1})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 0, result.Dropped)
	assert.Equal(t, 0, geo.calls, "geofence must be skipped for stale readings")
}

func TestProcessBatch_FullSuccess(t *testing.T) {
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error) {
			return &location.ProcessResult{Truck: svcTruck, Updated: true}, nil
		},
	}

	var capturedLat, capturedLon float64
	var capturedTs time.Time

	geo := &mockGeofenceEvaluator{
		evaluateFn: func(_ context.Context, _ *domain.Truck, lat, lon float64, ts time.Time) error {
			capturedLat = lat
			capturedLon = lon
			capturedTs = ts
			return nil
		},
	}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), []*domain.TelemetryReading{reading1})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Accepted)
	assert.Equal(t, 0, result.Dropped)
	assert.Equal(t, 1, geo.calls)
	assert.InDelta(t, reading1.Latitude, capturedLat, 0.000001)
	assert.InDelta(t, reading1.Longitude, capturedLon, 0.000001)
	assert.Equal(t, reading1.Timestamp, capturedTs)
}

func TestProcessBatch_MixedResults(t *testing.T) {
	count := 0
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error) {
			count++
			switch count {
			case 1:
				return nil, nil // unknown device
			case 2:
				return &location.ProcessResult{Truck: svcTruck, Updated: false}, nil // stale
			default:
				return &location.ProcessResult{Truck: svcTruck, Updated: true}, nil // accepted
			}
		},
	}
	geo := &mockGeofenceEvaluator{}
	svc := newIngestSvc(loc, geo)

	readings := []*domain.TelemetryReading{reading1, reading2, reading1}
	result, err := svc.ProcessBatch(context.Background(), readings)
	require.NoError(t, err)
	assert.Equal(t, 2, result.Accepted) // stale + fresh
	assert.Equal(t, 1, result.Dropped)
	assert.Equal(t, 1, geo.calls) // only the fresh one
}

func TestProcessBatch_LocationError_FailsBatch(t *testing.T) {
	dbErr := errors.New("postgres: connection reset")
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, _ *domain.TelemetryReading) (*location.ProcessResult, error) {
			return nil, dbErr
		},
	}
	geo := &mockGeofenceEvaluator{}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), []*domain.TelemetryReading{reading1})
	assert.ErrorIs(t, err, dbErr, "infrastructure error must propagate to caller")
	assert.Nil(t, result)
	assert.Equal(t, 0, geo.calls)
}

func TestProcessBatch_GeofenceError_FailsBatch(t *testing.T) {
	loc := &mockMessageProcessor{
		processFn: func(_ context.Context, _ *domain.TelemetryReading) (*location.ProcessResult, error) {
			return &location.ProcessResult{Truck: svcTruck, Updated: true}, nil
		},
	}
	geoErr := errors.New("geofence state write failed")
	geo := &mockGeofenceEvaluator{
		evaluateFn: func(_ context.Context, _ *domain.Truck, _, _ float64, _ time.Time) error {
			return geoErr
		},
	}
	svc := newIngestSvc(loc, geo)

	result, err := svc.ProcessBatch(context.Background(), []*domain.TelemetryReading{reading1})
	assert.ErrorIs(t, err, geoErr)
	assert.Nil(t, result)
}
