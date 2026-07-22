-- =============================================================
-- RLS access patch for CRM tables used directly by the browser app.
-- Safe to re-run in Supabase SQL editor.
--
-- Use this when RLS is enabled and data disappears from the UI because
-- anon/authenticated roles do not have matching policies yet.
--
-- This file intentionally prepares every browser-used CRM table with grants
-- and permissive CRUD policies, then enables RLS. The policies keep the
-- current browser-first CRM flows working while avoiding per-table RLS gaps.
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
    'app_settings',
    'clients',
    'locations',
    'location_services',
    'services',
    'projects',
    'protocols',
    'protocol_number_counter',
    'protocol_photos',
    'fire_extinguisher_sticker_counter',
    'protocol_fire_extinguisher_rows',
    'fire_extinguisher_service_history',
    'team_members',
    'sales_opportunities',
    'sales_opportunity_services',
    'sales_activity_logs',
    'crm_role_permissions',
    'crm_appearance',
    'client_portal_links',
    'client_portal_documents'
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
          AND policyname = table_name || '_rls_ready_read'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (TRUE)',
          table_name || '_rls_ready_read',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_rls_ready_insert'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (TRUE)',
          table_name || '_rls_ready_insert',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_rls_ready_update'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (TRUE) WITH CHECK (TRUE)',
          table_name || '_rls_ready_update',
          table_name
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_rls_ready_delete'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (TRUE)',
          table_name || '_rls_ready_delete',
          table_name
        );
      END IF;

      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
        table_name
      );
    END IF;
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.claim_fire_extinguisher_sticker_number()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.claim_fire_extinguisher_sticker_number() TO anon, authenticated;
  END IF;

  IF to_regprocedure('public.get_next_protocol_seq()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.get_next_protocol_seq() TO anon, authenticated;
  END IF;
END $$;

DO $$
DECLARE
  bucket_name TEXT;
  policy_prefix TEXT;
BEGIN
  FOREACH bucket_name IN ARRAY ARRAY[
    'protocol-photos',
    'team-avatars',
    'team-signatures'
  ]
  LOOP
    INSERT INTO storage.buckets (id, name, public)
    VALUES (bucket_name, bucket_name, TRUE)
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

    policy_prefix := replace(bucket_name, '-', '_') || '_rls_ready';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = policy_prefix || '_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = %L)',
        policy_prefix || '_read',
        bucket_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = policy_prefix || '_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = %L)',
        policy_prefix || '_insert',
        bucket_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = policy_prefix || '_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
        policy_prefix || '_update',
        bucket_name,
        bucket_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = policy_prefix || '_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = %L)',
        policy_prefix || '_delete',
        bucket_name
      );
    END IF;
  END LOOP;
END $$;
