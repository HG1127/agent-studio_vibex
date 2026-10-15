-- W1 standalone incremental migration. Stage only; never enables execution.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
    current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'workflow_wrong_stage_database_or_version';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_005') THEN
    RAISE EXCEPTION 'workflow_missing_pg_v8_005';
  END IF;
END
$guard$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_workflow_imports (
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  legacy_workflow_id text NOT NULL UNIQUE CHECK(legacy_workflow_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_workflow_id uuid NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
  execution_enabled boolean NOT NULL DEFAULT false CHECK(execution_enabled=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_snapshot_sha256,legacy_workflow_id),
  FOREIGN KEY(target_workflow_id,owner_user_id) REFERENCES agentstudio.workflows(id,owner_user_id)
);
REVOKE ALL ON agentstudio.legacy_workflow_imports FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_workflow_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_workflow_imports FORCE ROW LEVEL SECURITY;
-- SECURITY DEFINER is needed to see the admin-only crosswalk under API RLS.
-- Fixed search_path and no dynamic SQL; function exposes no source content.
CREATE OR REPLACE FUNCTION agentstudio.block_legacy_workflow_execution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,agentstudio AS $block$
BEGIN
  IF NEW.workflow_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM agentstudio.legacy_workflow_imports WHERE target_workflow_id=NEW.workflow_id
  ) THEN RAISE EXCEPTION 'legacy_workflow_execution_disabled' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$block$;
REVOKE ALL ON FUNCTION agentstudio.block_legacy_workflow_execution() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_workflow_no_run ON agentstudio.runs;
CREATE TRIGGER legacy_workflow_no_run BEFORE INSERT OR UPDATE ON agentstudio.runs
FOR EACH ROW EXECUTE FUNCTION agentstudio.block_legacy_workflow_execution();
DROP TRIGGER IF EXISTS legacy_workflow_no_schedule ON agentstudio.schedules;
CREATE TRIGGER legacy_workflow_no_schedule BEFORE INSERT OR UPDATE ON agentstudio.schedules
FOR EACH ROW EXECUTE FUNCTION agentstudio.block_legacy_workflow_execution();
-- Imported rows stay immutable until a separately reviewed conversion exists.
CREATE OR REPLACE FUNCTION agentstudio.freeze_legacy_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,agentstudio AS $freeze$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.legacy_workflow_imports WHERE target_workflow_id=OLD.id)
  THEN RAISE EXCEPTION 'legacy_workflow_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$freeze$;
REVOKE ALL ON FUNCTION agentstudio.freeze_legacy_workflow() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_workflow_frozen ON agentstudio.workflows;
CREATE TRIGGER legacy_workflow_frozen BEFORE UPDATE OR DELETE ON agentstudio.workflows
FOR EACH ROW EXECUTE FUNCTION agentstudio.freeze_legacy_workflow();
CREATE OR REPLACE FUNCTION agentstudio.freeze_legacy_workflow_crosswalk()
RETURNS trigger LANGUAGE plpgsql AS $freeze$
BEGIN RAISE EXCEPTION 'legacy_workflow_crosswalk_immutable' USING ERRCODE='23514'; END
$freeze$;
REVOKE ALL ON FUNCTION agentstudio.freeze_legacy_workflow_crosswalk() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_workflow_crosswalk_frozen ON agentstudio.legacy_workflow_imports;
CREATE TRIGGER legacy_workflow_crosswalk_frozen BEFORE UPDATE OR DELETE ON agentstudio.legacy_workflow_imports
FOR EACH ROW EXECUTE FUNCTION agentstudio.freeze_legacy_workflow_crosswalk();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_006','Offline lossless Workflow skeleton import; immutable and execution disabled')
ON CONFLICT(version) DO NOTHING;
COMMIT;
