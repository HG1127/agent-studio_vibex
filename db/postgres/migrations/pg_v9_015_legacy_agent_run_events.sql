-- W24: isolated DBA evidence only; no runtime workflow/run/event insertion.
\set ON_ERROR_STOP on
BEGIN;
DO $safe$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
     session_user<>'agentstudio_admin' OR
     current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
     NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'agent_run_events_wrong_stage_database_or_version';
  END IF;
END
$safe$;
-- Parent evidence remains DBA-only; the complete review tuple is the FK target.
CREATE UNIQUE INDEX IF NOT EXISTS legacy_run_history_event_parent_uq
ON agentstudio.legacy_run_history(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,owner_user_id,source_table,legacy_id);
CREATE TABLE IF NOT EXISTS agentstudio.legacy_agent_run_events (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_table text NOT NULL CHECK(source_table='run_events'),
  legacy_id text NOT NULL CHECK(legacy_id ~ '^[A-Za-z0-9]{15}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  legacy_run_id text NOT NULL CHECK(legacy_run_id ~ '^[A-Za-z0-9]{15}$'),
  run_source_table text GENERATED ALWAYS AS ('agent_runs'::text) STORED,
  source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_status text NOT NULL DEFAULT 'historical_unverified' CHECK(evidence_status='historical_unverified'),
  executable boolean NOT NULL DEFAULT false CHECK(executable=false),
  model_execution_enabled boolean NOT NULL DEFAULT false CHECK(model_execution_enabled=false),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(source_table,legacy_id),
  FOREIGN KEY(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,owner_user_id,run_source_table,legacy_run_id)
    REFERENCES agentstudio.legacy_run_history(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,owner_user_id,source_table,legacy_id),
  CHECK(source_record ?& ARRAY['id','run_id','step_index','seq','event_type','content','created','updated']),
  CHECK((source_record - ARRAY['id','run_id','step_index','seq','event_type','content','created','updated'])='{}'::jsonb),
  CHECK(jsonb_typeof(source_record->'id')='string' AND source_record->>'id'=legacy_id),
  CHECK(jsonb_typeof(source_record->'run_id')='string' AND source_record->>'run_id'=legacy_run_id),
  CHECK(source_record->'content'='null'::jsonb OR
    (jsonb_typeof(source_record->'content')='string' AND
      (source_record->>'content') ~ E'^[ \t\r\n]*(null|\\{[ \t\r\n]*\\}|\\[[ \t\r\n]*\\])[ \t\r\n]*$'))
);
REVOKE ALL ON agentstudio.legacy_agent_run_events FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_agent_run_events FORCE ROW LEVEL SECURITY;
-- Deliberately no policies: even an accidental SELECT grant exposes no raw rows.
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_agent_run_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'legacy_agent_run_events_immutable';
END $$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_agent_run_events_immutable() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_agent_run_events_immutable ON agentstudio.legacy_agent_run_events;
CREATE TRIGGER legacy_agent_run_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON agentstudio.legacy_agent_run_events FOR EACH STATEMENT
EXECUTE FUNCTION agentstudio.guard_legacy_agent_run_events_immutable();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_015','DBA-only non-executable legacy Agent event evidence archive')
ON CONFLICT(version) DO NOTHING;
COMMIT;
