-- One-time Docker staging bootstrap. Only agentstudio_stage; requires
-- a SEPARATE password file from API and PostgreSQL administrator secrets.
-- Never execute against BaoTa existing databases.
\set ON_ERROR_STOP on
BEGIN;
DO $worker_auth$
DECLARE secret text;
BEGIN
  IF current_database()<>'agentstudio_stage' THEN
    RAISE EXCEPTION 'refuse_non_stage_database';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_worker')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') THEN
    RAISE EXCEPTION 'staging_roles_missing';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_stage_worker') THEN
    RAISE EXCEPTION 'worker_login_role_collision';
  END IF;
  secret:=regexp_replace(
    pg_read_file('/run/secrets/worker_login_password'),
    E'[\r\n]+$','','g');
  IF length(secret)<32 OR secret ~ '^(.)\1+$' THEN
    RAISE EXCEPTION 'unsafe_stage_worker_password';
  END IF;
  EXECUTE format(
    'CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT PASSWORD %L',
    secret);
  -- Trusted Worker can SET ROLE api only after validating an atomically
  -- fenced lease and copying its owner UUID; never expose its credentials.
  GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker;
END
$worker_auth$;
GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_stage_worker;
COMMIT;
