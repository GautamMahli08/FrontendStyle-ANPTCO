package api

import (
	"context"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/aws/aws-lambda-go/events"
)

// routeAdmin dispatches all /admin/v1/* requests. RLS has already been bypassed
// and PLATFORM_ADMIN role has been verified by the caller.
func (h *Handler) routeAdmin(
	ctx context.Context,
	method, path string,
	req events.APIGatewayV2HTTPRequest,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	// Strip prefix for easier matching below.
	p := strings.TrimPrefix(path, "/admin/v1")

	switch {
	// ── Subscription plans ────────────────────────────────────────────────────
	case method == "GET" && p == "/plans":
		return h.handleAdminListPlans(ctx)

	// ── Workspaces ────────────────────────────────────────────────────────────
	case method == "GET" && p == "/workspaces":
		return h.handleAdminListWorkspaces(ctx)

	case method == "POST" && p == "/workspaces":
		return h.handleAdminCreateWorkspace(ctx, req, claims)

	case method == "GET" && isWorkspacePath(p, ""):
		return h.handleAdminGetWorkspace(ctx, workspaceID(p))

	case method == "PUT" && isWorkspacePath(p, "/profile"):
		return h.handleAdminUpsertProfile(ctx, req, workspaceID(p), claims)

	case method == "PUT" && isWorkspacePath(p, "/modules"):
		return h.handleAdminSetModules(ctx, req, workspaceID(p), claims)

	case method == "POST" && isWorkspacePath(p, "/subscribe"):
		return h.handleAdminSubscribe(ctx, req, workspaceID(p), claims)

	case method == "GET" && isWorkspacePath(p, "/readiness"):
		return h.handleAdminReadiness(ctx, workspaceID(p))

	case method == "GET" && isWorkspacePath(p, "/audit"):
		return h.handleAdminAuditLog(ctx, workspaceID(p))

	case method == "GET" && isWorkspacePath(p, "/integrations"):
		return h.handleAdminListIntegrations(ctx, workspaceID(p))

	case method == "PUT" && isWorkspacePath(p, "/integrations"):
		return h.handleAdminUpsertIntegration(ctx, req, workspaceID(p), claims)

	// ── Workspace → API keys ──────────────────────────────────────────────────
	case method == "GET" && isWorkspacePath(p, "/api-keys"):
		return h.handleAdminListAPIKeys(ctx, workspaceID(p))

	case method == "POST" && isWorkspacePath(p, "/api-keys"):
		return h.handleAdminCreateAPIKey(ctx, req, workspaceID(p), claims)

	// ── Workspace → asset events ──────────────────────────────────────────────
	case method == "GET" && isWorkspacePath(p, "/events"):
		return h.handleAdminListAssetEvents(ctx, workspaceID(p))

	// ── Workspace → trips ─────────────────────────────────────────────────────
	case method == "GET" && isWorkspacePath(p, "/trips"):
		return h.handleAdminListTrips(ctx, workspaceID(p))

	// ── Workspace → fleet (trucks created under a workspace) ─────────────────
	case method == "GET" && isWorkspacePath(p, "/trucks"):
		return h.handleAdminListTrucks(ctx, workspaceID(p))

	case method == "POST" && isWorkspacePath(p, "/trucks"):
		return h.handleAdminCreateTruck(ctx, req, workspaceID(p), claims)

	// ── Workspace → drivers ───────────────────────────────────────────────────
	case method == "GET" && isWorkspacePath(p, "/drivers"):
		return h.handleAdminListDrivers(ctx, workspaceID(p))

	case method == "POST" && isWorkspacePath(p, "/drivers"):
		return h.handleAdminCreateDriver(ctx, req, workspaceID(p), claims)

	// ── API keys: revoke ──────────────────────────────────────────────────────
	case method == "DELETE" && strings.HasPrefix(p, "/api-keys/") && !strings.Contains(strings.TrimPrefix(p, "/api-keys/"), "/"):
		id := strings.TrimPrefix(p, "/api-keys/")
		return h.handleAdminRevokeAPIKey(ctx, id, claims)

	// ── Trucks: meta + compartments + device history + driver ─────────────────
	case method == "PATCH" && strings.HasPrefix(p, "/trucks/") && strings.HasSuffix(p, "/meta"):
		id := truckSegment(p, "/meta")
		return h.handleAdminUpdateTruckMeta(ctx, req, id, claims)

	case method == "GET" && strings.HasPrefix(p, "/trucks/") && strings.HasSuffix(p, "/compartments"):
		id := truckSegment(p, "/compartments")
		return h.handleAdminListCompartments(ctx, id)

	case method == "PUT" && strings.HasPrefix(p, "/trucks/") && strings.HasSuffix(p, "/compartments"):
		id := truckSegment(p, "/compartments")
		return h.handleAdminUpsertCompartments(ctx, req, id, claims)

	case method == "GET" && strings.HasPrefix(p, "/trucks/") && strings.HasSuffix(p, "/devices"):
		id := truckSegment(p, "/devices")
		return h.handleAdminListDeviceAssignments(ctx, id)

	case method == "POST" && strings.HasPrefix(p, "/trucks/") && strings.HasSuffix(p, "/regenerate-qr"):
		id := truckSegment(p, "/regenerate-qr")
		return h.handleAdminRegenerateQR(ctx, req, id, claims)

	// ── Drivers: update / deactivate ─────────────────────────────────────────
	case method == "PATCH" && isWorkspaceDriverPath(p):
		wsID, driverID := workspaceDriverIDs(p)
		return h.handleAdminUpdateDriver(ctx, req, wsID, driverID, claims)

	case method == "DELETE" && strings.HasPrefix(p, "/drivers/") && !strings.Contains(strings.TrimPrefix(p, "/drivers/"), "/"):
		id := strings.TrimPrefix(p, "/drivers/")
		return h.handleAdminDeactivateDriver(ctx, id, claims)

	// ── Device inventory ──────────────────────────────────────────────────────
	case method == "GET" && p == "/devices":
		return h.handleAdminListDevices(ctx, req)

	case method == "POST" && p == "/devices":
		return h.handleAdminCreateDevice(ctx, req, claims)

	case method == "PATCH" && strings.HasPrefix(p, "/devices/") && !strings.Contains(strings.TrimPrefix(p, "/devices/"), "/"):
		id := strings.TrimPrefix(p, "/devices/")
		return h.handleAdminUpdateDevice(ctx, req, id, claims)

	case method == "POST" && strings.HasPrefix(p, "/devices/") && strings.HasSuffix(p, "/assign"):
		id := strings.TrimSuffix(strings.TrimPrefix(p, "/devices/"), "/assign")
		return h.handleAdminAssignDevice(ctx, req, id, claims)

	case method == "POST" && strings.HasPrefix(p, "/devices/") && strings.HasSuffix(p, "/unassign"):
		id := strings.TrimSuffix(strings.TrimPrefix(p, "/devices/"), "/unassign")
		return h.handleAdminUnassignDevice(ctx, id, claims)

	// ── Fuel sensors ──────────────────────────────────────────────────────────
	case method == "GET" && p == "/sensors":
		return h.handleAdminListSensors(ctx, req)

	case method == "POST" && p == "/sensors":
		return h.handleAdminCreateSensor(ctx, req, claims)

	case method == "POST" && strings.HasPrefix(p, "/sensors/") && strings.HasSuffix(p, "/assign"):
		id := strings.TrimSuffix(strings.TrimPrefix(p, "/sensors/"), "/assign")
		return h.handleAdminAssignSensor(ctx, req, id, claims)

	case method == "POST" && strings.HasPrefix(p, "/sensors/") && strings.HasSuffix(p, "/unassign"):
		id := strings.TrimSuffix(strings.TrimPrefix(p, "/sensors/"), "/unassign")
		return h.handleAdminUnassignSensor(ctx, id, claims)

	default:
		return jsonError(404, "not found"), nil
	}
}

// ── Path helpers ──────────────────────────────────────────────────────────────

// isWorkspacePath returns true when p matches /workspaces/{uuid}{suffix}.
// suffix may be empty to match the workspace root (/workspaces/{uuid}).
func isWorkspacePath(p, suffix string) bool {
	const pre = "/workspaces/"
	if !strings.HasPrefix(p, pre) {
		return false
	}
	rest := strings.TrimPrefix(p, pre)
	// rest is "{uuid}{suffix}" or just "{uuid}"
	if suffix == "" {
		return !strings.Contains(rest, "/")
	}
	return strings.HasSuffix(rest, suffix) && strings.Count(rest, "/") == 1
}

// workspaceID extracts the UUID segment from /workspaces/{uuid}[/...].
func workspaceID(p string) string {
	rest := strings.TrimPrefix(p, "/workspaces/")
	if idx := strings.Index(rest, "/"); idx >= 0 {
		return rest[:idx]
	}
	return rest
}

// truckSegment extracts the UUID from /trucks/{uuid}{suffix}.
func truckSegment(p, suffix string) string {
	return strings.TrimSuffix(strings.TrimPrefix(p, "/trucks/"), suffix)
}

// isWorkspaceDriverPath matches /workspaces/{uuid}/drivers/{uuid}.
func isWorkspaceDriverPath(p string) bool {
	parts := strings.Split(strings.TrimPrefix(p, "/workspaces/"), "/")
	return len(parts) == 3 && parts[1] == "drivers"
}

// workspaceDriverIDs returns (workspaceID, driverID) from /workspaces/{ws}/drivers/{d}.
func workspaceDriverIDs(p string) (string, string) {
	parts := strings.Split(strings.TrimPrefix(p, "/workspaces/"), "/")
	if len(parts) < 3 {
		return "", ""
	}
	return parts[0], parts[2]
}
