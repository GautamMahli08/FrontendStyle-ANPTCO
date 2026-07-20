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

// GET /v1/sellers — any authenticated user can discover available sellers.
// RLS ws_isolation policy on workspaces allows SELLER rows to all callers.
func (h *Handler) handleListSellers(
	ctx context.Context,
) (events.APIGatewayV2HTTPResponse, error) {
	sellers, err := h.workspaces.ListSellers(ctx)
	if err != nil {
		h.log.Error("list sellers", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(sellers) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(sellers)
}

// POST /v1/users/invite — PLATFORM_ADMIN invites a B2B user (SELLER_MANAGER or TRANSPORT_ADMIN).
// Body:
//
//	{
//	  "email":          "rajesh@ommco.com",
//	  "role":           "SELLER_MANAGER",
//	  "workspace_id":   "optional-existing-uuid",   ← omit to auto-generate
//	  "workspace_name": "OMMCO Fuel"                ← required when creating a new workspace
//	  "workspace_type": "SELLER"                    ← SELLER | TSP | CLIENT
//	}
func (h *Handler) handleInviteUser(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {
	var body struct {
		Email         string `json:"email"`
		Role          string `json:"role"`
		WorkspaceID   string `json:"workspace_id"`
		WorkspaceName string `json:"workspace_name"`
		WorkspaceType string `json:"workspace_type"`
	}
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}

	// Validate role.
	allowed := map[string]bool{
		auth.RoleSellerManager:  true,
		auth.RoleTransportAdmin: true,
		auth.RoleClient:         true,
		auth.RoleDriver:         true,
		auth.RoleERPClient:      true,
	}
	if !allowed[body.Role] {
		return jsonError(400, "role must be one of SELLER_MANAGER, TRANSPORT_ADMIN, CLIENT, DRIVER, ERP_CLIENT"), nil
	}
	if body.Email == "" {
		return jsonError(400, "email is required"), nil
	}

	// Resolve workspace ID.
	wsID := strings.TrimSpace(body.WorkspaceID)
	if wsID == "" {
		wsID = uuid.New().String()
	}

	// Invite the user in Cognito.
	if err := h.cognito.InviteUser(ctx, body.Email, body.Role, wsID); err != nil {
		h.log.Error("invite user", zap.String("email", body.Email), zap.Error(err))
		return jsonError(500, "failed to create user"), nil
	}

	// Upsert the workspace record so it appears in listings.
	if body.WorkspaceName != "" {
		wsType := domain.WorkspaceType(body.WorkspaceType)
		if wsType == "" {
			wsType = workspaceTypeForRole(body.Role)
		}
		slug := strings.ToLower(strings.ReplaceAll(body.WorkspaceName, " ", "-"))
		if err := h.workspaces.Upsert(ctx, wsID, slug, body.WorkspaceName, wsType); err != nil {
			h.log.Warn("upsert workspace after invite", zap.Error(err))
		}
	}

	return jsonCreated(map[string]string{
		"workspace_id": wsID,
		"email":        body.Email,
		"role":         body.Role,
	})
}

func workspaceTypeForRole(role string) domain.WorkspaceType {
	switch role {
	case auth.RoleSellerManager:
		return domain.WorkspaceTypeSeller
	case auth.RoleTransportAdmin, auth.RoleDriver:
		return domain.WorkspaceTypeTSP
	default:
		return domain.WorkspaceTypeClient
	}
}
