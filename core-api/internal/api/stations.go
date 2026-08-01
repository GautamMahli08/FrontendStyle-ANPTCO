package api

import (
	"context"
	"encoding/json"

	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

const minRadiusMeters = 50

// POST /v1/stations — CLIENT registers a delivery station (geofence type=STATION)
func (h *Handler) handleCreateStation(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	var input domain.CreateStationInput
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil || input.Name == "" {
		return jsonError(400, "name, latitude, longitude and radius_meters are required"), nil
	}
	if input.RadiusMeters < minRadiusMeters {
		input.RadiusMeters = minRadiusMeters
	}

	g := &domain.Geofence{
		WorkspaceID:  workspaceID,
		Type:         domain.GeofenceTypeStation,
		Name:         input.Name,
		Latitude:     input.Latitude,
		Longitude:    input.Longitude,
		RadiusMeters: input.RadiusMeters,
	}
	if err := h.geofences.Create(ctx, g); err != nil {
		h.log.Error("create station", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	// Set ref_id = id so createTripForOrder can look up destination coords by station UUID.
	if err := h.geofences.SetSelfRefID(ctx, g.ID); err != nil {
		h.log.Warn("create station: set ref_id", zap.Error(err))
	}
	refID := g.ID.String()
	g.RefID = &refID

	return jsonCreated(g)
}

// GET /v1/stations — CLIENT lists their delivery stations
func (h *Handler) handleListStations(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	rows, err := h.geofences.ListByWorkspace(ctx, workspaceID, domain.GeofenceTypeStation)
	if err != nil {
		h.log.Error("list stations", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(rows) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(rows)
}

// POST /v1/depots — TRANSPORT_ADMIN registers a truck depot (geofence type=DEPOT)
func (h *Handler) handleCreateDepot(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	var input domain.CreateDepotInput
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil || input.Name == "" {
		return jsonError(400, "name, latitude, longitude and radius_meters are required"), nil
	}
	if input.RadiusMeters < minRadiusMeters {
		input.RadiusMeters = minRadiusMeters
	}

	g := &domain.Geofence{
		WorkspaceID:  workspaceID,
		Type:         domain.GeofenceTypeDepot,
		Name:         input.Name,
		Latitude:     input.Latitude,
		Longitude:    input.Longitude,
		RadiusMeters: input.RadiusMeters,
	}
	if err := h.geofences.Create(ctx, g); err != nil {
		h.log.Error("create depot", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonCreated(g)
}

// GET /v1/depots — TRANSPORT_ADMIN lists their depots
func (h *Handler) handleListDepots(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	rows, err := h.geofences.ListByWorkspace(ctx, workspaceID, domain.GeofenceTypeDepot)
	if err != nil {
		h.log.Error("list depots", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(rows) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(rows)
}
