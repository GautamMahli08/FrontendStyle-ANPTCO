-- Unified alert model for all monitoring subsystems.
-- Every detector writes via INSERT ... ON CONFLICT (workspace_id, dedup_key) DO UPDATE
-- so re-processing the same telemetry batch is always idempotent.

CREATE TYPE alert_type AS ENUM (
  'ORDER_SYNC_FAILURE',
  'SUSPECTED_DELIVERY',
  'SUSPICIOUS_STOP',
  'SENSOR_TAMPERING',
  'FUEL_DRAINING_SUSPECTED',
  'EXTERNAL_POWER_TAMPERING'
);

CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');

CREATE TABLE alerts (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid         NOT NULL,
  type         alert_type   NOT NULL,
  status       alert_status NOT NULL DEFAULT 'OPEN',
  severity     smallint     NOT NULL DEFAULT 3,  -- 1 critical .. 5 info
  vehicle_id   uuid,
  device_imei  text,
  trip_id      uuid,
  order_id     uuid,
  sensor_id    text,
  occurred_at  timestamptz  NOT NULL,
  detected_at  timestamptz  NOT NULL DEFAULT now(),
  last_lat     double precision,
  last_lng     double precision,
  geofence_id  uuid,
  confidence   numeric(4,3),
  dedup_key    text         NOT NULL,
  payload      jsonb        NOT NULL DEFAULT '{}',
  UNIQUE (workspace_id, dedup_key)
);

-- Fast path for the operations dashboard: open alerts per workspace, newest first.
CREATE INDEX alerts_open_by_workspace
  ON alerts (workspace_id, occurred_at DESC)
  WHERE status = 'OPEN';

-- Fast path for per-vehicle alert history.
CREATE INDEX alerts_by_vehicle
  ON alerts (vehicle_id, occurred_at DESC)
  WHERE vehicle_id IS NOT NULL;

-- Per-workspace / per-vehicle detection tunables.
-- A row with vehicle_id IS NULL is the workspace default.
-- A row with vehicle_id set is a vehicle-specific override.
CREATE TABLE monitoring_config (
  id                         uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               uuid     NOT NULL,
  vehicle_id                 uuid,
  fuel_change_l              numeric  NOT NULL DEFAULT 3.0,
  stationary_speed_kmh       smallint NOT NULL DEFAULT 3,
  min_stop_duration_s        integer  NOT NULL DEFAULT 180,
  suspicious_stop_duration_s integer  NOT NULL DEFAULT 900,
  drain_window_s             integer  NOT NULL DEFAULT 180,
  drain_delta_stationary_pct numeric  NOT NULL DEFAULT 0.05,
  drain_delta_moving_pct     numeric  NOT NULL DEFAULT 0.15,
  power_loss_debounce_s      integer  NOT NULL DEFAULT 30,
  sensor_miss_window_s       integer  NOT NULL DEFAULT 120,
  power_mode                 text     NOT NULL DEFAULT 'constant'
    CHECK (power_mode IN ('constant', 'ignition_switched'))
);

-- One workspace default (vehicle_id IS NULL) per workspace.
CREATE UNIQUE INDEX monitoring_config_workspace_default
  ON monitoring_config (workspace_id)
  WHERE vehicle_id IS NULL;

-- One vehicle override per (workspace, vehicle).
CREATE UNIQUE INDEX monitoring_config_vehicle_override
  ON monitoring_config (workspace_id, vehicle_id)
  WHERE vehicle_id IS NOT NULL;
