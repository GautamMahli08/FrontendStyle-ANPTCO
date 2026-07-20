package geofence

import (
	"context"
	"fmt"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/notify"
	"github.com/anptco/location-geofence-service/internal/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Service performs stateful geofence detection and drives the trip state
// machine in response to confirmed ENTER/EXIT transitions.
//
// Detection is stateful: each (truck, geofence) pair has a persistent
// inside/outside record so that readings while parked inside a zone do not
// generate repeated events.
//
// The state write (SetState), the event insert (Insert), and the trip state
// advance are all wrapped in a single transaction via the Transactor so they
// are always co-visible to other readers.
//
// Notifications are published AFTER the transaction commits so that downstream
// consumers never observe a state that was rolled back.
type Service struct {
	geofences    repository.GeofenceRepository
	events       repository.GeofenceEventRepository
	trips        repository.TripRepository
	tx           repository.Transactor
	notifier     notify.Notifier
	log          *zap.Logger
	destRadiusM  float64
	depotRadiusM float64
}

// NewService wires the geofence service with its split repository dependencies.
// destRadiusM and depotRadiusM are env-level overrides for the per-zone
// radius_meters column, enabling tuning without DB changes.
// notifier receives lifecycle events after each successful transaction commit;
// pass notify.NoopNotifier{} for local development and tests.
func NewService(
	geofences repository.GeofenceRepository,
	events repository.GeofenceEventRepository,
	trips repository.TripRepository,
	tx repository.Transactor,
	log *zap.Logger,
	destRadiusM, depotRadiusM int,
	notifier notify.Notifier,
) *Service {
	return &Service{
		geofences:    geofences,
		events:       events,
		trips:        trips,
		tx:           tx,
		notifier:     notifier,
		log:          log,
		destRadiusM:  float64(destRadiusM),
		depotRadiusM: float64(depotRadiusM),
	}
}

// EvaluateReading checks whether the truck's latest position crosses any
// relevant geofence boundary (active-order destination and/or depot).
// It is only called when the location module confirms the reading advanced
// truck_live_state (i.e. it is not stale).
func (s *Service) EvaluateReading(ctx context.Context, truck *domain.Truck, lat, lon float64, ts time.Time) error {
	trip, err := s.geofences.FindActiveTripForTruck(ctx, truck.ID)
	if err != nil {
		return fmt.Errorf("find active trip: %w", err)
	}

	depot, err := s.geofences.FindDepotByWorkspace(ctx, truck.WorkspaceID)
	if err != nil {
		return fmt.Errorf("find depot: %w", err)
	}

	if trip != nil {
		// Use the radius stored in the geofences table (set by the operator in
		// the fleet-monitor UI). Fall back to the env-level default only when the
		// row carries 0 (legacy trips created before this field was populated).
		destRadius := trip.RadiusMeters
		if destRadius == 0 {
			destRadius = int(s.destRadiusM)
		}
		stationFence := &domain.Geofence{
			ID:           trip.GeofenceID,
			WorkspaceID:  truck.WorkspaceID,
			Type:         domain.GeofenceTypeStation,
			Latitude:     trip.DestLat,
			Longitude:    trip.DestLon,
			RadiusMeters: destRadius,
		}
		if err := s.evaluateZone(ctx, truck, trip, lat, lon, ts, stationFence); err != nil {
			return fmt.Errorf("evaluate station zone: %w", err)
		}
	}

	if depot == nil {
		s.log.Warn("no DEPOT geofence found for workspace — seed one to enable depot detection",
			zap.String("workspace_id", truck.WorkspaceID.String()),
		)
	} else {
		// Use the stored depot radius; fall back to env default when 0.
		if depot.RadiusMeters == 0 {
			depot.RadiusMeters = int(s.depotRadiusM)
		}
		if err := s.evaluateZone(ctx, truck, trip, lat, lon, ts, depot); err != nil {
			return fmt.Errorf("evaluate depot zone: %w", err)
		}
	}

	return nil
}

// evaluateZone detects an inside/outside transition for a single zone.
// The state read (GetState) runs outside the transaction; the state write,
// event insert, and order mutation run atomically inside one.
// Any notification is published only after the transaction commits.
func (s *Service) evaluateZone(
	ctx context.Context,
	truck *domain.Truck,
	trip *domain.ActiveTrip,
	lat, lon float64,
	ts time.Time,
	fence *domain.Geofence,
) error {
	radius := float64(fence.RadiusMeters)
	dist := DistanceMeters(lat, lon, fence.Latitude, fence.Longitude)
	insideNow := dist <= radius

	wasInside, err := s.geofences.GetState(ctx, truck.ID, fence.ID)
	if err != nil {
		return fmt.Errorf("get state for fence %s: %w", fence.ID, err)
	}

	var evtType domain.EventType
	switch {
	case insideNow && !wasInside:
		evtType = domain.EventTypeEnter
	case !insideNow && wasInside:
		evtType = domain.EventTypeExit
	default:
		return nil // no transition — already in the same state
	}

	evt := buildEvent(truck, trip, fence, evtType, lat, lon, ts)

	// Capture what the state machine did so we can notify after commit.
	var pending *pendingNotification

	if err := s.tx.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.geofences.SetState(txCtx, truck.ID, fence.ID, insideNow); err != nil {
			return fmt.Errorf("set geofence state: %w", err)
		}
		if err := s.events.Insert(txCtx, evt); err != nil {
			return fmt.Errorf("insert geofence event: %w", err)
		}

		s.log.Info("geofence transition",
			zap.String("truck_id", truck.ID.String()),
			zap.String("geofence_id", fence.ID.String()),
			zap.String("zone_type", string(fence.Type)),
			zap.String("event", string(evtType)),
			zap.Float64("distance_m", dist),
			zap.Float64("radius_m", radius),
		)

		n, err := s.applyStateMachineEffect(txCtx, truck, trip, fence.Type, evtType, lat, lon, ts)
		if err != nil {
			return err
		}
		pending = n
		return nil
	}); err != nil {
		return err
	}

	// Transaction committed — publish notification best-effort.
	s.publishNotification(ctx, pending)
	return nil
}

// pendingNotification captures what lifecycle notification (if any) should be
// published after the current transaction commits. Only one field will be set.
type pendingNotification struct {
	arrived   *notify.OrderArrivedPayload
	completed *notify.OrderCompletedPayload
}

// applyStateMachineEffect advances the trip state machine in response to a
// confirmed ENTER event and returns a pendingNotification describing the change
// so it can be published after the transaction commits.
// Effects are conditional on the trip's current status so stale or unexpected
// states are silently ignored.
func (s *Service) applyStateMachineEffect(
	ctx context.Context,
	truck *domain.Truck,
	trip *domain.ActiveTrip,
	zoneType domain.GeofenceType,
	evtType domain.EventType,
	lat, lon float64,
	ts time.Time,
) (*pendingNotification, error) {
	if evtType != domain.EventTypeEnter {
		return nil, nil
	}

	switch zoneType {
	case domain.GeofenceTypeStation:
		if trip == nil || trip.TripStatus != domain.OrderStatusEnRoute {
			return nil, nil
		}
		if err := s.trips.AdvanceToArrived(ctx, trip.TripID); err != nil {
			return nil, fmt.Errorf("advance trip to ARRIVED: %w", err)
		}
		s.log.Info("trip → ARRIVED",
			zap.String("trip_id", trip.TripID.String()),
			zap.String("truck_id", truck.ID.String()),
		)
		return &pendingNotification{
			arrived: &notify.OrderArrivedPayload{
				TripID:      trip.TripID,
				OrderID:     trip.OrderID,
				TruckID:     truck.ID,
				WorkspaceID: truck.WorkspaceID,
				GeofenceID:  trip.GeofenceID,
				Latitude:    lat,
				Longitude:   lon,
				OccurredAt:  ts,
			},
		}, nil

	case domain.GeofenceTypeDepot:
		if trip == nil || trip.TripStatus != domain.OrderStatusDeliveryAccepted {
			return nil, nil
		}
		if err := s.trips.CompleteAssignment(ctx, trip.AssignmentID, truck.ID); err != nil {
			return nil, fmt.Errorf("complete assignment: %w", err)
		}
		completed, err := s.trips.TryComplete(ctx, trip.TripID, trip.OrderID)
		if err != nil {
			return nil, fmt.Errorf("try complete trip: %w", err)
		}
		assignmentStr := "<none>"
		if trip.AssignmentID != nil {
			assignmentStr = trip.AssignmentID.String()
		}
		s.log.Info("trip → COMPLETED",
			zap.String("trip_id", trip.TripID.String()),
			zap.String("assignment_id", assignmentStr),
			zap.String("truck_id", truck.ID.String()),
			zap.Bool("completed", completed),
		)
		if !completed {
			return nil, nil
		}
		return &pendingNotification{
			completed: &notify.OrderCompletedPayload{
				TripID:      trip.TripID,
				OrderID:     trip.OrderID,
				WorkspaceID: truck.WorkspaceID,
				OccurredAt:  ts,
			},
		}, nil
	}

	return nil, nil
}

// publishNotification dispatches notifications after a successful transaction
// commit. Errors are logged at ERROR level but do not propagate — the DB state
// is already consistent, and failing the ingestion would cause flespi to
// retry a batch whose geofence state is now INSIDE, producing no re-notification.
func (s *Service) publishNotification(ctx context.Context, n *pendingNotification) {
	if n == nil {
		return
	}
	if n.arrived != nil {
		if err := s.notifier.OrderArrived(ctx, *n.arrived); err != nil {
			s.log.Error("failed to publish OrderArrived notification",
				zap.Error(err),
				zap.String("trip_id", n.arrived.TripID.String()),
			)
		}
	}
	if n.completed != nil {
		if err := s.notifier.OrderCompleted(ctx, *n.completed); err != nil {
			s.log.Error("failed to publish OrderCompleted notification",
				zap.Error(err),
				zap.String("trip_id", n.completed.TripID.String()),
			)
		}
	}
}

func buildEvent(
	truck *domain.Truck,
	trip *domain.ActiveTrip,
	fence *domain.Geofence,
	evtType domain.EventType,
	lat, lon float64,
	ts time.Time,
) *domain.GeofenceEvent {
	evt := &domain.GeofenceEvent{
		ID:           uuid.New(),
		WorkspaceID:  truck.WorkspaceID,
		TruckID:      truck.ID,
		GeofenceID:   fence.ID,
		GeofenceType: fence.Type,
		EventType:    evtType,
		Latitude:     &lat,
		Longitude:    &lon,
		OccurredAt:   ts,
	}
	if trip != nil {
		tripID := trip.TripID
		evt.TripID = &tripID
		evt.OrderID = trip.OrderID // nil for Mode B
	}
	return evt
}
