-- =============================================================
-- Stable QR code for each equipment record.
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.equipment
  ADD COLUMN IF NOT EXISTS equipment_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS equipment_qr_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS equipment_qr_printed_at TIMESTAMPTZ;

UPDATE public.equipment
SET equipment_qr_code = 'FC-EQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    equipment_qr_generated_at = COALESCE(equipment_qr_generated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE COALESCE(btrim(equipment_qr_code), '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS equipment_qr_code_stable_unique
  ON public.equipment (lower(btrim(equipment_qr_code)))
  WHERE COALESCE(btrim(equipment_qr_code), '') <> '';

CREATE INDEX IF NOT EXISTS idx_equipment_qr_code_lookup
  ON public.equipment (equipment_qr_code)
  WHERE COALESCE(btrim(equipment_qr_code), '') <> '';
