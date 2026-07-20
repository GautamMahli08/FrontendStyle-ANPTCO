-- Sensor (truck) integration requests — 2-step approval flow.
-- Step 1: Transport Admin submits a truck (device IMEI) for integration.
-- Step 2: Seller Manager approves the truck being associated with their workspace.
-- Step 3: Platform Admin gives final approval and the truck row is created.

CREATE TABLE IF NOT EXISTS sensor_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL,
    submitted_by    UUID        NOT NULL,   -- Cognito sub of TRANSPORT_ADMIN
    device_imei     VARCHAR(64) NOT NULL,   -- Galileosky IMEI / flespi device id
    registration_no VARCHAR(64),            -- truck license plate
    status          VARCHAR(32) NOT NULL DEFAULT 'PENDING_SELLER'
                        CHECK (status IN (
                            'PENDING_SELLER',   -- waiting for seller approval
                            'PENDING_ADMIN',    -- seller approved, waiting for platform admin
                            'APPROVED',         -- admin approved → truck row created
                            'REJECTED'          -- rejected at either step
                        )),
    seller_reviewed_by  UUID,
    seller_reviewed_at  TIMESTAMPTZ,
    admin_reviewed_by   UUID,
    admin_reviewed_at   TIMESTAMPTZ,
    rejection_reason    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensor_requests_workspace_status
    ON sensor_requests (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_sensor_requests_submitted_by
    ON sensor_requests (submitted_by);
