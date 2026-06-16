-- =============================================================
-- Add service_id column to existing protocols table
-- Run this in the Supabase SQL editor if your protocols table
-- was created before this column was added.
-- =============================================================

ALTER TABLE protocols
  ADD COLUMN IF NOT EXISTS service_id TEXT;

COMMENT ON COLUMN protocols.service_id IS
  'The localStorage service-center id selected when the protocol was created';
