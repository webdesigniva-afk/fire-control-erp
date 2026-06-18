-- =============================================================
-- Hotfix: app_settings RLS policies
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'app_settings_rls_ready_read'
  ) THEN
    CREATE POLICY app_settings_rls_ready_read
      ON public.app_settings FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'app_settings_rls_ready_insert'
  ) THEN
    CREATE POLICY app_settings_rls_ready_insert
      ON public.app_settings FOR INSERT
      TO anon, authenticated
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'app_settings_rls_ready_update'
  ) THEN
    CREATE POLICY app_settings_rls_ready_update
      ON public.app_settings FOR UPDATE
      TO anon, authenticated
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'app_settings_rls_ready_delete'
  ) THEN
    CREATE POLICY app_settings_rls_ready_delete
      ON public.app_settings FOR DELETE
      TO anon, authenticated
      USING (TRUE);
  END IF;
END $$;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
