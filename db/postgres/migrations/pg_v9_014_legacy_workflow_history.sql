-- W22: isolated DBA evidence only; no runtime workflow/run/event insertion.
\set ON_ERROR_STOP on
BEGIN;
DO $safe$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
     session_user<>'agentstudio_admin' OR
     current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
     NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'workflow_history_wrong_stage_database_or_version';
  END IF;
END
$safe$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_workflow_history (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_table text NOT NULL CHECK(source_table IN ('workflow_runs','workflow_events')),
  legacy_id text NOT NULL CHECK(legacy_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  legacy_run_id text NOT NULL CHECK(legacy_run_id ~ '^[A-Za-z0-9]{15}$'),
  legacy_workflow_id text NOT NULL CHECK(legacy_workflow_id ~ '^[A-Za-z0-9]{15}$'),
  run_source_table text GENERATED ALWAYS AS ('workflow_runs'::text) STORED,
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_status text NOT NULL DEFAULT 'historical_unverified' CHECK(evidence_status='historical_unverified'),
  executable boolean NOT NULL DEFAULT false CHECK(executable=false),
  model_execution_enabled boolean NOT NULL DEFAULT false CHECK(model_execution_enabled=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(source_table,legacy_id),
  UNIQUE(source_snapshot_sha256,identity_mapping_sha256,owner_user_id,source_table,legacy_id,legacy_workflow_id),
  FOREIGN KEY(source_snapshot_sha256,identity_mapping_sha256,owner_user_id,run_source_table,legacy_run_id,legacy_workflow_id)
    REFERENCES agentstudio.legacy_workflow_history(source_snapshot_sha256,identity_mapping_sha256,owner_user_id,source_table,legacy_id,legacy_workflow_id),
  CHECK(source_record ? 'id' AND source_record->>'id' IS NOT NULL AND source_record->>'id'=legacy_id),
  CHECK((source_table='workflow_runs' AND legacy_run_id=legacy_id AND source_record->>'workflow_id'=legacy_workflow_id)
     OR (source_table='workflow_events' AND source_record->>'run_id'=legacy_run_id))
);
REVOKE ALL ON agentstudio.legacy_workflow_history FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_workflow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_workflow_history FORCE ROW LEVEL SECURITY;
-- Deliberately no policies: even an accidental SELECT grant exposes no raw rows.
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_workflow_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'legacy_workflow_history_immutable';
END $$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_workflow_history_immutable() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_workflow_history_immutable ON agentstudio.legacy_workflow_history;
CREATE TRIGGER legacy_workflow_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON agentstudio.legacy_workflow_history FOR EACH STATEMENT
EXECUTE FUNCTION agentstudio.guard_legacy_workflow_history_immutable();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_014','DBA-only non-executable legacy Workflow run/event evidence archive')
ON CONFLICT(version) DO NOTHING;
COMMIT;
