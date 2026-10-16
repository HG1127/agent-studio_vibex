-- W6: DBA-only frozen content archive. This does NOT activate RAG.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage'
    OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
    OR session_user<>'agentstudio_admin' OR current_user<>'agentstudio_admin'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'refuse_nonisolated_pg17_admin';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_007') THEN
    RAISE EXCEPTION 'missing_W2_crosswalk';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_content_snapshots (
  source_snapshot_sha256 text PRIMARY KEY CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
  inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_sha256 text NOT NULL CHECK(mapping_sha256 ~ '^[0-9a-f]{64}$'),
  approved_mapping text NOT NULL CHECK(jsonb_typeof(approved_mapping::jsonb)='object'),
  document_count bigint NOT NULL CHECK(document_count>=0),
  chunk_count bigint NOT NULL CHECK(chunk_count>=0),
  vector_count bigint NOT NULL CHECK(vector_count>=0),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_document_archive (
  source_snapshot_sha256 text NOT NULL REFERENCES agentstudio.legacy_kb_content_snapshots,
  legacy_id text PRIMARY KEY,
  legacy_base_id text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users,
  target_base_id uuid NOT NULL,
  raw_payload text NOT NULL CHECK(jsonb_typeof(raw_payload::jsonb)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE(source_snapshot_sha256,legacy_id,legacy_base_id,owner_user_id,target_base_id),
  FOREIGN KEY(source_snapshot_sha256,legacy_base_id)
    REFERENCES agentstudio.legacy_knowledge_base_imports(source_snapshot_sha256,legacy_base_id),
  FOREIGN KEY(target_base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id)
);
CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_chunk_archive (
  source_snapshot_sha256 text NOT NULL REFERENCES agentstudio.legacy_kb_content_snapshots,
  legacy_id text PRIMARY KEY,
  legacy_base_id text NOT NULL,
  legacy_document_id text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users,
  target_base_id uuid NOT NULL,
  raw_payload text NOT NULL CHECK(jsonb_typeof(raw_payload::jsonb)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE(source_snapshot_sha256,legacy_id,legacy_base_id,legacy_document_id,owner_user_id,target_base_id),
  FOREIGN KEY(source_snapshot_sha256,legacy_document_id,legacy_base_id,owner_user_id,target_base_id)
    REFERENCES agentstudio.legacy_kb_document_archive(source_snapshot_sha256,legacy_id,legacy_base_id,owner_user_id,target_base_id)
);
CREATE TABLE IF NOT EXISTS agentstudio.legacy_kb_vector_archive (
  source_snapshot_sha256 text NOT NULL REFERENCES agentstudio.legacy_kb_content_snapshots,
  legacy_id text PRIMARY KEY, -- original chunk_id, never a fabricated vector ID
  legacy_base_id text NOT NULL,
  legacy_document_id text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users,
  target_base_id uuid NOT NULL,
  raw_payload text NOT NULL CHECK(jsonb_typeof(raw_payload::jsonb)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY(source_snapshot_sha256,legacy_id,legacy_base_id,legacy_document_id,owner_user_id,target_base_id)
    REFERENCES agentstudio.legacy_kb_chunk_archive(source_snapshot_sha256,legacy_id,legacy_base_id,legacy_document_id,owner_user_id,target_base_id)
);
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_kb_content() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,agentstudio AS $body$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'immutable_kb_archive'; END IF;
  IF session_user<>'agentstudio_admin' OR current_user<>'agentstudio_admin'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'kb_archive_DBA_only';
  END IF;
  IF TG_TABLE_NAME<>'legacy_kb_content_snapshots' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.legacy_knowledge_base_imports m
      WHERE m.source_snapshot_sha256=NEW.source_snapshot_sha256
        AND m.legacy_base_id=NEW.legacy_base_id AND m.owner_user_id=NEW.owner_user_id
        AND m.target_base_id=NEW.target_base_id) THEN
      RAISE EXCEPTION 'kb_archive_crosswalk_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_kb_content() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DO $protect$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legacy_kb_content_snapshots','legacy_kb_document_archive',
    'legacy_kb_chunk_archive','legacy_kb_vector_archive'] LOOP
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker',t);
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_kb_archive_row ON agentstudio.%I',t);
    EXECUTE format('CREATE TRIGGER guard_kb_archive_row BEFORE INSERT OR UPDATE OR DELETE ON agentstudio.%I FOR EACH ROW EXECUTE FUNCTION agentstudio.guard_legacy_kb_content()',t);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_kb_archive_truncate ON agentstudio.%I',t);
    EXECUTE format('CREATE TRIGGER guard_kb_archive_truncate BEFORE TRUNCATE ON agentstudio.%I FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.guard_legacy_kb_content()',t);
  END LOOP;
END $protect$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_010','W6 immutable Knowledge content archive; no RAG activation')
ON CONFLICT(version) DO NOTHING;
COMMIT;
