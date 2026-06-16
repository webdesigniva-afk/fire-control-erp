-- =============================================================
-- Database-first storage for CRM data that must not live only in
-- browser localStorage. Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS service_tasks (
  id                     TEXT PRIMARY KEY,
  title                  TEXT NOT NULL DEFAULT '',
  description            TEXT NOT NULL DEFAULT '',
  task_type              TEXT NOT NULL DEFAULT 'Планирано посещение',
  activities             JSONB NOT NULL DEFAULT '[]'::jsonb,
  object_id              TEXT,
  object_code            TEXT NOT NULL DEFAULT '',
  object_name            TEXT NOT NULL DEFAULT '',
  client                 TEXT NOT NULL DEFAULT '',
  due_date               DATE,
  source_protocol_id     TEXT,
  source_protocol_number TEXT,
  source_protocol_row    TEXT,
  source_label           TEXT,
  recurrence_months      INTEGER,
  status                 TEXT NOT NULL DEFAULT 'planned',
  created_at_ms          BIGINT NOT NULL DEFAULT 0,
  completed_at           TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS description            TEXT NOT NULL DEFAULT '';
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS task_type              TEXT NOT NULL DEFAULT 'Планирано посещение';
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS activities             JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS object_id              TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_protocol_id     TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_protocol_row    TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_label           TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS recurrence_months      INTEGER;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ;

UPDATE service_tasks
SET object_id = COALESCE(NULLIF(object_id, ''), NULLIF(object_code, ''), NULLIF(object_name, '')),
    source_protocol_id = COALESCE(
      NULLIF(source_protocol_id, ''),
      NULLIF(source_protocol_number, ''),
      NULLIF(source_label, '')
    )
WHERE object_id IS NULL
   OR object_id = ''
   OR source_protocol_id IS NULL
   OR source_protocol_id = '';

ALTER TABLE service_tasks DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_service_tasks_status_due
  ON service_tasks (status, due_date);

DROP INDEX IF EXISTS uq_service_tasks_source_protocol;
DROP INDEX IF EXISTS uq_service_tasks_planned_protocol_row;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_tasks_planned_protocol_date
  ON service_tasks (object_id, source_protocol_id, task_type, due_date)
  WHERE status = 'planned'
    AND object_id IS NOT NULL
    AND object_id <> ''
    AND source_protocol_id IS NOT NULL
    AND source_protocol_id <> ''
    AND due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_documents (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT '',
  number     TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  client     TEXT NOT NULL DEFAULT '',
  object     TEXT NOT NULL DEFAULT '',
  href       TEXT NOT NULL DEFAULT '',
  total      TEXT NOT NULL DEFAULT '',
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_documents DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_documents_kind
  ON saved_documents (kind);

-- ---------------------------------------------------------------
-- Object map coordinates
-- Locations are geocoded from their address by the app and stored
-- here so dashboard/map views use database data, not mock markers.
-- Safe to re-run after the main locations table already exists.
-- ---------------------------------------------------------------
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS geocoded_address TEXT;
ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_locations_coordinates
  ON locations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ---------------------------------------------------------------
-- Object equipment
-- Practical, inspection-oriented records linked to a CRM object.
-- Safe to re-run. Keeps archived rows for history/protocol context.
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID,
  object_id       UUID,
  site_id         UUID,
  name            TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT '',
  equipment_type  TEXT,
  subtype         TEXT,
  display_name    TEXT,
  category        TEXT,
  brand           TEXT,
  model           TEXT,
  serial_number   TEXT,
  capacity        TEXT,
  description     TEXT,
  location        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Изряден',
  last_check_date DATE,
  next_check_date DATE,
  notes           TEXT,
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS location_id     UUID;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS object_id       UUID;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS site_id         UUID;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS name            TEXT NOT NULL DEFAULT '';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS type            TEXT NOT NULL DEFAULT '';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS equipment_type  TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS subtype         TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS display_name    TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS category        TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS brand           TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS model           TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS serial_number   TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS capacity        TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS location        TEXT NOT NULL DEFAULT '';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'Изряден';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_check_date DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_check_date DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes           TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS archived        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'equipment' AND column_name = 'serial'
  ) THEN
    UPDATE equipment
    SET serial_number = COALESCE(NULLIF(serial_number, ''), NULLIF(serial, ''))
    WHERE COALESCE(serial_number, '') = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'equipment' AND column_name = 'last_check'
  ) THEN
    UPDATE equipment
    SET last_check_date = COALESCE(
      last_check_date,
      CASE
        WHEN last_check::text ~ '^\d{4}-\d{2}-\d{2}' THEN substring(last_check::text from 1 for 10)::date
        ELSE NULL
      END
    )
    WHERE last_check_date IS NULL AND last_check IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'equipment' AND column_name = 'next_check'
  ) THEN
    UPDATE equipment
    SET next_check_date = COALESCE(
      next_check_date,
      CASE
        WHEN next_check::text ~ '^\d{4}-\d{2}-\d{2}' THEN substring(next_check::text from 1 for 10)::date
        ELSE NULL
      END
    )
    WHERE next_check_date IS NULL AND next_check IS NOT NULL;
  END IF;
END $$;

UPDATE equipment
SET object_id = COALESCE(object_id, location_id),
    site_id = COALESCE(site_id, location_id),
    equipment_type = COALESCE(NULLIF(equipment_type, ''), NULLIF(type, '')),
    display_name = COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), NULLIF(type, '')),
    archived = COALESCE(archived, FALSE),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE equipment DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_equipment_location_active
  ON equipment (location_id, archived, next_check_date);

CREATE INDEX IF NOT EXISTS idx_equipment_object_active
  ON equipment (object_id, archived);

-- ---------------------------------------------------------------
-- Protocol and object media
-- Stores protocol photos in Supabase Storage and links them to both
-- the protocol and object. Safe to re-run.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('protocol-photos', 'protocol-photos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE TABLE IF NOT EXISTS protocol_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id     UUID,
  protocol_number TEXT NOT NULL DEFAULT '',
  object_id       TEXT NOT NULL DEFAULT '',
  uploaded_by     TEXT NOT NULL DEFAULT '',
  file_url        TEXT NOT NULL DEFAULT '',
  storage_path    TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS protocol_id     UUID;
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS protocol_number TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS object_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS uploaded_by     TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS file_url        TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS storage_path    TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS description     TEXT NOT NULL DEFAULT '';
ALTER TABLE protocol_photos ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE protocol_photos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_protocol_photos_protocol
  ON protocol_photos (protocol_number, created_at);

CREATE INDEX IF NOT EXISTS idx_protocol_photos_object
  ON protocol_photos (object_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'protocol_photos_public_read'
  ) THEN
    CREATE POLICY protocol_photos_public_read
      ON storage.objects FOR SELECT
      USING (bucket_id = 'protocol-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'protocol_photos_public_insert'
  ) THEN
    CREATE POLICY protocol_photos_public_insert
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'protocol-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'protocol_photos_public_update'
  ) THEN
    CREATE POLICY protocol_photos_public_update
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'protocol-photos')
      WITH CHECK (bucket_id = 'protocol-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'protocol_photos_public_delete'
  ) THEN
    CREATE POLICY protocol_photos_public_delete
      ON storage.objects FOR DELETE
      USING (bucket_id = 'protocol-photos');
  END IF;
END $$;
