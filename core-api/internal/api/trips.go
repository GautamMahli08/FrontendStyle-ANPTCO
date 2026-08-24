package api

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// handleGetWorkspace returns the calling user's workspace record including module flags.
// Used by the frontend to decide which nav items to show.
func (h *Handler) handleGetWorkspace(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	ws, err := h.workspaces.GetByID(ctx, workspaceID.String())
	if err != nil {
		h.log.Error("get workspace", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if ws == nil {
		return jsonError(404, "workspace not found"), nil
	}
	return jsonOK(ws)
}

// handleDispatchTrip creates a Mode B trip via machine-to-machine auth.
// Auth: Authorization: Bearer <dispatch_api_key> (NOT a Cognito JWT).
// The workspace is identified by the key, not a JWT workspace_id claim.
func (h *Handler) handleDispatchTrip(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	// Extract Bearer key from Authorization header.
	authHeader := req.Headers["authorization"]
	if authHeader == "" {
		authHeader = req.Headers["Authorization"]
	}
	key := strings.TrimPrefix(authHeader, "Bearer ")
	if key == "" || key == authHeader {
		return jsonError(401, "missing dispatch API key"), nil
	}

	// Try new dispatch_api_keys table first (SHA-256 hash lookup).
	// Fall back to legacy workspaces.dispatch_api_key column for existing keys.
	ws, err := h.apiKeys.GetWorkspaceByKeyHash(ctx, hashBearerKey(key))
	if err != nil {
		h.log.Error("dispatch: look up key hash", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if ws == nil {
		ws, err = h.workspaces.GetByDispatchKey(ctx, key)
		if err != nil {
			h.log.Error("dispatch: look up legacy key", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
	}
	if ws == nil {
		return jsonError(401, "invalid dispatch API key"), nil
	}

	workspaceID, err := uuid.Parse(ws.ID)
	if err != nil {
		return jsonError(500, "internal error"), nil
	}

	// Bypass RLS: key auth already scopes to the workspace.
	if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
		h.log.Error("dispatch: bypass RLS", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	var input domain.DispatchTripInput
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if input.TruckID == (uuid.UUID{}) {
		return jsonError(400, "truck_id is required"), nil
	}
	if input.DestName == "" {
		return jsonError(400, "dest_name is required"), nil
	}
	if input.DestLat == 0 && input.DestLng == 0 {
		return jsonError(400, "dest_lat and dest_lng are required"), nil
	}

	// Resolve or create the destination geofence.
	var destGeofenceID *uuid.UUID
	if input.DestGeofenceRefID != "" {
		fence, lookErr := h.geofences.GetByRefID(ctx, input.DestGeofenceRefID)
		if lookErr != nil {
			h.log.Warn("dispatch: look up geofence ref_id", zap.Error(lookErr))
		} else if fence != nil {
			destGeofenceID = &fence.ID
		}
	}
	if destGeofenceID == nil {
		// Create an ephemeral STATION geofence so the monitoring engine has a
		// stable geofence_id for state tracking.
		radius := input.DestRadiusMeters
		if radius == 0 {
			radius = 200
		}
		newFence := &domain.Geofence{
			ID:           uuid.New(),
			WorkspaceID:  workspaceID,
			Type:         domain.GeofenceTypeStation,
			Name:         input.DestName,
			Latitude:     input.DestLat,
			Longitude:    input.DestLng,
			RadiusMeters: radius,
		}
		if createErr := h.geofences.Create(ctx, newFence); createErr != nil {
			h.log.Error("dispatch: create geofence", zap.Error(createErr))
			return jsonError(500, "internal error"), nil
		}
		destGeofenceID = &newFence.ID
	}

	// Build compartments JSONB if provided.
	var compartmentsJSON domain.JSONB
	if len(input.Compartments) > 0 {
		if b, marshalErr := json.Marshal(input.Compartments); marshalErr == nil {
			compartmentsJSON = domain.JSONB(b)
		}
	}

	orderRef := input.OrderRef
	driverName := input.DriverName
	originName := input.OriginName

	// P2-2: idempotency — if the caller already dispatched this order_ref, return
	// the existing trip with 409 so their retry logic can read the trip_id.
	if orderRef != "" {
		existing, lookErr := h.trips.GetByWorkspaceAndOrderRef(ctx, workspaceID, orderRef)
		if lookErr != nil {
			h.log.Error("dispatch: idempotency check", zap.Error(lookErr))
			return jsonError(500, "internal error"), nil
		}
		if existing != nil {
			return jsonConflict(existing)
		}
	}

	trip := &domain.Trip{
		ID:             uuid.New(),
		WorkspaceID:    workspaceID,
		TruckID:        input.TruckID,
		OrderRef:       strPtr(orderRef),
		DriverName:     strPtr(driverName),
		OriginName:     strPtr(originName),
		OriginLat:      float64Ptr(input.OriginLat),
		OriginLng:      float64Ptr(input.OriginLng),
		DestName:       input.DestName,
		DestLat:        input.DestLat,
		DestLng:        input.DestLng,
		DestGeofenceID: destGeofenceID,
		Source:         domain.TripSourceDispatch,
		// Mode B trips start EN_ROUTE immediately — the truck is already dispatched.
		Status:       domain.TripStatusEnRoute,
		Compartments: compartmentsJSON,
	}

	if err := h.trips.Create(ctx, trip); err != nil {
		h.log.Error("dispatch: create trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.log.Info("trip dispatched",
		zap.String("trip_id", trip.ID.String()),
		zap.String("workspace_id", workspaceID.String()),
		zap.String("truck_id", input.TruckID.String()),
	)
	return jsonCreated(trip)
}

// handleCreateTrip is the JWT-authenticated equivalent of handleDispatchTrip.
// Used by the fleet-monitor UI so transport admins can dispatch test trips
// without needing a machine-to-machine API key.
func (h *Handler) handleCreateTrip(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	var input domain.DispatchTripInput
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if input.TruckID == (uuid.UUID{}) {
		return jsonError(400, "truck_id is required"), nil
	}
	if input.DestName == "" {
		return jsonError(400, "dest_name is required"), nil
	}
	if input.DestLat == 0 && input.DestLng == 0 {
		return jsonError(400, "dest_lat and dest_lng are required"), nil
	}

	radius := input.DestRadiusMeters
	if radius == 0 {
		radius = 200
	}
	newFence := &domain.Geofence{
		ID:           uuid.New(),
		WorkspaceID:  workspaceID,
		Type:         domain.GeofenceTypeStation,
		Name:         input.DestName,
		Latitude:     input.DestLat,
		Longitude:    input.DestLng,
		RadiusMeters: radius,
	}
	if err := h.geofences.Create(ctx, newFence); err != nil {
		h.log.Error("create trip: create geofence", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	trip := &domain.Trip{
		ID:             uuid.New(),
		WorkspaceID:    workspaceID,
		TruckID:        input.TruckID,
		OrderRef:       strPtr(input.OrderRef),
		DriverName:     strPtr(input.DriverName),
		OriginName:     strPtr(input.OriginName),
		OriginLat:      float64Ptr(input.OriginLat),
		OriginLng:      float64Ptr(input.OriginLng),
		DestName:       input.DestName,
		DestLat:        input.DestLat,
		DestLng:        input.DestLng,
		DestGeofenceID: &newFence.ID,
		Source:         domain.TripSourceDispatch,
		Status:         domain.TripStatusEnRoute,
	}
	if err := h.trips.Create(ctx, trip); err != nil {
		h.log.Error("create trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	h.log.Info("trip created via JWT",
		zap.String("trip_id", trip.ID.String()),
		zap.String("workspace_id", workspaceID.String()),
	)
	return jsonCreated(trip)
}

// handleListTrips returns recent trips for the workspace (TRANSPORT_ADMIN / PLATFORM_ADMIN).
func (h *Handler) handleListTrips(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	trips, err := h.trips.ListByWorkspace(ctx, workspaceID, 100)
	if err != nil {
		h.log.Error("list trips", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(trips) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(trips)
}

// handleGetTrip returns a single trip by ID.
func (h *Handler) handleGetTrip(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	tripID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid trip id"), nil
	}
	trip, err := h.trips.GetByID(ctx, tripID, workspaceID)
	if err != nil {
		h.log.Error("get trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if trip == nil {
		return jsonError(404, "trip not found"), nil
	}
	return jsonOK(trip)
}

func (h *Handler) handleDeleteTrip(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	tripID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid trip id"), nil
	}
	if err := h.trips.Delete(ctx, tripID, workspaceID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return jsonError(404, "trip not found"), nil
		}
		h.log.Error("delete trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(map[string]string{"id": tripID.String()})
}

// handleScanTrip processes a QR scan at delivery: ARRIVED → DELIVERY_ACCEPTED.
// Works for both Mode A and Mode B trips. For Mode A, the existing order scan
// endpoint (/v1/orders/{id}/scan) remains the primary path; this endpoint is
// introduced for Mode B and is also usable for Mode A as an alternative.
// Optional body: {"fuel_delivered": {"1": 4800}}
func (h *Handler) handleScanTrip(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	tripID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid trip id"), nil
	}

	var body struct {
		FuelDelivered map[string]float64 `json:"fuel_delivered"`
	}
	if req.Body != "" {
		_ = json.Unmarshal([]byte(req.Body), &body)
	}

	// RLS bypass: trip may live in seller's workspace (Mode A).
	if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
		return jsonError(500, "internal error"), nil
	}

	if err := h.trips.ScanDelivery(ctx, tripID, workspaceID, body.FuelDelivered); err != nil {
		if err == repository.ErrWrongStatus {
			return jsonError(409, "trip is not in ARRIVED status"), nil
		}
		h.log.Error("scan trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	trip, _ := h.trips.GetByID(ctx, tripID, workspaceID)
	h.log.Info("delivery accepted via trip scan",
		zap.String("trip_id", tripID.String()),
	)
	return jsonOK(trip)
}

// handleGetDeliveryNote returns a delivery summary for a completed or accepted trip.
// Phase 2: returns JSON. Phase 3 can generate a PDF from this.
func (h *Handler) handleGetDeliveryNote(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	tripID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid trip id"), nil
	}

	// RLS bypass: trip may live in a different workspace (Mode A via transporter).
	if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
		return jsonError(500, "internal error"), nil
	}

	trip, err := h.trips.GetByID(ctx, tripID, workspaceID)
	if err != nil {
		h.log.Error("delivery note: get trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if trip == nil {
		return jsonError(404, "trip not found"), nil
	}
	if trip.Status != domain.TripStatusDeliveryAccepted &&
		trip.Status != domain.TripStatusCompleted {
		return jsonError(409, "delivery note is only available after delivery is accepted"), nil
	}

	note := map[string]interface{}{
		"trip_id":        trip.ID,
		"order_id":       trip.OrderID,
		"order_ref":      trip.OrderRef,
		"driver_name":    trip.DriverName,
		"truck_id":       trip.TruckID,
		"workspace_id":   trip.WorkspaceID,
		"origin_name":    trip.OriginName,
		"dest_name":      trip.DestName,
		"status":         trip.Status,
		"fuel_loaded":    trip.FuelLoaded,
		"fuel_delivered": trip.FuelDelivered,
		"compartments":   trip.Compartments,
		"scanned_at":     trip.ScannedAt,
		"created_at":     trip.CreatedAt,
	}
	return jsonOK(note)
}

// strPtr returns a pointer to s, or nil if s is the empty string.
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// float64Ptr returns a pointer to f, or nil if f is zero (unset by caller).
func float64Ptr(f float64) *float64 {
	if f == 0 {
		return nil
	}
	return &f
}
