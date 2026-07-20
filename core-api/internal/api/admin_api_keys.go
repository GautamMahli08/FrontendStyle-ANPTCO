package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/anptco/core-api/internal/auth"
	"github.com/anptco/core-api/internal/repository"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ── GET /admin/v1/workspaces/{id}/api-keys ───────────────────────────────────

func (h *Handler) handleAdminListAPIKeys(
	ctx context.Context,
	rawID string,
) (events.APIGatewayV2HTTPResponse, error) {
	wsID, err := uuid.Parse(rawID)
	if err != nil {
		return jsonError(400, "invalid workspace id"), nil
	}
	keys, err := h.apiKeys.ListKeys(ctx, wsID)
	if err != nil {
		h.log.Error("admin: list api keys", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}
	if len(keys) == 0 {
		return jsonOK([]interface{}{})
	}
	return jsonOK(keys)
}

// ── POST /admin/v1/workspaces/{id}/api-keys ──────────────────────────────────

func (h *Handler) handleAdminCreateAPIKey(
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
		Description *string `json:"description"`
	}
	if req.Body != "" {
		if err := json.Unmarshal([]byte(req.Body), &input); err != nil {
			return jsonError(400, "invalid JSON body"), nil
		}
	}

	key, err := h.apiKeys.CreateKey(ctx, wsID, input.Description, claims.Sub)
	if err != nil {
		if err == repository.ErrMaxKeysReached {
			return jsonError(409, "workspace already has 2 active API keys; revoke one before creating another"), nil
		}
		h.log.Error("admin: create api key", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "api_key.created", "workspace", rawID,
		map[string]interface{}{"key_id": key.ID, "description": key.Description})
	return jsonCreated(key)
}

// ── DELETE /admin/v1/api-keys/{id} ───────────────────────────────────────────

func (h *Handler) handleAdminRevokeAPIKey(
	ctx context.Context,
	rawID string,
	claims auth.Claims,
) (events.APIGatewayV2HTTPResponse, error) {
	keyID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return jsonError(400, "invalid key id"), nil
	}

	if err := h.apiKeys.RevokeKey(ctx, keyID, claims.Sub); err != nil {
		h.log.Error("admin: revoke api key", zap.Error(err))
		return jsonError(500, "internal error"), nil
	}

	h.writeAudit(ctx, claims.Sub, "api_key.revoked", "api_key", rawID, nil)
	return jsonOK(map[string]interface{}{"id": keyID, "status": "REVOKED"})
}

// hashBearerKey computes the SHA-256 hex digest of a raw dispatch API key.
// Used by the dispatch endpoint to look up the workspace via the new keys table.
func hashBearerKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
