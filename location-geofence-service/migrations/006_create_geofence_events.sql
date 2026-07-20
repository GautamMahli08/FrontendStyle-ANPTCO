-- Authoritative log of every ENTER/EXIT transition.
-- These events are the real-world triggers that drive the order state machine
-- (EN_ROUTE → ARRIVED on ENTER(STATION); DELIVERY_ACCEPTED → JOURNEY_COMPLETE
-- on ENTER(DEPOT)). They replace the simulated journey timers in the dashboard.
CREATE TABLE IF NOT EXISTS geofence_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL,
    truck_id      UUID        NOT NULL,
    order_id      UUID,                        -- null when truck is not on an active order
    geofence_id   UUID        NOT NULL,
    geofence_type VARCHAR(20) NOT NULL CHECK (geofence_type IN ('DEPOT', 'STATION')),
    event_type    VARCHAR(10) NOT NULL CHECK (event_type    IN ('ENTER', 'EXIT')),
    latitude      DECIMAL(10, 8),
    longitude     DECIMAL(11, 8),
    occurred_at   TIMESTAMPTZ NOT NULL,        -- device clock time
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_order ON geofence_events (order_id,  occurred_at);
CREATE INDEX IF NOT EXISTS idx_geofence_events_truck ON geofence_events (truck_id,  occurred_at);
