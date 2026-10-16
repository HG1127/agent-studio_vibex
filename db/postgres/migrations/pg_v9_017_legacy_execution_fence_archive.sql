-- W27. Audit evidence only. Never a lease, job, queue or external-effect ledger.
\set ON_ERROR_STOP on
BEGIN;
DO $safe$
BEGIN
  IF current_database()<>'agentstudio_stage' OR session_user<>'agentstudio_admin' OR
     current_user<>session_user OR
     current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
     NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'execution_fence_wrong_stage_database_or_version';
  END IF;
END
$safe$;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE agentstudio.jobs,agentstudio.runs,agentstudio.schedules IN EXCLUSIVE MODE;
DO $drained$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.jobs) OR
     EXISTS(SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused')) OR
     EXISTS(SELECT 1 FROM agentstudio.schedules WHERE enabled=true) THEN
    RAISE EXCEPTION 'execution_fence_stage_execution_not_drained';
  END IF;
  IF (SELECT count(*) FROM agentstudio.schema_migrations
      WHERE version IN ('pg_v8_011','pg_v8_012','pg_v9_014'))<>3 THEN
    RAISE EXCEPTION 'execution_fence_missing_parent_migration';
  END IF;
END
$drained$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_execution_fence_archive (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  source_review_sha256 text NOT NULL CHECK(source_review_sha256 ~ '^[a-f0-9]{64}$'),
  source_table text NOT NULL CHECK(source_table IN ('agent_studio_run_leases','agent_studio_side_effects')),
  kind text NOT NULL CHECK(kind IN ('agent','workflow')),
  legacy_run_id text NOT NULL CHECK(legacy_run_id ~ '^[A-Za-z0-9]{15}$'),
  step_key text NOT NULL CHECK(octet_length(step_key)<=256),
  legacy_owner_id text NOT NULL CHECK(legacy_owner_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  parent_payload_sha256 text NOT NULL CHECK(parent_payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object' AND octet_length(source_record::text)<=32768),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_status text NOT NULL DEFAULT 'historical_unverified' CHECK(evidence_status='historical_unverified'),
  executable boolean NOT NULL DEFAULT false CHECK(executable=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(source_table,kind,legacy_run_id,step_key),
  CHECK(source_record ?& ARRAY['kind','run_id'] AND
        source_record->>'kind' IS NOT NULL AND source_record->>'kind'=kind AND
        source_record->>'run_id' IS NOT NULL AND source_record->>'run_id'=legacy_run_id),
  CHECK((source_table='agent_studio_run_leases' AND step_key='') OR
        (source_table='agent_studio_side_effects' AND source_record ? 'step_key' AND
         source_record->>'step_key' IS NOT NULL AND source_record->>'step_key'=step_key))
);
REVOKE ALL ON agentstudio.legacy_execution_fence_archive FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_execution_fence_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_execution_fence_archive FORCE ROW LEVEL SECURITY;
-- No policies. Accidental SELECT grants still reveal zero rows to runtime roles.
CREATE OR REPLACE FUNCTION agentstudio.guard_execution_fence_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.legacy_user_imports m
      WHERE m.legacy_user_id=NEW.legacy_owner_id AND m.target_user_id=NEW.owner_user_id
        AND m.source_snapshot_sha256=NEW.source_snapshot_sha256
        AND m.reviewed_mapping_sha256=NEW.identity_mapping_sha256 AND m.active_automatically=false) THEN
    RAISE EXCEPTION 'execution_fence_identity_mismatch';
  END IF;
  IF NEW.kind='agent' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.legacy_run_history p
      WHERE p.legacy_id=NEW.legacy_run_id AND p.owner_user_id=NEW.owner_user_id
        AND p.source_table='agent_runs' AND p.source_record->>'id'=NEW.legacy_run_id
        AND p.source_record->>'rh_user_id'=NEW.legacy_owner_id
        AND p.source_snapshot_sha256=NEW.source_snapshot_sha256
        AND p.identity_mapping_sha256=NEW.identity_mapping_sha256
        AND p.manifest_sha256=NEW.manifest_sha256 AND p.payload_sha256=NEW.parent_payload_sha256) THEN
      RAISE EXCEPTION 'execution_fence_parent_mismatch';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM agentstudio.legacy_workflow_history p
      WHERE p.legacy_id=NEW.legacy_run_id AND p.owner_user_id=NEW.owner_user_id
        AND p.source_table='workflow_runs' AND p.source_record->>'id'=NEW.legacy_run_id
        AND p.source_record->>'rh_user_id'=NEW.legacy_owner_id
        AND p.source_snapshot_sha256=NEW.source_snapshot_sha256
        AND p.identity_mapping_sha256=NEW.identity_mapping_sha256
        AND p.manifest_sha256=NEW.manifest_sha256 AND p.payload_sha256=NEW.parent_payload_sha256) THEN
      RAISE EXCEPTION 'execution_fence_parent_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION agentstudio.guard_execution_fence_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'execution_fence_immutable';
END $$;
REVOKE ALL ON FUNCTION agentstudio.guard_execution_fence_parent(),agentstudio.guard_execution_fence_immutable()
  FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS execution_fence_parent ON agentstudio.legacy_execution_fence_archive;
CREATE TRIGGER execution_fence_parent BEFORE INSERT ON agentstudio.legacy_execution_fence_archive
FOR EACH ROW EXECUTE FUNCTION agentstudio.guard_execution_fence_parent();
DROP TRIGGER IF EXISTS execution_fence_immutable ON agentstudio.legacy_execution_fence_archive;
CREATE TRIGGER execution_fence_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON agentstudio.legacy_execution_fence_archive FOR EACH STATEMENT
EXECUTE FUNCTION agentstudio.guard_execution_fence_immutable();
DO $receipt$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_017'
      AND description<>'execution_fence_sql_sha256:e86d0fd6685c7c82e2ed67afa8e63869dd769b2178ab402e07e6cfcca8a401e1') THEN
    RAISE EXCEPTION 'execution_fence_sql_receipt_conflict';
  END IF;
END
$receipt$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_017','execution_fence_sql_sha256:e86d0fd6685c7c82e2ed67afa8e63869dd769b2178ab402e07e6cfcca8a401e1')
ON CONFLICT(version) DO NOTHING;
COMMIT;
