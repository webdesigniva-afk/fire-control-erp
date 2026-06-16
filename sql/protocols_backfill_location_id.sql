-- =============================================================
-- Backfill location_id on existing protocols
--
-- Run once in the Supabase SQL editor.
-- Safe to re-run (updates only rows where location_id IS NULL).
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Protocols whose object_code matches a location's qr_code
--    (the normal case for protocols created via the UI)
-- ---------------------------------------------------------------
UPDATE protocols p
SET    location_id = l.id
FROM   locations l
WHERE  p.location_id IS NULL
  AND  p.object_code <> ''
  AND  l.qr_code = p.object_code;

-- ---------------------------------------------------------------
-- 2. Protocols whose object_code is actually the location UUID
--    (fallback: created when qr_code was empty, so the form
--    stored the UUID as object_code instead)
-- ---------------------------------------------------------------
UPDATE protocols p
SET    location_id  = l.id,
       object_code  = COALESCE(NULLIF(l.qr_code, ''), l.id::text)
FROM   locations l
WHERE  p.location_id IS NULL
  AND  p.object_code = l.id::text;

-- ---------------------------------------------------------------
-- 3. Verify — show any protocols still without a location link
-- ---------------------------------------------------------------
SELECT id, protocol_number, object_code, location_id
FROM   protocols
WHERE  location_id IS NULL
ORDER  BY created_at DESC;
