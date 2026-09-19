-- asset_events had no link back to a specific trip — only truck_id and a
-- timestamp. With multiple trips per truck (especially overlapping stale/
-- cancelled ones, common before auto-cancel-on-redispatch existed), the
-- frontend was forced to guess which trip an event belonged to by checking
-- whether its timestamp fell inside [trip.created_at, trip.updated_at] —
-- fragile, and wrong whenever two trips for the same truck overlap in time.
--
-- trip_id is nullable: existing rows have no way to be backfilled reliably
-- (the same overlap ambiguity that caused this problem in the first place),
-- so old events keep using the time-window fallback; only new events get
-- an unambiguous trip_id going forward.
ALTER TABLE asset_events
  ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id);

CREATE INDEX IF NOT EXISTS idx_asset_events_trip
  ON asset_events (trip_id)
  WHERE trip_id IS NOT NULL;
