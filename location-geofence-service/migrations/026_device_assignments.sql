-- Device ↔ truck assignment history.
-- Each row records when a device was installed in a truck (assigned_at)
-- and optionally when it was removed (unassigned_at IS NULL = active binding).
-- On assign: devices.status → ASSIGNED + trucks.galileosky_device_id updated.
-- On unassign: unassigned_at set + devices.status → AVAILABLE.

CREATE TABLE IF NOT EXISTS device_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID        NOT NULL REFERENCES devices (id),
    truck_id        UUID        NOT NULL REFERENCES trucks (id),
    assigned_by     TEXT        NOT NULL,   -- actor Cognito sub
    unassigned_by   TEXT,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at   TIMESTAMPTZ,
    notes           TEXT
);

-- Only one active assignment per device at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_assignments_active_device
    ON device_assignments (device_id)
    WHERE unassigned_at IS NULL;

-- Only one active assignment per truck at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_assignments_active_truck
    ON device_assignments (truck_id)
    WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_assignments_truck
    ON device_assignments (truck_id, assigned_at DESC);

-- Fuel sensor assignments follow the same pattern.
CREATE TABLE IF NOT EXISTS fuel_sensor_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id       UUID        NOT NULL REFERENCES fuel_sensors (id),
    truck_id        UUID        NOT NULL REFERENCES trucks (id),
    compartment_no  SMALLINT    NOT NULL,   -- which compartment this sensor measures
    assigned_by     TEXT        NOT NULL,
    unassigned_by   TEXT,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at   TIMESTAMPTZ,
    notes           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_sensor_assignments_active_sensor
    ON fuel_sensor_assignments (sensor_id)
    WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_sensor_assignments_truck
    ON fuel_sensor_assignments (truck_id, assigned_at DESC);
