-- =============================================================
-- Extra fields for fire detector equipment.
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS installation_date DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS system_address TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS system_type TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS total_devices INTEGER;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pump_group TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pump_station_location TEXT;
