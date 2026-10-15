-- Snapshot of fuel level at the moment a geofence ENTER/EXIT event fires.
-- Lets the dashboard show fuel-at-arrival vs fuel-at-departure for a
-- destination visit (and depot visits) without re-joining truck_telemetry.
ALTER TABLE geofence_events ADD COLUMN IF NOT EXISTS fuel_level DOUBLE PRECISION;
