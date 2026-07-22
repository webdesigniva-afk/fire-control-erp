-- =============================================================
-- Client portal foundation.
-- Safe to re-run in Supabase SQL editor.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS client_portal_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at     TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON client_portal_links TO anon, authenticated;

ALTER TABLE client_portal_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_links'
      AND policyname = 'client_portal_links_rls_ready_read'
  ) THEN
    CREATE POLICY client_portal_links_rls_ready_read
      ON client_portal_links FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_links'
      AND policyname = 'client_portal_links_rls_ready_insert'
  ) THEN
    CREATE POLICY client_portal_links_rls_ready_insert
      ON client_portal_links FOR INSERT
      TO anon, authenticated
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_links'
      AND policyname = 'client_portal_links_rls_ready_update'
  ) THEN
    CREATE POLICY client_portal_links_rls_ready_update
      ON client_portal_links FOR UPDATE
      TO anon, authenticated
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_links'
      AND policyname = 'client_portal_links_rls_ready_delete'
  ) THEN
    CREATE POLICY client_portal_links_rls_ready_delete
      ON client_portal_links FOR DELETE
      TO anon, authenticated
      USING (TRUE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_portal_links_client
  ON client_portal_links (client_id, active);

CREATE INDEX IF NOT EXISTS idx_client_portal_links_token_active
  ON client_portal_links (token)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS client_portal_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id       UUID REFERENCES locations(id) ON DELETE SET NULL,
  saved_document_id TEXT REFERENCES saved_documents(id) ON DELETE SET NULL,
  protocol_id       UUID REFERENCES protocols(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT '',
  title             TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'published',
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at         TIMESTAMPTZ,
  signed_by_name    TEXT NOT NULL DEFAULT '',
  signature_method  TEXT,
  signature_data_url TEXT NOT NULL DEFAULT '',
  published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at       TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_portal_documents_kind_check
    CHECK (kind IN ('offer', 'contract', 'protocol', 'other')),
  CONSTRAINT client_portal_documents_status_check
    CHECK (status IN ('published', 'viewed', 'sent_to_portal', 'signed', 'archived')),
  CONSTRAINT client_portal_documents_signature_method_check
    CHECK (signature_method IS NULL OR signature_method IN ('onsite', 'portal', 'paper'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON client_portal_documents TO anon, authenticated;

ALTER TABLE client_portal_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_documents'
      AND policyname = 'client_portal_documents_rls_ready_read'
  ) THEN
    CREATE POLICY client_portal_documents_rls_ready_read
      ON client_portal_documents FOR SELECT
      TO anon, authenticated
      USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_documents'
      AND policyname = 'client_portal_documents_rls_ready_insert'
  ) THEN
    CREATE POLICY client_portal_documents_rls_ready_insert
      ON client_portal_documents FOR INSERT
      TO anon, authenticated
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_documents'
      AND policyname = 'client_portal_documents_rls_ready_update'
  ) THEN
    CREATE POLICY client_portal_documents_rls_ready_update
      ON client_portal_documents FOR UPDATE
      TO anon, authenticated
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_documents'
      AND policyname = 'client_portal_documents_rls_ready_delete'
  ) THEN
    CREATE POLICY client_portal_documents_rls_ready_delete
      ON client_portal_documents FOR DELETE
      TO anon, authenticated
      USING (TRUE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_portal_documents_client
  ON client_portal_documents (client_id, archived_at, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_portal_documents_location
  ON client_portal_documents (location_id, published_at DESC)
  WHERE location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_portal_documents_saved_document
  ON client_portal_documents (client_id, saved_document_id)
  WHERE saved_document_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_portal_documents_protocol
  ON client_portal_documents (client_id, protocol_id)
  WHERE protocol_id IS NOT NULL;
