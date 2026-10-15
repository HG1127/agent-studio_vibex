-- V8.3: ONLY an approved, separately isolated agentstudio_stage database.
-- On an existing stage: backup first, then apply once with psql -v ON_ERROR_STOP=1.
-- Never apply against BaoTa/PocketBase/production databases.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' THEN
    RAISE EXCEPTION 'wrong_stage_database';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
    WHERE version='pg_v8_004') THEN
    RAISE EXCEPTION 'missing_pg_v8_004_baseline';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS agentstudio.legacy_agent_imports (
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_spec_id text NOT NULL UNIQUE
    CHECK(length(legacy_spec_id) BETWEEN 1 AND 64),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_spec_id uuid NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_snapshot_sha256,legacy_spec_id),
  FOREIGN KEY(target_spec_id,owner_user_id)
    REFERENCES agentstudio.agent_specs(id,owner_user_id)
);

-- Admin-only, not part of HTTP API or normal Worker grants. RLS deny-by-default
-- for everyone else, including the shared agentstudio_api and worker roles.
REVOKE ALL ON agentstudio.legacy_agent_imports FROM PUBLIC,
  agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_agent_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_agent_imports FORCE ROW LEVEL SECURITY;

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_005','Staging-only original Agent ID crosswalk, no automatic conversion')
ON CONFLICT(version) DO NOTHING;
COMMIT;
