-- Workspace profile: rich metadata collected during Mode B onboarding.
-- One-to-one with workspaces; separate table so the hot-path workspaces row
-- stays narrow.
--
-- subscription_plans: platform-defined catalogue (STARTER, GROWTH, ENTERPRISE).
-- workspace_subscriptions: the active plan for each workspace.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill updated_at for existing rows.
UPDATE workspaces SET updated_at = created_at WHERE updated_at = now() AND created_at < now();

CREATE TABLE IF NOT EXISTS workspace_profiles (
    workspace_id    UUID        PRIMARY KEY REFERENCES workspaces (id),
    company_name    VARCHAR(255) NOT NULL,
    company_reg_no  VARCHAR(64),
    tax_id          VARCHAR(64),
    country         VARCHAR(2)  NOT NULL DEFAULT 'AZ',
    city            VARCHAR(128),
    address         TEXT,
    contact_name    VARCHAR(128),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(32),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(32) NOT NULL UNIQUE,   -- 'STARTER', 'GROWTH', 'ENTERPRISE'
    name        VARCHAR(128) NOT NULL,
    max_trucks  INT         NOT NULL DEFAULT 0,  -- 0 = unlimited
    price_usd   NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default plans (idempotent via ON CONFLICT).
INSERT INTO subscription_plans (key, name, max_trucks, price_usd) VALUES
    ('STARTER',    'Starter',    5,  99.00),
    ('GROWTH',     'Growth',     25, 299.00),
    ('ENTERPRISE', 'Enterprise', 0,  999.00)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces (id),
    plan_id         UUID        NOT NULL REFERENCES subscription_plans (id),
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_subscriptions_active
    ON workspace_subscriptions (workspace_id)
    WHERE status = 'ACTIVE';
