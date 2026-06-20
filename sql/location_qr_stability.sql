-- =============================================================
-- Stable object QR codes.
-- Safe to re-run in Supabase SQL editor.
--
-- Ensures every location has a persisted qr_code and prevents future
-- duplicates, so printed QR labels keep pointing to one object.
-- =============================================================

ALTER TABLE IF EXISTS public.locations
  ADD COLUMN IF NOT EXISTS qr_code TEXT;

UPDATE public.locations
SET qr_code = 'OBJ-' || upper(substr(md5(id::text), 1, 10))
WHERE COALESCE(NULLIF(trim(qr_code), ''), '') = '';

WITH duplicate_codes AS (
  SELECT
    id,
    qr_code,
    row_number() OVER (
      PARTITION BY lower(trim(qr_code))
      ORDER BY id
    ) AS duplicate_index
  FROM public.locations
  WHERE COALESCE(NULLIF(trim(qr_code), ''), '') <> ''
),
renumbered AS (
  SELECT
    id,
    'OBJ-' || upper(substr(md5(id::text), 1, 10)) AS next_qr_code
  FROM duplicate_codes
  WHERE duplicate_index > 1
)
UPDATE public.locations AS locations
SET qr_code = renumbered.next_qr_code
FROM renumbered
WHERE locations.id = renumbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS locations_qr_code_stable_unique
  ON public.locations (lower(trim(qr_code)))
  WHERE COALESCE(NULLIF(trim(qr_code), ''), '') <> '';
