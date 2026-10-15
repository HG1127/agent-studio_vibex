-- READ-ONLY check for the V8 disposable PostgreSQL stage only.
-- Connect as the staging administrator with psql -X -v ON_ERROR_STOP=1.
-- Uses no production data and never modifies any persistent table.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $checks$
DECLARE
  total_tables integer;
  secured_tables integer;
  policy_count integer;
  vector_present boolean;
  derived_migration_count integer;  unsafe_logins integer;
BEGIN
  IF current_database()<>'agentstudio_stage' THEN
    RAISE EXCEPTION 'refuse_wrong_stage_database';
  END IF;

  -- Domain importers own additive 006/007 SQL independently of the base.
  -- The verifier accepts either an old base-only stage or a correctly
  -- migrated stage, but never accepts a version ledger with missing tables.
  SELECT count(*) INTO derived_migration_count
  FROM agentstudio.schema_migrations
  WHERE version IN ('pg_v8_006','pg_v8_007','pg_v8_008');
  IF EXISTS (SELECT 1 FROM agentstudio.schema_migrations
     WHERE version='pg_v8_006') AND
     to_regclass('agentstudio.legacy_workflow_imports') IS NULL THEN
    RAISE EXCEPTION 'workflow_crosswalk_schema_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM agentstudio.schema_migrations
     WHERE version='pg_v8_007') AND
     to_regclass('agentstudio.legacy_knowledge_base_imports') IS NULL THEN
    RAISE EXCEPTION 'kb_crosswalk_schema_missing';
  END IF;

  IF EXISTS (SELECT 1 FROM agentstudio.schema_migrations
    WHERE version='pg_v8_008') AND
    to_regclass('agentstudio.legacy_schedule_imports') IS NULL THEN
    RAISE EXCEPTION 'schedule_crosswalk_schema_missing';
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')
    INTO vector_present;
  IF NOT vector_present THEN RAISE EXCEPTION 'pgvector_extension_missing'; END IF;

  SELECT count(*) INTO total_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='agentstudio' AND c.relkind='r';
  IF total_tables<>(20+derived_migration_count) THEN RAISE EXCEPTION
    'staging_table_count_mismatch: %',total_tables; END IF;

  SELECT count(*) INTO secured_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='agentstudio' AND c.relkind='r'
    AND c.relrowsecurity=true AND c.relforcerowsecurity=true;
  IF secured_tables<>(19+derived_migration_count) THEN RAISE EXCEPTION
    'staging_forced_rls_count_mismatch: %',secured_tables; END IF;

  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname='agentstudio';
  IF policy_count<>22 THEN RAISE EXCEPTION
    'staging_policy_count_mismatch: %',policy_count; END IF;

  SELECT count(*) INTO unsafe_logins FROM pg_roles
  WHERE rolname IN ('agentstudio_api','agentstudio_worker') AND rolcanlogin=true;
  IF unsafe_logins<>0 THEN RAISE EXCEPTION
    'service_group_roles_must_not_login: %',unsafe_logins; END IF;

  RAISE NOTICE
    'V8_STAGING_READONLY_CHECK_PASSED: tables=%, forced_rls=%, policies=%, migration_modules=%',
    total_tables,secured_tables,policy_count,derived_migration_count;
END
$checks$;
SELECT version,applied_at FROM agentstudio.schema_migrations ORDER BY version;
COMMIT;
