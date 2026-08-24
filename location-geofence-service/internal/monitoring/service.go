// Package monitoring orchestrates the vehicle-monitoring detection subsystems:
// stop recording (§3), sensor tampering (§4), fuel drain (§5), and external
// power tampering (§6) from the design doc. It is called once per telemetry
// reading after the location and geofence services have run.
package monitoring

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/events"
	"github.com/anptco/location-geofence-service/internal/repository"
	"go.uber.org/zap"
)

// Service coordinates all per-reading monitoring detectors.
type Service struct {
	alerts repository.AlertRepository
	stops  repository.StopRepository
	log    *zap.Logger
}

// NewService wires the monitoring service with its two repository dependencies.
func NewService(
	alerts repository.AlertRepository,
	stops repository.StopRepository,
	log *zap.Logger,
) *Service {
	return &Service{alerts: alerts, stops: stops, log: log}
}

// Process runs all monitoring detectors for a single fresh telemetry reading.
// prev is the live state that existed before this reading was applied.
// actx carries the geofence context computed by the geofence service.
//
// Errors from individual detectors are logged and swallowed — a monitoring
// failure must never block the main telemetry pipeline.
func (s *Service) Process(
	ctx context.Context,
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	actx events.AlertContext,
) {
	cfg := domain.DefaultMonitoringConfig(truck.WorkspaceID)
	s.processStop(ctx, truck, r, actx, cfg)
	s.processAlerts(ctx, truck, prev, r, actx, cfg)
}

func (s *Service) processStop(
	ctx context.Context,
	truck *domain.Truck,
	r *domain.TelemetryReading,
	actx events.AlertContext,
	cfg *domain.MonitoringConfig,
) {
	openStop, err := s.stops.GetOpen(ctx, truck.ID)
	if err != nil {
		s.log.Error("stop: get open candidate",
			zap.String("truck_id", truck.ID.String()), zap.Error(err))
		return
	}

	// Enrich the open stop with current geofence context so the finalized
	// record carries accurate inside_geofence / geofence_id fields.
	if openStop != nil {
		openStop.InsideGeofence = actx.InsideDepotGeofence || actx.InsideDeliveryGeofence
	}

	result := events.ProcessStop(truck, r, openStop, cfg)

	switch result.Action {
	case events.StopActionNone:
		// Nothing to persist.

	case events.StopActionOpen:
		result.Stop.InsideGeofence = actx.InsideDepotGeofence || actx.InsideDeliveryGeofence
		if err := s.stops.Upsert(ctx, result.Stop); err != nil {
			s.log.Error("stop: upsert open candidate",
				zap.String("truck_id", truck.ID.String()), zap.Error(err))
		}

	case events.StopActionFinalize:
		if err := s.stops.Upsert(ctx, result.Stop); err != nil {
			s.log.Error("stop: upsert finalized stop",
				zap.String("truck_id", truck.ID.String()), zap.Error(err))
			return
		}
		s.log.Info("stop finalized",
			zap.String("truck_id", truck.ID.String()),
			zap.Int("duration_s", *result.Stop.DurationS),
			zap.String("classification", result.Stop.Classification),
		)
		if result.Stop.Classification == "SUSPICIOUS" {
			s.upsertSuspiciousStopAlert(ctx, truck, r, result.Stop, actx)
		}

	case events.StopActionDiscard:
		if err := s.stops.DeleteOpen(ctx, truck.ID); err != nil {
			s.log.Error("stop: delete short candidate",
				zap.String("truck_id", truck.ID.String()), zap.Error(err))
		}
	}
}

func (s *Service) upsertSuspiciousStopAlert(
	ctx context.Context,
	truck *domain.Truck,
	r *domain.TelemetryReading,
	stop *domain.VehicleStop,
	actx events.AlertContext,
) {
	type stopPayload struct {
		DurationS      int      `json:"duration_s"`
		InsideGeofence bool     `json:"inside_geofence"`
		Reasons        []string `json:"reasons"`
		StopLat        float64  `json:"stop_lat"`
		StopLng        float64  `json:"stop_lng"`
	}
	var durS int
	if stop.DurationS != nil {
		durS = *stop.DurationS
	}
	raw, _ := json.Marshal(stopPayload{
		DurationS:      durS,
		InsideGeofence: stop.InsideGeofence,
		Reasons:        stop.Reasons,
		StopLat:        stop.Lat,
		StopLng:        stop.Lng,
	})

	lat, lng := r.Latitude, r.Longitude
	imei := truck.GalileoskyDeviceID
	alert := &domain.Alert{
		WorkspaceID: truck.WorkspaceID,
		Type:        domain.AlertTypeSuspiciousStop,
		Severity:    3,
		VehicleID:   &truck.ID,
		DeviceIMEI:  &imei,
		TripID:      actx.ActiveTripID,
		OccurredAt:  stop.StartedAt,
		LastLat:     &lat,
		LastLng:     &lng,
		DedupKey:    fmt.Sprintf("suspicious_stop:%s", stop.DedupKey),
		Payload:     raw,
	}
	if err := s.alerts.Upsert(ctx, alert); err != nil {
		s.log.Error("stop: upsert suspicious stop alert",
			zap.String("truck_id", truck.ID.String()), zap.Error(err))
	}
}

func (s *Service) processAlerts(
	ctx context.Context,
	truck *domain.Truck,
	prev *domain.TruckLiveState,
	r *domain.TelemetryReading,
	actx events.AlertContext,
	cfg *domain.MonitoringConfig,
) {
	for _, a := range events.DetectAlerts(truck, prev, r, actx, cfg) {
		if err := s.alerts.Upsert(ctx, a); err != nil {
			s.log.Error("alert upsert failed",
				zap.String("type", string(a.Type)),
				zap.String("truck_id", truck.ID.String()),
				zap.Error(err),
			)
		} else {
			s.log.Info("alert detected",
				zap.String("type", string(a.Type)),
				zap.String("truck_id", truck.ID.String()),
				zap.Int("severity", a.Severity),
			)
		}
	}
}
