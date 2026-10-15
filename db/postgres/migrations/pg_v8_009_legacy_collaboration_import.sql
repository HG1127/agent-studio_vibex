-- W5: immutable private historical archive, NEVER a live ACL source.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'agentstudio_stage' OR
    current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR
    session_user<>'agentstudio_admin' OR
    NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
    RAISE EXCEPTION 'wrong_stage_database_version_or_admin';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_005') OR
    NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v8_007') THEN
    RAISE EXCEPTION 'missing_resource_crosswalk_baseline';
  END IF;
END
$guard$;
CREATE TABLE IF NOT EXISTS agentstudio.legacy_collaboration_imports (
  source_table text NOT NULL CHECK(source_table IN ('agent_studio_spec_access',
    'agent_studio_kb_access','agent_studio_spec_proposals','agent_studio_kb_access_events',
    'agent_studio_spec_collab_audit','agent_studio_spec_revisions')),
  legacy_key text NOT NULL CHECK(legacy_key ~ '^[a-f0-9]{64}$'),
  source_snapshot_sha256 text NOT NULL CHECK(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  mapping_sha256 text NOT NULL CHECK(mapping_sha256 ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_spec_id uuid,
  target_base_id uuid,
  permissions_enabled boolean NOT NULL DEFAULT false CHECK(permissions_enabled=false),
  review_status text NOT NULL DEFAULT 'pending_manual_review' CHECK(review_status='pending_manual_review'),
  archive jsonb NOT NULL CHECK(jsonb_typeof(archive)='object'),
  archive_sha256 text NOT NULL CHECK(archive_sha256 ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_table,legacy_key),
  CHECK((target_spec_id IS NULL)<>(target_base_id IS NULL)),
  FOREIGN KEY(target_spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id),
  FOREIGN KEY(target_base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id)
);
REVOKE ALL ON agentstudio.legacy_collaboration_imports FROM PUBLIC,agentstudio_api,agentstudio_worker;
ALTER TABLE agentstudio.legacy_collaboration_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_collaboration_imports FORCE ROW LEVEL SECURITY;
-- No policy: even an accidental future SELECT grant cannot expose tenant data.
CREATE OR REPLACE FUNCTION agentstudio.reject_collaboration_archive_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $body$
BEGIN
  RAISE EXCEPTION 'collaboration_archive_immutable';
END
$body$;
REVOKE ALL ON FUNCTION agentstudio.reject_collaboration_archive_mutation() FROM PUBLIC,agentstudio_api,agentstudio_worker;
DROP TRIGGER IF EXISTS collaboration_archive_immutable ON agentstudio.legacy_collaboration_imports;
CREATE TRIGGER collaboration_archive_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON agentstudio.legacy_collaboration_imports FOR EACH STATEMENT
  EXECUTE FUNCTION agentstudio.reject_collaboration_archive_mutation();
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v8_009','Disabled admin-only legacy collaboration history archive; no RBAC activation')
ON CONFLICT(version) DO NOTHING;
COMMIT;
