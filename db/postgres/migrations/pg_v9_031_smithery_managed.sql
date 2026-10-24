-- Proposed isolated migration. No connection, activation or remote writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_030')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_model_broker'
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  THEN RAISE EXCEPTION 'smithery_managed_requires_reviewed_pg_v9_030'; END IF;
END
$preflight$;
CREATE TABLE agentstudio.smithery_credentials (
  owner_user_id uuid PRIMARY KEY REFERENCES agentstudio.users(id),
  active boolean NOT NULL,
  revision bigint NOT NULL CHECK(revision>0),
  key_tail text NOT NULL CHECK(length(key_tail) IN (0,4)),
  last_request_id uuid NOT NULL,
  key_fingerprint text NOT NULL CHECK(key_fingerprint ~ '^[a-f0-9]{64}$'),
  api_key_ciphertext bytea,api_key_nonce bytea,api_key_tag bytea,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((active AND octet_length(api_key_ciphertext) BETWEEN 8 AND 2048
    AND octet_length(api_key_nonce)=12 AND octet_length(api_key_tag)=16 AND length(key_tail)=4
    AND api_key_ciphertext IS NOT NULL AND api_key_nonce IS NOT NULL AND api_key_tag IS NOT NULL)
    OR (NOT active AND api_key_ciphertext IS NULL AND api_key_nonce IS NULL AND api_key_tag IS NULL AND key_tail=''))
);
CREATE TABLE agentstudio.smithery_connections (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  namespace text NOT NULL CHECK(namespace ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$'),
  remote_connection_id text NOT NULL CHECK(remote_connection_id ~ '^studio-[a-f0-9]{32}$'),
  server_name text NOT NULL CHECK(length(server_name) BETWEEN 1 AND 255),
  binding_proof text NOT NULL CHECK(binding_proof ~ '^[a-f0-9]{64}$'),
  creation_fingerprint text NOT NULL CHECK(creation_fingerprint ~ '^[a-f0-9]{64}$'),
  key_revision bigint NOT NULL CHECK(key_revision>0),
  state text NOT NULL CHECK(state IN ('pending','unknown','paused','connected','disconnected','auth_required','input_required','error','revoking','revoke_unknown','revoked','needs_key','needs_refresh')),
  revoke_requested boolean NOT NULL DEFAULT false,
  setup_url text NOT NULL DEFAULT '' CHECK(length(setup_url)<=2048),
  missing jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(missing)='array' AND octet_length(missing::text)<=4096),
  last_error text NOT NULL DEFAULT '' CHECK(length(last_error)<=80),
  operation_kind text NOT NULL DEFAULT '' CHECK(operation_kind IN ('','connect','refresh','revoke')),
  operation_token uuid,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(id,owner_user_id) REFERENCES agentstudio.mcp_connections(id,owner_user_id),
  UNIQUE(namespace,remote_connection_id),
  CHECK(operation_token IS NULL OR operation_kind<>'')
);
CREATE INDEX ix_smithery_connections_owner ON agentstudio.smithery_connections(owner_user_id,updated_at DESC);
ALTER TABLE agentstudio.smithery_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.smithery_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.smithery_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.smithery_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.smithery_credentials,agentstudio.smithery_connections FROM PUBLIC;
GRANT INSERT,UPDATE,DELETE ON agentstudio.smithery_credentials TO agentstudio_api;
GRANT SELECT(owner_user_id,active,revision,key_tail,last_request_id,key_fingerprint,created_at,updated_at)
  ON agentstudio.smithery_credentials TO agentstudio_api;
GRANT SELECT ON agentstudio.smithery_credentials TO agentstudio_model_broker;
GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.smithery_connections TO agentstudio_api;
CREATE POLICY smithery_key_owner ON agentstudio.smithery_credentials TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY smithery_key_broker ON agentstudio.smithery_credentials FOR SELECT TO agentstudio_model_broker
  USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY smithery_connection_owner ON agentstudio.smithery_connections TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_031','Owner Smithery credentials and managed connection operation reservations');
COMMIT;
