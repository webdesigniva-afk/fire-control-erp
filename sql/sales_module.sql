-- =============================================================
-- Sales Module — Tables + Seed Data
-- Run this in the Supabase SQL editor
-- =============================================================

-- ----------------------------------------------------------------
-- 1. sales_opportunities
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL DEFAULT '',
  contact_name        TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  object_type         TEXT NOT NULL DEFAULT '',
  object_name         TEXT NOT NULL DEFAULT '',
  object_address      TEXT NOT NULL DEFAULT '',
  stage               TEXT NOT NULL DEFAULT 'lead',
  status              TEXT NOT NULL DEFAULT 'Нов',
  next_action         TEXT NOT NULL DEFAULT '',
  next_action_date    DATE,
  notes               TEXT NOT NULL DEFAULT '',
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_to_service BOOLEAN NOT NULL DEFAULT FALSE,
  converted_client_id UUID,
  converted_object_id UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales_opportunities DISABLE ROW LEVEL SECURITY;

ALTER TABLE sales_opportunities
  ADD COLUMN IF NOT EXISTS object_type TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------
-- 2. sales_opportunity_services
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_opportunity_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  service_category TEXT NOT NULL DEFAULT '',
  service_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales_opportunity_services DISABLE ROW LEVEL SECURITY;

ALTER TABLE sales_opportunity_services
  ADD COLUMN IF NOT EXISTS service_category TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------
-- 3. sales_activity_logs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'note',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales_activity_logs DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_opps_stage
  ON sales_opportunities(stage);

CREATE INDEX IF NOT EXISTS idx_sales_opps_last_activity
  ON sales_opportunities(last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_opp_services_opp_id
  ON sales_opportunity_services(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_opp_id
  ON sales_activity_logs(opportunity_id);

UPDATE locations AS location
SET object_type = opportunity.object_type
FROM sales_opportunities AS opportunity
WHERE opportunity.converted_object_id = location.id
  AND COALESCE(location.object_type, '') = ''
  AND COALESCE(opportunity.object_type, '') <> '';

-- ----------------------------------------------------------------
-- Seed data (only if the table is empty)
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_id1 UUID := 'a1b2c3d4-1001-0000-0000-000000000001';
  v_id2 UUID := 'a1b2c3d4-1001-0000-0000-000000000002';
  v_id3 UUID := 'a1b2c3d4-1001-0000-0000-000000000003';
  v_id4 UUID := 'a1b2c3d4-1001-0000-0000-000000000004';
  v_id5 UUID := 'a1b2c3d4-1001-0000-0000-000000000005';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_opportunities LIMIT 1) THEN

    -- Opportunities
    INSERT INTO sales_opportunities
      (id, company_name, contact_name, phone, email, object_name, object_address,
       stage, status, next_action, last_activity_at, notes)
    VALUES
      (v_id1,
       'Алфа Ритейл ООД', 'Мария Стоянова', '+359 88 456 1020', 'office@alfa-retail.bg',
       'Нов търговски обект', 'гр. Шумен, бул. Мадара 12',
       'lead', 'Нов', 'Обаждане',
       NOW() - INTERVAL '2 days',
       'Клиентът търси абонаментна поддръжка и първоначален оглед.'),

      (v_id2,
       'Хотел Панорама', 'Елена Георгиева', '+359 88 721 3050', 'office@hotel-panorama.bg',
       'Хотел Панорама', 'гр. Шумен, ул. Цар Освободител 5',
       'lead', 'В контакт', 'Изпращане на оферта',
       NOW() - INTERVAL '18 hours',
       'Интерес към пожароизвестителна система и план за евакуация.'),

      (v_id3,
       'Шумен Ритейл Груп АД', 'Мария Георгиева', '+359 88 700 1234', 'm.georgieva@shumen-retail.bg',
       'МОЛ Шумен', 'бул. Симеон Велики 46, 9700 Шумен',
       'offer', 'Изпратена оферта', 'Потвърждение от клиент',
       NOW() - INTERVAL '1 day',
       'Офертата е изпратена. Очаква се потвърждение от клиента.'),

      (v_id4,
       'Централ Хотелс ООД', 'Анелия Димитрова', '+359 88 720 3072', 'office@central-hotels.bg',
       'Хотел Централ', 'ул. Оборище 8, 9700 Шумен',
       'order', 'Потвърден', 'Подписване на договор',
       NOW() - INTERVAL '3 hours',
       'Приета оферта. Следва подготовка на договор за обслужване.'),

      (v_id5,
       'Север Логистик ЕООД', 'Петър Стоянов', '+359 88 630 2100', 'office@sever-logistic.bg',
       'Склад Север', 'гр. Шумен, Промишлена зона Запад',
       'contract', 'Потвърден', 'Стартиране на обслужване',
       NOW() - INTERVAL '5 days',
       'Активен договор. Следва планиране на първо сервизно посещение.');

    -- Services
    INSERT INTO sales_opportunity_services (opportunity_id, service_name) VALUES
      (v_id1, 'Абонаментно обслужване'),
      (v_id1, 'Технически преглед'),
      (v_id2, 'Пожароизвестителна система'),
      (v_id2, 'Евакуационни планове'),
      (v_id3, 'Абонаментно обслужване'),
      (v_id3, 'Пожарогасители'),
      (v_id3, 'QR етикети'),
      (v_id4, 'Пожароизвестителна система'),
      (v_id4, 'Аварийно осветление'),
      (v_id4, 'Абонаментно обслужване'),
      (v_id5, 'Пожарогасители'),
      (v_id5, 'Аварийно осветление');

    -- Activity logs
    INSERT INTO sales_activity_logs (opportunity_id, type, title, description, created_at) VALUES
      (v_id1, 'created',      'Лийд създаден',         'Нов запис добавен от входящо запитване.',                 NOW() - INTERVAL '2 days'),

      (v_id2, 'created',      'Лийд създаден',         'Нов запис добавен от входящо запитване.',                 NOW() - INTERVAL '3 days'),
      (v_id2, 'note',         'Проведен разговор',      'Потвърден интерес. Очаква се изпращане на оферта.',       NOW() - INTERVAL '18 hours'),

      (v_id3, 'created',      'Лийд създаден',         'Нов запис добавен от входящо запитване.',                 NOW() - INTERVAL '5 days'),
      (v_id3, 'stage_change', 'Преминаване към оферта', 'Изготвена е оферта за клиента.',                         NOW() - INTERVAL '1 day'),

      (v_id4, 'created',      'Лийд създаден',         'Нов запис добавен от входящо запитване.',                 NOW() - INTERVAL '10 days'),
      (v_id4, 'stage_change', 'Преминаване към оферта', 'Офертата е изпратена.',                                  NOW() - INTERVAL '5 days'),
      (v_id4, 'stage_change', 'Оферта приета',          'Клиентът потвърди офертата. Преминаване към поръчка.',   NOW() - INTERVAL '3 hours'),

      (v_id5, 'created',      'Лийд създаден',         'Нов запис добавен от входящо запитване.',                 NOW() - INTERVAL '20 days'),
      (v_id5, 'stage_change', 'Преминаване към оферта', 'Офертата е изпратена.',                                  NOW() - INTERVAL '15 days'),
      (v_id5, 'stage_change', 'Преминаване към поръчка','Офертата е приета.',                                     NOW() - INTERVAL '10 days'),
      (v_id5, 'stage_change', 'Договор подписан',       'Клиентът подписа договор за абонаментно обслужване.',    NOW() - INTERVAL '5 days');

  END IF;
END $$;
