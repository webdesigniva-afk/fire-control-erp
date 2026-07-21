-- =============================================================
-- Warehouse module
-- Semi-automatic stock tracking for FireControl.
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL DEFAULT '',
  code        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warehouse_locations_name_not_blank CHECK (btrim(name) <> '')
);

ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS name       TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS code       TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE warehouse_locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_locations_name
  ON warehouse_locations (lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_locations_code
  ON warehouse_locations (lower(btrim(code)))
  WHERE btrim(code) <> '';

INSERT INTO warehouse_locations (name, code, sort_order)
VALUES
  ('Склад 1', 'warehouse-1', 10),
  ('Склад 2', 'warehouse-2', 20),
  ('Офис/сервиз', 'office-service', 30)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS warehouse_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT '',
  sku              TEXT NOT NULL DEFAULT '',
  unit             TEXT NOT NULL DEFAULT 'бр.',
  minimum_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warehouse_items_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT warehouse_items_minimum_non_negative CHECK (minimum_quantity >= 0)
);

ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS name             TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS category         TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS sku              TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS unit             TEXT NOT NULL DEFAULT 'бр.';
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS minimum_quantity NUMERIC(14,3) NOT NULL DEFAULT 0;
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS notes            TEXT NOT NULL DEFAULT '';
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_warehouse_items_category
  ON warehouse_items (category);

CREATE INDEX IF NOT EXISTS idx_warehouse_items_active_name
  ON warehouse_items (is_active, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_items_sku
  ON warehouse_items (lower(btrim(sku)))
  WHERE btrim(sku) <> '';

CREATE TABLE IF NOT EXISTS warehouse_stock (
  item_id     UUID NOT NULL REFERENCES warehouse_items(id),
  location_id UUID NOT NULL REFERENCES warehouse_locations(id),
  quantity    NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, location_id),
  CONSTRAINT warehouse_stock_quantity_non_negative CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_location
  ON warehouse_stock (location_id);

CREATE TABLE IF NOT EXISTS warehouse_movements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                UUID NOT NULL REFERENCES warehouse_items(id),
  movement_type          TEXT NOT NULL,
  quantity               NUMERIC(14,3) NOT NULL,
  from_location_id       UUID REFERENCES warehouse_locations(id),
  to_location_id         UUID REFERENCES warehouse_locations(id),
  protocol_id            UUID,
  protocol_number        TEXT NOT NULL DEFAULT '',
  object_id              TEXT NOT NULL DEFAULT '',
  object_name            TEXT NOT NULL DEFAULT '',
  performed_by           TEXT NOT NULL DEFAULT '',
  note                   TEXT NOT NULL DEFAULT '',
  reversal_of_movement_id UUID REFERENCES warehouse_movements(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT warehouse_movements_quantity_positive CHECK (quantity > 0),
  CONSTRAINT warehouse_movements_type_check CHECK (
    movement_type IN ('inbound', 'outbound', 'transfer', 'adjustment')
  )
);

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_item_created
  ON warehouse_movements (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_protocol
  ON warehouse_movements (protocol_number, created_at DESC)
  WHERE btrim(protocol_number) <> '';

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_object
  ON warehouse_movements (object_id, created_at DESC)
  WHERE btrim(object_id) <> '';

CREATE TABLE IF NOT EXISTS protocol_used_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id           UUID,
  protocol_number       TEXT NOT NULL DEFAULT '',
  object_id             TEXT NOT NULL DEFAULT '',
  object_name           TEXT NOT NULL DEFAULT '',
  warehouse_item_id     UUID NOT NULL REFERENCES warehouse_items(id),
  warehouse_location_id UUID NOT NULL REFERENCES warehouse_locations(id),
  quantity              NUMERIC(14,3) NOT NULL,
  note                  TEXT NOT NULL DEFAULT '',
  performed_by          TEXT NOT NULL DEFAULT '',
  deducted_movement_id  UUID REFERENCES warehouse_movements(id),
  void_movement_id      UUID REFERENCES warehouse_movements(id),
  voided_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT protocol_used_items_quantity_positive CHECK (quantity > 0)
);

ALTER TABLE protocol_used_items ADD COLUMN IF NOT EXISTS void_movement_id UUID REFERENCES warehouse_movements(id);
ALTER TABLE protocol_used_items ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_used_items_pending_identity
  ON protocol_used_items (
    protocol_number,
    warehouse_item_id,
    warehouse_location_id,
    COALESCE(note, '')
  )
  WHERE deducted_movement_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_protocol_used_items_protocol
  ON protocol_used_items (protocol_number, created_at);

ALTER TABLE warehouse_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_used_items DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'warehouse_locations',
    'warehouse_items',
    'warehouse_stock',
    'warehouse_movements',
    'protocol_used_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_public_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (TRUE)',
        table_name || '_public_read',
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_public_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (TRUE)',
        table_name || '_public_insert',
        table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_public_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE USING (TRUE) WITH CHECK (TRUE)',
        table_name || '_public_update',
        table_name
      );
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON warehouse_locations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON warehouse_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON warehouse_stock TO anon, authenticated;
GRANT SELECT, INSERT ON warehouse_movements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON protocol_used_items TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_warehouse_movement(
  p_item_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_from_location_id UUID DEFAULT NULL,
  p_to_location_id UUID DEFAULT NULL,
  p_protocol_id UUID DEFAULT NULL,
  p_protocol_number TEXT DEFAULT '',
  p_object_id TEXT DEFAULT '',
  p_object_name TEXT DEFAULT '',
  p_performed_by TEXT DEFAULT '',
  p_note TEXT DEFAULT '',
  p_reversal_of_movement_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_movement_id UUID;
  v_available NUMERIC(14,3);
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive.';
  END IF;

  IF p_movement_type NOT IN ('inbound', 'outbound', 'transfer', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid movement type.';
  END IF;

  IF p_movement_type = 'inbound' AND p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'Inbound movement requires target location.';
  END IF;

  IF p_movement_type = 'outbound' AND p_from_location_id IS NULL THEN
    RAISE EXCEPTION 'Outbound movement requires source location.';
  END IF;

  IF p_movement_type = 'transfer' THEN
    IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
      RAISE EXCEPTION 'Transfer requires source and target locations.';
    END IF;
    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'Transfer locations must be different.';
    END IF;
  END IF;

  IF p_movement_type = 'adjustment' AND btrim(COALESCE(p_note, '')) = '' THEN
    RAISE EXCEPTION 'Adjustment requires a note.';
  END IF;

  IF p_from_location_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (item_id, location_id, quantity)
    VALUES (p_item_id, p_from_location_id, 0)
    ON CONFLICT (item_id, location_id) DO NOTHING;

    SELECT quantity
      INTO v_available
      FROM warehouse_stock
     WHERE item_id = p_item_id
       AND location_id = p_from_location_id
     FOR UPDATE;

    IF v_available < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %.', v_available, p_quantity;
    END IF;

    UPDATE warehouse_stock
       SET quantity = quantity - p_quantity,
           updated_at = NOW()
     WHERE item_id = p_item_id
       AND location_id = p_from_location_id;
  END IF;

  IF p_to_location_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (item_id, location_id, quantity)
    VALUES (p_item_id, p_to_location_id, 0)
    ON CONFLICT (item_id, location_id) DO NOTHING;

    UPDATE warehouse_stock
       SET quantity = quantity + p_quantity,
           updated_at = NOW()
     WHERE item_id = p_item_id
       AND location_id = p_to_location_id;
  END IF;

  INSERT INTO warehouse_movements (
    item_id,
    movement_type,
    quantity,
    from_location_id,
    to_location_id,
    protocol_id,
    protocol_number,
    object_id,
    object_name,
    performed_by,
    note,
    reversal_of_movement_id
  )
  VALUES (
    p_item_id,
    p_movement_type,
    p_quantity,
    p_from_location_id,
    p_to_location_id,
    p_protocol_id,
    COALESCE(p_protocol_number, ''),
    COALESCE(p_object_id, ''),
    COALESCE(p_object_name, ''),
    COALESCE(p_performed_by, ''),
    COALESCE(p_note, ''),
    p_reversal_of_movement_id
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_protocol_used_item(
  p_protocol_id UUID,
  p_protocol_number TEXT,
  p_object_id TEXT,
  p_object_name TEXT,
  p_item_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_performed_by TEXT DEFAULT '',
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
  v_existing_used_item_id UUID;
  v_existing_quantity NUMERIC(14,3);
  v_used_item_id UUID;
  v_movement_id UUID;
  v_quantity_delta NUMERIC(14,3);
BEGIN
  IF btrim(COALESCE(p_protocol_number, '')) = '' THEN
    RAISE EXCEPTION 'Protocol number is required.';
  END IF;

  SELECT id, quantity, deducted_movement_id
    INTO v_existing_used_item_id, v_existing_quantity, v_existing_id
    FROM protocol_used_items
   WHERE protocol_number = p_protocol_number
     AND warehouse_item_id = p_item_id
     AND warehouse_location_id = p_location_id
     AND COALESCE(note, '') = COALESCE(p_note, '')
     AND deducted_movement_id IS NOT NULL
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_quantity_delta := p_quantity - v_existing_quantity;

    IF v_quantity_delta = 0 THEN
      RETURN v_existing_id;
    END IF;

    IF v_quantity_delta > 0 THEN
      v_movement_id := create_warehouse_movement(
        p_item_id,
        'outbound',
        v_quantity_delta,
        p_location_id,
        NULL,
        p_protocol_id,
        p_protocol_number,
        p_object_id,
        p_object_name,
        p_performed_by,
        COALESCE(NULLIF(p_note, ''), 'Корекция на използван артикул по протокол'),
        v_existing_id
      );
    ELSE
      v_movement_id := create_warehouse_movement(
        p_item_id,
        'inbound',
        abs(v_quantity_delta),
        NULL,
        p_location_id,
        p_protocol_id,
        p_protocol_number,
        p_object_id,
        p_object_name,
        p_performed_by,
        COALESCE(NULLIF(p_note, ''), 'Връщане при корекция на използван артикул по протокол'),
        v_existing_id
      );
    END IF;

    UPDATE protocol_used_items
       SET protocol_id = p_protocol_id,
           object_id = COALESCE(p_object_id, ''),
           object_name = COALESCE(p_object_name, ''),
           quantity = p_quantity,
           performed_by = COALESCE(p_performed_by, ''),
           deducted_movement_id = v_movement_id,
           updated_at = NOW()
     WHERE id = v_existing_used_item_id;

    RETURN v_movement_id;
  END IF;

  SELECT id
    INTO v_used_item_id
    FROM protocol_used_items
   WHERE protocol_number = p_protocol_number
     AND warehouse_item_id = p_item_id
     AND warehouse_location_id = p_location_id
     AND COALESCE(note, '') = COALESCE(p_note, '')
     AND deducted_movement_id IS NULL
   LIMIT 1;

  IF v_used_item_id IS NULL THEN
    INSERT INTO protocol_used_items (
      protocol_id,
      protocol_number,
      object_id,
      object_name,
      warehouse_item_id,
      warehouse_location_id,
      quantity,
      note,
      performed_by
    )
    VALUES (
      p_protocol_id,
      p_protocol_number,
      COALESCE(p_object_id, ''),
      COALESCE(p_object_name, ''),
      p_item_id,
      p_location_id,
      p_quantity,
      COALESCE(p_note, ''),
      COALESCE(p_performed_by, '')
    )
    RETURNING id INTO v_used_item_id;
  ELSE
    UPDATE protocol_used_items
       SET protocol_id = p_protocol_id,
           object_id = COALESCE(p_object_id, ''),
           object_name = COALESCE(p_object_name, ''),
           quantity = p_quantity,
           performed_by = COALESCE(p_performed_by, ''),
           updated_at = NOW()
     WHERE id = v_used_item_id;
  END IF;

  v_movement_id := create_warehouse_movement(
    p_item_id,
    'outbound',
    p_quantity,
    p_location_id,
    NULL,
    p_protocol_id,
    p_protocol_number,
    p_object_id,
    p_object_name,
    p_performed_by,
    COALESCE(NULLIF(p_note, ''), 'Изписване през протокол')
  );

  UPDATE protocol_used_items
     SET deducted_movement_id = v_movement_id,
         updated_at = NOW()
   WHERE id = v_used_item_id;

  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_protocol_used_item(
  p_used_item_id UUID,
  p_performed_by TEXT DEFAULT '',
  p_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row protocol_used_items%ROWTYPE;
  v_movement_id UUID;
BEGIN
  SELECT *
    INTO v_row
    FROM protocol_used_items
   WHERE id = p_used_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Used warehouse item was not found.';
  END IF;

  IF v_row.voided_at IS NOT NULL THEN
    RETURN v_row.void_movement_id;
  END IF;

  IF v_row.deducted_movement_id IS NULL THEN
    RAISE EXCEPTION 'Used warehouse item has not affected stock.';
  END IF;

  v_movement_id := create_warehouse_movement(
    v_row.warehouse_item_id,
    'inbound',
    v_row.quantity,
    NULL,
    v_row.warehouse_location_id,
    v_row.protocol_id,
    v_row.protocol_number,
    v_row.object_id,
    v_row.object_name,
    COALESCE(NULLIF(p_performed_by, ''), v_row.performed_by),
    COALESCE(NULLIF(p_note, ''), 'Връщане при премахнат използван артикул от протокол'),
    v_row.deducted_movement_id
  );

  UPDATE protocol_used_items
     SET voided_at = NOW(),
         void_movement_id = v_movement_id,
         updated_at = NOW()
   WHERE id = p_used_item_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_warehouse_movement(UUID, TEXT, NUMERIC, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_protocol_used_item(UUID, TEXT, TEXT, TEXT, UUID, UUID, NUMERIC, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION void_protocol_used_item(UUID, TEXT, TEXT) TO anon, authenticated;
