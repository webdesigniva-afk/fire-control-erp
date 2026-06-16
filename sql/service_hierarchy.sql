-- ============================================================
-- Service hierarchy
-- Run once in Supabase SQL editor. Safe to re-run.
-- Adds main services and subservices in the existing services table.
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.services(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_parent_id
  ON public.services(parent_id);

DO $$
DECLARE
  fire_systems_id UUID;
BEGIN
  SELECT id
    INTO fire_systems_id
  FROM public.services
  WHERE parent_id IS NULL
    AND lower(name) = lower('Пожарогасителни системи')
  LIMIT 1;

  IF fire_systems_id IS NULL THEN
    INSERT INTO public.services (name, parent_id)
    VALUES ('Пожарогасителни системи', NULL)
    RETURNING id INTO fire_systems_id;
  END IF;

  INSERT INTO public.services (name, parent_id)
  SELECT service_name, fire_systems_id
  FROM (
    VALUES
      ('Водни и спринклерни системи'),
      ('Газови пожарогасителни системи'),
      ('Прахови и пенообразуващи системи'),
      ('Поддръжка и профилактика')
  ) AS defaults(service_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.services
    WHERE parent_id = fire_systems_id
      AND lower(name) = lower(defaults.service_name)
  );
END $$;
