package api

import (
	"context"
	"strings"

	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// routeERP handles all /v1/erp/* endpoints. Auth is a dispatch API key (Bearer),
// not a Cognito JWT. Workspace is derived from the key. CORS headers are included
// so the standalone erp-console app can call these endpoints cross-origin.
func (h *Handler) routeERP(
	ctx context.Context,
	method, path string,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	// OPTIONS preflight for CORS.
	if method == "OPTIONS" {
		return events.APIGatewayV2HTTPResponse{StatusCode: 204, Headers: erpHeaders()}, nil
	}

	// Authenticate via dispatch API key.
	authHeader := req.Headers["authorization"]
	if authHeader == "" {
		authHeader = req.Headers["Authorization"]
	}
	rawKey := strings.TrimPrefix(authHeader, "Bearer ")
	if rawKey == "" || rawKey == authHeader {
		return erpError(401, "missing bearer key"), nil
	}

	ws, err := h.apiKeys.GetWorkspaceByKeyHash(ctx, hashBearerKey(rawKey))
	if err != nil {
		h.log.Error("erp: key lookup", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	if ws == nil {
		return erpError(401, "invalid api key"), nil
	}

	wsID, err := uuid.Parse(ws.ID)
	if err != nil {
		return erpError(500, "internal error"), nil
	}

	// Set RLS workspace so geofence queries are scoped correctly.
	if err := db.SetWorkspace(ctx, h.pool, ws.ID); err != nil {
		h.log.Error("erp: set workspace", zap.Error(err))
		return erpError(500, "internal error"), nil
	}

	p := strings.TrimPrefix(path, "/v1/erp")
	switch {
	case method == "GET" && p == "/trucks":
		return h.handleERPTrucks(ctx, wsID, ws)
	case method == "GET" && p == "/drivers":
		return h.handleERPDrivers(ctx, wsID)
	case method == "GET" && p == "/geofences":
		return h.handleERPGeofences(ctx, wsID)
	case method == "GET" && p == "/events":
		return h.handleERPEvents(ctx, wsID)
	case method == "GET" && p == "/trips":
		return h.handleERPTrips(ctx, wsID)
	default:
		return erpError(404, "not found"), nil
	}
}

func (h *Handler) handleERPTrucks(ctx context.Context, wsID uuid.UUID, ws *domain.Workspace) (events.APIGatewayV2HTTPResponse, error) {
	trucks, err := h.admin.ListERPTrucks(ctx, wsID)
	if err != nil {
		h.log.Error("erp: list trucks", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	return erpOK(map[string]interface{}{
		"workspace_id":   ws.ID,
		"workspace_name": ws.Name,
		"trucks":         trucks,
	})
}

func (h *Handler) handleERPDrivers(ctx context.Context, wsID uuid.UUID) (events.APIGatewayV2HTTPResponse, error) {
	drivers, err := h.admin.ListDrivers(ctx, wsID)
	if err != nil {
		h.log.Error("erp: list drivers", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	if drivers == nil {
		drivers = []*domain.Driver{}
	}
	return erpOK(map[string]interface{}{"drivers": drivers})
}

func (h *Handler) handleERPGeofences(ctx context.Context, wsID uuid.UUID) (events.APIGatewayV2HTTPResponse, error) {
	stations, err := h.geofences.ListByWorkspace(ctx, wsID, domain.GeofenceTypeStation)
	if err != nil {
		h.log.Error("erp: list geofences", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	if stations == nil {
		stations = []*domain.Geofence{}
	}
	return erpOK(map[string]interface{}{"geofences": stations})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (h *Handler) handleERPEvents(ctx context.Context, wsID uuid.UUID) (events.APIGatewayV2HTTPResponse, error) {
	evs, err := h.admin.ListAssetEvents(ctx, wsID, 200)
	if err != nil {
		h.log.Error("erp: list events", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	if evs == nil {
		return erpOK([]interface{}{})
	}
	return erpOK(evs)
}

func (h *Handler) handleERPTrips(ctx context.Context, wsID uuid.UUID) (events.APIGatewayV2HTTPResponse, error) {
	trips, err := h.admin.ListAdminTrips(ctx, wsID)
	if err != nil {
		h.log.Error("erp: list trips", zap.Error(err))
		return erpError(500, "internal error"), nil
	}
	if trips == nil {
		return erpOK([]interface{}{})
	}
	return erpOK(trips)
}

func erpHeaders() map[string]string {
	return map[string]string{
		"Content-Type":                 "application/json",
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
	}
}

func erpOK(body interface{}) (events.APIGatewayV2HTTPResponse, error) {
	resp, err := jsonOK(body)
	if err == nil {
		if resp.Headers == nil {
			resp.Headers = map[string]string{}
		}
		for k, v := range erpHeaders() {
			resp.Headers[k] = v
		}
	}
	return resp, err
}

func erpError(code int, msg string) events.APIGatewayV2HTTPResponse {
	resp := jsonError(code, msg)
	if resp.Headers == nil {
		resp.Headers = map[string]string{}
	}
	for k, v := range erpHeaders() {
		resp.Headers[k] = v
	}
	return resp
}
