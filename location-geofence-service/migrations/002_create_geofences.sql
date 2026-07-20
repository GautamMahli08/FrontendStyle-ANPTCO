-- Geofences table: depot + delivery stations.
-- ref_id links a STATION row back to the station/order destination identifier
-- used by the orders table so the geofence module can resolve it via JOIN.
CREATE TABLE IF NOT EXISTS geofences (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL,
    type          VARCHAR(20) NOT NULL CHECK (type IN ('DEPOT', 'STATION')),
    ref_id        VARCHAR(64),               -- station ID or depot identifier
    name          VARCHAR(255),
    latitude      DECIMAL(10, 8) NOT NULL,
    longitude     DECIMAL(11, 8) NOT NULL,
    radius_meters INT           NOT NULL,   -- depot ≈ 200, station ≈ 100–250
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_workspace_type ON geofences (workspace_id, type);
CREATE INDEX IF NOT EXISTS idx_geofences_ref            ON geofences (ref_id) WHERE ref_id IS NOT NULL;
