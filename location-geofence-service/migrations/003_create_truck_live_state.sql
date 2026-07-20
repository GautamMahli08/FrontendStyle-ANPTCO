-- Latest-known position per truck: O(1) read for "where is truck X now".
-- Updated via upsert only when the incoming device timestamp is strictly newer
-- than last_message_at — the guard against out-of-order/duplicate delivery.
CREATE TABLE IF NOT EXISTS truck_live_state (
    truck_id            UUID           PRIMARY KEY REFERENCES trucks (id) ON DELETE CASCADE,
    workspace_id        UUID           NOT NULL,
    latitude            DECIMAL(10, 8),
    longitude           DECIMAL(11, 8),
    speed               INT,
    total_fuel_liters   DECIMAL(10, 2),
    compartment_fuel    JSONB,
    last_message_at     TIMESTAMPTZ,
    -- Tracks the last geofence the truck entered; used for stateful exit detection
    -- when the service restarts and the geofence_state table row is unavailable.
    current_geofence_id UUID REFERENCES geofences (id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
