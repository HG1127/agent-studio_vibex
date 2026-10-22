-- Reviewed upgrade for owner-scoped credentials WITHOUT Worker transitive read.
-- Isolated PostgreSQL candidate only. Never run on a live database without
-- explicit authorization, verified backup, and Worker/API downtime plan.
-- No login passwords, no provider network calls, no worker activation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

DO $preflight$
BEGIN
  IF to_regclass('agentstudio.model_connections') IS NULL OR
     to_regprocedure('agentstudio.identity_user_id(text,text)') IS NULL OR
     to_regprocedure('agentstudio.actor_id()') IS NULL OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_worker') OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_019') THEN
    RAISE EXCEPTION 'model_credential_broker_requires_reviewed_pg_baseline'
      USING ERRCODE='P0001';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles
     WHERE rolname='agentstudio_model_broker' AND
       (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'unsafe_existing_model_broker_role'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;

DO $roles$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles
      WHERE rolname='agentstudio_model_broker') THEN
    CREATE ROLE agentstudio_model_broker NOLOGIN NOINHERIT
      NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;
-- Never grant model Broker membership to either stage API or stage Worker.
-- Broker login is separately provisioned by explicit reviewed bootstrap.
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id()
  TO agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.identity_user_id(text,text)
  TO agentstudio_model_broker;

REVOKE ALL ON agentstudio.model_connections FROM PUBLIC;
REVOKE SELECT ON agentstudio.model_connections FROM agentstudio_api;
-- PostgreSQL table-level SELECT shadows column-level REVOKE:
-- regrant ONLY non-sensitive columns, never envelope columns.
GRANT SELECT (
  id,owner_user_id,name,provider,base_url,api_key_tail,
  enabled,status,last_latency_ms,last_checked_at,models,last_error,
  revision,created_at,updated_at
) ON agentstudio.model_connections TO agentstudio_api;
GRANT SELECT (
  id,owner_user_id,revision,enabled,status,provider,base_url,
  models,last_checked_at,api_key_ciphertext,api_key_nonce,api_key_tag
) ON agentstudio.model_connections TO agentstudio_model_broker;
ALTER TABLE agentstudio.model_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.model_connections FORCE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies
     WHERE schemaname='agentstudio' AND tablename='model_connections'
       AND policyname='broker_model_credentials') THEN
    CREATE POLICY broker_model_credentials
      ON agentstudio.model_connections FOR SELECT
      TO agentstudio_model_broker
      USING(owner_user_id=agentstudio.actor_id());
  END IF;
END
$policy$;
DO $verify$
BEGIN
  IF has_column_privilege('agentstudio_api',
       'agentstudio.model_connections','api_key_ciphertext','SELECT') OR
     has_column_privilege('agentstudio_api',
       'agentstudio.model_connections','api_key_nonce','SELECT') OR
     has_column_privilege('agentstudio_api',
       'agentstudio.model_connections','api_key_tag','SELECT') OR
     NOT has_column_privilege('agentstudio_model_broker',
       'agentstudio.model_connections','api_key_ciphertext','SELECT') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.model_connections','UPDATE') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.model_connections','INSERT') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.model_connections','DELETE') OR
     (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_stage_worker') AND
       pg_has_role('agentstudio_stage_worker',
         'agentstudio_model_broker','member')) OR
     (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_stage_login') AND
       pg_has_role('agentstudio_stage_login',
         'agentstudio_model_broker','member')) THEN
    RAISE EXCEPTION 'model_credential_broker_privilege_invariant_failed'
      USING ERRCODE='P0001';
  END IF;
END
$verify$;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_020','Owner-only broker credential columns; API/Worker cannot read envelopes')
ON CONFLICT(version) DO NOTHING;
COMMIT;
