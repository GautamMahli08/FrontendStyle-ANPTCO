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

// ── GET /admin/v1/workspaces ──────────────────────────────────────────────────

func (h *Handler) handleAdminListWorkspaces(ctx context.Context) (events.APIGatewayV2HTTPResponse, error) {
	ws, err := h.admin.ListWorkspaces(ctx)
	if err != nil {
		h.log.Error("admin: list workspaces", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(ws) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(ws)
}

// ── POST /admin/v1/workspaces ─────────────────────────────────────────────────

func (h *Handler) handleAdminCreateWorkspace(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	var input struct {
		Slug      string               `json:"slug"`
		Name      string               `json:"name"`
		Type      domain.WorkspaceType `json:"type"`
		IsSandbox bool                 `json:"is_sandbox"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if input.Slug == "" || input.Name == "" {
		return jsonError(400, "slug and name are required"), nil
	}
	if input.Type == "" {
		input.Type = domain.WorkspaceTypeTSP
	}

	w := &domain.Workspace{
		ID:        uuid.New().String(),
		Slug:      input.Slug,
		Name:      input.Name,
		Type:      input.Type,
		IsSandbox: input.IsSandbox,
	}
	if err := h.admin.CreateWorkspace(ctx, w); err != nil {
		h.log.Error("admin: create workspace", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "workspace.created", "workspace", w.ID, w)
	return jsonCreated(w)
}

// ── GET /admin/v1/workspaces/{id} ─────────────────────────────────────────────

func (h *Handler) handleAdminGetWorkspace(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	ws, err := h.workspaces.GetByID(ctx, rawID)
	if err != nil {
		h.log.Error("admin: get workspace", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if ws == nil {
		return jsonError(404, "workspace not found"), nil
	}

	// Attach profile if available.
	wsID, _ := uuid.Parse(rawID)
	profile, _ := h.admin.GetProfile(ctx, wsID)
	sub, _ := h.admin.GetSubscription(ctx, wsID)

	return jsonOK(map[string]interface{}{
		"workspace":    ws,
		"profile":      profile,
		"subscription": sub,
	})
}

// ── PUT /admin/v1/workspaces/{id}/profile ─────────────────────────────────────

func (h *Handler) handleAdminUpsertProfile(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	var p domain.WorkspaceProfile
	if err := json.Unmarshal([]byte(req.Body), &p); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if p.CompanyName == "" {
		return jsonError(400, "company_name is required"), nil
	}
	if p.Country == "" {
		p.Country = "AZ"
	}
	p.WorkspaceID = wsID

	if err := h.admin.UpsertProfile(ctx, &p); err != nil {
		h.log.Error("admin: upsert profile", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "workspace.profile_updated", "workspace", rawID, &p)
	return jsonOK(&p)
}

// ── PUT /admin/v1/workspaces/{id}/modules ────────────────────────────────────

func (h *Handler) handleAdminSetModules(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	// Validate that the body is valid JSON (it will be stored verbatim as JSONB).
	if !json.Valid([]byte(req.Body)) {
		return jsonError(400, "body must be a valid JSON object"), nil
	}
	modules := domain.JSONB(req.Body)

	if err := h.admin.UpdateWorkspaceModules(ctx, wsID, modules); err != nil {
		h.log.Error("admin: set modules", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "workspace.modules_updated", "workspace", rawID, map[string]interface{}{"modules": json.RawMessage(modules)})
	return jsonOK(map[string]interface{}{"workspace_id": rawID, "modules": json.RawMessage(modules)})
}

// ── POST /admin/v1/workspaces/{id}/subscribe ─────────────────────────────────

func (h *Handler) handleAdminSubscribe(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	var input struct {
		PlanID string `json:"plan_id"`
	}
	if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	planID, err := uuid.Parse(strings.TrimSpace(input.PlanID))
	if err != nil {
		return jsonError(400, "invalid plan_id"), nil
	}

	sub, err := h.admin.Subscribe(ctx, wsID, planID)
	if err != nil {
		h.log.Error("admin: subscribe", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "workspace.subscribed", "workspace", rawID, sub)
	return jsonOK(sub)
}

// ── GET /admin/v1/workspaces/{id}/readiness ───────────────────────────────────

func (h *Handler) handleAdminReadiness(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	report, err := h.admin.GetReadiness(ctx, wsID)
	if err != nil {
		h.log.Error("admin: readiness", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	return jsonOK(report)
}

// ── GET /admin/v1/plans ───────────────────────────────────────────────────────

func (h *Handler) handleAdminListPlans(ctx context.Context) (events.APIGatewayV2HTTPResponse, error) {
	plans, err := h.admin.ListPlans(ctx)
	if err != nil {
		h.log.Error("admin: list plans", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(plans) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(plans)
}

// ── GET /admin/v1/workspaces/{id}/audit ──────────────────────────────────────

func (h *Handler) handleAdminAuditLog(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	entries, err := h.admin.ListAuditLog(ctx, "workspace", rawID, 100)
	if err != nil {
		h.log.Error("admin: audit log", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(entries) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(entries)
}

// ── PUT /admin/v1/workspaces/{id}/integrations ───────────────────────────────

func (h *Handler) handleAdminUpsertIntegration(
	ctx context.Context,
	req events.APIGatewayV2HTTPRequest,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}

	var i domain.WorkspaceIntegration
	if err := json.Unmarshal([]byte(req.Body), &i); err != nil {
		return jsonError(400, "invalid JSON body"), nil
	}
	if i.SystemType == "" {
		return jsonError(400, "system_type is required"), nil
	}
	i.WorkspaceID = wsID

	if err := h.admin.UpsertIntegration(ctx, &i); err != nil {
		h.log.Error("admin: upsert integration", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "workspace.integration_upserted", "workspace", rawID, &i)
	return jsonOK(&i)
}

// ── GET /admin/v1/workspaces/{id}/integrations ───────────────────────────────

func (h *Handler) handleAdminListIntegrations(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	items, err := h.admin.ListIntegrations(ctx, wsID)
	if err != nil {
		h.log.Error("admin: list integrations", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(items) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(items)
}

// writeAudit is a fire-and-forget audit helper. Errors are logged but not
// returned to the caller — the primary operation already succeeded.
func (h *Handler) writeAudit(ctx context.Context, actorID, action, targetType, targetID string, payload interface{}) {
	b, _ := json.Marshal(payload)
	entry := &domain.AuditLog{
		ActorID:    actorID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Payload:    domain.JSONB(b),
	}
	if err := h.admin.WriteAuditLog(ctx, entry); err != nil {
		h.log.Warn("audit log write failed", zap.Error(err), zap.String("action", action))
	}
}
