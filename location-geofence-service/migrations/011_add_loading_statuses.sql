-- Add LOADING and LOADED to the orders status lifecycle.
-- Per the canonical dashboard flow (§2 of BACKEND_ARCHITECTURE.md):
--   EN_ROUTE → ARRIVED → LOADING → LOADED → DELIVERY_ACCEPTED → COMPLETED
--
-- The CHECK constraint must be dropped and recreated because Postgres does not
-- support ALTER … CHECK ADD VALUE (that syntax is only for enum types).

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
        'EN_ROUTE',
        'ARRIVED',
        'LOADING',
        'LOADED',
        'DELIVERY_ACCEPTED',
        'COMPLETED'
    ));

-- Mirror the same expansion on order_assignments so statuses stay consistent.
ALTER TABLE order_assignments
    DROP CONSTRAINT IF EXISTS order_assignments_status_check;

ALTER TABLE order_assignments
    ADD CONSTRAINT order_assignments_status_check
    CHECK (status IN (
        'EN_ROUTE',
        'ARRIVED',
        'LOADING',
        'LOADED',
        'DELIVERY_ACCEPTED',
        'JOURNEY_COMPLETE'
    ));
