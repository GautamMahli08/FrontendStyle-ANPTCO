package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/domain"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// handleOrderSyncWebhook processes POST /v1/webhooks/orders.
//
// Flow (§1.5 of the design):
//  1. Verify HMAC-SHA256 signature (skip when webhookSecret is empty — dev only).
//  2. Parse the InboundOrderEvent payload.
//  3. Dedup on event_id via order_events table — return 200 immediately on replay.
//  4. Resolve workspace from the payload's workspace_id field.
//  5. Try to link to a vehicle via device_imei.
//  6. Upsert to synced_orders; raise UNLINKED when no vehicle found.
//  7. Commit and return 2xx.
func (h *Handler) handleOrderSyncWebhook(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {

	// ── Step 1: signature verification ───────────────────────────────────────
	if h.orderWebhookSecret != "" {
		sig := req.Headers["x-webhook-signature"]
		if !verifyOrderWebhookSig(h.orderWebhookSecret, req.Body, sig) {
			return jsonError(401, "invalid webhook signature"), nil
		}
	}

	// ── Step 2: parse payload ─────────────────────────────────────────────────
	var evt domain.InboundOrderEvent
	if err := json.Unmarshal([]byte(req.Body), &evt); err != nil {
		h.log.Warn("order sync: invalid JSON body", zap.Error(err))
		return jsonError(400, "invalid JSON body"), nil
	}
	if evt.EventID == "" || evt.Order.ExternalOrderID == "" {
		return jsonError(400, "event_id and order.external_order_id are required"), nil
	}

	wsID, err := uuid.Parse(strings.TrimSpace(evt.WorkspaceID))
	if err != nil {
		return jsonError(400, "invalid workspace_id"), nil
	}

	// ── Step 3: idempotency check ─────────────────────────────────────────────
	seen, err := h.syncedOrders.IsEventSeen(ctx, wsID, evt.EventID)
	if err != nil {
		h.log.Error("order sync: check event seen", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if seen {
		return jsonOK(map[string]string{"status": "already_processed"})
	}

	// ── Steps 4–6: build and upsert synced order ──────────────────────────────
	o := buildSyncedOrder(wsID, &evt)

	// Try to link to a vehicle via IMEI.
	if evt.Order.Vehicle != nil && evt.Order.Vehicle.DeviceIMEI != "" {
		truckID, err := h.syncedOrders.FindTruckByIMEI(ctx, wsID, evt.Order.Vehicle.DeviceIMEI)
		if err != nil {
			h.log.Error("order sync: find truck by imei", zap.Error(err))
		} else if truckID != nil {
			o.VehicleID = truckID
			o.LinkState = "LINKED"
		} else {
			o.LinkState = "UNLINKED"
			h.log.Warn("order sync: vehicle not found — order unlinked",
				zap.String("external_order_id", evt.Order.ExternalOrderID),
				zap.String("imei", evt.Order.Vehicle.DeviceIMEI),
			)
		}
	}

	rawBytes, _ := json.Marshal(evt)
	o.Raw = rawBytes

	if err := h.syncedOrders.Upsert(ctx, o); err != nil {
		h.log.Error("order sync: upsert", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	// ── Step 7: mark event seen after successful upsert ───────────────────────
	if err := h.syncedOrders.MarkEventSeen(ctx, wsID, evt.EventID); err != nil {
		// Non-fatal: the order is already persisted; a duplicate delivery will
		// hit the synced_orders ON CONFLICT and be harmless.
		h.log.Error("order sync: mark event seen", zap.Error(err))
	}

	h.log.Info("order synced",
		zap.String("external_order_id", o.ExternalOrderID),
		zap.String("status", o.Status),
		zap.String("link_state", o.LinkState),
	)
	return jsonOK(map[string]string{
		"external_order_id": o.ExternalOrderID,
		"link_state":        o.LinkState,
	})
}

func buildSyncedOrder(wsID uuid.UUID, evt *domain.InboundOrderEvent) *domain.SyncedOrder {
	o := &domain.SyncedOrder{
		WorkspaceID:     wsID,
		ExternalOrderID: evt.Order.ExternalOrderID,
		Status:          evt.Order.Status,
		LinkState:       "LINKED",
		ProductCode:     evt.Order.ProductCode,
		QuantityOrderedL: evt.Order.QuantityL,
		ScheduledFrom:   evt.Order.ScheduledFrom,
		ScheduledTo:     evt.Order.ScheduledTo,
	}
	if evt.Order.Destination != nil {
		o.DestLat = evt.Order.Destination.Lat
		o.DestLng = evt.Order.Destination.Lon
	}
	return o
}

// verifyOrderWebhookSig checks the HMAC-SHA256 signature sent by the external
// system in the X-Webhook-Signature header (hex-encoded, no prefix).
func verifyOrderWebhookSig(secret, body, sigHeader string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sigHeader))
}
