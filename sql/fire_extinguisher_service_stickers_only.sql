-- =============================================================
-- Fire extinguisher service stickers are valid only for
-- "Техническо обслужване".
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

ALTER TABLE IF EXISTS public.protocol_fire_extinguisher_rows
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT '';

WITH latest_sticker_history AS (
  SELECT DISTINCT ON (sticker_number)
    sticker_number,
    service_type
  FROM public.fire_extinguisher_service_history
  WHERE sticker_number IS NOT NULL
  ORDER BY sticker_number, service_date DESC NULLS LAST, created_at DESC
)
UPDATE public.protocol_fire_extinguisher_rows sticker_rows
SET service_type = latest_sticker_history.service_type,
    updated_at = NOW()
FROM latest_sticker_history
WHERE sticker_rows.sticker_number = latest_sticker_history.sticker_number
  AND COALESCE(BTRIM(sticker_rows.service_type), '') = '';

WITH invalid_stickers AS (
  SELECT DISTINCT sticker_number
  FROM public.fire_extinguisher_service_history
  WHERE sticker_number IS NOT NULL
    AND COALESCE(BTRIM(service_type), '') <> ''
    AND LOWER(service_type) NOT LIKE '%техническо обслужване%'
)
UPDATE public.equipment
SET sticker_number = NULL,
    sticker_generated_at = NULL,
    sticker_printed_at = NULL,
    updated_at = NOW()
WHERE sticker_number IN (SELECT sticker_number FROM invalid_stickers);

WITH invalid_stickers AS (
  SELECT DISTINCT sticker_number
  FROM public.fire_extinguisher_service_history
  WHERE sticker_number IS NOT NULL
    AND COALESCE(BTRIM(service_type), '') <> ''
    AND LOWER(service_type) NOT LIKE '%техническо обслужване%'
)
DELETE FROM public.protocol_fire_extinguisher_rows
WHERE sticker_number IN (SELECT sticker_number FROM invalid_stickers)
  AND COALESCE(BTRIM(service_type), '') <> ''
  AND LOWER(service_type) NOT LIKE '%техническо обслужване%';

UPDATE public.fire_extinguisher_service_history
SET sticker_number = NULL
WHERE sticker_number IS NOT NULL
  AND COALESCE(BTRIM(service_type), '') <> ''
  AND LOWER(service_type) NOT LIKE '%техническо обслужване%';
