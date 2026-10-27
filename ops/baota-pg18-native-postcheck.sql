-- BASELINE-ONLY: 001 plus010 schema before Native login activation.
-- Full019..043 runtime uses pg18-runtime-postcheck-cli.mjs with an explicit stage.
-- BaoTa PostgreSQL 18 — Native Auth SCHEMA POST-CHECK, READ ONLY.
-- Run ONLY after an approved 010 migration on agent_studio:5333.
-- This does NOT enable login, read sensitive hashes, start HTTP, or modify roles.
\set ON_ERROR_STOP on
\pset pager off
BEGIN READ ONLY;

SELECT current_database() AS database_name,
       session_user AS session_role,
       current_setting('server_version') AS postgres_version,
       current_setting('port')::integer AS instance_port;

SELECT schemaname,count(*)::int AS table_count
FROM pg_tables
WHERE schemaname IN ('agentstudio','agentstudio_auth')
GROUP BY schemaname
ORDER BY schemaname;

SELECT n.nspname AS schema_name,count(*)::int AS force_rls_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('agentstudio','agentstudio_auth')
  AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
GROUP BY n.nspname
ORDER BY n.nspname;

SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb
FROM pg_roles
WHERE rolname IN ('agentstudio_native_auth','agentstudio_native_login')
ORDER BY rolname;

SELECT version FROM agentstudio.schema_migrations ORDER BY version;

SELECT CASE WHEN
  current_database()='agent_studio'
  AND session_user='postgres'
  AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999
  AND current_setting('port')::integer=5333
  AND NOT pg_is_in_recovery()
  AND (SELECT extversion FROM pg_extension WHERE extname='vector')='0.8.7'
  AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio')=23
  AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio_auth')=2
  AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='agentstudio' AND c.relkind='r'
         AND c.relrowsecurity AND c.relforcerowsecurity)=22
  AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='agentstudio_auth' AND c.relkind='r'
         AND c.relrowsecurity AND c.relforcerowsecurity)=2
  AND (SELECT count(*) FROM agentstudio.schema_migrations)=4
  AND (SELECT count(*) FROM agentstudio.schema_migrations WHERE version IN
      ('pg_v8_001','pg_v8_004','pg_v8_005','pg18_native_auth_001'))=4
  AND (SELECT count(*) FROM agentstudio.users)=0
  AND (SELECT count(*) FROM agentstudio.jobs)=0
  AND (SELECT count(*) FROM pg_roles WHERE rolname IN
       ('agentstudio_native_auth','agentstudio_native_login')
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreaterole AND NOT rolcreatedb)=2
  AND (SELECT rolpassword IS NULL FROM pg_authid
       WHERE rolname='agentstudio_native_login') IS TRUE
  AND pg_has_role('agentstudio_native_login','agentstudio_native_auth','member')
  AND NOT pg_has_role('agentstudio_stage_login','agentstudio_native_auth','member')
  AND NOT pg_has_role('agentstudio_stage_worker','agentstudio_native_auth','member')
  AND NOT pg_has_role('agentstudio_native_login','agentstudio_api','member')
  AND NOT has_schema_privilege('agentstudio_stage_login','agentstudio_auth','USAGE')
  AND NOT has_schema_privilege('agentstudio_stage_worker','agentstudio_auth','USAGE')
  AND NOT has_table_privilege('agentstudio_stage_login','agentstudio_auth.accounts','SELECT')
  AND NOT has_table_privilege('agentstudio_stage_worker','agentstudio_auth.sessions','SELECT')
  AND (SELECT count(*) FROM pg_policies
       WHERE schemaname='agentstudio_auth' AND policyname IN
         ('native_auth_accounts_service','native_auth_sessions_service'))=2
  AND (SELECT count(*) FROM pg_policies
       WHERE schemaname='agentstudio' AND tablename='users' AND policyname IN
         ('native_auth_insert_local_users','native_auth_verified_local_users'))=2
THEN 'AUTH_SCHEMA_OK_LOGIN_STILL_DISABLED'
ELSE 'NO_GO_AUTH_SCHEMA_POSTCHECK' END AS native_auth_schema_status;

ROLLBACK;
