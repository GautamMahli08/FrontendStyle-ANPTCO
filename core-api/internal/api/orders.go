package api

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/domain"
	"github.com/anptco/core-api/internal/repository"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

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
		Status:  domain.OrderStatusAssigned,
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
