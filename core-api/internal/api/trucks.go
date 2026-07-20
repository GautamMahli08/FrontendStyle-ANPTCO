package api

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"
	"go.uber.org/zap"
)

func (h *Handler) handleListTrucks(
	ctx context.Context,
	workspaceID uuid.UUID,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	bypass := func() bool {
		return db.SetWorkspace(ctx, h.pool, "") == nil
	}

	var rows []*domain.TruckWithPosition
	var err error

	switch {
	case claims.HasAnyRole(auth.RolePlatformAdmin):
		if !bypass() {
			return jsonError(500, "internal error"), nil
		}
		rows, err = h.trucks.ListAllWithPosition(ctx)
	case claims.HasAnyRole(auth.RoleSellerManager):
		if !bypass() {
			return jsonError(500, "internal error"), nil
		}
		rows, err = h.trucks.ListForSellerWithPosition(ctx, workspaceID)
	default:
		rows, err = h.trucks.ListWithPosition(ctx, workspaceID)
	}

	if err != nil {
		h.log.Error("list trucks", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(rows) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(rows)
}

// GET /v1/trucks/{id}/qr
// Returns the CloudFront URL of the truck's QR PNG, generating and uploading it
// on demand when the store is configured but the URL is not yet cached on the row.
func (h *Handler) handleGetTruckQR(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	truck, err := h.trucks.GetByID(ctx, truckID, workspaceID)
	if err != nil {
		h.log.Error("get truck for QR", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if truck == nil {
		return jsonError(404, "truck not found"), nil
	}

	if h.store == nil {
		return jsonError(503, "QR storage not configured"), nil
	}

	// Return cached URL if already set.
	if truck.QRUrl != nil && *truck.QRUrl != "" {
		return jsonOK(map[string]string{"qr_url": *truck.QRUrl})
	}

	// Generate on demand.
	qrURL, err := generateAndUploadQR(ctx, h, truck.ID.String())
	if err != nil {
		h.log.Error("generate QR on demand", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(map[string]string{"qr_url": qrURL})
}

// POST /v1/kyc/upload-url  { "filename": "doc.pdf" }
// Returns a pre-signed S3 PUT URL valid for 15 minutes.
func (h *Handler) handleKYCUploadURL(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	if h.store == nil {
		return jsonError(503, "KYC storage not configured"), nil
	}

	var body struct {
		Filename string `json:"filename"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.Filename == "" {
		return jsonError(400, "filename is required"), nil
	}

	key := fmt.Sprintf("kyc/%s", body.Filename)
	url, err := h.store.PresignKYCUpload(ctx, key)
	if err != nil {
		h.log.Error("presign KYC upload", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(map[string]string{"upload_url": url, "key": key})
}

// generateAndUploadQR generates a QR PNG for truckID, uploads it, and persists the URL.
func generateAndUploadQR(ctx context.Context, h *Handler, truckID string) (string, error) {
	png, err := qrcode.Encode(truckID, qrcode.Medium, 256)
	if err != nil {
		return "", fmt.Errorf("qr encode: %w", err)
	}
	qrURL, err := h.store.UploadQR(ctx, truckID, png)
	if err != nil {
		return "", err
	}
	id, _ := uuid.Parse(truckID)
	if err := h.trucks.UpdateQRUrl(ctx, id, qrURL); err != nil {
		// Non-fatal — URL will be regenerated next call.
		h.log.Warn("persist qr_url", zap.Error(err))
	}
	return qrURL, nil
}

// PATCH /v1/trucks/{id}/fuel  { "compartment_fuel": {"1":5000,"2":8000,"3":3000,"4":4000} }
// Directly sets the truck's fuel load — used when a truck is loaded at depot
// without going through the order finish-loading flow.
func (h *Handler) handleSetTruckFuel(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	truck, err := h.trucks.GetByID(ctx, truckID, workspaceID)
	if err != nil {
		h.log.Error("set fuel: get truck", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if truck == nil {
		return jsonError(404, "truck not found"), nil
	}

	var body struct {
		CompartmentFuel map[string]float64 `json:"compartment_fuel"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || len(body.CompartmentFuel) == 0 {
		return jsonError(400, "compartment_fuel is required"), nil
	}

	var total float64
	for _, v := range body.CompartmentFuel {
		total += v
	}

	if err := h.trucks.SetFuel(ctx, truckID, workspaceID, body.CompartmentFuel, total); err != nil {
		h.log.Error("set fuel", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(map[string]interface{}{"status": "ok", "total_fuel_liters": total})
}

// PATCH /v1/trucks/{id}/position  { "latitude": 17.385, "longitude": 78.4867 }
// Seeds the truck's initial position in truck_live_state.
// Only takes effect while no real telemetry has been received (last_message_at IS NULL).
func (h *Handler) handleSeedTruckPosition(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	truck, err := h.trucks.GetByID(ctx, truckID, workspaceID)
	if err != nil {
		h.log.Error("seed position: get truck", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if truck == nil {
		return jsonError(404, "truck not found"), nil
	}

	var body struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil {
		return jsonError(400, "invalid body"), nil
	}
	if body.Latitude == 0 && body.Longitude == 0 {
		return jsonError(400, "latitude and longitude are required"), nil
	}

	if err := h.trucks.SeedPosition(ctx, truckID, workspaceID, body.Latitude, body.Longitude); err != nil {
		h.log.Error("seed position", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(map[string]string{"status": "ok"})
}

func (h *Handler) handleGetTruckPosition(
	ctx context.Context,
	workspaceID uuid.UUID,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	truckID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid truck id"), nil
	}

	truck, err := h.trucks.GetByID(ctx, truckID, workspaceID)
	if err != nil {
		h.log.Error("get truck", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if truck == nil {
		return jsonError(404, "truck not found"), nil
	}

	pos, err := h.trucks.GetPosition(ctx, truckID)
	if err != nil {
		h.log.Error("get position", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(pos)
}
