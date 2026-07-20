package geofence

// White-box tests: same package lets us construct Service with unexported
// field values and verify internal transitions without exporting them.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/anptco/location-geofence-service/internal/domain"
	"github.com/anptco/location-geofence-service/internal/notify"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---- mock implementations ---------------------------------------------------

type mockGeofenceRepo struct {
	findDepotFn      func(ctx context.Context, wsID uuid.UUID) (*domain.Geofence, error)
	findActiveTripFn func(ctx context.Context, truckID uuid.UUID) (*domain.ActiveTrip, error)
	getStateFn       func(ctx context.Context, truckID, fenceID uuid.UUID) (bool, error)
	setStateFn       func(ctx context.Context, truckID, fenceID uuid.UUID, inside bool) error
}

func (m *mockGeofenceRepo) FindDepotByWorkspace(ctx context.Context, wsID uuid.UUID) (*domain.Geofence, error) {
	if m.findDepotFn != nil {
		return m.findDepotFn(ctx, wsID)
	}
	return nil, nil
}
func (m *mockGeofenceRepo) FindActiveTripForTruck(ctx context.Context, truckID uuid.UUID) (*domain.ActiveTrip, error) {
	if m.findActiveTripFn != nil {
		return m.findActiveTripFn(ctx, truckID)
	}
	return nil, nil
}
func (m *mockGeofenceRepo) GetState(ctx context.Context, truckID, fenceID uuid.UUID) (bool, error) {
	if m.getStateFn != nil {
		return m.getStateFn(ctx, truckID, fenceID)
	}
	return false, nil
}
func (m *mockGeofenceRepo) SetState(ctx context.Context, truckID, fenceID uuid.UUID, inside bool) error {
	if m.setStateFn != nil {
		return m.setStateFn(ctx, truckID, fenceID, inside)
	}
	return nil
}

type mockEventRepo struct {
	insertFn func(ctx context.Context, evt *domain.GeofenceEvent) error
	calls    int
	last     *domain.GeofenceEvent
}

func (m *mockEventRepo) Insert(ctx context.Context, evt *domain.GeofenceEvent) error {
	m.calls++
	m.last = evt
	if m.insertFn != nil {
		return m.insertFn(ctx, evt)
	}
	return nil
}

// mockTripRepo implements repository.TripRepository with injectable functions.
type mockTripRepo struct {
	advanceFn  func(ctx context.Context, tripID uuid.UUID) error
	completeFn func(ctx context.Context, assignID *uuid.UUID, truckID uuid.UUID) error
	tryFn      func(ctx context.Context, tripID uuid.UUID, orderID *uuid.UUID) (bool, error)

	advanceCalls  int
	completeCalls int
}

func (m *mockTripRepo) AdvanceToArrived(ctx context.Context, tripID uuid.UUID) error {
	m.advanceCalls++
	if m.advanceFn != nil {
		return m.advanceFn(ctx, tripID)
	}
	return nil
}
func (m *mockTripRepo) CompleteAssignment(ctx context.Context, assignID *uuid.UUID, truckID uuid.UUID) error {
	m.completeCalls++
	if m.completeFn != nil {
		return m.completeFn(ctx, assignID, truckID)
	}
	return nil
}
func (m *mockTripRepo) TryComplete(ctx context.Context, tripID uuid.UUID, orderID *uuid.UUID) (bool, error) {
	if m.tryFn != nil {
		return m.tryFn(ctx, tripID, orderID)
	}
	return false, nil
}

// passthroughTransactor calls fn(ctx) directly — no real DB transaction.
type passthroughTransactor struct {
	err error // inject a post-fn commit error for rollback tests
}

func (t *passthroughTransactor) WithTx(ctx context.Context, fn func(context.Context) error) error {
	if err := fn(ctx); err != nil {
		return err
	}
	return t.err
}

// ---- fixtures ---------------------------------------------------------------

var (
	gTruckID     = uuid.MustParse("11111111-1111-1111-1111-111111111111")
	gWorkspaceID = uuid.MustParse("22222222-2222-2222-2222-222222222222")
	gOrderID     = uuid.MustParse("33333333-3333-3333-3333-333333333333")
	gAssignID    = uuid.MustParse("44444444-4444-4444-4444-444444444444")
	gFenceID     = uuid.MustParse("55555555-5555-5555-5555-555555555555")
	gDepotID     = uuid.MustParse("66666666-6666-6666-6666-666666666666")
	gTripID      = uuid.MustParse("77777777-7777-7777-7777-777777777777")

	gTruck = &domain.Truck{ID: gTruckID, WorkspaceID: gWorkspaceID}

	// Station at (55.75, 37.62); radius 100 m.
	gStation = &domain.Geofence{
		ID: gFenceID, WorkspaceID: gWorkspaceID,
		Type:         domain.GeofenceTypeStation,
		Latitude:     55.7500,
		Longitude:    37.6200,
		RadiusMeters: 100,
	}

	// Depot at (55.80, 37.60); radius 200 m.
	gDepot = &domain.Geofence{
		ID: gDepotID, WorkspaceID: gWorkspaceID,
		Type:         domain.GeofenceTypeDepot,
		Latitude:     55.8000,
		Longitude:    37.6000,
		RadiusMeters: 200,
	}

	// gOrder is an EN_ROUTE Mode A trip fixture.
	// OrderID and AssignmentID are pointers because Mode B trips may have nil values.
	gOrder = &domain.ActiveTrip{
		TripID:       gTripID,
		OrderID:      &gOrderID,
		AssignmentID: &gAssignID,
		TruckID:      gTruckID,
		WorkspaceID:  gWorkspaceID,
		TripStatus:   domain.OrderStatusEnRoute,
		GeofenceID:   gFenceID,
		DestLat:      gStation.Latitude,
		DestLon:      gStation.Longitude,
	}

	gNow = time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
)

// mockNotifier records which notifications were published.
type mockNotifier struct {
	arrived   []notify.OrderArrivedPayload
	completed []notify.OrderCompletedPayload
}

func (m *mockNotifier) OrderArrived(_ context.Context, p notify.OrderArrivedPayload) error {
	m.arrived = append(m.arrived, p)
	return nil
}
func (m *mockNotifier) OrderCompleted(_ context.Context, p notify.OrderCompletedPayload) error {
	m.completed = append(m.completed, p)
	return nil
}

func newGeoSvc(gr *mockGeofenceRepo, er *mockEventRepo, tr *mockTripRepo) *Service {
	return NewService(gr, er, tr, &passthroughTransactor{}, zap.NewNop(), 100, 200, notify.NoopNotifier{})
}

func newGeoSvcWithNotifier(gr *mockGeofenceRepo, er *mockEventRepo, tr *mockTripRepo, n notify.Notifier) *Service {
	return NewService(gr, er, tr, &passthroughTransactor{}, zap.NewNop(), 100, 200, n)
}

// ---- tests ------------------------------------------------------------------

func TestEvaluateReading_NoOrderNoDepot_NoEvents(t *testing.T) {
	events := &mockEventRepo{}
	svc := newGeoSvc(&mockGeofenceRepo{}, events, &mockTripRepo{})

	// Truck inside the station area, but no active trip → nothing evaluated.
	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)
	assert.Equal(t, 0, events.calls)
}

func TestEvaluateReading_NoTransition_AlreadyInside(t *testing.T) {
	events := &mockEventRepo{}
	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return true, nil // already inside
		},
	}
	svc := newGeoSvc(gr, events, &mockTripRepo{})

	// Reading still inside the station zone → no transition.
	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)
	assert.Equal(t, 0, events.calls, "no event when state does not change")
}

func TestEvaluateReading_StationEnter_AdvancesOrderToArrived(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil // EN_ROUTE
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil // was OUTSIDE
		},
	}
	svc := newGeoSvc(gr, events, trips)

	// Reading exactly at the station centre → inside.
	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "one ENTER event should be emitted")
	assert.Equal(t, domain.EventTypeEnter, events.last.EventType)
	assert.Equal(t, domain.GeofenceTypeStation, events.last.GeofenceType)
	assert.Equal(t, 1, trips.advanceCalls, "trip should advance to ARRIVED")
}

func TestEvaluateReading_StationEnter_WrongOrderStatus_NoAdvance(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	tripAlreadyArrived := *gOrder
	tripAlreadyArrived.TripStatus = domain.OrderStatusArrived

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripAlreadyArrived, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, events, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "ENTER event is still emitted regardless of trip status")
	assert.Equal(t, 0, trips.advanceCalls, "trip already ARRIVED — should not advance again")
}

func TestEvaluateReading_StationExit_NoOrderEffect(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return true, nil // was INSIDE
		},
	}
	svc := newGeoSvc(gr, events, trips)

	// Reading 5 km from station → outside.
	err := svc.EvaluateReading(context.Background(), gTruck, 55.80, 38.00, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls)
	assert.Equal(t, domain.EventTypeExit, events.last.EventType)
	assert.Equal(t, 0, trips.advanceCalls, "EXIT should not advance trip")
}

func TestEvaluateReading_DepotEnter_CompleteAssignment(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) { return false, nil },
	}

	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return gDepot, nil
		},
		// Truck was outside all fences. At depot coordinates it is inside the depot
		// but still outside the station (~5.6 km away), so no station EXIT fires.
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, events, trips)

	// Truck arrives at depot coordinates.
	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "one ENTER(DEPOT) event")
	assert.Equal(t, domain.EventTypeEnter, events.last.EventType)
	assert.Equal(t, domain.GeofenceTypeDepot, events.last.GeofenceType)
	assert.Equal(t, 1, trips.completeCalls, "assignment should be completed")
}

func TestEvaluateReading_DepotEnter_AllDone_OrderCompleted(t *testing.T) {
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) { return true, nil },
	}

	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) { return gDepot, nil },
		// Truck was outside all fences; only ENTER(DEPOT) should fire.
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, &mockEventRepo{}, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)
	assert.Equal(t, 1, trips.completeCalls)
}

// TestEvaluateReading_DepotEnter_WrongStatus verifies that a depot ENTER event
// is still emitted when the trip is not DELIVERY_ACCEPTED, but the assignment
// is NOT completed (the state machine effect is status-gated).
func TestEvaluateReading_DepotEnter_WrongStatus_EventEmittedNoCompletion(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	// Trip is EN_ROUTE — truck has not yet been to the station.
	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil // TripStatus = EN_ROUTE
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return gDepot, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil // outside all fences
		},
	}
	svc := newGeoSvc(gr, events, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "depot ENTER event must still be emitted")
	assert.Equal(t, domain.GeofenceTypeDepot, events.last.GeofenceType)
	assert.Equal(t, domain.EventTypeEnter, events.last.EventType)
	assert.Equal(t, 0, trips.completeCalls, "assignment must NOT be completed when trip is EN_ROUTE")
}

// TestEvaluateReading_DepotEnter_NoActiveOrder verifies that a depot ENTER event
// is emitted (useful for audit) even when the truck has no active trip.
func TestEvaluateReading_DepotEnter_NoActiveOrder_EventEmittedNoOrderEffect(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return nil, nil // no active trip
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return gDepot, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, events, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "depot ENTER must fire even with no active trip")
	assert.Equal(t, domain.GeofenceTypeDepot, events.last.GeofenceType)
	assert.Nil(t, events.last.OrderID, "order_id must be nil when truck has no active trip")
	assert.Equal(t, 0, trips.completeCalls)
}

// TestEvaluateReading_NoDepotConfigured verifies that when no depot is
// registered for the workspace only the station zone is evaluated.
func TestEvaluateReading_NoDepotConfigured_OnlyStationEvaluated(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil // EN_ROUTE
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return nil, nil // no depot configured for this workspace
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, events, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "only station ENTER fires")
	assert.Equal(t, domain.GeofenceTypeStation, events.last.GeofenceType)
	assert.Equal(t, 1, trips.advanceCalls, "trip advances to ARRIVED")
}

// TestEvaluateReading_DepotRadiusEnvOverride verifies that the GEOFENCE_DEPOT_RADIUS_M
// env variable overrides the DB radius_meters value for the depot fence.
// A truck 100 m from the depot centre is INSIDE the 200 m env override but
// OUTSIDE the 50 m DB value — so an ENTER event should fire.
func TestEvaluateReading_DepotRadiusEnvOverride(t *testing.T) {
	events := &mockEventRepo{}
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) { return false, nil },
	}

	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	// DB depot has a small radius that would NOT include the test position.
	smallDepot := *gDepot
	smallDepot.RadiusMeters = 50

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return &smallDepot, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	// newGeoSvc passes depotRadiusM=200 — overrides the DB value of 50.
	svc := newGeoSvc(gr, events, trips)

	// ~100 m north of depot centre: outside 50 m DB radius, inside 200 m env radius.
	lat100mNorth := gDepot.Latitude + 0.0009
	err := svc.EvaluateReading(context.Background(), gTruck, lat100mNorth, gDepot.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls, "env radius (200 m) overrides DB radius (50 m); truck is inside")
	assert.Equal(t, domain.EventTypeEnter, events.last.EventType)
}

// TestEvaluateReading_GetStateError_Propagated ensures an error from GetState
// is returned before entering the transaction.
func TestEvaluateReading_GetStateError_Propagated(t *testing.T) {
	stateErr := errors.New("geofence_state table locked")

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, stateErr
		},
	}
	svc := newGeoSvc(gr, &mockEventRepo{}, &mockTripRepo{})

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	assert.ErrorIs(t, err, stateErr, "GetState error must propagate")
}

// TestEvaluateReading_TryCompleteError_Propagated verifies that an error from
// TryComplete is returned after CompleteAssignment succeeds.
func TestEvaluateReading_TryCompleteError_Propagated(t *testing.T) {
	tryErr := errors.New("connection reset")
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) { return false, tryErr },
	}

	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) {
			return gDepot, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil
		},
	}
	svc := newGeoSvc(gr, &mockEventRepo{}, trips)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	assert.ErrorIs(t, err, tryErr, "TryComplete error must propagate through the transaction")
}

func TestEvaluateReading_SetStateError_TransactionRolledBack(t *testing.T) {
	setErr := errors.New("write conflict")
	events := &mockEventRepo{}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) {
			return false, nil // outside → will try to ENTER
		},
		setStateFn: func(_ context.Context, _, _ uuid.UUID, _ bool) error {
			return setErr
		},
	}
	svc := newGeoSvc(gr, events, &mockTripRepo{})

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	assert.ErrorIs(t, err, setErr)
	assert.Equal(t, 0, events.calls, "event must not be inserted when SetState fails")
}

func TestEvaluateReading_EventInsertError_Propagated(t *testing.T) {
	insertErr := errors.New("disk full")
	events := &mockEventRepo{
		insertFn: func(_ context.Context, _ *domain.GeofenceEvent) error { return insertErr },
	}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvc(gr, events, &mockTripRepo{})

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	assert.ErrorIs(t, err, insertErr)
}

func TestEvaluateReading_EventOrderIDSet_WhenOrderPresent(t *testing.T) {
	events := &mockEventRepo{}
	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvc(gr, events, &mockTripRepo{})

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	require.NotNil(t, events.last.OrderID, "order_id should be set when truck is on a Mode A trip")
	assert.Equal(t, gOrderID, *events.last.OrderID)
}

func TestEvaluateReading_StationEnter_PublishesOrderArrivedNotification(t *testing.T) {
	notifier := &mockNotifier{}
	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil // EN_ROUTE
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvcWithNotifier(gr, &mockEventRepo{}, &mockTripRepo{}, notifier)

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	require.Len(t, notifier.arrived, 1, "OrderArrived should fire once")
	require.NotNil(t, notifier.arrived[0].OrderID, "OrderID must be set for a Mode A trip")
	assert.Equal(t, gOrderID, *notifier.arrived[0].OrderID)
	assert.Equal(t, gTripID, notifier.arrived[0].TripID)
	assert.Equal(t, gTruckID, notifier.arrived[0].TruckID)
	assert.Equal(t, gNow, notifier.arrived[0].OccurredAt)
	assert.Empty(t, notifier.completed, "OrderCompleted must not fire on station arrival")
}

func TestEvaluateReading_DepotEnter_AllDone_PublishesOrderCompletedNotification(t *testing.T) {
	notifier := &mockNotifier{}
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) { return true, nil },
	}
	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) { return gDepot, nil },
		getStateFn:  func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvcWithNotifier(gr, &mockEventRepo{}, trips, notifier)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)

	require.Len(t, notifier.completed, 1, "OrderCompleted should fire once")
	require.NotNil(t, notifier.completed[0].OrderID, "OrderID must be set for a Mode A trip")
	assert.Equal(t, gOrderID, *notifier.completed[0].OrderID)
	assert.Equal(t, gTripID, notifier.completed[0].TripID)
	assert.Equal(t, gNow, notifier.completed[0].OccurredAt)
	assert.Empty(t, notifier.arrived, "OrderArrived must not fire on depot arrival")
}

func TestEvaluateReading_DepotEnter_NotAllDone_NoCompletedNotification(t *testing.T) {
	notifier := &mockNotifier{}
	trips := &mockTripRepo{
		tryFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) (bool, error) {
			return false, nil // other trucks still active
		},
	}
	tripDelivered := *gOrder
	tripDelivered.TripStatus = domain.OrderStatusDeliveryAccepted

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return &tripDelivered, nil
		},
		findDepotFn: func(_ context.Context, _ uuid.UUID) (*domain.Geofence, error) { return gDepot, nil },
		getStateFn:  func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvcWithNotifier(gr, &mockEventRepo{}, trips, notifier)

	err := svc.EvaluateReading(context.Background(), gTruck, gDepot.Latitude, gDepot.Longitude, gNow)
	require.NoError(t, err)

	assert.Empty(t, notifier.completed, "OrderCompleted must NOT fire while other trucks are still active")
}

func TestEvaluateReading_EventOccurredAtMatchesDeviceTimestamp(t *testing.T) {
	events := &mockEventRepo{}
	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return gOrder, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvc(gr, events, &mockTripRepo{})

	ts := time.Date(2026, 6, 15, 8, 30, 0, 0, time.UTC)
	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, ts)
	require.NoError(t, err)
	assert.Equal(t, ts, events.last.OccurredAt, "occurred_at must equal device timestamp")
}

// TestEvaluateReading_ModeBTrip_NoOrderID verifies that a Mode B trip (no
// linked order) still generates events and advances the trip state machine,
// but OrderID is nil in both the event and the notification.
func TestEvaluateReading_ModeBTrip_NoOrderID(t *testing.T) {
	notifier := &mockNotifier{}
	events := &mockEventRepo{}
	trips := &mockTripRepo{}

	modeBTrip := &domain.ActiveTrip{
		TripID:       gTripID,
		OrderID:      nil, // Mode B — no internal order
		AssignmentID: nil,
		TruckID:      gTruckID,
		WorkspaceID:  gWorkspaceID,
		TripStatus:   domain.OrderStatusEnRoute,
		GeofenceID:   gFenceID,
		DestLat:      gStation.Latitude,
		DestLon:      gStation.Longitude,
	}

	gr := &mockGeofenceRepo{
		findActiveTripFn: func(_ context.Context, _ uuid.UUID) (*domain.ActiveTrip, error) {
			return modeBTrip, nil
		},
		getStateFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}
	svc := newGeoSvcWithNotifier(gr, events, trips, notifier)

	err := svc.EvaluateReading(context.Background(), gTruck, gStation.Latitude, gStation.Longitude, gNow)
	require.NoError(t, err)

	assert.Equal(t, 1, events.calls)
	assert.Nil(t, events.last.OrderID, "Mode B event must have nil order_id")
	assert.Equal(t, &gTripID, events.last.TripID, "trip_id must be set even for Mode B")
	assert.Equal(t, 1, trips.advanceCalls, "trip must advance to ARRIVED even without an order")

	require.Len(t, notifier.arrived, 1)
	assert.Nil(t, notifier.arrived[0].OrderID, "Mode B notification must have nil order_id")
	assert.Equal(t, gTripID, notifier.arrived[0].TripID)
}
