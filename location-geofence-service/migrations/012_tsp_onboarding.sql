-- TSP ↔ Seller connection requests.
-- A Transport Admin enters the seller's code and requests a connection.
-- The Seller Manager approves or rejects it.
-- Once approved, the seller can see the TSP's trucks on their orders.

CREATE TABLE IF NOT EXISTS seller_connections (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL,
    transporter_id  UUID        NOT NULL,   -- Cognito sub of the TRANSPORT_ADMIN
    seller_code     VARCHAR(64) NOT NULL,   -- code the seller shares out-of-band
    status          VARCHAR(32) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID                   -- Cognito sub of the SELLER_MANAGER who acted
);

CREATE INDEX IF NOT EXISTS idx_seller_connections_workspace
    ON seller_connections (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_seller_connections_transporter
    ON seller_connections (transporter_id, status);

-- Sellers publish a code that transporters use to connect.
-- Each workspace row may have one seller_code; PLATFORM_ADMIN generates it.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS seller_code VARCHAR(64) UNIQUE;
