-- W3: stage-only lossless admin quarantine; no jobs, history or effects replayed.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' OR session_user<>'agentstudio_admin' OR
    NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) OR
    current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'schedule_wrong_stage_database_or_version';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_006') THEN
    RAISE EXCEPTION 'schedule_missing_pg_v8_006';
  END IF;
END
$guard$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_schedule_imports (
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  legacy_schedule_id text NOT NULL UNIQUE CHECK(legacy_schedule_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_schedule_id uuid NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  projection_sha256 text NOT NULL CHECK(projection_sha256 ~ '^[a-f0-9]{64}$'),
  identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[a-f0-9]{64}$'),
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
  quarantine_only boolean NOT NULL DEFAULT true CHECK(quarantine_only=true),
  execution_enabled boolean NOT NULL DEFAULT false CHECK(execution_enabled=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_snapshot_sha256,legacy_schedule_id),
  FOREIGN KEY(target_schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id)
);
REVOKE ALL ON agentstudio.legacy_schedule_imports FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_schedule_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_schedule_imports FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION agentstudio.freeze_legacy_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,agentstudio AS $freeze$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.legacy_schedule_imports WHERE target_schedule_id=OLD.id)
  THEN RAISE EXCEPTION 'legacy_schedule_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$freeze$;
REVOKE ALL ON FUNCTION agentstudio.freeze_legacy_schedule() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_schedule_frozen ON agentstudio.schedules;
CREATE TRIGGER legacy_schedule_frozen BEFORE UPDATE OR DELETE ON agentstudio.schedules
FOR EACH ROW EXECUTE FUNCTION agentstudio.freeze_legacy_schedule();

CREATE OR REPLACE FUNCTION agentstudio.freeze_legacy_schedule_crosswalk()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,agentstudio AS $freeze$
DECLARE s agentstudio.schedules;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'legacy_schedule_crosswalk_immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM agentstudio.schedules WHERE id=NEW.target_schedule_id AND owner_user_id=NEW.owner_user_id;
  IF NOT FOUND OR s.enabled OR s.next_at IS NOT NULL OR
    s.recurrence<>'{"legacy_import":"quarantined","execution_supported":false}'::jsonb OR
    EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences WHERE schedule_id=s.id) THEN
    RAISE EXCEPTION 'legacy_schedule_not_quarantined' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$freeze$;
REVOKE ALL ON FUNCTION agentstudio.freeze_legacy_schedule_crosswalk() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_schedule_crosswalk_frozen ON agentstudio.legacy_schedule_imports;
CREATE TRIGGER legacy_schedule_crosswalk_frozen BEFORE INSERT OR UPDATE OR DELETE ON agentstudio.legacy_schedule_imports
FOR EACH ROW EXECUTE FUNCTION agentstudio.freeze_legacy_schedule_crosswalk();

CREATE OR REPLACE FUNCTION agentstudio.block_legacy_schedule_occurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,agentstudio AS $block$
BEGIN
  IF EXISTS(SELECT 1 FROM agentstudio.legacy_schedule_imports WHERE target_schedule_id=NEW.schedule_id)
  THEN RAISE EXCEPTION 'legacy_schedule_execution_disabled' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$block$;
REVOKE ALL ON FUNCTION agentstudio.block_legacy_schedule_occurrence() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_schedule_no_occurrence ON agentstudio.schedule_occurrences;
CREATE TRIGGER legacy_schedule_no_occurrence BEFORE INSERT OR UPDATE ON agentstudio.schedule_occurrences
FOR EACH ROW EXECUTE FUNCTION agentstudio.block_legacy_schedule_occurrence();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_008','Offline schedules: immutable disabled quarantine; history not replayed')
ON CONFLICT(version) DO NOTHING;
COMMIT;
