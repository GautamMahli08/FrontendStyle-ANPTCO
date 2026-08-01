package api

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/qr"
	"github.com/anptco/core-api/internal/repository"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// handleGetOrderDeliveryNote returns the delivery note for an order.
// Accessible by CLIENT, SELLER_MANAGER, TRANSPORT_ADMIN, and PLATFORM_ADMIN.
func (h *Handler) handleGetOrderDeliveryNote(
	ctx context.Context,
	workspaceID uuid.UUID,
	claims auth.Claims,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	// Bypass RLS — order/note may live in seller's workspace.
	if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
		return jsonError(500, "internal error"), nil
	}

	// Verify caller has access to this order.
	order, err := h.orders.GetByIDRaw(ctx, orderID)
	if err != nil {
		h.log.Error("delivery-note: get order", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if order == nil {
		return jsonError(404, "order not found"), nil
	}
	if claims.HasAnyRole(auth.RoleClient) &&
		(order.ClientWorkspaceID == nil || order.ClientWorkspaceID.String() != workspaceID.String()) {
		return jsonError(403, "forbidden"), nil
	}

	note, err := h.deliveryNotes.GetByOrderID(ctx, orderID)
	if err != nil {
		h.log.Error("delivery-note: get note", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if note == nil {
		return jsonError(404, "delivery note not yet available"), nil
	}

	resp := map[string]interface{}{
		"id":           note.ID,
		"trip_id":      note.TripID,
		"order_id":     note.OrderID,
		"workspace_id": note.WorkspaceID,
		"qr_confirmed": note.QRConfirmed,
		"note_data":    note.NoteData,
		"generated_at": note.GeneratedAt,
	}

	// Attach a presigned download URL when S3 key is stored and store is available.
	if note.S3Key != nil && *note.S3Key != "" && h.store != nil {
		if signedURL, presignErr := h.store.PresignDeliveryNote(ctx, *note.S3Key); presignErr == nil {
			resp["download_url"] = signedURL
		}
	}

	return jsonOK(resp)
}

// createTripForOrder creates a Trip row for a Mode A (full-product) order at the
// moment loading completes. The Trip captures the fuel_loaded snapshot and
// resolves the destination geofence so the monitoring engine has everything it
// needs without joining through orders at runtime.
//
// Errors are logged as warnings — a missing trip means the geofence service will
// not advance the order automatically, but the order itself is already correct.
func (h *Handler) createTripForOrder(
	ctx context.Context,
	order *domain.Order,
	truckID uuid.UUID,
	fuelLoaded map[string]float64,
) {
	if order == nil || truckID == (uuid.UUID{}) {
		return
	}

	// Idempotency: skip if a trip already exists for this order.
	existing, _ := h.trips.GetByOrderID(ctx, order.ID)
	if existing != nil {
		return
	}

	trip := &domain.Trip{
		ID:          uuid.New(),
		WorkspaceID: order.WorkspaceID,
		TruckID:     truckID,
		Source:      domain.TripSourceOrdering,
		Status:      domain.TripStatusLoading,
	}
	trip.OrderID = &order.ID

	// Encode fuel_loaded as JSONB.
	if len(fuelLoaded) > 0 {
		if b, err := json.Marshal(fuelLoaded); err == nil {
			trip.FuelLoaded = domain.JSONB(b)
		}
	}

	// Resolve destination from station geofence.
	if order.DestinationStationID != nil && *order.DestinationStationID != "" {
		fence, err := h.geofences.GetByRefID(ctx, *order.DestinationStationID)
		if err != nil {
			h.log.Warn("create trip: look up station geofence", zap.Error(err))
		}
		if fence != nil {
			trip.DestName = fence.Name
			trip.DestLat = fence.Latitude
			trip.DestLng = fence.Longitude
			trip.DestGeofenceID = &fence.ID
		}
	}

	// dest_name / lat / lng are NOT NULL in the DB — if we couldn't resolve them
	// (order has no destination station), skip creating the trip rather than
	// inserting a row with zero coordinates that would confuse the geofence engine.
	if trip.DestLat == 0 && trip.DestLng == 0 {
		h.log.Warn("create trip: no destination coordinates — skipping",
			zap.String("order_id", order.ID.String()),
		)
		return
	}

	if err := h.trips.Create(ctx, trip); err != nil {
		h.log.Warn("create trip: insert", zap.Error(err), zap.String("order_id", order.ID.String()))
		return
	}
	h.log.Info("trip created",
		zap.String("trip_id", trip.ID.String()),
		zap.String("order_id", order.ID.String()),
		zap.String("truck_id", truckID.String()),
	)
}

func (h *Handler) handleListOrders(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	activeOnly := req.QueryStringParameters["active"] != "false"

	var orders []*domain.Order
	var err error

	if claims.HasAnyRole(auth.RoleClient) {
		// CLIENT's orders live in seller workspaces — bypass RLS and query by client_workspace_id.
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			h.log.Error("list orders: bypass workspace", zap.Error(setErr))
			return jsonError(500, "internal error"), nil
		}
		orders, err = h.orders.ListByClient(ctx, workspaceID, activeOnly)
	} else if claims.HasAnyRole(auth.RoleTransportAdmin) {
		// TRANSPORT_ADMIN's assigned orders live in seller workspaces — bypass RLS and query by transporter_id.
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			h.log.Error("list orders: bypass workspace for transporter", zap.Error(setErr))
			return jsonError(500, "internal error"), nil
		}
		orders, err = h.orders.ListByTransporter(ctx, claims.Sub, activeOnly)
	} else {
		orders, err = h.orders.List(ctx, workspaceID, activeOnly)
	}

	if err != nil {
		h.log.Error("list orders", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(orders) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(orders)
}

func (h *Handler) handleGetOrder(
	ctx context.Context,
	workspaceID uuid.UUID,
	claims auth.Claims,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	var order *domain.Order
	if claims.HasAnyRole(auth.RoleClient) {
		// Order lives in seller's workspace — bypass RLS and verify client ownership.
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		order, err = h.orders.GetByIDRaw(ctx, orderID)
		if err == nil && order != nil && (order.ClientWorkspaceID == nil || order.ClientWorkspaceID.String() != workspaceID.String()) {
			return jsonError(404, "order not found"), nil
		}
	} else if claims.HasAnyRole(auth.RoleTransportAdmin) {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		order, err = h.orders.GetByTransporter(ctx, orderID, claims.Sub)
	} else {
		order, err = h.orders.GetByID(ctx, orderID, workspaceID)
	}
	if err != nil {
		h.log.Error("get order", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if order == nil {
		return jsonError(404, "order not found"), nil
	}
	return jsonOK(order)
}

func (h *Handler) handleCreateOrder(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var input domain.CreateOrderInput
	if req.Body != "" {
		if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
			return jsonError(400, "invalid JSON body"), nil
		}
	}

	// Determine which workspace owns the order.
	// CLIENTs must supply seller_workspace_id; the order lives in the seller's workspace.
	// SELLER_MANAGER / PLATFORM_ADMIN create orders directly in their own workspace.
	targetWorkspace := workspaceID
	var clientWorkspaceID *uuid.UUID

	if claims.HasAnyRole(auth.RoleClient) {
		if input.SellerWorkspaceID == "" {
			return jsonError(400, "seller_workspace_id is required"), nil
		}
		sellerWS, err := uuid.Parse(input.SellerWorkspaceID)
		if err != nil {
			return jsonError(400, "seller_workspace_id must be a valid UUID"), nil
		}
		targetWorkspace = sellerWS
		clientWorkspaceID = &workspaceID
		// Switch RLS context to seller's workspace so the INSERT passes the check.
		if err := db.SetWorkspace(ctx, h.pool, sellerWS.String()); err != nil {
			h.log.Error("create order: set seller workspace", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
	}

	order := &domain.Order{
		ID:                   uuid.New(),
		WorkspaceID:          targetWorkspace,
		ClientWorkspaceID:    clientWorkspaceID,
		Status:               domain.OrderStatusPlaced,
		DestinationStationID: input.DestinationStationID,
		VolumeLiters:         input.VolumeLiters,
		FuelType:             input.FuelType,
	}
	if err := h.orders.Create(ctx, order); err != nil {
		h.log.Error("create order", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	// Re-fetch to get DB-generated timestamps.
	created, err := h.orders.GetByID(ctx, order.ID, targetWorkspace)
	if err != nil || created == nil {
		return jsonCreated(order)
	}
	return jsonCreated(created)
}

// handleScanOrder processes a QR scan at delivery. The request body is the
// raw truck_id string or a JSON object {"truck_id": "..."}.
// Either way it sets the order status to DELIVERY_ACCEPTED.
// CLIENT and TRANSPORT_ADMIN callers bypass RLS (order lives in seller's workspace).
func (h *Handler) handleScanOrder(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	var order *domain.Order
	needsBypass := claims.HasAnyRole(auth.RoleClient, auth.RoleTransportAdmin, auth.RoleDriver)

	if needsBypass {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		order, err = h.orders.GetByIDRaw(ctx, orderID)
	} else {
		order, err = h.orders.GetByID(ctx, orderID, workspaceID)
	}
	if err != nil {
		h.log.Error("get order for scan", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if order == nil {
		return jsonError(404, "order not found"), nil
	}
	// Verify caller owns this order
	if claims.HasAnyRole(auth.RoleClient) && (order.ClientWorkspaceID == nil || order.ClientWorkspaceID.String() != workspaceID.String()) {
		return jsonError(403, "forbidden"), nil
	}
	if claims.HasAnyRole(auth.RoleTransportAdmin, auth.RoleDriver) && order.TransporterID == nil {
		return jsonError(403, "forbidden"), nil
	}
	if order.Status == domain.OrderStatusDeliveryAccepted ||
		order.Status == domain.OrderStatusCompleted {
		return jsonError(409, "order already accepted or completed"), nil
	}

	// UpdateStatus uses order's own workspace_id (RLS already bypassed above)
	if err := h.orders.UpdateStatus(ctx, orderID, order.WorkspaceID, domain.OrderStatusDeliveryAccepted); err != nil {
		h.log.Error("scan: update status", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.log.Info("delivery accepted via scan",
		zap.String("order_id", orderID.String()),
		zap.String("workspace_id", order.WorkspaceID.String()),
	)

	order.Status = domain.OrderStatusDeliveryAccepted
	return jsonOK(order)
}

// PATCH /v1/orders/{id}/accept — PLACED → ACCEPTED_BY_SELLER (SELLER_MANAGER)
func (h *Handler) handleAcceptOrder(ctx context.Context, workspaceID uuid.UUID, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	return h.simpleAdvance(ctx, workspaceID, rawID, domain.OrderStatusPlaced, domain.OrderStatusAcceptedBySeller)
}

// PATCH /v1/orders/{id}/assign-tsp — ACCEPTED_BY_SELLER → ASSIGNED_TO_TSP (SELLER_MANAGER)
// Body: {"transporter_id": "<cognito_sub_or_email>"}
func (h *Handler) handleAssignTSP(ctx context.Context, req events.APIGatewayV2HTTPRequest, workspaceID uuid.UUID, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}
	var body struct {
		TransporterID string `json:"transporter_id"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.TransporterID == "" {
		return jsonError(400, "transporter_id is required"), nil
	}
	if err := h.orders.AssignTransporter(ctx, orderID, workspaceID, body.TransporterID); err != nil {
		if errors.Is(err, repository.ErrWrongStatus) {
			return jsonError(409, "order must be in ACCEPTED_BY_SELLER status"), nil
		}
		h.log.Error("assign tsp", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	order, _ := h.orders.GetByID(ctx, orderID, workspaceID)
	return jsonOK(order)
}

// PATCH /v1/orders/{id}/assign-truck — ASSIGNED_TO_TSP → ASSIGNED (TRANSPORT_ADMIN)
// Body: {"truck_id": "<uuid>"}
func (h *Handler) handleAssignTruck(ctx context.Context, req events.APIGatewayV2HTTPRequest, workspaceID uuid.UUID, claims auth.Claims, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}
	var body struct {
		TruckID string `json:"truck_id"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.TruckID == "" {
		return jsonError(400, "truck_id is required"), nil
	}
	truckID, err := uuid.Parse(body.TruckID)
	if err != nil {
		return jsonError(400, "truck_id must be a valid UUID"), nil
	}

	var order *domain.Order
	if claims.HasAnyRole(auth.RoleTransportAdmin) {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		if err := h.orders.AdvanceStatusByTransporter(ctx, orderID, claims.Sub, domain.OrderStatusAssignedToTSP, domain.OrderStatusAssigned); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order must be in ASSIGNED_TO_TSP status"), nil
			}
			h.log.Error("assign truck: advance status", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByTransporter(ctx, orderID, claims.Sub)
	} else {
		if err := h.orders.AdvanceStatus(ctx, orderID, workspaceID, domain.OrderStatusAssignedToTSP, domain.OrderStatusAssigned); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order must be in ASSIGNED_TO_TSP status"), nil
			}
			h.log.Error("assign truck: advance status", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByID(ctx, orderID, workspaceID)
	}
	assignment := &domain.OrderAssignment{
		ID:      uuid.New(),
		OrderID: orderID,
		TruckID: truckID,
		Status:  "LOADING", // order_assignments uses trip-phase values, not order statuses
	}
	if err := h.orders.AssignTruck(ctx, assignment); err != nil {
		h.log.Warn("assign truck: create assignment row", zap.Error(err))
	}
	return jsonOK(order)
}

// PATCH /v1/orders/{id}/start-loading — ASSIGNED → LOADING (TRANSPORT_ADMIN)
func (h *Handler) handleStartLoading(ctx context.Context, workspaceID uuid.UUID, claims auth.Claims, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	return h.simpleAdvanceForRole(ctx, workspaceID, claims, rawID, domain.OrderStatusAssigned, domain.OrderStatusLoading)
}

// PATCH /v1/orders/{id}/finish-loading — LOADING → LOADED (TRANSPORT_ADMIN)
// Optional body: { "compartment_fuel": {"1": 5000, "2": 10000, "3": 7500, "4": 2500} }
func (h *Handler) handleFinishLoading(ctx context.Context, req events.APIGatewayV2HTTPRequest, workspaceID uuid.UUID, claims auth.Claims, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	var body struct {
		CompartmentFuel map[string]float64 `json:"compartment_fuel"`
	}
	if req.Body != "" {
		_ = json.Unmarshal([]byte(req.Body), &body)
	}

	// Advance order — TRANSPORT_ADMIN uses transporter_id, others use workspace.
	var order *domain.Order
	if claims.HasAnyRole(auth.RoleTransportAdmin) {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		if err := h.orders.AdvanceStatusByTransporter(ctx, orderID, claims.Sub, domain.OrderStatusLoading, domain.OrderStatusLoaded); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order is not in the expected status for this transition"), nil
			}
			h.log.Error("finish loading: advance by transporter", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByTransporter(ctx, orderID, claims.Sub)
	} else {
		if err := h.orders.AdvanceStatus(ctx, orderID, workspaceID, domain.OrderStatusLoading, domain.OrderStatusLoaded); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order is not in the expected status for this transition"), nil
			}
			h.log.Error("finish loading: advance status", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByID(ctx, orderID, workspaceID)
	}

	// Resolve the truck — needed for both fuel update and trip creation.
	truckID, err := h.orders.GetTruckForOrder(ctx, orderID)
	if err != nil {
		h.log.Warn("finish loading: get truck for order", zap.Error(err))
	}
	// Fallback: if no order_assignments row exists, use the first truck in the
	// transporter's workspace. Covers cases where the order bypassed the
	// assign-truck step or was created before assignment tracking was added.
	if truckID == (uuid.UUID{}) {
		if trucks, listErr := h.trucks.ListWithPosition(ctx, workspaceID); listErr == nil && len(trucks) > 0 {
			truckID = trucks[0].ID
			h.log.Info("finish loading: fuel fallback — using first workspace truck", zap.String("truck_id", truckID.String()))
		}
	}

	// Store compartment fuel if provided.
	if len(body.CompartmentFuel) > 0 && truckID != (uuid.UUID{}) {
		var total float64
		for _, v := range body.CompartmentFuel {
			total += v
		}
		if err := h.trucks.SetFuel(ctx, truckID, workspaceID, body.CompartmentFuel, total); err != nil {
			h.log.Warn("finish loading: set fuel", zap.Error(err))
		}
	}
	if len(body.CompartmentFuel) == 0 && truckID == (uuid.UUID{}) {
		h.log.Warn("finish loading: no truck found — skipping fuel + trip", zap.String("order_id", orderID.String()))
	}

	// Create the Trip for the monitoring engine (Phase 1: Mode A).
	// RLS bypass is already active at this point if claims are TRANSPORT_ADMIN.
	if err := db.SetWorkspace(ctx, h.pool, ""); err == nil {
		h.createTripForOrder(ctx, order, truckID, body.CompartmentFuel)
	}

	return jsonOK(order)
}

// PATCH /v1/orders/{id}/depart — LOADED → EN_ROUTE (TRANSPORT_ADMIN)
// Also advances the linked Trip to EN_ROUTE so the monitoring engine picks it up.
func (h *Handler) handleDepart(ctx context.Context, workspaceID uuid.UUID, claims auth.Claims, rawID string) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	var order *domain.Order
	if claims.HasAnyRole(auth.RoleTransportAdmin) {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		if err := h.orders.AdvanceStatusByTransporter(ctx, orderID, claims.Sub, domain.OrderStatusLoaded, domain.OrderStatusEnRoute); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order is not in the expected status for this transition"), nil
			}
			h.log.Error("depart: advance by transporter", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByTransporter(ctx, orderID, claims.Sub)
	} else {
		if err := h.orders.AdvanceStatus(ctx, orderID, workspaceID, domain.OrderStatusLoaded, domain.OrderStatusEnRoute); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order is not in the expected status for this transition"), nil
			}
			h.log.Error("depart: advance status", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ = h.orders.GetByID(ctx, orderID, workspaceID)
	}

	// Advance the linked trip to EN_ROUTE so the geofence service starts monitoring.
	// RLS is already bypassed above (TRANSPORT_ADMIN path) or not needed (same workspace).
	if err := db.SetWorkspace(ctx, h.pool, ""); err == nil {
		if trip, tripErr := h.trips.GetByOrderID(ctx, orderID); tripErr == nil && trip != nil {
			if advErr := h.trips.UpdateStatus(ctx, trip.ID, domain.TripStatusEnRoute); advErr != nil {
				h.log.Warn("depart: advance trip to EN_ROUTE", zap.Error(advErr), zap.String("trip_id", trip.ID.String()))
			} else {
				h.log.Info("trip → EN_ROUTE", zap.String("trip_id", trip.ID.String()))
			}
		}
	}

	return jsonOK(order)
}

// POST /v1/orders/{id}/accept-delivery { "token": "truck_id.version.hmac" }
// 4-gate QR delivery acceptance (CLIENT / PLATFORM_ADMIN only).
//
//	Gate 1 — token HMAC is valid and version matches the truck's ACTIVE qr_codes row.
//	Gate 2 — the token's truck is the truck assigned to the active trip for this order.
//	Gate 3 — the truck is within qrProximityM metres of the order's destination.
//	Gate 4 — the truck's last telemetry is no older than qrRecencyLimit seconds.
//
// When qrKey is nil (not configured), gates 1 and 2 are skipped and the endpoint
// accepts any token that contains a valid truck UUID — graceful degradation for
// deployments that have not yet set QR_SIGNING_KEY.
func (h *Handler) handleAcceptDelivery(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	workspaceID uuid.UUID,
	claims auth.Claims,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}

	var body struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil || body.Token == "" {
		return jsonError(400, "token is required"), nil
	}

	// Bypass RLS: order lives in seller's workspace.
	if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
		return jsonError(500, "internal error"), nil
	}

	order, err := h.orders.GetByIDRaw(ctx, orderID)
	if err != nil {
		h.log.Error("accept-delivery: get order", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if order == nil {
		return jsonError(404, "order not found"), nil
	}
	if claims.HasAnyRole(auth.RoleClient) &&
		(order.ClientWorkspaceID == nil || order.ClientWorkspaceID.String() != workspaceID.String()) {
		return jsonError(403, "forbidden"), nil
	}
	if order.Status == domain.OrderStatusDeliveryAccepted || order.Status == domain.OrderStatusCompleted {
		return jsonOK(order) // idempotent
	}
	if order.Status != domain.OrderStatusArrived {
		return jsonError(409, "truck has not arrived"), nil
	}

	// Resolve the trip — carries dest coords + assigned truck.
	trip, err := h.trips.GetByOrderID(ctx, orderID)
	if err != nil {
		h.log.Error("accept-delivery: get trip", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if trip == nil {
		return jsonError(409, "no active trip found for this order"), nil
	}

	// --- Gate 1 + 2 (skip when signing key not configured) ---
	var tokenTruckID uuid.UUID
	if len(h.qrKey) > 0 {
		truckIDStr, version, verErr := qr.Verify(h.qrKey, body.Token)
		if verErr != nil {
			return jsonError(422, "invalid or expired QR"), nil
		}
		tokenTruckID, err = uuid.Parse(truckIDStr)
		if err != nil {
			return jsonError(422, "invalid or expired QR"), nil
		}
		// Gate 1: check version is active in qr_codes.
		active, qrErr := h.qrCodes.GetActiveByTruckID(ctx, tokenTruckID)
		if qrErr != nil {
			h.log.Error("accept-delivery: get active qr", zap.Error(qrErr))
			return jsonError(500, "internal error"), nil
		}
		if active == nil || active.Version != version {
			return jsonError(422, "invalid or expired QR"), nil
		}
		// Gate 2: token truck must be the trip's truck.
		if tokenTruckID != trip.TruckID {
			return jsonError(422, "wrong truck for this order"), nil
		}
	} else {
		// Graceful degradation: extract UUID from token string.
		uuidStr := body.Token
		if len(uuidStr) > 36 {
			uuidStr = uuidStr[:36]
		}
		tokenTruckID, err = uuid.Parse(strings.TrimSpace(uuidStr))
		if err != nil {
			return jsonError(422, "invalid QR token"), nil
		}
		if tokenTruckID != trip.TruckID {
			return jsonError(422, "wrong truck for this order"), nil
		}
	}

	// --- Gates 3 + 4: proximity and recency ---
	pos, err := h.trucks.GetPosition(ctx, tokenTruckID)
	if err != nil {
		h.log.Error("accept-delivery: get truck position", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if pos == nil || pos.Latitude == nil || pos.Longitude == nil {
		return jsonError(409, "truck position is not available"), nil
	}
	// Gate 3: proximity.
	distM := haversineM(*pos.Latitude, *pos.Longitude, trip.DestLat, trip.DestLng)
	if distM > qrProximityM {
		return jsonError(409, "truck no longer at destination"), nil
	}
	// Gate 4: recency.
	if pos.LastMessageAt == nil || time.Since(*pos.LastMessageAt) > time.Duration(qrRecencyLimit)*time.Second {
		return jsonError(409, "truck position is stale — cannot confirm"), nil
	}

	// All gates passed — advance order + trip.
	if err := h.orders.UpdateStatus(ctx, orderID, order.WorkspaceID, domain.OrderStatusDeliveryAccepted); err != nil {
		h.log.Error("accept-delivery: update order status", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if err := h.trips.UpdateStatus(ctx, trip.ID, domain.TripStatusDeliveryAccepted); err != nil {
		h.log.Warn("accept-delivery: update trip status", zap.Error(err), zap.String("trip_id", trip.ID.String()))
	}

	h.log.Info("delivery accepted via 4-gate QR",
		zap.String("order_id", orderID.String()),
		zap.String("trip_id", trip.ID.String()),
		zap.String("truck_id", tokenTruckID.String()),
		zap.Float64("dist_m", distM),
	)

	// Generate delivery note (non-fatal — acceptance already succeeded).
	h.generateDeliveryNote(ctx, order, trip, tokenTruckID, distM, time.Since(*pos.LastMessageAt), claims.Sub)

	order.Status = domain.OrderStatusDeliveryAccepted
	return jsonOK(order)
}

// generateDeliveryNote builds and persists the delivery note for a just-accepted delivery.
// Non-fatal: errors are logged but do not fail the acceptance.
func (h *Handler) generateDeliveryNote(
	ctx context.Context,
	order *domain.Order,
	trip *domain.Trip,
	truckID uuid.UUID,
	distM float64,
	telemetryAge time.Duration,
	acceptedBy string,
) {
	now := time.Now().UTC()
	notePayload := map[string]interface{}{
		"trip_id":            trip.ID,
		"order_id":           order.ID,
		"workspace_id":       order.WorkspaceID,
		"truck_id":           truckID,
		"driver_name":        trip.DriverName,
		"origin_name":        trip.OriginName,
		"dest_name":          trip.DestName,
		"volume_ordered_liters": order.VolumeLiters,
		"fuel_type":          order.FuelType,
		"fuel_loaded":        trip.FuelLoaded,
		"fuel_delivered":     trip.FuelDelivered,
		"qr_confirmed":       true,
		"dist_m":             math.Round(distM*10) / 10,
		"telemetry_age_s":    int(telemetryAge.Seconds()),
		"accepted_by":        acceptedBy,
		"accepted_at":        now,
	}

	noteJSON, err := json.Marshal(notePayload)
	if err != nil {
		h.log.Warn("delivery-note: marshal", zap.Error(err))
		return
	}

	note := &domain.DeliveryNote{
		ID:          uuid.New(),
		TripID:      trip.ID,
		WorkspaceID: order.WorkspaceID,
		QRConfirmed: true,
		NoteData:    domain.JSONB(noteJSON),
		GeneratedAt: now,
	}
	note.OrderID = &order.ID

	// Upload to S3 when store is available.
	if h.store != nil {
		key, uploadErr := h.store.UploadDeliveryNote(ctx, trip.ID.String(), noteJSON)
		if uploadErr != nil {
			h.log.Warn("delivery-note: upload to S3", zap.Error(uploadErr))
		} else {
			note.S3Key = &key
		}
	}

	if err := h.deliveryNotes.Insert(ctx, note); err != nil {
		h.log.Warn("delivery-note: insert", zap.Error(err))
	}
}

// haversineM returns the great-circle distance in metres between two lat/lng points.
func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6_371_000 // Earth radius in metres
	φ1 := lat1 * math.Pi / 180
	φ2 := lat2 * math.Pi / 180
	Δφ := (lat2 - lat1) * math.Pi / 180
	Δλ := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(Δφ/2)*math.Sin(Δφ/2) + math.Cos(φ1)*math.Cos(φ2)*math.Sin(Δλ/2)*math.Sin(Δλ/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// simpleAdvance advances an order from → to and returns the updated order.
func (h *Handler) simpleAdvance(ctx context.Context, workspaceID uuid.UUID, rawID string, from, to domain.OrderStatus) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}
	if err := h.orders.AdvanceStatus(ctx, orderID, workspaceID, from, to); err != nil {
		if errors.Is(err, repository.ErrWrongStatus) {
			return jsonError(409, "order is not in the expected status for this transition"), nil
		}
		h.log.Error("advance order status", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	order, _ := h.orders.GetByID(ctx, orderID, workspaceID)
	return jsonOK(order)
}

// simpleAdvanceForRole advances an order for either TRANSPORT_ADMIN (by transporter_id,
// RLS bypassed) or other roles (by workspace_id).
func (h *Handler) simpleAdvanceForRole(ctx context.Context, workspaceID uuid.UUID, claims auth.Claims, rawID string, from, to domain.OrderStatus) (events.APIGatewayV2HTTPResponse, error) {
	orderID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid order id"), nil
	}
	if claims.HasAnyRole(auth.RoleTransportAdmin) {
		if setErr := db.SetWorkspace(ctx, h.pool, ""); setErr != nil {
			return jsonError(500, "internal error"), nil
		}
		if err := h.orders.AdvanceStatusByTransporter(ctx, orderID, claims.Sub, from, to); err != nil {
			if errors.Is(err, repository.ErrWrongStatus) {
				return jsonError(409, "order is not in the expected status for this transition"), nil
			}
			h.log.Error("advance order status by transporter", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		order, _ := h.orders.GetByTransporter(ctx, orderID, claims.Sub)
		return jsonOK(order)
	}
	if err := h.orders.AdvanceStatus(ctx, orderID, workspaceID, from, to); err != nil {
		if errors.Is(err, repository.ErrWrongStatus) {
			return jsonError(409, "order is not in the expected status for this transition"), nil
		}
		h.log.Error("advance order status", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	order, _ := h.orders.GetByID(ctx, orderID, workspaceID)
	return jsonOK(order)
}
