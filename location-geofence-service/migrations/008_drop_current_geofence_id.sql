-- current_geofence_id was added to truck_live_state as a planned optimisation
-- for exit detection on cold-start but was never implemented; geofence_state
-- is used exclusively. Drop the dead column to keep the schema clean.
ALTER TABLE truck_live_state DROP COLUMN IF EXISTS current_geofence_id;
