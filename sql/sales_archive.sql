-- =============================================================
-- Sales Archive — Add soft-delete columns to sales_opportunities
-- Run this in the Supabase SQL editor
-- =============================================================

ALTER TABLE sales_opportunities
  ADD COLUMN IF NOT EXISTS archived         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason  TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS restored_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_opps_archived
  ON sales_opportunities(archived);
