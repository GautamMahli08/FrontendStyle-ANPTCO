-- Extend orders.status to cover the full lifecycle:
-- PLACED → ACCEPTED_BY_SELLER → ASSIGNED_TO_TSP → ASSIGNED →
-- LOADING → LOADED → EN_ROUTE → ARRIVED → DELIVERY_ACCEPTED → COMPLETED

-- Drop whatever status CHECK constraint exists on orders (any name).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE  conrelid = 'orders'::regclass AND contype = 'c' AND conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'PLACED','ACCEPTED_BY_SELLER','ASSIGNED_TO_TSP','ASSIGNED',
    'LOADING','LOADED','EN_ROUTE',
    'ARRIVED','DELIVERY_ACCEPTED','COMPLETED'
  ));

-- New orders start as PLACED (previously defaulted to EN_ROUTE).
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PLACED';

-- Track which TSP workspace / user is handling this order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transporter_id TEXT;
