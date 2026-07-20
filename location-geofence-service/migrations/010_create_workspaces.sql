-- Workspaces master table.
-- MVP runs a single workspace (ws-anptco). The UUID below matches what is
-- already stored in trucks.workspace_id in production.
CREATE TABLE IF NOT EXISTS workspaces (
    id         UUID        PRIMARY KEY,
    slug       VARCHAR(64) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the production workspace. IF NOT EXISTS equivalent via ON CONFLICT.
INSERT INTO workspaces (id, slug, name)
VALUES ('22af2fec-9a68-4bf5-87b8-bdad3238e3a6', 'ws-anptco', 'ANPTCO')
ON CONFLICT (id) DO NOTHING;
