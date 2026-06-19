-- =============================================================
-- Hotfix: app_settings RLS policies
-- Safe to re-run in Supabase SQL editor.
--
-- This table stores shared ERP settings/catalogs such as object
-- types, protocol settings, technicians and company settings.
-- The app writes these settings from the browser through the
-- Supabase anon/authenticated roles, so the table needs explicit
-- read/write RLS policies for both roles.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.app_settings',
      policy_record.policyname
    );
  END LOOP;
END $$;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_public_read
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (TRUE);

CREATE POLICY app_settings_public_insert
  ON public.app_settings FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY app_settings_public_update
  ON public.app_settings FOR UPDATE
  TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY app_settings_public_delete
  ON public.app_settings FOR DELETE
  TO anon, authenticated
  USING (TRUE);
