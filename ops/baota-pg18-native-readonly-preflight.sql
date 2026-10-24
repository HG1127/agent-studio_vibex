-- BASELINE-ONLY: 001 baseline before Native Auth.
-- Full019..043 runtime uses pg18-runtime-postcheck-cli.mjs with an explicit stage.
-- BaoTa PostgreSQL 18 Native Auth deployment PRE-FLIGHT ONLY.
-- Safe to run on agent_studio: SELECT-only; never alters vcaios, users or PG roles.
\set ON_ERROR_STOP on
\pset pager off
BEGIN READ ONLY;

SELECT
  current_database() AS target_database,
  session_user AS verified_login,
  current_setting('server_version') AS postgres_version,
  current_setting('port')::integer AS server_port,
  pg_is_in_recovery() AS standby;

SELECT
  (SELECT count(*) FROM pg_tables
   WHERE schemaname='agentstudio') AS baseline_tables,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='agentstudio' AND c.relkind='r'
     AND c.relrowsecurity AND c.relforcerowsecurity) AS baseline_force_rls,
  (SELECT extversion FROM pg_extension WHERE extname='vector') AS vector_version,
  (SELECT count(*) FROM pg_tables
   WHERE schemaname='agentstudio_auth') AS native_auth_tables,
  (SELECT count(*) FROM pg_roles
   WHERE rolname IN ('agentstudio_native_auth','agentstudio_native_login')) AS native_roles;

SELECT version
FROM agentstudio.schema_migrations
ORDER BY version;

SELECT
  CASE WHEN
    current_database()='agent_studio'
    AND session_user='postgres'
    AND current_setting('server_version_num')::integer >=180000
    AND current_setting('server_version_num')::integer <190000
    AND current_setting('port')::integer=5333
    AND NOT pg_is_in_recovery()
    AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio')=23
    AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='agentstudio' AND c.relkind='r'
           AND c.relrowsecurity AND c.relforcerowsecurity)=22
    AND (SELECT extversion FROM pg_extension WHERE extname='vector')='0.8.7'
    AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio_auth')=0
    AND (SELECT count(*) FROM pg_roles WHERE rolname IN
      ('agentstudio_native_auth','agentstudio_native_login'))=0
    AND (SELECT count(*) FROM agentstudio.schema_migrations)=3
    AND (SELECT count(*) FROM agentstudio.users)=0
  THEN 'READY_FOR_NATIVE_AUTH_SCHEMA_REVIEW'
  ELSE 'NO_GO_CHECK_BASELINE_DETAILS' END AS deployment_preflight;

ROLLBACK;
