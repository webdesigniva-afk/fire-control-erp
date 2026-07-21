-- Canonical services catalog.
-- Safe to re-run. Keeps existing links/history and archives non-canonical
-- service rows instead of deleting them.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES services(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_parent_id
  ON services(parent_id);

WITH canonical(name) AS (
  VALUES
    ('Техническо обслужване'),
    ('Презареждане'),
    ('Хидростатичен тест'),
    ('Годишна проверка на димо- и топлоотвеждащи люкове'),
    ('Периодична проверка на пожароизвестителна система'),
    ('Годишна проверка на пожарозащитни и димоуплътнени врати'),
    ('Проверка на аварийно евакуационно осветление'),
    ('Обслужване на вътрешни пожарни кранове (ВПК)')
)
INSERT INTO services (name, parent_id, archived_at)
SELECT canonical.name, NULL, NULL
FROM canonical
WHERE NOT EXISTS (
  SELECT 1
  FROM services
  WHERE lower(services.name) = lower(canonical.name)
);

WITH canonical(name) AS (
  VALUES
    ('Техническо обслужване'),
    ('Презареждане'),
    ('Хидростатичен тест'),
    ('Годишна проверка на димо- и топлоотвеждащи люкове'),
    ('Периодична проверка на пожароизвестителна система'),
    ('Годишна проверка на пожарозащитни и димоуплътнени врати'),
    ('Проверка на аварийно евакуационно осветление'),
    ('Обслужване на вътрешни пожарни кранове (ВПК)')
)
UPDATE services
SET archived_at = NOW()
WHERE archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM canonical
    WHERE lower(canonical.name) = lower(services.name)
  );

UPDATE services
SET archived_at = NULL
WHERE EXISTS (
  SELECT 1
  FROM (
    VALUES
      ('Техническо обслужване'),
      ('Презареждане'),
      ('Хидростатичен тест'),
      ('Годишна проверка на димо- и топлоотвеждащи люкове'),
      ('Периодична проверка на пожароизвестителна система'),
      ('Годишна проверка на пожарозащитни и димоуплътнени врати'),
      ('Проверка на аварийно евакуационно осветление'),
      ('Обслужване на вътрешни пожарни кранове (ВПК)')
  ) AS canonical(name)
  WHERE lower(canonical.name) = lower(services.name)
);

UPDATE app_settings
SET
  value = jsonb_set(
    value,
    '{extinguisherServiceTypes}',
    '["Техническо обслужване","Презареждане","Хидростатичен тест"]'::jsonb,
    TRUE
  ),
  updated_at = NOW()
WHERE key = 'firecontrol:settings:protocols';
