-- Add external power voltage to telemetry history and live state.
ALTER TABLE truck_telemetry  ADD COLUMN IF NOT EXISTS external_power_voltage DECIMAL(6,2);
ALTER TABLE truck_live_state ADD COLUMN IF NOT EXISTS external_power_voltage DECIMAL(6,2);

-- Asset event log: fill/drain fuel, battery on/off, ignition on/off, movement start/stop.
-- One row per detected transition; value_before/after carry the numeric context
-- (fuel litres for fill/drain; voltage for battery; speed for movement).
CREATE TABLE IF NOT EXISTS asset_events (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    truck_id      UUID        NOT NULL REFERENCES trucks(id),
    workspace_id  UUID        NOT NULL,
    event_type    VARCHAR(30) NOT NULL
        CHECK (event_type IN (
            'FUEL_FILL','FUEL_DRAIN',
            'BATTERY_ON','BATTERY_OFF',
            'IGNITION_ON','IGNITION_OFF',
            'MOVEMENT_START','MOVEMENT_STOP'
        )),
    latitude      DECIMAL(10,8),
    longitude     DECIMAL(11,8),
    value_before  DECIMAL(10,2),
    value_after   DECIMAL(10,2),
    occurred_at   TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_events_truck_time
    ON asset_events (truck_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_events_workspace_time
    ON asset_events (workspace_id, occurred_at DESC);
