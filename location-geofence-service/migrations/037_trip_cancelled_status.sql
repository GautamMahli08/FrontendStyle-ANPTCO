-- The frontend (trip-history, fleet-monitor) already treats CANCELLED as a
-- real trip status (STATUS_LABEL, STATUS_STYLE, and active-trip filters all
-- reference it), but the original trips.status CHECK constraint never
-- allowed it, so no trip could actually reach that state.
--
-- This is needed so a truck can be re-dispatched without leaving its
-- previous trip stuck open forever: on new dispatch, any of the truck's
-- other non-terminal trips are now marked CANCELLED instead of piling up
-- as permanently "active" EN_ROUTE rows.
ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips
  ADD CONSTRAINT trips_status_check
  CHECK (status IN (
    'LOADING', 'LOADED', 'EN_ROUTE',
    'ARRIVED', 'DELIVERY_ACCEPTED', 'COMPLETED', 'CANCELLED'
  ));
