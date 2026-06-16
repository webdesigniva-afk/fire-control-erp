-- =============================================================
-- Protocol Numbering System
-- Format: S{service_code}{year_short}-{DDMM}-{sequence}
-- Example: SA26-0805-4001
--
-- Run this in the Supabase SQL editor ONCE.
-- =============================================================

-- ----------------------------------------------------------------
-- 1. Global sequence counter (shared across all protocol types)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_number_counter (
  id            INT  PRIMARY KEY DEFAULT 1,
  next_seq      INT  NOT NULL    DEFAULT 4001,
  CONSTRAINT    single_row CHECK (id = 1)
);

-- Seed exactly one row
INSERT INTO protocol_number_counter (id, next_seq)
VALUES (1, 4001)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE protocol_number_counter DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2. Atomic "get and increment" RPC
--    Returns the sequence number to use, then advances the counter.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_next_protocol_seq()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  UPDATE protocol_number_counter
     SET next_seq = next_seq + 1
   WHERE id = 1
   RETURNING next_seq - 1 INTO v_seq;
  RETURN v_seq;
END;
$$;

-- ----------------------------------------------------------------
-- 3. protocols table — stores structured fields + formatted number
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocols (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Structured number components
  protocol_number  TEXT        NOT NULL,
  protocol_type    TEXT        NOT NULL,   -- 'subscription' | 'extinguisher' | 'service'
  service_code     TEXT        NOT NULL DEFAULT 'A',
  -- service_id: the localStorage id of the service center chosen at protocol creation
  service_id       TEXT,
  year_short       TEXT        NOT NULL,   -- e.g. '26'
  protocol_date    DATE        NOT NULL,
  protocol_sequence INTEGER    NOT NULL,

  -- Linked object / people
  location_id      UUID,                   -- FK to locations (soft, no cascade)
  object_code      TEXT        NOT NULL DEFAULT '',
  client_name      TEXT        NOT NULL DEFAULT '',
  object_name      TEXT        NOT NULL DEFAULT '',
  technician       TEXT        NOT NULL DEFAULT '',

  -- Lifecycle
  status           TEXT        NOT NULL DEFAULT 'draft',  -- 'draft' | 'completed'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_protocol_number UNIQUE (protocol_number)
);

ALTER TABLE protocols DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_protocols_type
  ON protocols (protocol_type);

CREATE INDEX IF NOT EXISTS idx_protocols_date
  ON protocols (protocol_date DESC);

CREATE INDEX IF NOT EXISTS idx_protocols_location
  ON protocols (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_protocols_status
  ON protocols (status);

-- ----------------------------------------------------------------
-- 5. Demo seed rows (only if table is empty)
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM protocols LIMIT 1) THEN

    -- Advance counter past the demo rows
    UPDATE protocol_number_counter SET next_seq = 4004 WHERE id = 1;

    INSERT INTO protocols
      (protocol_number, protocol_type, service_code, year_short,
       protocol_date, protocol_sequence,
       client_name, object_name, technician, status)
    VALUES
      ('SA26-1204-4001', 'subscription', 'A', '26',
       '2026-04-12', 4001,
       'Шумен Ритейл Груп АД', 'МОЛ Шумен', 'Иван Петров', 'completed'),

      ('SA26-1104-4002', 'extinguisher', 'A', '26',
       '2026-04-11', 4002,
       'Север Логистик ЕООД', 'Склад Север', 'Георги Димитров', 'completed'),

      ('SA26-1004-4003', 'service', 'A', '26',
       '2026-04-10', 4003,
       'Хотел Централ ООД', 'Хотел Централ', 'Николай Стоянов', 'draft');

  END IF;
END $$;
