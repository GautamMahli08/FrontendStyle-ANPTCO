-- Phase 2: Dispatch API key per workspace + QR scan timestamp on trips.
--
-- dispatch_api_key: a long-lived Bearer token that external ERPs present with
-- POST /v1/trips/dispatch.  NULL means dispatch is not enabled for that workspace.
-- Rotate by: UPDATE workspaces SET dispatch_api_key = gen_random_uuid()::text WHERE id = '...';
--
-- scanned_at: the moment a QR-scan transitioned the trip ARRIVED → DELIVERY_ACCEPTED.
-- Captured in the delivery note.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS dispatch_api_key TEXT UNIQUE;

-- Hot path: dispatch handler looks up workspace by this column on every POST.
CREATE INDEX IF NOT EXISTS idx_workspaces_dispatch_api_key
    ON workspaces (dispatch_api_key)
    WHERE dispatch_api_key IS NOT NULL;

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;
