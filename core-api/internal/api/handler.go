package api

import (
	"context"
	"errors"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/db"
	"github.com/anptco/core-api/internal/notify"
	"github.com/anptco/core-api/internal/repository"
	"github.com/anptco/core-api/internal/storage"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"go.uber.org/zap"
)

// qrProximityM is the radius within which the truck must be to accept delivery.
const qrProximityM = 200.0

// qrRecencyLimit is the maximum age of the last telemetry reading.
const qrRecencyLimit = 5 * 60 // seconds

// Handler is the top-level Lambda request handler. It owns routing, workspace
// extraction, and role-based authorization.
type Handler struct {
	pool          *sqlx.DB
	trucks        repository.TruckRepository
	orders        repository.OrderRepository
	trips         repository.TripRepository
	onboarding    repository.OnboardingRepository
	geofences     repository.GeofenceRepository
	workspaces    repository.WorkspaceRepository
	admin         repository.AdminRepository
	devices       repository.DeviceRepository
	apiKeys       repository.APIKeyRepository
	qrCodes       repository.QRCodeRepository
	deliveryNotes repository.DeliveryNoteRepository
	syncedOrders  repository.SyncedOrderRepository
	cognito        *auth.CognitoClient // nil when USER_POOL_ID not configured
	store          *storage.S3Store    // nil when QR_BUCKET not configured
	email          notify.EmailSender  // noop when SES_FROM_ADDRESS not configured
	log            *zap.Logger
	devWorkspaceID     string
	qrKey              []byte // HMAC key for QR token signing; nil disables 4-gate verification
	orderWebhookSecret string // HMAC secret for inbound order webhook; empty = no verification
}

func NewHandler(
	pool *sqlx.DB,
	trucks repository.TruckRepository,
	orders repository.OrderRepository,
	trips repository.TripRepository,
	onboarding repository.OnboardingRepository,
	geofences repository.GeofenceRepository,
	workspaces repository.WorkspaceRepository,
	admin repository.AdminRepository,
	devices repository.DeviceRepository,
	apiKeys repository.APIKeyRepository,
	qrCodes repository.QRCodeRepository,
	deliveryNotes repository.DeliveryNoteRepository,
	syncedOrders repository.SyncedOrderRepository,
	cognito *auth.CognitoClient,
	store *storage.S3Store,
	email notify.EmailSender,
	log *zap.Logger,
	devWorkspaceID string,
	qrKey []byte,
	orderWebhookSecret string,
) *Handler {
	return &Handler{
		pool:               pool,
		trucks:             trucks,
		orders:             orders,
		trips:              trips,
		onboarding:         onboarding,
		geofences:          geofences,
		workspaces:         workspaces,
		admin:              admin,
		devices:            devices,
		apiKeys:            apiKeys,
		qrCodes:            qrCodes,
		deliveryNotes:      deliveryNotes,
		syncedOrders:       syncedOrders,
		cognito:            cognito,
		store:              store,
		email:              email,
		log:                log,
		devWorkspaceID:     devWorkspaceID,
		qrKey:              qrKey,
		orderWebhookSecret: orderWebhookSecret,
	}
}

func (h *Handler) HandleRequest(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	method := req.RequestContext.HTTP.Method
	path := req.RawPath

	// CORS preflight — must return 2xx with no auth so browsers allow cross-origin
	// requests. Handled before any auth logic.
	if method == "OPTIONS" {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: 204,
			Headers: map[string]string{
				"Access-Control-Allow-Origin":  "*",
				"Access-Control-Allow-Headers": "Authorization, Content-Type",
				"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
			},
		}, nil
	}

	// Health check — no auth required.
	if method == "GET" && path == "/v1/health" {
		return jsonOK(map[string]string{"status": "ok"})
	}

	// Dispatch API — machine-to-machine Bearer key auth, no Cognito JWT.
	// Must be handled before extractAuth so the JWT validator doesn't reject it.
	if method == "POST" && path == "/v1/trips/dispatch" {
		return h.handleDispatchTrip(ctx, req)
	}

	// ERP read endpoints — dispatch API key auth, CORS-enabled for erp-console.
	if strings.HasPrefix(path, "/v1/erp/") {
		return h.routeERP(ctx, method, path, req)
	}

	// Inbound order webhook — HMAC-verified, no Cognito JWT required.
	if method == "POST" && path == "/v1/webhooks/orders" {
		return h.handleOrderSyncWebhook(ctx, req)
	}

	workspaceID, claims, err := h.extractAuth(req)
	if err != nil {
		return jsonError(401, "unauthorized"), nil
	}

	// Set app.workspace_id so RLS ws_isolation policies apply to every query.
	if err := db.SetWorkspace(ctx, h.pool, workspaceID.String()); err != nil {
		h.log.Error("set workspace for RLS", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.log.Info("request",
		zap.String("method", method),
		zap.String("path", path),
		zap.String("sub", claims.Sub),
		zap.Strings("groups", claims.Groups),
	)

	// Any authenticated user may read trucks and positions.
	readRoles := []string{
		auth.RolePlatformAdmin, auth.RoleSellerManager,
		auth.RoleTransportAdmin, auth.RoleClient, auth.RoleDriver,
	}
	// Order writes are restricted to seller/admin; scans to driver/client.
	writeOrderRoles := []string{auth.RolePlatformAdmin, auth.RoleSellerManager}
	scanRoles := []string{
		auth.RolePlatformAdmin, auth.RoleTransportAdmin,
		auth.RoleClient, auth.RoleDriver,
	}

	switch {
	// Trucks
	case method == "GET" && path == "/v1/trucks":
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListTrucks(ctx, workspaceID, claims)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/trucks/") && strings.HasSuffix(path, "/position"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trucks/"), "/position")
		return h.handleSeedTruckPosition(ctx, req, workspaceID, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/trucks/") && strings.HasSuffix(path, "/fuel"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trucks/"), "/fuel")
		return h.handleSetTruckFuel(ctx, req, workspaceID, id)

	case method == "GET" && strings.HasPrefix(path, "/v1/trucks/") && strings.HasSuffix(path, "/position"):
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trucks/"), "/position")
		return h.handleGetTruckPosition(ctx, workspaceID, id)

	case method == "GET" && strings.HasPrefix(path, "/v1/trucks/") && strings.HasSuffix(path, "/fuel-history"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trucks/"), "/fuel-history")
		return h.handleFuelHistory(ctx, req, workspaceID, id)

	case method == "GET" && strings.HasPrefix(path, "/v1/trucks/") && strings.HasSuffix(path, "/qr"):
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trucks/"), "/qr")
		return h.handleGetTruckQR(ctx, workspaceID, id)

	case method == "POST" && path == "/v1/kyc/upload-url":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleKYCUploadURL(ctx, req)

	// Orders
	case method == "GET" && path == "/v1/orders":
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListOrders(ctx, req, workspaceID, claims)

	case method == "POST" && path == "/v1/orders":
		if !claims.HasAnyRole(append(writeOrderRoles, auth.RoleClient)...) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleCreateOrder(ctx, req, workspaceID, claims)

	case method == "GET" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/delivery-note"):
		if !claims.HasAnyRole(auth.RoleClient, auth.RoleSellerManager, auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/delivery-note")
		return h.handleGetOrderDeliveryNote(ctx, workspaceID, claims, id)

	case method == "GET" && strings.HasPrefix(path, "/v1/orders/") && !strings.Contains(strings.TrimPrefix(path, "/v1/orders/"), "/"):
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimPrefix(path, "/v1/orders/")
		return h.handleGetOrder(ctx, workspaceID, claims, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/scan"):
		if !claims.HasAnyRole(scanRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/scan")
		return h.handleScanOrder(ctx, req, workspaceID, claims, id)

	// 4-gate QR delivery acceptance (CLIENT only, signed versioned token)
	case method == "POST" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/accept-delivery"):
		if !claims.HasAnyRole(auth.RoleClient, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/accept-delivery")
		return h.handleAcceptDelivery(ctx, req, workspaceID, claims, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/accept"):
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/accept")
		return h.handleAcceptOrder(ctx, workspaceID, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/assign-tsp"):
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/assign-tsp")
		return h.handleAssignTSP(ctx, req, workspaceID, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/assign-truck"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/assign-truck")
		return h.handleAssignTruck(ctx, req, workspaceID, claims, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/start-loading"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/start-loading")
		return h.handleStartLoading(ctx, workspaceID, claims, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/finish-loading"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/finish-loading")
		return h.handleFinishLoading(ctx, req, workspaceID, claims, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/orders/") && strings.HasSuffix(path, "/depart"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/orders/"), "/depart")
		return h.handleDepart(ctx, workspaceID, claims, id)

	// ─── Seller connections ───────────────────────────────────────────────────
	case method == "POST" && path == "/v1/connections":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleRequestConnection(ctx, req, workspaceID, claims)

	case method == "GET" && path == "/v1/connections":
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListConnections(ctx, workspaceID)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/connections/") &&
		(strings.HasSuffix(path, "/approve") || strings.HasSuffix(path, "/reject")):
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		parts := strings.Split(strings.TrimPrefix(path, "/v1/connections/"), "/")
		if len(parts) != 2 {
			return jsonError(404, "not found"), nil
		}
		return h.handleResolveConnection(ctx, workspaceID, parts[0], parts[1], claims)

	// ─── Sensor requests ──────────────────────────────────────────────────────
	case method == "POST" && path == "/v1/sensor-requests":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleSubmitSensorRequest(ctx, req, workspaceID, claims)

	case method == "GET" && path == "/v1/sensor-requests":
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListSensorRequests(ctx, req, workspaceID)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/sensor-requests/") &&
		(strings.HasSuffix(path, "/approve") || strings.HasSuffix(path, "/reject")):
		if !claims.HasAnyRole(auth.RoleSellerManager, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		parts := strings.Split(strings.TrimPrefix(path, "/v1/sensor-requests/"), "/")
		if len(parts) != 2 {
			return jsonError(404, "not found"), nil
		}
		return h.handleReviewSensorRequest(ctx, req, workspaceID, parts[0], parts[1], claims)

	// ─── Stations (CLIENT delivery destinations) ──────────────────────────────
	case method == "POST" && path == "/v1/stations":
		if !claims.HasAnyRole(auth.RoleClient, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleCreateStation(ctx, req, workspaceID)

	case method == "GET" && path == "/v1/stations":
		if !claims.HasAnyRole(auth.RoleClient, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListStations(ctx, workspaceID)

	// ─── Asset events (fleet monitor alert feed) ──────────────────────────────
	case method == "GET" && path == "/v1/events":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListEvents(ctx, workspaceID)

	// ─── Depots (TRANSPORT_ADMIN home bases) ──────────────────────────────────
	case method == "POST" && path == "/v1/depots":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleCreateDepot(ctx, req, workspaceID)

	case method == "GET" && path == "/v1/depots":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListDepots(ctx, workspaceID)

	// ─── Workspace (module flags) ──────────────────────────────────────────────
	case method == "GET" && path == "/v1/workspace":
		if !claims.HasAnyRole(readRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleGetWorkspace(ctx, workspaceID)

	// ─── Trips (Mode B dispatch + unified monitoring view) ────────────────────
	case method == "POST" && path == "/v1/trips":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleCreateTrip(ctx, req, workspaceID)

	case method == "GET" && path == "/v1/trips":
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleListTrips(ctx, workspaceID)

	case method == "GET" && strings.HasPrefix(path, "/v1/trips/") &&
		!strings.Contains(strings.TrimPrefix(path, "/v1/trips/"), "/"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimPrefix(path, "/v1/trips/")
		return h.handleGetTrip(ctx, workspaceID, id)

	case method == "DELETE" && strings.HasPrefix(path, "/v1/trips/") &&
		!strings.Contains(strings.TrimPrefix(path, "/v1/trips/"), "/"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimPrefix(path, "/v1/trips/")
		return h.handleDeleteTrip(ctx, workspaceID, id)

	case method == "PATCH" && strings.HasPrefix(path, "/v1/trips/") && strings.HasSuffix(path, "/scan"):
		if !claims.HasAnyRole(scanRoles...) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trips/"), "/scan")
		return h.handleScanTrip(ctx, req, workspaceID, id)

	case method == "GET" && strings.HasPrefix(path, "/v1/trips/") && strings.HasSuffix(path, "/delivery-note"):
		if !claims.HasAnyRole(auth.RoleTransportAdmin, auth.RoleClient, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/trips/"), "/delivery-note")
		return h.handleGetDeliveryNote(ctx, workspaceID, id)

	// ─── Seller discovery + user invite ───────────────────────────────────────
	case method == "GET" && path == "/v1/sellers":
		return h.handleListSellers(ctx)

	case method == "POST" && path == "/v1/users/invite":
		if !claims.HasAnyRole(auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.handleInviteUser(ctx, req)

	// ─── Client Portal: Mode B human login ───────────────────────────────────
	case strings.HasPrefix(path, "/v1/client/"):
		if !claims.HasAnyRole(auth.RoleERPClient, auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		return h.routeClient(ctx, method, path, req, workspaceID)

	// ─── Platform Admin: workspace management ─────────────────────────────────
	case strings.HasPrefix(path, "/admin/v1/"):
		if !claims.HasAnyRole(auth.RolePlatformAdmin) {
			return jsonError(403, "forbidden"), nil
		}
		// Bypass RLS for all admin endpoints — they operate cross-workspace.
		if err := db.SetWorkspace(ctx, h.pool, ""); err != nil {
			h.log.Error("admin: bypass RLS", zap.Error(err))
			return jsonError(500, "internal error"), nil
		}
		return h.routeAdmin(ctx, method, path, req, claims)

	default:
		return jsonError(404, "not found"), nil
	}
}

// extractAuth pulls workspace_id and role claims from the JWT authorizer
// context injected by API Gateway. In dev mode (devWorkspaceID set) it
// returns a synthetic PLATFORM_ADMIN claim so all endpoints are reachable.
func (h *Handler) extractAuth(req events.APIGatewayV2HTTPRequest) (uuid.UUID, auth.Claims, error) {
	if h.devWorkspaceID != "" {
		id, err := uuid.Parse(h.devWorkspaceID)
		if err != nil {
			return uuid.UUID{}, auth.Claims{}, errors.New("DEV_WORKSPACE_ID is not a valid UUID")
		}
		return id, auth.Claims{
			WorkspaceID: h.devWorkspaceID,
			Groups:      []string{auth.RolePlatformAdmin},
			Sub:         "dev",
		}, nil
	}

	rawClaims := req.RequestContext.Authorizer.JWT.Claims
	claims := auth.ParseClaims(rawClaims)

	if claims.WorkspaceID == "" {
		return uuid.UUID{}, auth.Claims{}, errors.New("missing custom:workspace_id claim")
	}
	id, err := uuid.Parse(claims.WorkspaceID)
	if err != nil {
		return uuid.UUID{}, auth.Claims{}, errors.New("custom:workspace_id is not a valid UUID")
	}
	return id, claims, nil
}
