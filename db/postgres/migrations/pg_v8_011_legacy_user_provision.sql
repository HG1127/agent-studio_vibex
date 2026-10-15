-- V8.5: stage-only, DISABLED employee OIDC preprovision crosswalk.
-- Operators must independently verify OIDC subject ownership; this schema
-- does NOT authenticate anyone and cannot activate a migrated identity.
\set ON_ERROR_STOP on
BEGIN;
DO $safe$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
     current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
     session_user<>'agentstudio_admin' OR
     NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'refuse_nonisolated_user_provision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM agentstudio.schema_migrations
    WHERE version='pg_v8_005') THEN
    RAISE EXCEPTION 'missing_stage_id_crosswalk_baseline';
  END IF;
END
$safe$;

CREATE TABLE IF NOT EXISTS agentstudio.legacy_user_imports (
  source_snapshot_sha256 text NOT NULL
    CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_user_id text NOT NULL UNIQUE
    CHECK(length(legacy_user_id) BETWEEN 1 AND 120),
  target_user_id uuid NOT NULL UNIQUE REFERENCES agentstudio.users(id),
  reviewed_mapping_sha256 text NOT NULL
    CHECK(reviewed_mapping_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_idp_sha256 text NOT NULL
    CHECK(reviewed_idp_sha256 ~ '^[0-9a-f]{64}$'),
  identity_row_sha256 text NOT NULL
    CHECK(identity_row_sha256 ~ '^[0-9a-f]{64}$'),
  active_automatically boolean NOT NULL DEFAULT false
    CHECK(active_automatically=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_snapshot_sha256, legacy_user_id)
);
REVOKE ALL ON agentstudio.legacy_user_imports
  FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_user_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_user_imports FORCE ROW LEVEL SECURITY;

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_011','Stage-only preprovision disabled employee OIDC references; no login granted')
ON CONFLICT(version) DO NOTHING;
COMMIT;
