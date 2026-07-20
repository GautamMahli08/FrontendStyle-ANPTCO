package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// routeClient handles all /v1/client/* endpoints.
// Auth: Cognito JWT (ERP_CLIENT or PLATFORM_ADMIN group).
// Workspace is derived from custom:workspace_id in the JWT — the API key is
// never returned to the browser.
func (h *Handler) routeClient(
	ctx context.Context,
	method, path string,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	p := strings.TrimPrefix(path, "/v1/client")

	switch {
	case method == "GET" && p == "/me":
		return h.handleClientMe(ctx, workspaceID)
	case method == "GET" && p == "/trucks":
		return h.handleClientTrucks(ctx, workspaceID)
	case method == "GET" && p == "/events":
		return h.handleClientEvents(ctx, workspaceID)
	case method == "GET" && p == "/trips":
		return h.handleClientTrips(ctx, workspaceID)
	case method == "POST" && p == "/dispatch":
		return h.handleClientDispatch(ctx, req, workspaceID)
	default:
		return clientError(404, "not found"), nil
	}
}

// GET /v1/client/me — workspace metadata + subscribed modules.
// Never returns the dispatch_api_key.
func (h *Handler) handleClientMe(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	ws, err := h.workspaces.GetByID(ctx, workspaceID.String())
	if err != nil {
		h.log.Error("client: get workspace", zap.Error(err))
		return clientError(500, "internal error"), nil
	}
	if ws == nil {
		return clientError(404, "workspace not found"), nil
	}
	return clientOK(map[string]interface{}{
		"workspace_id":   ws.ID,
		"workspace_name": ws.Name,
		"modules":        ws.Modules,
	})
}

// GET /v1/client/trucks — truck list with current live state (position, speed, fuel).
func (h *Handler) handleClientTrucks(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	trucks, err := h.admin.ListClientTrucks(ctx, workspaceID)
	if err != nil {
		h.log.Error("client: list trucks", zap.Error(err))
		return clientError(500, "internal error"), nil
	}
	if trucks == nil {
		return clientOK([]interface{}{})
	}
	return clientOK(trucks)
}

// GET /v1/client/events — asset events (fuel, battery, ignition, movement).
func (h *Handler) handleClientEvents(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	evs, err := h.admin.ListAssetEvents(ctx, workspaceID, 200)
	if err != nil {
		h.log.Error("client: list events", zap.Error(err))
		return clientError(500, "internal error"), nil
	}
	if evs == nil {
		return clientOK([]interface{}{})
	}
	return clientOK(evs)
}

// GET /v1/client/trips — dispatched trips for the workspace.
func (h *Handler) handleClientTrips(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	trips, err := h.admin.ListAdminTrips(ctx, workspaceID)
	if err != nil {
		h.log.Error("client: list trips", zap.Error(err))
		return clientError(500, "internal error"), nil
	}
	if trips == nil {
		return clientOK([]interface{}{})
	}
	return clientOK(trips)
}

// POST /v1/client/dispatch — dispatch a trip using Cognito JWT auth.
// Workspace comes from JWT, not from a dispatch API key.
func (h *Handler) handleClientDispatch(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	var input domain.DispatchTripInput
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return clientError(400, "invalid JSON body"), nil
	}
	if input.TruckID == (uuid.UUID{}) {
		return clientError(400, "truck_id is required"), nil
	}
	if input.DestName == "" {
		return clientError(400, "dest_name is required"), nil
	}
	if input.DestLat == 0 && input.DestLng == 0 {
		return clientError(400, "dest_lat and dest_lng are required"), nil
	}

	// Idempotency: return existing trip if order_ref was already dispatched.
	if input.OrderRef != "" {
		existing, err := h.trips.GetByWorkspaceAndOrderRef(ctx, workspaceID, input.OrderRef)
		if err != nil {
			h.log.Error("client dispatch: idempotency check", zap.Error(err))
			return clientError(500, "internal error"), nil
		}
		if existing != nil {
			resp, err := clientOK(existing)
			if err == nil {
				resp.StatusCode = 409
			}
			return resp, err
		}
	}

	// Resolve or create the destination geofence.
	var destGeofenceID *uuid.UUID
	if input.DestGeofenceRefID != "" {
		fence, err := h.geofences.GetByRefID(ctx, input.DestGeofenceRefID)
		if err == nil && fence != nil {
			destGeofenceID = &fence.ID
		}
	}
	if destGeofenceID == nil {
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
			h.log.Error("client dispatch: create geofence", zap.Error(err))
			return clientError(500, "internal error"), nil
		}
		destGeofenceID = &newFence.ID
	}

	var compartmentsJSON domain.JSONB
	if len(input.Compartments) > 0 {
		if b, err := json.Marshal(input.Compartments); err == nil {
			compartmentsJSON = domain.JSONB(b)
		}
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
		DestGeofenceID: destGeofenceID,
		Source:         domain.TripSourceDispatch,
		Status:         domain.TripStatusEnRoute,
		Compartments:   compartmentsJSON,
	}
	if err := h.trips.Create(ctx, trip); err != nil {
		h.log.Error("client dispatch: create trip", zap.Error(err))
		return clientError(500, "internal error"), nil
	}
	resp, err := clientOK(trip)
	if err == nil {
		resp.StatusCode = 201
	}
	return resp, err
}

// ── helpers ───────────────────────────────────────────────────────────────────

func clientHeaders() map[string]string {
	return map[string]string{
		"Content-Type":                 "application/json",
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	}
}

func clientOK(body interface{}) (events.APIGatewayV2HTTPResponse, error) {
	resp, err := jsonOK(body)
	if err == nil {
		if resp.Headers == nil {
			resp.Headers = map[string]string{}
		}
		for k, v := range clientHeaders() {
			resp.Headers[k] = v
		}
	}
	return resp, err
}

func clientError(code int, msg string) events.APIGatewayV2HTTPResponse {
	resp := jsonError(code, msg)
	if resp.Headers == nil {
		resp.Headers = map[string]string{}
	}
	for k, v := range clientHeaders() {
		resp.Headers[k] = v
	}
	return resp
}
