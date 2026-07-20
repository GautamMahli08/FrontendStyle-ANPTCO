-- Add QR PNG URL to trucks; populated when sensor request is fully approved.
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS qr_url TEXT;
