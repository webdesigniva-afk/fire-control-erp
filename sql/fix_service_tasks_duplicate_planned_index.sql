-- Fix for duplicate planned service tasks blocking older migrations.
-- Run this when Supabase reports:
-- could not create unique index "uq_service_tasks_planned_protocol_date"

DROP INDEX IF EXISTS uq_service_tasks_planned_protocol_date;

CREATE INDEX IF NOT EXISTS idx_service_tasks_planned_protocol_date
  ON service_tasks (object_id, source_protocol_id, task_type, due_date)
  WHERE status = 'planned'
    AND object_id IS NOT NULL
    AND object_id <> ''
    AND source_protocol_id IS NOT NULL
    AND source_protocol_id <> ''
    AND due_date IS NOT NULL;
