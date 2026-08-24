package location

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/events"
	"github.com/anptco/location-geofence-service/internal/repository"
	"go.uber.org/zap"
)

// Service executes the location module's three per-message steps:
//  1. Map device_id → truck (cache-first, DB on miss, nil-cached for unknowns).
//  2. Append a row to truck_telemetry.
//  3. Upsert truck_live_state if the reading is the newest seen for this truck.
//  4. Detect asset state transitions (fuel, battery, ignition, movement).
type Service struct {
	trucks      repository.TruckRepository
	telemetry   repository.TelemetryRepository
	liveState   repository.LiveStateRepository
	assetEvents repository.AssetEventRepository
	cache       *DeviceCache
	log         *zap.Logger
}

// NewService wires the location service with its split repository dependencies.
func NewService(
	trucks repository.TruckRepository,
	telemetry repository.TelemetryRepository,
	liveState repository.LiveStateRepository,
	assetEvents repository.AssetEventRepository,
	cache *DeviceCache,
	log *zap.Logger,
) *Service {
	return &Service{
		trucks:      trucks,
		telemetry:   telemetry,
		liveState:   liveState,
		assetEvents: assetEvents,
		cache:       cache,
		log:         log,
	}
}

// ProcessResult carries what the geofence and monitoring modules need from a
// successful location step.
type ProcessResult struct {
	Truck     *domain.Truck
	PrevState *domain.TruckLiveState // live state before this reading was applied
	Updated   bool                   // false when reading was stale — skip geofence eval
}

// ProcessMessage runs the location + event-detection steps for a single telemetry reading.
// Returns (nil, nil) when the device is not registered — the caller should
// drop the message and continue without failing the whole batch.
func (s *Service) ProcessMessage(ctx context.Context, r *domain.TelemetryReading) (*ProcessResult, error) {
	truck, err := s.cache.GetOrLoad(ctx, r.DeviceID, s.trucks.FindByDeviceID)
	if err != nil {
		return nil, fmt.Errorf("resolve device %q: %w", r.DeviceID, err)
	}
	if truck == nil {
		s.log.Warn("unknown device — message dropped",
			zap.String("device_id", r.DeviceID),
		)
		return nil, nil
	}

	// Fetch previous live state BEFORE the upsert so we can diff transitions.
	prev, err := s.liveState.Get(ctx, truck.ID)
	if err != nil {
		return nil, fmt.Errorf("get live state: %w", err)
	}

	if err := s.telemetry.Insert(ctx, buildTelemetry(truck, r)); err != nil {
		return nil, fmt.Errorf("insert telemetry: %w", err)
	}

	updated, err := s.liveState.Upsert(ctx, buildLiveState(truck, r))
	if err != nil {
		return nil, fmt.Errorf("upsert live state: %w", err)
	}

	s.log.Info("telemetry persisted",
		zap.String("truck_id", truck.ID.String()),
		zap.String("device_id", r.DeviceID),
		zap.Bool("live_state_updated", updated),
		zap.Time("device_ts", r.Timestamp),
	)

	// Detect and persist asset events only when the reading was fresh.
	if updated {
		detected := events.Detect(truck, prev, r, r.Timestamp)
		for _, e := range detected {
			if err := s.assetEvents.Insert(ctx, e); err != nil {
				// Non-fatal: log and continue — the telemetry row is already written.
				s.log.Error("asset event insert failed",
					zap.String("event_type", string(e.EventType)),
					zap.String("truck_id", truck.ID.String()),
					zap.Error(err),
				)
			} else {
				s.log.Info("asset event detected",
					zap.String("event_type", string(e.EventType)),
					zap.String("truck_id", truck.ID.String()),
				)
			}
		}
	}

	return &ProcessResult{Truck: truck, PrevState: prev, Updated: updated}, nil
}

func buildTelemetry(truck *domain.Truck, r *domain.TelemetryReading) *domain.TruckTelemetry {
	t := &domain.TruckTelemetry{
		TruckID:     truck.ID,
		WorkspaceID: truck.WorkspaceID,
		Timestamp:   r.Timestamp,
		Latitude:    r.Latitude,
		Longitude:   r.Longitude,
		Speed:       r.Speed,
		IgnitionOn:  r.IgnitionOn,
	}
	if r.TotalFuelLiters != nil {
		v := *r.TotalFuelLiters
		t.TotalFuelLiters = &v
	}
	if r.ExternalPowerVoltage != nil {
		v := *r.ExternalPowerVoltage
		t.ExternalPowerVoltage = &v
	}
	if len(r.CompartmentFuel) > 0 {
		raw, _ := json.Marshal(r.CompartmentFuel)
		t.CompartmentSensors = raw
	}
	return t
}

func buildLiveState(truck *domain.Truck, r *domain.TelemetryReading) *domain.TruckLiveState {
	s := &domain.TruckLiveState{
		TruckID:       truck.ID,
		WorkspaceID:   truck.WorkspaceID,
		Latitude:      &r.Latitude,
		Longitude:     &r.Longitude,
		Speed:         r.Speed,
		LastMessageAt: &r.Timestamp,
	}
	if r.TotalFuelLiters != nil {
		v := *r.TotalFuelLiters
		s.TotalFuelLiters = &v
	}
	if r.ExternalPowerVoltage != nil {
		v := *r.ExternalPowerVoltage
		s.ExternalPowerVoltage = &v
	}
	if r.IgnitionOn != nil {
		v := *r.IgnitionOn
		s.IgnitionOn = &v
	}
	if len(r.CompartmentFuel) > 0 {
		raw, _ := json.Marshal(r.CompartmentFuel)
		s.CompartmentFuel = raw
	}
	return s
}
