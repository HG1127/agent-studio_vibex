-- V8 staging-only least-privilege login role bootstrap.
-- Called ONLY on first initialization of a NEW, isolated stage volume.
-- Never run on a production or existing PostgreSQL database.
-- Its actual password comes from an externally supplied Docker secret file.
\set ON_ERROR_STOP on
BEGIN;
DO $stage_login$
DECLARE
  passwd text;
BEGIN
  IF current_database() <> 'agentstudio_stage' THEN
    RAISE EXCEPTION 'refuse_non_stage_database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') THEN
    RAISE EXCEPTION 'api_policy_role_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentstudio_stage_login') THEN
    RAISE EXCEPTION 'stage_login_role_collision';
  END IF;
  passwd := regexp_replace(
    pg_read_file('/run/secrets/api_login_password'),
    E'[\r\n]+$', '', 'g'
  );
  IF length(passwd) < 32 OR passwd ~ '^(.)\1+$' THEN
    RAISE EXCEPTION 'unsafe_stage_api_password';
  END IF;
  -- Do not print or log passwd. Passwords never belong in generated source.
  EXECUTE format(
    'CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT PASSWORD %L',
    passwd
  );
  GRANT agentstudio_api TO agentstudio_stage_login;
END
$stage_login$;
REVOKE CONNECT ON DATABASE agentstudio_stage FROM PUBLIC;
GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_stage_login;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
COMMIT;
