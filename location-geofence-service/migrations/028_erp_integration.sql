-- ERP / external system integration metadata.
-- workspace_integrations: records which external system (SAP, 1C, custom ERP)
--   is connected and its connection status.
-- workspace_module_config: key-value pairs for per-workspace module settings
--   that don't need their own table (e.g. dispatch radius, alerts email).

CREATE TABLE IF NOT EXISTS workspace_integrations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    system_type     VARCHAR(32) NOT NULL    -- 'SAP', '1C', 'CUSTOM', 'REST_WEBHOOK'
                        CHECK (system_type IN ('SAP', '1C', 'CUSTOM', 'REST_WEBHOOK')),
    base_url        TEXT,
    auth_type       VARCHAR(16) NOT NULL DEFAULT 'API_KEY'
                        CHECK (auth_type IN ('API_KEY', 'BASIC', 'OAUTH2', 'NONE')),
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED')),
    verified_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_integrations_workspace_type
    ON workspace_integrations (workspace_id, system_type);

-- Go-live readiness checklist per workspace.
-- Each row is one checklist item; checked = true means admin confirmed it.
CREATE TABLE IF NOT EXISTS workspace_checklist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    item_key        VARCHAR(64) NOT NULL,   -- e.g. 'trucks_registered', 'api_key_issued'
    checked         BOOLEAN     NOT NULL DEFAULT false,
    checked_by      TEXT,                  -- actor Cognito sub
    checked_at      TIMESTAMPTZ,
    UNIQUE (workspace_id, item_key)
);
