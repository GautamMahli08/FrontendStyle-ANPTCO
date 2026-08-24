-- Persistent stop candidates and finalized stop records.
-- An open stop (ended_at IS NULL) is the in-progress candidate;
-- the Lambda writes it on the first stationary reading and finalizes
-- (or discards) it when movement resumes.
CREATE TABLE vehicle_stops (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid     NOT NULL,
  vehicle_id      uuid     NOT NULL REFERENCES trucks(id),
  trip_id         uuid,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  duration_s      integer,
  inside_geofence boolean  NOT NULL DEFAULT false,
  geofence_id     uuid,
  geofence_name   text,
  classification  text     NOT NULL DEFAULT 'NORMAL'
    CHECK (classification IN ('NORMAL', 'SUSPICIOUS')),
  reasons         text[]   NOT NULL DEFAULT '{}',
  dedup_key       text     NOT NULL,
  UNIQUE (workspace_id, dedup_key)
);

-- Per-vehicle stop history, newest first.
CREATE INDEX vehicle_stops_by_vehicle
  ON vehicle_stops (vehicle_id, started_at DESC);

-- Fast lookup of the open candidate per vehicle (at most one row per vehicle).
CREATE INDEX vehicle_stops_open
  ON vehicle_stops (vehicle_id)
  WHERE ended_at IS NULL;
