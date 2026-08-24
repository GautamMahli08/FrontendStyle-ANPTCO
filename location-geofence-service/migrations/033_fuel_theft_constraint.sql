-- FUEL_THEFT was added to the event detector but was missing from the
-- asset_events check constraint, causing those inserts to fail silently.
ALTER TABLE asset_events
  DROP CONSTRAINT IF EXISTS asset_events_event_type_check;

ALTER TABLE asset_events
  ADD CONSTRAINT asset_events_event_type_check
  CHECK (event_type IN (
    'FUEL_FILL', 'FUEL_DRAIN', 'FUEL_THEFT',
    'BATTERY_ON', 'BATTERY_OFF',
    'IGNITION_ON', 'IGNITION_OFF',
    'MOVEMENT_START', 'MOVEMENT_STOP'
  ));
