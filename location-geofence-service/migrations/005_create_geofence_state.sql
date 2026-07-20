-- Stateful inside/outside tracking per (truck, geofence) pair.
-- Persisted in Postgres so detection is durable across Lambda cold starts and
-- concurrent invocations. A missing row means the truck is assumed OUTSIDE
-- (the safe default: it may generate a spurious ENTER on next reading, but
-- will not generate a false EXIT).
CREATE TABLE IF NOT EXISTS geofence_state (
    truck_id    UUID        NOT NULL REFERENCES trucks    (id) ON DELETE CASCADE,
    geofence_id UUID        NOT NULL REFERENCES geofences (id) ON DELETE CASCADE,
    is_inside   BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (truck_id, geofence_id)
);
