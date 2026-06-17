-- =============================================================
-- RLS access patch for CRM tables used directly by the browser app.
-- Safe to re-run in Supabase SQL editor.
--
-- Use this when RLS is enabled and data disappears from the UI because
-- anon/authenticated roles do not have matching policies yet.
-- =============================================================

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'service_tasks',
    'problems',
    'equipment',
    'saved_documents',
    'fire_extinguisher_sticker_counter',
    'protocol_fire_extinguisher_rows',
    'fire_extinguisher_service_history'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated',
        table_name
      );

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_public_read'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (TRUE)',
          table_name || '_public_read',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_public_insert'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (TRUE)',
          table_name || '_public_insert',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_public_update'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (TRUE) WITH CHECK (TRUE)',
          table_name || '_public_update',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_public_delete'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (TRUE)',
          table_name || '_public_delete',
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.claim_fire_extinguisher_sticker_number()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.claim_fire_extinguisher_sticker_number() TO anon, authenticated;
  END IF;
END $$;
