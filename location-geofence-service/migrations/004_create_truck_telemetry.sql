-- Partitioned telemetry history table.
-- Range-partitioned by timestamp so monthly partitions can be dropped or
-- downsampled independently when raw history exceeds the retention window.
--
-- Partition management: create the next month's partition before the boundary
-- (e.g. via a monthly EventBridge rule invoking a maintenance Lambda).
CREATE TABLE IF NOT EXISTS truck_telemetry (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    truck_id            UUID        NOT NULL,
    workspace_id        UUID        NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL,
    latitude            DECIMAL(10, 8) NOT NULL,
    longitude           DECIMAL(11, 8) NOT NULL,
    speed               INT,
    ignition_on         BOOLEAN,
    compartment_sensors JSONB,
    total_fuel_liters   DECIMAL(10, 2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Partition key must be part of the primary key.
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Bootstrap three months. Extend before each month boundary.
CREATE TABLE IF NOT EXISTS truck_telemetry_2026_06
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS truck_telemetry_2026_07
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS truck_telemetry_2026_08
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Primary access pattern: latest N readings for a given truck.
CREATE INDEX IF NOT EXISTS idx_telemetry_truck_time ON truck_telemetry (truck_id, timestamp DESC);
