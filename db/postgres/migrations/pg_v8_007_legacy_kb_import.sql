-- V8.4 W2: opt-in STAGE-only legacy knowledge-base ID mapping.
-- Existing isolated stage requires pg_v8_005 and a reviewed backup.
-- No normal API/Worker grants; no documents, vectors or ACL copied.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' THEN
    RAISE EXCEPTION 'wrong_stage_database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM agentstudio.schema_migrations
    WHERE version='pg_v8_005') THEN
    RAISE EXCEPTION 'missing_stage_agent_crosswalk_baseline';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS agentstudio.legacy_knowledge_base_imports (
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_base_id text NOT NULL UNIQUE CHECK(length(legacy_base_id) BETWEEN 1 AND 64),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_base_id uuid NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_snapshot_sha256,legacy_base_id),
  FOREIGN KEY(target_base_id,owner_user_id)
    REFERENCES agentstudio.knowledge_bases(id,owner_user_id)
);
REVOKE ALL ON agentstudio.legacy_knowledge_base_imports
  FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_knowledge_base_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_knowledge_base_imports FORCE ROW LEVEL SECURITY;

INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v8_007','Staging-only knowledge-base metadata ID crosswalk')
  ON CONFLICT(version) DO NOTHING;
COMMIT;
