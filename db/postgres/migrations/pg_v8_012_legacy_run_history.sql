-- W8: DBA-only evidence, never an executable run or external-effect ledger.
\set ON_ERROR_STOP on
BEGIN;
DO $safe$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
     session_user<>'agentstudio_admin' OR
     current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
     NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'history_wrong_stage_database_or_version';
  END IF;
END
$safe$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_run_history (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_table text NOT NULL CHECK(source_table='agent_runs'),
  legacy_id text NOT NULL UNIQUE CHECK(legacy_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_status text NOT NULL DEFAULT 'historical_unverified' CHECK(evidence_status='historical_unverified'),
  executable boolean NOT NULL DEFAULT false CHECK(executable=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(source_snapshot_sha256,source_table,legacy_id)
);
REVOKE ALL ON agentstudio.legacy_run_history FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_run_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_run_history FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'legacy_history_immutable';
END $$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_history_immutable() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_history_immutable ON agentstudio.legacy_run_history;
CREATE TRIGGER legacy_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON agentstudio.legacy_run_history FOR EACH STATEMENT
EXECUTE FUNCTION agentstudio.guard_legacy_history_immutable();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_012','DBA-only unverified non-executable legacy Agent history archive')
ON CONFLICT(version) DO NOTHING;
COMMIT;
