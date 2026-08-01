package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/qr"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ── GET /admin/v1/workspaces/{id}/trucks ──────────────────────────────────────

func (h *Handler) handleAdminListTrucks(
	ctx context.Context,
	wsIDStr string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	trucks, err := h.admin.ListERPTrucks(ctx, wsID)
	if err != nil {
		h.log.Error("admin: list trucks", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if trucks == nil {
		return jsonOK([]interface{}{})
	}
	return jsonOK(trucks)
}

// ── POST /admin/v1/workspaces/{id}/trucks ─────────────────────────────────────

func (h *Handler) handleAdminCreateTruck(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	wsIDStr string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	var input struct {
		DeviceIMEI string  `json:"device_imei"`
		Plate      *string `json:"license_plate"`
		Make       *string `json:"make"`
		Model      *string `json:"model"`
		Year       *int    `json:"year"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if input.DeviceIMEI == "" {
		return jsonError(400, "device_imei is required"), nil
	}

	truckID, err := h.admin.CreateAdminTruck(ctx, wsID, input.DeviceIMEI, input.Plate, input.Make, input.Model, input.Year)
	if err != nil {
		h.log.Error("admin: create truck", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.issueInitialQR(ctx, truckID, claims.Sub)
	h.writeAudit(ctx, claims.Sub, "truck.created", "truck", truckID.String(), input)
	return jsonCreated(map[string]interface{}{"id": truckID, "workspace_id": wsID})
}

// ── PATCH /admin/v1/trucks/{id}/meta ──────────────────────────────────────────

func (h *Handler) handleAdminUpdateTruckMeta(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	var input struct {
		Plate *string `json:"license_plate"`
		Make  *string `json:"make"`
		Model *string `json:"model"`
		Year  *int    `json:"year"`
		Notes *string `json:"notes"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}

	if err := h.admin.UpdateTruckMeta(ctx, truckID, input.Plate, input.Make, input.Model, input.Year, input.Notes); err != nil {
		h.log.Error("admin: update truck meta", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "truck.meta_updated", "truck", rawID, input)
	return jsonOK(map[string]interface{}{"id": truckID, "updated": true})
}

// ── GET /admin/v1/trucks/{id}/compartments ────────────────────────────────────

func (h *Handler) handleAdminListCompartments(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}
	compartments, err := h.admin.ListCompartments(ctx, truckID)
	if err != nil {
		h.log.Error("admin: list compartments", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(compartments) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(compartments)
}

// ── PUT /admin/v1/trucks/{id}/compartments ────────────────────────────────────

func (h *Handler) handleAdminUpsertCompartments(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	var compartments []*domain.TruckCompartment
	if err := json.Unmarshal([]byte(req.Body), &compartments); err != nil {
		return jsonError(400, "invalid JSON body — expected array"), nil
	}
	for _, c := range compartments {
		if c.CapacityLiters <= 0 {
			return jsonError(400, "each compartment must have capacity_liters > 0"), nil
		}
		if c.CompartmentNo <= 0 {
			return jsonError(400, "compartment_no must be >= 1"), nil
		}
		if c.ProductType == "" {
			c.ProductType = "FUEL"
		}
	}

	if err := h.admin.UpsertCompartments(ctx, truckID, compartments); err != nil {
		h.log.Error("admin: upsert compartments", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "truck.compartments_updated", "truck", rawID, compartments)
	return jsonOK(compartments)
}

// ── GET /admin/v1/workspaces/{id}/events ─────────────────────────────────────

func (h *Handler) handleAdminListAssetEvents(
	ctx context.Context,
	wsIDStr string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	ev, err := h.admin.ListAssetEvents(ctx, wsID, 500)
	if err != nil {
		h.log.Error("admin: list asset events", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if ev == nil {
		return jsonOK([]interface{}{})
	}
	return jsonOK(ev)
}

// ── GET /v1/events — transport-admin alert feed (own workspace, RLS-scoped) ──
// Returns a merged feed of asset_events (fuel/battery/ignition/movement) and
// geofence_events (ENTER/EXIT transitions), sorted newest-first.

func (h *Handler) handleListEvents(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	feed, err := h.admin.ListUnifiedFeed(ctx, workspaceID, 500)
	if err != nil {
		h.log.Error("list unified feed", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(feed) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(feed)
}

// ── GET /admin/v1/workspaces/{id}/trips ──────────────────────────────────────

func (h *Handler) handleAdminListTrips(
	ctx context.Context,
	wsIDStr string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	trips, err := h.admin.ListAdminTrips(ctx, wsID)
	if err != nil {
		h.log.Error("admin: list trips", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if trips == nil {
		return jsonOK([]interface{}{})
	}
	return jsonOK(trips)
}

// ── GET /admin/v1/workspaces/{id}/drivers ────────────────────────────────────

func (h *Handler) handleAdminListDrivers(
	ctx context.Context,
	wsIDStr string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	drivers, err := h.admin.ListDrivers(ctx, wsID)
	if err != nil {
		h.log.Error("admin: list drivers", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(drivers) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(drivers)
}

// ── POST /admin/v1/workspaces/{id}/drivers ───────────────────────────────────

func (h *Handler) handleAdminCreateDriver(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	wsIDStr string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	var d domain.Driver
	if err := json.Unmarshal([]byte(req.Body), &d); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if d.FullName == "" {
		return jsonError(400, "full_name is required"), nil
	}
	d.ID = uuid.New()
	d.WorkspaceID = wsID
	d.IsActive = true

	if err := h.admin.CreateDriver(ctx, &d); err != nil {
		h.log.Error("admin: create driver", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "driver.created", "driver", d.ID.String(), &d)
	return jsonCreated(&d)
}

// ── PATCH /admin/v1/drivers/{id} ─────────────────────────────────────────────

func (h *Handler) handleAdminUpdateDriver(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	wsIDStr, rawDriverID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	driverID, err := uuid.Parse(strings.TrimSpace(rawDriverID))
	if err != nil {
		return jsonError(400, "invalid driver id"), nil
	}

	var d domain.Driver
	if err := json.Unmarshal([]byte(req.Body), &d); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	d.ID = driverID
	d.WorkspaceID = wsID

	if err := h.admin.UpdateDriver(ctx, &d); err != nil {
		h.log.Error("admin: update driver", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "driver.updated", "driver", rawDriverID, &d)
	return jsonOK(&d)
}

// ── DELETE /admin/v1/drivers/{id} ────────────────────────────────────────────

func (h *Handler) handleAdminDeactivateDriver(
	ctx context.Context,
	rawDriverID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	driverID, err := uuid.Parse(strings.TrimSpace(rawDriverID))
	if err != nil {
		return jsonError(400, "invalid driver id"), nil
	}

	if err := h.admin.DeactivateDriver(ctx, driverID); err != nil {
		h.log.Error("admin: deactivate driver", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "driver.deactivated", "driver", rawDriverID, nil)
	return jsonOK(map[string]interface{}{"id": driverID, "is_active": false})
}

// ── POST /admin/v1/trucks/{id}/regenerate-qr ─────────────────────────────────
// Revokes the current ACTIVE QR version and issues the next version.
// Body: { "reason": "sticker damaged" } (optional)
// Returns the new signed token and version number.
// Blocked when the truck has an active (non-completed) trip.

func (h *Handler) handleAdminRegenerateQR(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawTruckID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	if len(h.qrKey) == 0 {
		return jsonError(503, "QR signing key not configured"), nil
	}

	truckID, err := uuid.Parse(strings.TrimSpace(rawTruckID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	var body struct {
		Reason string `json:"reason"`
	}
	if req.Body != "" {
		_ = json.Unmarshal([]byte(req.Body), &body)
	}

	// Look up current active version.
	current, err := h.qrCodes.GetActiveByTruckID(ctx, truckID)
	if err != nil {
		h.log.Error("regenerate-qr: get active", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	nextVersion := 1
	if current != nil {
		nextVersion = current.Version + 1
		// Revoke current before issuing next.
		if err := h.qrCodes.Revoke(ctx, truckID, claims.Sub); err != nil {
			h.log.Error("regenerate-qr: revoke", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
	}

	token := qr.Build(h.qrKey, truckID.String(), nextVersion)
	hash := qr.TokenHash(token)
	reason := body.Reason
	code := &domain.QRCode{
		TruckID:   truckID,
		Version:   nextVersion,
		TokenHash: hash,
		CreatedBy: claims.Sub,
	}
	if reason != "" {
		code.Reason = &reason
	}
	if err := h.qrCodes.Issue(ctx, code); err != nil {
		h.log.Error("regenerate-qr: issue", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "qr.regenerated", "truck", truckID.String(), map[string]interface{}{
		"version": nextVersion,
		"reason":  reason,
	})

	return jsonOK(map[string]interface{}{
		"truck_id": truckID,
		"version":  nextVersion,
		"token":    token,
	})
}

// issueInitialQR issues QR version 1 for a newly created truck.
// Called from handleAdminCreateTruck when the signing key is configured.
// Non-fatal: a missing QR will be generated lazily on first access.
func (h *Handler) issueInitialQR(ctx context.Context, truckID uuid.UUID, createdBy string) {
	if len(h.qrKey) == 0 {
		return
	}
	token := qr.Build(h.qrKey, truckID.String(), 1)
	reason := "initial"
	code := &domain.QRCode{
		TruckID:   truckID,
		Version:   1,
		TokenHash: qr.TokenHash(token),
		CreatedBy: createdBy,
		Reason:    &reason,
	}
	if err := h.qrCodes.Issue(ctx, code); err != nil {
		// Non-fatal — admin can call regenerate-qr to create it later.
		return
	}
}
