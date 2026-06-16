-- =============================================================
-- Ensure the protocols table has ALL required columns.
-- Run once in the Supabase SQL editor — safe to re-run.
-- This fixes NOT NULL constraint errors and missing-column errors.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Columns that may be missing from older table versions
-- ---------------------------------------------------------------
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS service_id        TEXT;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS location_id       UUID;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS object_code       TEXT NOT NULL DEFAULT '';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS service_code      TEXT NOT NULL DEFAULT 'A';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS year_short        TEXT NOT NULL DEFAULT '26';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_date     DATE;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS client_name       TEXT NOT NULL DEFAULT '';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS object_name       TEXT NOT NULL DEFAULT '';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS technician        TEXT NOT NULL DEFAULT '';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_payload  JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------
-- 2. Fix NOT NULL violations on columns the app may not always supply.
--    The app sends BOTH naming conventions (type/protocol_type,
--    date/protocol_date, etc.) so whichever column exists gets a value.
--    But if either column has NOT NULL with no default, give it a default.
-- ---------------------------------------------------------------
-- "type" column (legacy schema) — add a default so rows without it don't fail
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'protocols' AND column_name = 'type'
  ) THEN
    ALTER TABLE protocols ALTER COLUMN "type" SET DEFAULT 'service';
    -- Back-fill any existing NULLs
    UPDATE protocols SET "type" = 'service' WHERE "type" IS NULL;
    ALTER TABLE protocols ALTER COLUMN "type" SET NOT NULL;
  END IF;
END $$;

-- "protocol_type" column — ensure it also has a default
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_type TEXT NOT NULL DEFAULT 'service';

-- "protocol_number" / "number" — both naming conventions
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS protocol_number TEXT;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS number          TEXT;

-- Add unique constraint on "number" if not present (used by upsert onConflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_name = 'protocols'
      AND  constraint_type = 'UNIQUE'
      AND  constraint_name = 'uq_number'
  ) THEN
    -- Back-fill protocol_number from number (so the unique constraint has no NULLs)
    UPDATE protocols SET number = id::text WHERE number IS NULL;
    ALTER TABLE protocols ADD CONSTRAINT uq_number UNIQUE (number);
  END IF;
END $$;

-- Also keep the protocol_number unique constraint for the new-form insert path
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  table_name = 'protocols'
      AND  constraint_type = 'UNIQUE'
      AND  constraint_name = 'uq_protocol_number'
  ) THEN
    ALTER TABLE protocols ADD CONSTRAINT uq_protocol_number UNIQUE (protocol_number);
  END IF;
END $$;

-- Disable RLS so the anon key can read/write freely
ALTER TABLE protocols DISABLE ROW LEVEL SECURITY;

-- Useful index for the object-detail page queries
CREATE INDEX IF NOT EXISTS idx_protocols_location
  ON protocols (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_protocols_object_code
  ON protocols (object_code)
  WHERE object_code <> '';

-- Verify: list columns
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'protocols'
ORDER  BY ordinal_position;
