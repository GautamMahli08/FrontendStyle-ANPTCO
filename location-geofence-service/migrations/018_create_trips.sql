-- Phase 1: introduce the Trip entity.
--
-- A Trip is the physical unit the monitoring engine runs on.
-- It can be created two ways:
--   Mode A (full product): created automatically when an order reaches LOADING.
--                          order_id is set; trip mirrors the order's lifecycle.
--   Mode B (monitoring-only): created by the Dispatch API.
--                              order_id is NULL; order_ref carries the client's ref.
--
-- The monitoring engine (geofence service) now reads from this table instead of
-- joining order_assignments → orders → geofences. This decouples monitoring from
-- the commercial ordering workflow.

CREATE TABLE IF NOT EXISTS trips (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID         NOT NULL REFERENCES workspaces(id),
    truck_id         UUID         NOT NULL REFERENCES trucks(id),
    -- Mode A linkage (NULL for Mode B dispatch trips)
    order_id         UUID         REFERENCES orders(id),
    -- Mode B external reference (e.g. client ERP order number)
    order_ref        TEXT,
    driver_name      TEXT,
    -- Origin (informational; geofence detection uses the depot zone, not this)
    origin_name      TEXT,
    origin_lat       DOUBLE PRECISION,
    origin_lng       DOUBLE PRECISION,
    -- Destination — always required; monitoring detects ENTER on this zone
    dest_name        TEXT         NOT NULL,
    dest_lat         DOUBLE PRECISION NOT NULL,
    dest_lng         DOUBLE PRECISION NOT NULL,
    -- Resolved station geofence — set at creation so the monitoring engine
    -- does not need to join through geofences at runtime
    dest_geofence_id UUID         REFERENCES geofences(id),
    -- Physical lifecycle (commercial statuses live only on orders)
    status           TEXT         NOT NULL DEFAULT 'LOADING'
                     CHECK (status IN (
                         'LOADING','LOADED','EN_ROUTE',
                         'ARRIVED','DELIVERY_ACCEPTED','COMPLETED'
                     )),
    -- Expected load per compartment: [{"index":1,"fuel_type":"DIESEL","expected_volume":9100}]
    compartments     JSONB,
    -- Actual fuel snapshot at departure (captured at finish-loading)
    fuel_loaded      JSONB,
    -- Actual fuel snapshot at delivery (captured at QR scan / offload)
    fuel_delivered   JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The geofence service looks up the active trip for a truck on every telemetry
-- reading — this index is on the hot path.
CREATE INDEX IF NOT EXISTS idx_trips_truck_status
    ON trips (truck_id, status)
    WHERE status IN ('EN_ROUTE', 'ARRIVED', 'DELIVERY_ACCEPTED');

CREATE INDEX IF NOT EXISTS idx_trips_order ON trips (order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_workspace ON trips (workspace_id, created_at DESC);

-- Add trip_id to geofence_events so events can link to a trip regardless of
-- whether an order exists (Mode B trips have order_id = NULL).
-- order_id is kept for backward compatibility with existing queries.
ALTER TABLE geofence_events
    ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id);

CREATE INDEX IF NOT EXISTS idx_geofence_events_trip
    ON geofence_events (trip_id, occurred_at)
    WHERE trip_id IS NOT NULL;

-- Module flags per workspace.
-- ordering: true  → ordering workflow endpoints are active
-- dispatch_api: true → POST /v1/trips/dispatch is active
-- Existing workspaces keep ordering=true so nothing breaks.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS modules JSONB
        NOT NULL DEFAULT '{"ordering": true, "dispatch_api": false}';
