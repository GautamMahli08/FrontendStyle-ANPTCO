-- P2-1: source column on trips + is_sandbox flag on workspaces.
--
-- source distinguishes how a trip was created:
--   'ORDERING'  — created from the full ordering workflow (Mode A)
--   'DISPATCH'  — created via the Dispatch API (Mode B, machine-to-machine)
-- Added with DEFAULT 'ORDERING' so all existing Mode A rows are correct.
ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'ORDERING'
        CHECK (source IN ('ORDERING', 'DISPATCH'));

-- is_sandbox marks sandbox/demo tenants so billing and analytics can exclude
-- their trips and telemetry from real numbers.
-- Added with DEFAULT false so no existing workspace becomes a sandbox tenant.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false;
