-- Trucks master table.
-- May be owned by a fleet/vehicles service sharing the same schema;
-- included here so migrations are self-contained and testable in isolation.
CREATE TABLE IF NOT EXISTS trucks (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID        NOT NULL,
    galileosky_device_id VARCHAR(64) NOT NULL,
    status               VARCHAR(32) NOT NULL DEFAULT 'IDLE',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_trucks_device UNIQUE (galileosky_device_id)
);

CREATE INDEX IF NOT EXISTS idx_trucks_workspace ON trucks (workspace_id);
