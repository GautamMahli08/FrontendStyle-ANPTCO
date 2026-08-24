-- Order records synced from an external ordering system.
-- External system is authoritative; we are a consumer.
CREATE TABLE synced_orders (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid        NOT NULL,
  external_order_id  text        NOT NULL,
  status             text        NOT NULL,
  vehicle_id         uuid,
  trip_id            uuid,
  product_code       text,
  quantity_ordered_l numeric,
  source_geofence_id uuid,
  dest_geofence_id   uuid,
  dest_lat           double precision,
  dest_lng           double precision,
  scheduled_from     timestamptz,
  scheduled_to       timestamptz,
  raw                jsonb       NOT NULL DEFAULT '{}',
  link_state         text        NOT NULL DEFAULT 'LINKED'
    CHECK (link_state IN ('LINKED', 'UNLINKED')),
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, external_order_id)
);

CREATE INDEX synced_orders_by_vehicle
  ON synced_orders (vehicle_id, updated_at DESC)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX synced_orders_unlinked
  ON synced_orders (workspace_id, first_seen_at)
  WHERE link_state = 'UNLINKED';

-- Idempotency ledger: one row per inbound event_id prevents duplicate processing
-- even when the external system retries a webhook delivery.
CREATE TABLE order_events (
  workspace_id uuid NOT NULL,
  event_id     text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, event_id)
);
