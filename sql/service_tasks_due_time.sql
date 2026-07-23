ALTER TABLE service_tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;

CREATE INDEX IF NOT EXISTS idx_service_tasks_due_date_time
  ON service_tasks (due_date, due_time);
