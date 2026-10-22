-- Isolated PG18 credential-broker login RESERVATION. Does NOT enable LOGIN,
-- set a password, install a service, run a Worker, or connect to providers.
-- Apply only after independent owner/API/Broker grant review and backup.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
  IF current_database()<>'agent_studio' OR
     current_setting('port')::integer<>5333 OR
     current_setting('server_version_num')::int <180000 OR
     current_setting('server_version_num')::int >=190000 OR
     session_user<>'postgres' OR pg_is_in_recovery() OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_020') OR
     NOT EXISTS(SELECT 1 FROM pg_roles
       WHERE rolname='agentstudio_model_broker' AND rolcanlogin=false) OR
     EXISTS(SELECT 1 FROM pg_roles
       WHERE rolname='agentstudio_model_broker_login') OR
     pg_has_role('agentstudio_stage_worker',
       'agentstudio_model_broker','member') OR
     pg_has_role('agentstudio_stage_login',
       'agentstudio_model_broker','member') THEN
    RAISE EXCEPTION 'model_broker_login_not_safe_to_reserve'
      USING ERRCODE='P0001';
  END IF;
END
$guard$;
CREATE ROLE agentstudio_model_broker_login NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT agentstudio_model_broker TO agentstudio_model_broker_login;
GRANT CONNECT ON DATABASE agent_studio TO agentstudio_model_broker_login;
COMMIT;
-- To activate later requires a separately reviewed OS-secret provisioning
-- operation. This file intentionally contains no ALTER ROLE ... LOGIN.
