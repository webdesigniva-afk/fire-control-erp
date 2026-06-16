-- =============================================================
-- Settings refactor support
-- Safe to re-run in Supabase SQL editor.
-- Preserves existing app_settings and protocol catalog values.
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_services_archived_at
  ON services (archived_at);

INSERT INTO app_settings (key, value, updated_at)
VALUES
  (
    'firecontrol:settings:technicians',
    '[
      {"id":"tech-1","name":"Иван Петров","role":"Сервизен техник","phone":"","email":"","active":true},
      {"id":"tech-2","name":"Георги Димитров","role":"Сервизен техник","phone":"","email":"","active":true},
      {"id":"tech-3","name":"Николай Стоянов","role":"Сервизен техник","phone":"","email":"","active":true}
    ]'::jsonb,
    NOW()
  ),
  (
    'firecontrol:settings:service-centers',
    '[
      {"id":"service-center-1","name":"A","manager":"","phone":"","email":"","address":"","active":true},
      {"id":"service-center-2","name":"B","manager":"","phone":"","email":"","address":"","active":true},
      {"id":"service-center-3","name":"C","manager":"","phone":"","email":"","address":"","active":true}
    ]'::jsonb,
    NOW()
  ),
  (
    'firecontrol:settings:protocols',
    '{
      "protocolPrefix":"PR",
      "defaultTechnician":"Иван Петров",
      "defaultSystemStatus":"Изрядна",
      "nextVisitDays":"30",
      "extinguisherBrands":["FlammStop","Gloria","Bavaria"],
      "extinguisherModels":["ABC 6 kg","CO2 5 kg","Пяна 6 l"],
      "extinguisherCategories":["Прахов","Въглероден диоксид","Пенен","Воден"],
      "extinguisherChargeMasses":["2","5","6","9","12"],
      "extinguishingAgentTypes":["прах","CO2","пяна","вода"],
      "extinguishingAgentTradeNames":["ABC 40","AFFF"],
      "extinguisherServiceTypes":["техническо обслужване","презареждане","хидростатично изпитване на устойчивост на налягане"],
      "serviceSystemStatuses":["Изрядна","С отклонения","Неизправна"],
      "archivedCatalogValues":{}
    }'::jsonb,
    NOW()
  ),
  (
    'firecontrol:settings:company',
    '{"companyName":"Пожарен Контрол ЕООД","bulstat":"206 094 193","address":"гр. Шумен, ул. Владайско въстание 152","phone":"0896 089 991","email":"office@firecontrol.bg","manager":"","logoUrl":""}'::jsonb,
    NOW()
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO services (name)
SELECT service_name
FROM (
  VALUES
    ('Абонаментно обслужване'),
    ('Пожарогасители'),
    ('Пожароизвестяване'),
    ('Аварийно осветление')
) AS defaults(service_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM services
  WHERE lower(services.name) = lower(defaults.service_name)
);
