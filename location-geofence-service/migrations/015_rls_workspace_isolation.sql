-- Row Level Security: workspace isolation at the database layer.
-- The application must call SET app.workspace_id = '<uuid>' before each request.
-- When the setting is empty (migrations, admin tools), all rows are accessible.

-- order_assignments intentionally excluded: no workspace_id column;
-- it is transitively protected through the orders RLS policy.
ALTER TABLE trucks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_live_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_telemetry     ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences           ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_requests     ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trucks','orders','truck_live_state',
    'truck_telemetry','geofences','geofence_events',
    'seller_connections','sensor_requests'
  ] LOOP
    EXECUTE format(
      $policy$
      CREATE POLICY ws_isolation ON %I
      USING (
        current_setting('app.workspace_id', true) = ''
        OR workspace_id::text = current_setting('app.workspace_id', true)
      )
      $policy$,
      t
    );
  END LOOP;
END $$;
