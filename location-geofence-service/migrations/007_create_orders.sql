-- Orders and assignments tables.
-- May be owned by a separate orders service sharing the same Postgres instance.
-- Included here so the full schema is testable end-to-end in isolation.
--
-- destination_station_id must match geofences.ref_id for the STATION-type row
-- that the geofence module resolves when evaluating active trips.
CREATE TABLE IF NOT EXISTS orders (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           UUID        NOT NULL,
    status                 VARCHAR(32) NOT NULL DEFAULT 'EN_ROUTE'
                               CHECK (status IN ('EN_ROUTE','ARRIVED','DELIVERY_ACCEPTED','COMPLETED')),
    destination_station_id VARCHAR(64),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_workspace_status ON orders (workspace_id, status)
    WHERE status NOT IN ('COMPLETED');

CREATE TABLE IF NOT EXISTS order_assignments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    truck_id   UUID        NOT NULL REFERENCES trucks (id) ON DELETE CASCADE,
    status     VARCHAR(32) NOT NULL DEFAULT 'EN_ROUTE'
                   CHECK (status IN ('EN_ROUTE','ARRIVED','DELIVERY_ACCEPTED','JOURNEY_COMPLETE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_truck_active ON order_assignments (truck_id, status)
    WHERE status NOT IN ('JOURNEY_COMPLETE');

CREATE INDEX IF NOT EXISTS idx_assignments_order ON order_assignments (order_id);
