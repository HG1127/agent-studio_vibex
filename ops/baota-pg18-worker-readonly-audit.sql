-- BaoTa PG18 worker security inventory, READ-ONLY.
-- Run ONLY with psql -X -p 5333 -d agent_studio using the already
-- authorized postgres operator. No secrets or task bodies are selected.
-- This checks declared role GRANTS; it does NOT authenticate as the Worker
-- login and does NOT replace an eventual non-root Worker --preflight.
BEGIN READ ONLY;
WITH rels AS (
  SELECT
    max(c.oid) FILTER (WHERE n.nspname='agentstudio'
      AND c.relname='jobs') AS jobs,
    max(c.oid) FILTER (WHERE n.nspname='agentstudio'
      AND c.relname='external_effects') AS effects,
    max(c.oid) FILTER (WHERE n.nspname='agentstudio'
      AND c.relname='runs') AS runs,
    max(c.oid) FILTER (WHERE n.nspname='agentstudio'
      AND c.relname='agent_specs') AS specs,
    max(c.oid) FILTER (WHERE n.nspname='agentstudio_auth'
      AND c.relname='accounts') AS auth
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
), worker AS (
  SELECT rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreaterole
  FROM pg_catalog.pg_roles
  WHERE rolname='agentstudio_stage_worker'
), checks AS (
  SELECT 'database_is_agent_studio' AS check_name,
    current_database()='agent_studio' AS pass
  UNION ALL SELECT 'pg18_server_major',
    current_setting('server_version_num')::integer>=180000
    AND current_setting('server_version_num')::integer<190000
  UNION ALL SELECT 'postgresql_port_5333',
    current_setting('port')='5333'
  UNION ALL SELECT 'vector_extension_0_8_7',
    EXISTS (SELECT 1 FROM pg_extension
      WHERE extname='vector' AND extversion='0.8.7')
  UNION ALL SELECT 'worker_login_is_nonprivileged',
    COALESCE((SELECT rolcanlogin AND NOT rolsuper AND
      NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole
      FROM worker),false)
  UNION ALL SELECT 'worker_can_assume_queue_role',
    pg_has_role('agentstudio_stage_worker','agentstudio_worker','member')
  UNION ALL SELECT 'worker_can_assume_api_role',
    pg_has_role('agentstudio_stage_worker','agentstudio_api','member')
  UNION ALL SELECT 'worker_queue_metadata_select',
    has_table_privilege('agentstudio_worker',
      (SELECT jobs FROM rels),'SELECT')
  UNION ALL SELECT 'worker_queue_status_update',
    has_column_privilege('agentstudio_worker',
      (SELECT jobs FROM rels),'status','UPDATE')
  UNION ALL SELECT 'worker_external_effect_status_select',
    has_column_privilege('agentstudio_worker',
      (SELECT effects FROM rels),'status','SELECT')
  UNION ALL SELECT 'worker_cannot_read_run_instruction',
    NOT has_column_privilege('agentstudio_worker',
      (SELECT runs FROM rels),'instruction','SELECT')
  UNION ALL SELECT 'worker_cannot_read_agent_specs',
    NOT has_table_privilege('agentstudio_worker',
      (SELECT specs FROM rels),'SELECT')
  UNION ALL SELECT 'worker_cannot_read_auth_accounts',
    NOT has_table_privilege('agentstudio_worker',
      (SELECT auth FROM rels),'SELECT')
  UNION ALL SELECT 'worker_cannot_use_native_auth_schema',
    NOT has_schema_privilege('agentstudio_worker',
      'agentstudio_auth','USAGE')
  UNION ALL SELECT 'worker_cannot_assume_native_auth_role',
    NOT pg_has_role('agentstudio_stage_worker',
      'agentstudio_native_auth','member')
)
SELECT check_name,
  CASE WHEN pass IS TRUE THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks ORDER BY check_name;
ROLLBACK;
