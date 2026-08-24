package ingestion

import (
	"context"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/events"
	"github.com/anptco/location-geofence-service/internal/geofence"
	"github.com/anptco/location-geofence-service/internal/location"
	"go.uber.org/zap"
)

// messageProcessor is satisfied by *location.Service.
type messageProcessor interface {
	ProcessMessage(ctx context.Context, r *domain.TelemetryReading) (*location.ProcessResult, error)
}

// geofenceEvaluator is satisfied by *geofence.Service.
type geofenceEvaluator interface {
	EvaluateReading(ctx context.Context, truck *domain.Truck, lat, lon float64, ts time.Time) (*geofence.EvalContext, error)
}

// monitoringProcessor is satisfied by *monitoring.Service.
type monitoringProcessor interface {
	Process(
		ctx context.Context,
		truck *domain.Truck,
		prev *domain.TruckLiveState,
		r *domain.TelemetryReading,
		actx events.AlertContext,
	)
}

// Service orchestrates the full per-message ingestion pipeline:
//  1. Resolve device → truck, persist telemetry, update live state.
//  2. Evaluate geofence crossings and advance the trip state machine.
//  3. Run monitoring detectors (stops, alerts) with geofence context.
type Service struct {
	loc messageProcessor
	geo geofenceEvaluator
	mon monitoringProcessor
	log *zap.Logger
}

// NewService wires the ingestion service.
// mon may be nil — monitoring is skipped when not configured.
func NewService(loc messageProcessor, geo geofenceEvaluator, mon monitoringProcessor, log *zap.Logger) *Service {
	return &Service{loc: loc, geo: geo, mon: mon, log: log}
}

// BatchResult summarises the outcome of processing one flespi webhook batch.
type BatchResult struct {
	Accepted int
	Dropped  int
}

// ProcessBatch runs the pipeline for each reading in arrival order.
//
// Per-message policy:
//   - Unknown device → increment Dropped and continue.
//   - Infrastructure error → return immediately so Lambda 5xx causes flespi retry.
//   - Stale reading → telemetry still written, geofence + monitoring skipped.
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
			geoCtx, err := s.geo.EvaluateReading(ctx,
				locResult.Truck,
				r.Latitude, r.Longitude,
				r.Timestamp,
			)
			if err != nil {
				return nil, err
			}

			if s.mon != nil {
				actx := events.AlertContext{
					InsideDepotGeofence:    geoCtx.InsideDepot,
					InsideDeliveryGeofence: geoCtx.InsideDelivery,
					ActiveTripID:           geoCtx.ActiveTripID,
				}
				s.mon.Process(ctx, locResult.Truck, locResult.PrevState, r, actx)
			}
		}

		result.Accepted++
	}

	return result, nil
}
