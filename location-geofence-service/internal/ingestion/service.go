package ingestion

import (
	"context"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/location"
	"go.uber.org/zap"
)

// messageProcessor is satisfied by *location.Service. Defined here as a
// narrow interface so the ingestion service is independently testable without
// a real location.Service wired to a database.
type messageProcessor interface {
	ProcessMessage(ctx context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error)
}

// geofenceEvaluator is satisfied by *geofence.Service.
type geofenceEvaluator interface {
	EvaluateReading(ctx context.Context, truck *domain.Truck, lat, lon float64, ts time.Time) error
}

// Service orchestrates the full per-message ingestion pipeline:
// location steps 1–3 (resolve, persist history, update live state)
// followed by geofence evaluation steps 4–6 (detect, emit event, advance order).
type Service struct {
	loc messageProcessor
	geo geofenceEvaluator
	log *zap.Logger
}

// NewService wires the ingestion service with its two domain sub-services.
// Both arguments satisfy the narrow local interfaces above so either the real
// implementations or test doubles can be passed in.
func NewService(loc messageProcessor, geo geofenceEvaluator, log *zap.Logger) *Service {
	return &Service{loc: loc, geo: geo, log: log}
}

// BatchResult summarises the outcome of processing one flespi webhook batch.
type BatchResult struct {
	Accepted int // messages processed and persisted
	Dropped  int // messages dropped due to an unregistered device
}

// ProcessBatch runs the pipeline for each reading in arrival order.
//
// Per-message policy:
//   - Unknown device → increment Dropped and continue; do not fail the batch.
//   - Infrastructure error → return immediately so the Lambda 5xx causes flespi
//     to retry the whole batch (store-and-forward prevents data loss).
//   - Stale reading (live state not updated) → telemetry still written, but
//     geofence evaluation is skipped to prevent out-of-order false transitions.
func (s *Service) ProcessBatch(ctx context.Context, readings []*domain.TelemetryReading) (*BatchResult, error) {
	result := &BatchResult{}

	for _, r := range readings {
		locResult, err := s.loc.ProcessMessage(ctx, r)
		if err != nil {
			return nil, err
		}
		if locResult == nil {
			result.Dropped++
			continue
		}

		if locResult.Updated {
			if err := s.geo.EvaluateReading(ctx,
				locResult.Truck,
				r.Latitude, r.Longitude,
				r.Timestamp,
			); err != nil {
				return nil, err
			}
		}

		result.Accepted++
	}

	return result, nil
}
