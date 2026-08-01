-- QR code versioning and audit trail.
-- Each truck has exactly one ACTIVE QR version at any time.
-- On regeneration: current row → REVOKED, new row (version+1) → ACTIVE.
-- The QR payload encodes: <truck_id>.<version>.<base64url(HMAC-SHA256(key, truck_id+"."+version))>
-- Gate 1 of the 4-gate delivery acceptance verifies this token against the ACTIVE row.

CREATE TABLE IF NOT EXISTS qr_codes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    truck_id     UUID        NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
    workspace_id UUID        NOT NULL,
    version      INT         NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'REVOKED')),
    -- SHA-256 hex of the raw token — stored for audit; verification uses the HMAC key live.
    token_hash   TEXT        NOT NULL,
    created_by   TEXT        NOT NULL,   -- Cognito sub of issuing PLATFORM_ADMIN
    reason       TEXT,                   -- why this version was issued / regenerated
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ,
    revoked_by   TEXT                    -- Cognito sub who triggered the next version
);

-- Exactly one ACTIVE row per truck at any time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_codes_active_truck
    ON qr_codes (truck_id)
    WHERE status = 'ACTIVE';

-- Monotonically increasing version per truck — no gaps allowed by application logic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_codes_truck_version
    ON qr_codes (truck_id, version);

CREATE INDEX IF NOT EXISTS idx_qr_codes_truck
    ON qr_codes (truck_id, created_at DESC);
