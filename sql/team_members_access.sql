-- =============================================================
-- Team members and employee-code/PIN access.
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS team_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL DEFAULT '',
  employee_code         TEXT NOT NULL,
  phone                 TEXT NOT NULL DEFAULT '',
  email                 TEXT,
  role                  TEXT NOT NULL DEFAULT 'Техник',
  photo_url             TEXT,
  photo_storage_path    TEXT,
  pin_hash              TEXT NOT NULL,
  must_change_pin       BOOLEAN NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at         TIMESTAMPTZ,
  notes                 TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_members_employee_code_key UNIQUE (employee_code),
  CONSTRAINT team_members_role_check CHECK (role IN ('Администратор', 'Офис', 'Техник', 'Мениджър')),
  CONSTRAINT team_members_employee_code_format CHECK (employee_code ~ '^FC-[0-9]{4,}$')
);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS name                  TEXT NOT NULL DEFAULT '';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS employee_code         TEXT NOT NULL DEFAULT '';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone                 TEXT NOT NULL DEFAULT '';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email                 TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role                  TEXT NOT NULL DEFAULT 'Техник';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo_url             TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo_storage_path    TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pin_hash              TEXT NOT NULL DEFAULT '';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS must_change_pin       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_active             BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login_at         TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notes                 TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_employee_code
  ON team_members (employee_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_phone_unique
  ON team_members (phone)
  WHERE phone <> '';

CREATE INDEX IF NOT EXISTS idx_team_members_active_role
  ON team_members (is_active, role);

ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON team_members TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'team_members_public_read'
  ) THEN
    CREATE POLICY team_members_public_read
      ON team_members FOR SELECT
      USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'team_members_public_insert'
  ) THEN
    CREATE POLICY team_members_public_insert
      ON team_members FOR INSERT
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'team_members_public_update'
  ) THEN
    CREATE POLICY team_members_public_update
      ON team_members FOR UPDATE
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('team-avatars', 'team-avatars', TRUE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'team_avatars_public_read'
  ) THEN
    CREATE POLICY team_avatars_public_read
      ON storage.objects FOR SELECT
      USING (bucket_id = 'team-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'team_avatars_public_insert'
  ) THEN
    CREATE POLICY team_avatars_public_insert
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'team-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'team_avatars_public_update'
  ) THEN
    CREATE POLICY team_avatars_public_update
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'team-avatars')
      WITH CHECK (bucket_id = 'team-avatars');
  END IF;
END $$;
