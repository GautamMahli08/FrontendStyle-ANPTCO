-- Client onboarding schema additions.
-- 1. workspaces gets a type so we can distinguish SELLER / TSP / CLIENT.
-- 2. orders gets client_workspace_id, volume_liters, fuel_type so clients can
--    place orders into a seller's workspace and still find their own orders.

-- ── workspaces.type ───────────────────────────────────────────────────────────
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS type VARCHAR(20)
        NOT NULL DEFAULT 'SELLER'
        CHECK (type IN ('SELLER', 'TSP', 'CLIENT', 'PLATFORM'));

-- The seed workspace is the platform operator, not a seller.
UPDATE workspaces SET type = 'PLATFORM' WHERE slug = 'ws-anptco';

-- Remove the default so future rows must declare their type explicitly.
ALTER TABLE workspaces ALTER COLUMN type DROP DEFAULT;

-- ── orders: client identity + cargo metadata ──────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_workspace_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS volume_liters       INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fuel_type           TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_client
    ON orders (client_workspace_id)
    WHERE client_workspace_id IS NOT NULL;

-- ── RLS on workspaces ─────────────────────────────────────────────────────────
-- SELLER workspaces are always visible (discovery).
-- Any other workspace is only visible to itself or when bypass is active (= '').
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY ws_isolation ON workspaces
    USING (
        type = 'SELLER'
        OR current_setting('app.workspace_id', true) = ''
        OR id::text = current_setting('app.workspace_id', true)
    );
