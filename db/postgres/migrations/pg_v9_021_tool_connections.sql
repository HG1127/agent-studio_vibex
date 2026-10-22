-- Owner-scoped Tool Connections configuration; no test-call or execution.
-- Apply only after pg_v9_020 on the separate reviewed staging database.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

DO $preflight$
BEGIN
  IF to_regclass('agentstudio.model_connections') IS NULL OR
     to_regprocedure('agentstudio.actor_id()') IS NULL OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_020') OR
     NOT EXISTS(SELECT 1 FROM pg_roles
       WHERE rolname='agentstudio_api') OR
     NOT EXISTS(SELECT 1 FROM pg_roles
       WHERE rolname='agentstudio_model_broker'
         AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'tool_connections_requires_pg_v9_020_broker_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS agentstudio.tool_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 500),
  url text NOT NULL CHECK(length(url) BETWEEN 8 AND 1000),
  method text NOT NULL CHECK(method IN ('GET','POST')),
  body_template text NOT NULL DEFAULT '' CHECK(length(body_template)<=20000),
  timeout_s integer NOT NULL DEFAULT 15 CHECK(timeout_s BETWEEN 1 AND 60),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'untested'
    CHECK(status IN ('untested','ok','error')),
  last_latency_ms integer NOT NULL DEFAULT 0
    CHECK(last_latency_ms BETWEEN 0 AND 600000),
  last_checked_at timestamptz,
  last_error text NOT NULL DEFAULT '' CHECK(length(last_error)<=1000),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS ix_tool_connections_owner
  ON agentstudio.tool_connections(owner_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS agentstudio.tool_connection_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  tool_connection_id uuid NOT NULL,
  header_name text NOT NULL
    CHECK(length(header_name) BETWEEN 1 AND 80
      AND header_name !~ '[[:space:][:cntrl:]]'),
  value_ciphertext bytea NOT NULL
    CHECK(octet_length(value_ciphertext) BETWEEN 8 AND 4096),
  value_nonce bytea NOT NULL CHECK(octet_length(value_nonce)=12),
  value_tag bytea NOT NULL CHECK(octet_length(value_tag)=16),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tool_connection_id,header_name),
  FOREIGN KEY(tool_connection_id,owner_user_id)
    REFERENCES agentstudio.tool_connections(id,owner_user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_tool_connection_headers_owner
  ON agentstudio.tool_connection_headers(owner_user_id,tool_connection_id);

DO $shape$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing FROM (VALUES
    ('tool_connections','id'),('tool_connections','owner_user_id'),
    ('tool_connections','name'),('tool_connections','description'),
    ('tool_connections','url'),('tool_connections','method'),
    ('tool_connections','body_template'),('tool_connections','timeout_s'),
    ('tool_connections','enabled'),('tool_connections','status'),
    ('tool_connections','revision'),('tool_connection_headers','id'),
    ('tool_connection_headers','owner_user_id'),
    ('tool_connection_headers','tool_connection_id'),
    ('tool_connection_headers','header_name'),
    ('tool_connection_headers','value_ciphertext'),
    ('tool_connection_headers','value_nonce'),('tool_connection_headers','value_tag')
  ) AS required(table_name,column_name)
  WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='agentstudio'
      AND c.table_name=required.table_name
      AND c.column_name=required.column_name);
  IF missing<>0 THEN
    RAISE EXCEPTION 'tool_connections_existing_table_shape_mismatch'
      USING ERRCODE='P0001';
  END IF;
END
$shape$;

ALTER TABLE agentstudio.tool_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.tool_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.tool_connection_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.tool_connection_headers FORCE ROW LEVEL SECURITY;

DO $policies$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='agentstudio'
    AND tablename='tool_connections' AND policyname='owner_tool_connections') THEN
    CREATE POLICY owner_tool_connections ON agentstudio.tool_connections
      TO agentstudio_api
      USING(owner_user_id=agentstudio.actor_id())
      WITH CHECK(owner_user_id=agentstudio.actor_id());
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='agentstudio'
    AND tablename='tool_connection_headers'
      AND policyname='owner_tool_connection_headers') THEN
    CREATE POLICY owner_tool_connection_headers
      ON agentstudio.tool_connection_headers TO agentstudio_api
      USING(owner_user_id=agentstudio.actor_id())
      WITH CHECK(owner_user_id=agentstudio.actor_id());
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='agentstudio'
    AND tablename='tool_connection_headers'
      AND policyname='broker_tool_connection_headers') THEN
    CREATE POLICY broker_tool_connection_headers
      ON agentstudio.tool_connection_headers FOR SELECT
      TO agentstudio_model_broker
      USING(owner_user_id=agentstudio.actor_id());
  END IF;
END
$policies$;
DO $policy_verify$
DECLARE p record;
BEGIN
  SELECT cmd,roles,qual,with_check INTO p FROM pg_policies
  WHERE schemaname='agentstudio' AND tablename='tool_connections'
    AND policyname='owner_tool_connections';
  IF NOT FOUND OR p.cmd<>'ALL' OR
     NOT ('agentstudio_api'=ANY(p.roles)) OR
     position('owner_user_id' in coalesce(p.qual,''))=0 OR
     position('actor_id' in coalesce(p.qual,''))=0 OR
     position('owner_user_id' in coalesce(p.with_check,''))=0 OR
     position('actor_id' in coalesce(p.with_check,''))=0 THEN
    RAISE EXCEPTION 'tool_connection_owner_policy_mismatch'
      USING ERRCODE='P0001';
  END IF;
  SELECT cmd,roles,qual,with_check INTO p FROM pg_policies
  WHERE schemaname='agentstudio' AND tablename='tool_connection_headers'
    AND policyname='owner_tool_connection_headers';
  IF NOT FOUND OR p.cmd<>'ALL' OR
     NOT ('agentstudio_api'=ANY(p.roles)) OR
     position('owner_user_id' in coalesce(p.qual,''))=0 OR
     position('actor_id' in coalesce(p.qual,''))=0 OR
     position('owner_user_id' in coalesce(p.with_check,''))=0 OR
     position('actor_id' in coalesce(p.with_check,''))=0 THEN
    RAISE EXCEPTION 'tool_header_owner_policy_mismatch'
      USING ERRCODE='P0001';
  END IF;
  SELECT cmd,roles,qual INTO p FROM pg_policies
  WHERE schemaname='agentstudio' AND tablename='tool_connection_headers'
    AND policyname='broker_tool_connection_headers';
  IF NOT FOUND OR p.cmd<>'SELECT' OR
     NOT ('agentstudio_model_broker'=ANY(p.roles)) OR
     position('owner_user_id' in coalesce(p.qual,''))=0 OR
     position('actor_id' in coalesce(p.qual,''))=0 THEN
    RAISE EXCEPTION 'tool_header_broker_policy_mismatch'
      USING ERRCODE='P0001';
  END IF;
END
$policy_verify$;

GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.tool_connections TO agentstudio_api;
GRANT INSERT,UPDATE,DELETE ON agentstudio.tool_connection_headers TO agentstudio_api;
REVOKE ALL ON agentstudio.tool_connection_headers FROM PUBLIC;
REVOKE SELECT ON agentstudio.tool_connection_headers
  FROM agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT SELECT (id,owner_user_id,tool_connection_id,header_name,created_at,updated_at)
  ON agentstudio.tool_connection_headers TO agentstudio_api;
GRANT SELECT (id,owner_user_id,tool_connection_id,header_name,
  value_ciphertext,value_nonce,value_tag,created_at,updated_at)
  ON agentstudio.tool_connection_headers TO agentstudio_model_broker;

DO $verify$
BEGIN
  IF has_column_privilege('agentstudio_api',
       'agentstudio.tool_connection_headers','value_ciphertext','SELECT') OR
     has_column_privilege('agentstudio_worker',
       'agentstudio.tool_connection_headers','value_ciphertext','SELECT') OR
     NOT has_column_privilege('agentstudio_model_broker',
       'agentstudio.tool_connection_headers','value_ciphertext','SELECT') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.tool_connection_headers','INSERT') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.tool_connection_headers','UPDATE') OR
     has_table_privilege('agentstudio_model_broker',
       'agentstudio.tool_connection_headers','DELETE') OR
     EXISTS(SELECT 1 FROM pg_roles w,pg_roles b
       WHERE w.rolname IN ('agentstudio_stage_login','agentstudio_stage_worker')
         AND b.rolname='agentstudio_model_broker'
         AND pg_has_role(w.oid,b.oid,'member')) THEN
    RAISE EXCEPTION 'tool_header_secret_privilege_invariant_failed'
      USING ERRCODE='P0001';
  END IF;
END
$verify$;

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_021','Owner-scoped Tool Connections metadata and encrypted header secrets; execution disabled')
ON CONFLICT(version) DO NOTHING;
COMMIT;
