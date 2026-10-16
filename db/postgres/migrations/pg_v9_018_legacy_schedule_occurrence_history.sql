-- W28: frozen, inert legacy schedule occurrence evidence.
-- NEVER import into agentstudio.schedule_occurrences/jobs/runs or reactivate locks.
\set ON_ERROR_STOP on
BEGIN;
DO $check$
BEGIN
 IF current_database()<>'agentstudio_stage' OR
    session_user<>'agentstudio_admin' OR
    NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) OR
    current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
   RAISE EXCEPTION 'occurrence_history_wrong_stage_database_or_version';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_008')
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_011') THEN
   RAISE EXCEPTION 'occurrence_history_dependencies_missing';
 END IF;
END
$check$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_schedule_occurrence_history (
 archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 identity_mapping_sha256 text NOT NULL CHECK(identity_mapping_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 legacy_occurrence_id text NOT NULL UNIQUE CHECK(legacy_occurrence_id ~ '^[A-Za-z0-9]{15}$'),
 legacy_schedule_id text NOT NULL CHECK(legacy_schedule_id ~ '^[A-Za-z0-9]{15}$'),
 legacy_run_id text NOT NULL CHECK(legacy_run_id ~ '^[A-Za-z0-9]{15}$'),
 owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 source_record jsonb NOT NULL CHECK(jsonb_typeof(source_record)='object'),
 evidence_status text NOT NULL DEFAULT 'historical_unverified' CHECK(evidence_status='historical_unverified'),
 execution_enabled boolean NOT NULL DEFAULT false CHECK(execution_enabled=false),
 lease_reactivated boolean NOT NULL DEFAULT false CHECK(lease_reactivated=false),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(source_snapshot_sha256,legacy_occurrence_id),
 CHECK(source_record->>'id'=legacy_occurrence_id AND
       source_record->>'schedule_id'=legacy_schedule_id AND
       source_record->>'run_id'=legacy_run_id)
);
REVOKE ALL ON agentstudio.legacy_schedule_occurrence_history FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_schedule_occurrence_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_schedule_occurrence_history FORCE ROW LEVEL SECURITY;
-- Deliberately no RLS policies. Even a mistaken GRANT does not expose history.
CREATE OR REPLACE FUNCTION agentstudio.guard_legacy_occurrence_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'legacy_occurrence_history_immutable';
END
$$;
REVOKE ALL ON FUNCTION agentstudio.guard_legacy_occurrence_history_immutable()
  FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS legacy_occurrence_history_immutable
  ON agentstudio.legacy_schedule_occurrence_history;
CREATE TRIGGER legacy_occurrence_history_immutable
 BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.legacy_schedule_occurrence_history
 FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.guard_legacy_occurrence_history_immutable();
INSERT INTO agentstudio.schema_migrations(version,description)
 VALUES('pg_v9_018','DBA-only immutable historical schedule occurrences; no execution replay')
 ON CONFLICT(version) DO NOTHING;
COMMIT;
