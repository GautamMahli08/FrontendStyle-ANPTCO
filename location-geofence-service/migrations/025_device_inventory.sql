-- Platform-owned hardware inventory.
-- devices: GPS trackers (Galileosky units and others).
-- fuel_sensors: DUT-E / DUT-E 2Bio capacitive probes.
--
-- Lifecycle:
--   AVAILABLE  → can be assigned to a truck
--   ASSIGNED   → currently bound to a truck (device_assignments row active)
--   MAINTENANCE → under repair; not available for assignment
--   RETIRED    → permanently decommissioned

CREATE TABLE IF NOT EXISTS devices (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    imei            VARCHAR(64) NOT NULL UNIQUE,
    model           VARCHAR(64) NOT NULL DEFAULT 'Galileosky 7x',
    firmware        VARCHAR(32),
    sim_iccid       VARCHAR(32),
    sim_phone       VARCHAR(32),
    status          VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
                        CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED')),
    purchased_at    DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);
CREATE INDEX IF NOT EXISTS idx_devices_imei   ON devices (imei);

CREATE TABLE IF NOT EXISTS fuel_sensors (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_no       VARCHAR(64) NOT NULL UNIQUE,
    model           VARCHAR(64) NOT NULL DEFAULT 'DUT-E',
    status          VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
                        CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED')),
    purchased_at    DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_sensors_status ON fuel_sensors (status);
