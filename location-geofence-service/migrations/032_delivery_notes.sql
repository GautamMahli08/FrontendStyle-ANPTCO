CREATE TABLE IF NOT EXISTS delivery_notes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id      UUID        NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
    order_id     UUID        REFERENCES orders(id),
    workspace_id UUID        NOT NULL,
    qr_confirmed BOOLEAN     NOT NULL DEFAULT FALSE,
    note_data    JSONB       NOT NULL DEFAULT '{}',
    s3_key       TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_order ON delivery_notes (order_id);
