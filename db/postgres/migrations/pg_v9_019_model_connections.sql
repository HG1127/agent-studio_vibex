-- Adds encrypted owner-scoped model connection configuration to an existing
-- isolated Agent Studio staging database. This migration stores no plaintext
-- API keys and does not enable provider egress, model execution or Workers.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
BEGIN
  IF to_regclass('agentstudio.schema_migrations') IS NULL OR
     to_regclass('agentstudio.users') IS NULL OR
     to_regprocedure('agentstudio.actor_id()') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') THEN
    RAISE EXCEPTION 'model_connections_requires_reviewed_pg_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS agentstudio.model_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  provider text NOT NULL CHECK(provider IN ('openai','anthropic','gemini')),
  base_url text NOT NULL CHECK(length(base_url) BETWEEN 8 AND 2048),
  api_key_ciphertext bytea NOT NULL CHECK(octet_length(api_key_ciphertext) BETWEEN 1 AND 4096),
  api_key_nonce bytea NOT NULL CHECK(octet_length(api_key_nonce)=12),
  api_key_tag bytea NOT NULL CHECK(octet_length(api_key_tag)=16),
  api_key_tail text NOT NULL CHECK(length(api_key_tail) BETWEEN 1 AND 4),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'untested'
    CHECK(status IN ('untested','ok','error')),
  last_latency_ms integer NOT NULL DEFAULT 0
    CHECK(last_latency_ms BETWEEN 0 AND 600000),
  last_checked_at timestamptz,
  models jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK(jsonb_typeof(models)='array' AND jsonb_array_length(models)<=300),
  last_error text NOT NULL DEFAULT '' CHECK(length(last_error)<=1000),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id)
);

DO $validate$
DECLARE
  missing integer;
  policy_row record;
BEGIN
  SELECT count(*) INTO missing
  FROM (VALUES
    ('id'),('owner_user_id'),('name'),('provider'),('base_url'),
    ('api_key_ciphertext'),('api_key_nonce'),('api_key_tag'),
    ('api_key_tail'),('enabled'),('status'),('last_latency_ms'),
    ('last_checked_at'),('models'),('last_error'),('revision'),
    ('created_at'),('updated_at')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='agentstudio'
      AND c.table_name='model_connections'
      AND c.column_name=required.column_name
  );
  IF missing<>0 THEN
    RAISE EXCEPTION 'model_connections_existing_table_shape_mismatch'
      USING ERRCODE='P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='agentstudio' AND tablename='model_connections'
      AND policyname='owner_model_connections'
  ) THEN
    SELECT cmd,roles,qual,with_check INTO policy_row
    FROM pg_policies
    WHERE schemaname='agentstudio' AND tablename='model_connections'
      AND policyname='owner_model_connections';
    IF policy_row.cmd<>'ALL' OR
       NOT ('agentstudio_api'=ANY(policy_row.roles)) OR
       position('owner_user_id' in coalesce(policy_row.qual,''))=0 OR
       position('actor_id' in coalesce(policy_row.qual,''))=0 OR
       position('owner_user_id' in coalesce(policy_row.with_check,''))=0 OR
       position('actor_id' in coalesce(policy_row.with_check,''))=0 THEN
      RAISE EXCEPTION 'model_connections_existing_rls_policy_mismatch'
        USING ERRCODE='P0001';
    END IF;
  ELSE
    CREATE POLICY owner_model_connections ON agentstudio.model_connections
      TO agentstudio_api
      USING(owner_user_id=agentstudio.actor_id())
      WITH CHECK(owner_user_id=agentstudio.actor_id());
  END IF;
END
$validate$;

ALTER TABLE agentstudio.model_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.model_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.model_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.model_connections TO agentstudio_api;
CREATE INDEX IF NOT EXISTS ix_model_connections_owner
  ON agentstudio.model_connections(owner_user_id,updated_at DESC);

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_019','Owner-scoped encrypted model connections; provider egress remains disabled')
ON CONFLICT(version) DO NOTHING;

COMMIT;
