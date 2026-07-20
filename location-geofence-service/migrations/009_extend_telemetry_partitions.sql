-- Extend truck_telemetry range partitions through end of 2026.
-- Operational note: create the next year's partitions before the boundary.
-- Use scripts/create_partition.sh for ad-hoc partition creation, or automate
-- via an EventBridge scheduled rule that invokes a maintenance Lambda.
CREATE TABLE IF NOT EXISTS truck_telemetry_2026_09
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS truck_telemetry_2026_10
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS truck_telemetry_2026_11
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS truck_telemetry_2026_12
    PARTITION OF truck_telemetry FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
