-- Unit price for the canonical services catalog.
-- Safe to re-run.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0;

UPDATE services
SET unit_price = 0
WHERE unit_price IS NULL;
