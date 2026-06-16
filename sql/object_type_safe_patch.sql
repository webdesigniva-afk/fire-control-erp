-- Safe to re-run. Adds the object type field used by location create/edit screens.
ALTER TABLE IF EXISTS locations
  ADD COLUMN IF NOT EXISTS object_type TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_locations_object_type
  ON locations (object_type)
  WHERE object_type <> '';
