-- Extend trucks with vehicle metadata for the admin fleet view.
-- truck_compartments: named fuel compartments with capacity (JSONB was enough
--   for live readings, but onboarding needs structured rows for capacity planning).
-- drivers: persons who operate trucks; linked to trucks at dispatch time via
--   trips.driver_name (free text) — no hard FK so Mode B callers can pass any name.

ALTER TABLE trucks
    ADD COLUMN IF NOT EXISTS license_plate VARCHAR(32),
    ADD COLUMN IF NOT EXISTS make          VARCHAR(64),
    ADD COLUMN IF NOT EXISTS model         VARCHAR(64),
    ADD COLUMN IF NOT EXISTS year          SMALLINT,
    ADD COLUMN IF NOT EXISTS notes         TEXT,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS truck_compartments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    truck_id        UUID        NOT NULL REFERENCES trucks (id) ON DELETE CASCADE,
    compartment_no  SMALLINT    NOT NULL,       -- 1-based index shown in UI
    capacity_liters NUMERIC(8,2) NOT NULL,
    product_type    VARCHAR(32) NOT NULL DEFAULT 'FUEL',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (truck_id, compartment_no)
);

CREATE TABLE IF NOT EXISTS drivers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL,
    full_name       VARCHAR(128) NOT NULL,
    phone           VARCHAR(32),
    license_no      VARCHAR(64),
    notes           TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_workspace
    ON drivers (workspace_id) WHERE is_active;
