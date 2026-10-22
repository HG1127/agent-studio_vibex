-- REVIEW ONLY: reserve an independent identity resolver login, still NOLOGIN.
-- Apply only after approved backup and reviewed V9.024; never auto-applied.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
  IF current_database()<>'agent_studio' OR
     current_setting('port')::integer<>5333 OR
     current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR
     session_user<>'postgres' OR pg_is_in_recovery() OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_024') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_bound_dispatch'
       AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) OR
     EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_bound_dispatch_login') THEN
    RAISE EXCEPTION 'bound_dispatch_login_not_safe_to_reserve' USING ERRCODE='P0001';
  END IF;
END
$guard$;
CREATE ROLE agentstudio_bound_dispatch_login NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT agentstudio_bound_dispatch TO agentstudio_bound_dispatch_login;
GRANT CONNECT ON DATABASE agent_studio TO agentstudio_bound_dispatch_login;
COMMIT;
-- No password, LOGIN activation, HBA modification, service or Worker startup.
