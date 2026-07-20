-- Structured dispatch API key management.
-- Replaces the single workspaces.dispatch_api_key TEXT column with a proper
-- table supporting: multiple active keys, rotation, revocation, and description.
--
-- The raw key is shown exactly once (on creation); only a SHA-256 hex digest
-- is stored here.  The lookup path:
--   1. Hash the incoming Bearer token with SHA-256.
--   2. Query dispatch_api_keys WHERE key_hash = $1 AND status = 'ACTIVE'.
--   3. Fall back to workspaces.dispatch_api_key (backward compat) if no row found.
--
-- Up to 2 ACTIVE keys are allowed simultaneously to enable zero-downtime rotation.

CREATE TABLE IF NOT EXISTS dispatch_api_keys (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    key_hash        TEXT        NOT NULL UNIQUE,   -- SHA-256 hex of the raw key
    description     VARCHAR(128),
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_by      TEXT        NOT NULL,          -- actor Cognito sub
    revoked_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispatch_api_keys_workspace
    ON dispatch_api_keys (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_dispatch_api_keys_hash
    ON dispatch_api_keys (key_hash)
    WHERE status = 'ACTIVE';
