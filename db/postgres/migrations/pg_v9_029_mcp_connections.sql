-- Proposed isolated PG migration. No remote connection or runtime activation.
BEGIN;
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_028')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_model_broker'
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  THEN RAISE EXCEPTION 'mcp_connections_require_reviewed_pg_v9_028'; END IF;
END
$preflight$;
CREATE TABLE agentstudio.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 500),
  url text NOT NULL CHECK(length(url) BETWEEN 8 AND 1000),
  creation_fingerprint text NOT NULL CHECK(creation_fingerprint ~ '^[a-f0-9]{64}$'),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'untested' CHECK(status IN ('untested','ok','error')),
  catalog jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(catalog)='object' AND octet_length(catalog::text)<=131072),
  last_checked_at timestamptz,
  last_error text NOT NULL DEFAULT '' CHECK(length(last_error)<=80),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id)
);
CREATE INDEX ix_mcp_connections_owner ON agentstudio.mcp_connections(owner_user_id,updated_at DESC);
CREATE TABLE agentstudio.mcp_connection_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  mcp_connection_id uuid NOT NULL,
  header_name text NOT NULL CHECK(length(header_name) BETWEEN 1 AND 80 AND header_name !~ '[[:space:][:cntrl:]]'),
  value_ciphertext bytea NOT NULL CHECK(octet_length(value_ciphertext) BETWEEN 8 AND 4096),
  value_nonce bytea NOT NULL CHECK(octet_length(value_nonce)=12),
  value_tag bytea NOT NULL CHECK(octet_length(value_tag)=16),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mcp_connection_id,header_name),
  FOREIGN KEY(mcp_connection_id,owner_user_id) REFERENCES agentstudio.mcp_connections(id,owner_user_id) ON DELETE CASCADE
);
ALTER TABLE agentstudio.mcp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.mcp_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.mcp_connection_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.mcp_connection_headers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.mcp_connections,agentstudio.mcp_connection_headers FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.mcp_connections TO agentstudio_api;
GRANT INSERT,UPDATE,DELETE ON agentstudio.mcp_connection_headers TO agentstudio_api;
GRANT SELECT(id,owner_user_id,mcp_connection_id,header_name,created_at,updated_at)
  ON agentstudio.mcp_connection_headers TO agentstudio_api;
GRANT SELECT ON agentstudio.mcp_connection_headers TO agentstudio_model_broker;
CREATE POLICY mcp_owner ON agentstudio.mcp_connections TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY mcp_headers_owner ON agentstudio.mcp_connection_headers TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY mcp_headers_broker ON agentstudio.mcp_connection_headers FOR SELECT TO agentstudio_model_broker
  USING(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_029','Owner MCP configuration and encrypted headers; read-only discovery only');
COMMIT;
