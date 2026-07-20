-- P2-2: dispatch idempotency via unique (workspace_id, order_ref).
--
-- Prevents the Dispatch API from creating duplicate trips for the same
-- external order reference within a workspace.  The partial index applies only
-- when order_ref IS NOT NULL so:
--   - Mode B dispatches (order_ref set) get duplicate-detection
--   - Mode A trips (order_ref NULL) are unaffected — multiple trips per order
--     are already prevented by the per-order idempotency check in the API
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_workspace_orderref
    ON trips (workspace_id, order_ref)
    WHERE order_ref IS NOT NULL;
