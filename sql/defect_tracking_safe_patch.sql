-- Safe patch for operational defect tracking.
-- Run this if database_first_storage.sql was copied before the latest fix.

ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS object_id              TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS description            TEXT NOT NULL DEFAULT '';
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS task_type              TEXT NOT NULL DEFAULT 'Планирано посещение';
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS activities             JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_protocol_id     TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_protocol_row    TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_protocol_type   TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS source_label           TEXT;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS recurrence_months      INTEGER;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS resolved_at            TIMESTAMPTZ;
ALTER TABLE service_tasks ADD COLUMN IF NOT EXISTS resolved_by            TEXT;

ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS extinguisher_category TEXT;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS extinguishing_agent_type TEXT;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS extinguishing_agent_trade_name TEXT;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS sticker_number INTEGER;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS sticker_generated_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS sticker_printed_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS last_service_date DATE;
ALTER TABLE IF EXISTS equipment ADD COLUMN IF NOT EXISTS next_service_date DATE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE service_tasks
SET object_id = COALESCE(NULLIF(object_id, ''), NULLIF(object_code, ''), NULLIF(object_name, '')),
    source_protocol_id = COALESCE(
      NULLIF(source_protocol_id, ''),
      NULLIF(source_protocol_number, ''),
      NULLIF(source_label, '')
    )
WHERE object_id IS NULL
   OR object_id = ''
   OR source_protocol_id IS NULL
   OR source_protocol_id = '';

DROP INDEX IF EXISTS uq_service_tasks_source_protocol;
DROP INDEX IF EXISTS uq_service_tasks_planned_protocol_row;
DROP INDEX IF EXISTS uq_service_tasks_planned_protocol_date;
DROP INDEX IF EXISTS uq_service_tasks_defect_protocol_row;

CREATE INDEX IF NOT EXISTS idx_service_tasks_planned_protocol_date
  ON service_tasks (object_id, source_protocol_id, task_type, due_date)
  WHERE status = 'planned'
    AND object_id IS NOT NULL
    AND object_id <> ''
    AND source_protocol_id IS NOT NULL
    AND source_protocol_id <> ''
    AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_tasks_defect_protocol_row
  ON service_tasks (source_protocol_id, source_protocol_row, task_type)
  WHERE task_type = 'defect'
    AND source_protocol_id IS NOT NULL
    AND source_protocol_id <> ''
    AND source_protocol_row IS NOT NULL
    AND source_protocol_row <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_extinguisher_sticker_number
  ON equipment (sticker_number)
  WHERE sticker_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS fire_extinguisher_sticker_counter (
  id       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_no  INTEGER NOT NULL DEFAULT 40000
);

INSERT INTO fire_extinguisher_sticker_counter (id, next_no)
VALUES (1, 40000)
ON CONFLICT (id) DO NOTHING;

UPDATE fire_extinguisher_sticker_counter
SET next_no = GREATEST(
  next_no,
  COALESCE((SELECT MAX(sticker_number) + 1 FROM equipment), 40000)
)
WHERE id = 1;

CREATE OR REPLACE FUNCTION claim_fire_extinguisher_sticker_number()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  claimed INTEGER;
BEGIN
  UPDATE fire_extinguisher_sticker_counter
  SET next_no = next_no + 1
  WHERE id = 1
  RETURNING next_no - 1 INTO claimed;

  IF claimed IS NULL THEN
    INSERT INTO fire_extinguisher_sticker_counter (id, next_no)
    VALUES (1, 40001)
    ON CONFLICT (id) DO UPDATE SET next_no = fire_extinguisher_sticker_counter.next_no + 1
    RETURNING next_no - 1 INTO claimed;
  END IF;

  RETURN GREATEST(claimed, 40000);
END;
$$;

CREATE TABLE IF NOT EXISTS protocol_fire_extinguisher_rows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_number      INTEGER NOT NULL,
  protocol_number     TEXT NOT NULL DEFAULT '',
  protocol_id         UUID,
  protocol_row_id     TEXT NOT NULL DEFAULT '',
  row_number          TEXT NOT NULL DEFAULT '',
  equipment_id        UUID,
  object_id           TEXT NOT NULL DEFAULT '',
  object_name         TEXT NOT NULL DEFAULT '',
  object_location     TEXT NOT NULL DEFAULT '',
  technician          TEXT NOT NULL DEFAULT '',
  service_date        DATE,
  next_service_date   DATE,
  extinguisher_type   TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT '',
  extinguishing_agent TEXT NOT NULL DEFAULT '',
  capacity_mass       TEXT NOT NULL DEFAULT '',
  brand               TEXT NOT NULL DEFAULT '',
  model               TEXT NOT NULL DEFAULT '',
  serial_number       TEXT NOT NULL DEFAULT '',
  company_settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE protocol_fire_extinguisher_rows DISABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_fire_extinguisher_rows_sticker_number
  ON protocol_fire_extinguisher_rows (sticker_number);

CREATE TABLE IF NOT EXISTS fire_extinguisher_service_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      UUID NOT NULL,
  object_id         TEXT NOT NULL DEFAULT '',
  protocol_id       UUID,
  protocol_number   TEXT NOT NULL DEFAULT '',
  sticker_number    INTEGER,
  service_type      TEXT NOT NULL DEFAULT '',
  service_date      DATE,
  next_service_date DATE,
  technician_id     TEXT NOT NULL DEFAULT '',
  technician        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fire_extinguisher_service_history DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fire_extinguisher_service_history_equipment
  ON fire_extinguisher_service_history (equipment_id, service_date DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fire_extinguisher_service_history_protocol_row
  ON fire_extinguisher_service_history (equipment_id, protocol_number, service_date)
  WHERE protocol_number <> '' AND service_date IS NOT NULL;
