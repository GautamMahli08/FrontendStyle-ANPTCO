package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ─── Seller connections ───────────────────────────────────────────────────────

// POST /v1/connections  { "seller_code": "SELLER-XXXX" }
// Any TRANSPORT_ADMIN can call this to request a connection with the seller
// identified by seller_code.
func (h *Handler) handleRequestConnection(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var body struct {
		SellerCode string `json:"seller_code"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.SellerCode == "" {
		return jsonError(400, "seller_code is required"), nil
	}

	// Resolve the workspace that owns this seller code.
	sellerWorkspace, err := h.onboarding.GetWorkspaceBySellerCode(ctx, body.SellerCode)
	if err != nil {
		h.log.Error("lookup seller code", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if sellerWorkspace == uuid.Nil {
		return jsonError(404, "seller code not found"), nil
	}

	conn := &domain.SellerConnection{
		ID:            uuid.New(),
		WorkspaceID:   sellerWorkspace, // stored against seller's workspace
		TransporterID: claims.Sub,
		SellerCode:    body.SellerCode,
	}
	if err := h.onboarding.CreateConnection(ctx, conn); err != nil {
		h.log.Error("create connection", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonCreated(conn)
}

// GET /v1/connections
// SELLER_MANAGER sees pending requests for their workspace.
// TRANSPORT_ADMIN sees their own outgoing requests.
func (h *Handler) handleListConnections(
	ctx context.Context,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	conns, err := h.onboarding.ListConnections(ctx, workspaceID)
	if err != nil {
		h.log.Error("list connections", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(conns) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(conns)
}

// PATCH /v1/connections/{id}/approve   (SELLER_MANAGER only)
// PATCH /v1/connections/{id}/reject    (SELLER_MANAGER only)
func (h *Handler) handleResolveConnection(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
	action string, // "approve" | "reject"
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	id, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid connection id"), nil
	}

	conn, err := h.onboarding.GetConnectionByID(ctx, id, workspaceID)
	if err != nil {
		h.log.Error("get connection", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if conn == nil {
		return jsonError(404, "connection not found"), nil
	}

	newStatus := "APPROVED"
	if action == "reject" {
		newStatus = "REJECTED"
	}

	if err := h.onboarding.ResolveConnection(ctx, id, workspaceID, newStatus, claims.Sub); err != nil {
		h.log.Error("resolve connection", zap.Error(err))
		return jsonError(409, "connection already resolved"), nil
	}
	conn.Status = newStatus
	return jsonOK(conn)
}

// ─── Sensor requests ─────────────────────────────────────────────────────────

// POST /v1/sensor-requests  { "device_imei": "...", "registration_no": "..." }
// TRANSPORT_ADMIN submits a truck for integration.
func (h *Handler) handleSubmitSensorRequest(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var body struct {
		DeviceIMEI     string  `json:"device_imei"`
		RegistrationNo *string `json:"registration_no"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.DeviceIMEI == "" {
		return jsonError(400, "device_imei is required"), nil
	}

	sr := &domain.SensorRequest{
		ID:             uuid.New(),
		WorkspaceID:    workspaceID,
		SubmittedBy:    claims.Sub,
		DeviceIMEI:     body.DeviceIMEI,
		RegistrationNo: body.RegistrationNo,
	}
	if err := h.onboarding.CreateSensorRequest(ctx, sr); err != nil {
		h.log.Error("create sensor request", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonCreated(sr)
}

// GET /v1/sensor-requests?status=PENDING_SELLER
func (h *Handler) handleListSensorRequests(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
) (events.APIGatewayV2HTTPResponse, error) {
	status := req.QueryStringParameters["status"]
	rows, err := h.onboarding.ListSensorRequests(ctx, workspaceID, status)
	if err != nil {
		h.log.Error("list sensor requests", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(rows) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(rows)
}

// PATCH /v1/sensor-requests/{id}/approve — seller approval (→ PENDING_ADMIN)
//                                         or admin approval (→ APPROVED + create truck)
// PATCH /v1/sensor-requests/{id}/reject  — either step
func (h *Handler) handleReviewSensorRequest(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	rawID string,
	action string, // "approve" | "reject"
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	id, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid request id"), nil
	}

	sr, err := h.onboarding.GetSensorRequestByID(ctx, id, workspaceID)
	if err != nil {
		h.log.Error("get sensor request", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if sr == nil {
		return jsonError(404, "sensor request not found"), nil
	}

	if action == "reject" {
		if err := h.onboarding.AdvanceSensorRequest(ctx, id, workspaceID, "REJECTED", claims.Sub); err != nil {
			return jsonError(409, "cannot reject in current status"), nil
		}
		sr.Status = "REJECTED"
		return jsonOK(sr)
	}

	// Approve: role determines which step
	var newStatus string
	switch {
	case sr.Status == "PENDING_SELLER" && claims.HasAnyRole(auth.RoleSellerManager, auth.RolePlatformAdmin):
		newStatus = "PENDING_ADMIN"
	case sr.Status == "PENDING_ADMIN" && claims.HasAnyRole(auth.RolePlatformAdmin):
		newStatus = "APPROVED"
	default:
		return jsonError(403, "not authorized to approve at this stage"), nil
	}

	if err := h.onboarding.AdvanceSensorRequest(ctx, id, workspaceID, newStatus, claims.Sub); err != nil {
		h.log.Error("advance sensor request", zap.Error(err))
		return jsonError(409, "cannot advance in current status"), nil
	}

	// When fully approved, create the truck row then generate its QR code.
	if newStatus == "APPROVED" {
		if err := h.trucks.Create(ctx, workspaceID, sr.DeviceIMEI); err != nil {
			h.log.Error("create truck after sensor approval", zap.Error(err),
				zap.String("device_imei", sr.DeviceIMEI))
		} else if h.store != nil {
			truck, err := h.trucks.GetByDeviceIMEI(ctx, workspaceID, sr.DeviceIMEI)
			if err != nil || truck == nil {
				h.log.Warn("get truck for QR generation after approval", zap.Error(err))
			} else {
				if _, err := generateAndUploadQR(ctx, h, truck.ID.String()); err != nil {
					h.log.Warn("generate QR after sensor approval", zap.Error(err),
						zap.String("truck_id", truck.ID.String()))
				}
			}
		}

		// Notify the approving admin.
		if claims.Email != "" {
			body := "Sensor request approved. The truck has been integrated and its QR code generated."
			_ = h.email.Send(ctx, claims.Email, "Truck integration approved", body)
		}
	}

	sr.Status = newStatus
	return jsonOK(sr)
}
