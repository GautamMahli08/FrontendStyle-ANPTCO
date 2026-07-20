-- Append-only audit log for all Platform Admin actions.
-- Rows are never updated or deleted; each action creates a new row.
-- actor_id is the Cognito sub (UUID string) of the admin who took the action.
-- target_type is a short noun: 'workspace', 'truck', 'device', 'api_key', etc.
-- payload is the JSON body of the action (before/after state or request body).

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    TEXT        NOT NULL,
    action      VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id   TEXT        NOT NULL,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_target
    ON audit_log (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
    ON audit_log (actor_id, created_at DESC);
