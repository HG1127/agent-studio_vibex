-- V8 PostgreSQL 17 + pgvector: ISOLATED STAGING CONTRACT, NOT production migration.
-- Initial empty staging database only. Never apply to existing BaoTa databases.
-- Current V7 PocketBase/SQLite API, running Worker and users remain unchanged.
-- Run by PostgreSQL official initdb entrypoint on a NEW named volume, once.
\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS agentstudio;
REVOKE ALL ON SCHEMA agentstudio FROM PUBLIC;

CREATE TABLE agentstudio.schema_migrations (
  version text PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Identity uses verified issuer/sub from a future authenticating API, never
-- a browser-supplied X-Rh-User-Id. DB roles must not be public-facing.
CREATE TABLE agentstudio.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_issuer text NOT NULL,
  external_subject text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_issuer,external_subject)
);

CREATE TABLE agentstudio.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES agentstudio.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agentstudio.team_memberships (
  team_id uuid NOT NULL REFERENCES agentstudio.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id,user_id)
);

-- Team-oriented fields are reserved for a future explicitly verified RBAC
-- API. V8 baseline row-level policy is deliberately OWNER-ONLY.
CREATE TABLE agentstudio.agent_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  team_id uuid REFERENCES agentstudio.teams(id),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  spec jsonb NOT NULL CHECK (jsonb_typeof(spec)='object'),
  requires_approval boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,owner_user_id),
  CHECK (visibility <> 'team' OR team_id IS NOT NULL)
);
CREATE INDEX ix_agent_specs_owner ON agentstudio.agent_specs(owner_user_id,updated_at DESC);

CREATE TABLE agentstudio.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  team_id uuid REFERENCES agentstudio.teams(id),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  graph jsonb NOT NULL CHECK (jsonb_typeof(graph)='object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,owner_user_id),
  CHECK (visibility <> 'team' OR team_id IS NOT NULL)
);
CREATE INDEX ix_workflows_owner ON agentstudio.workflows(owner_user_id,updated_at DESC);

-- Provider credentials are authenticated-encrypted by the API with a key
-- delivered independently from PostgreSQL credentials. No plaintext key is
-- persisted or returned to a browser. This table is owner-only and not granted
-- to the Worker; external provider calls remain disabled until egress review.
CREATE TABLE agentstudio.model_connections (
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
CREATE INDEX ix_model_connections_owner
  ON agentstudio.model_connections(owner_user_id,updated_at DESC);
-- Tool endpoints are configuration only in the current PG18 candidate:
-- no test-call, proxy, or Worker execution route is enabled. Header values
-- live in a separate encrypted child table so the ordinary API can list key
-- names and preserve blank fields without SELECT on any credential ciphertext.
CREATE TABLE agentstudio.tool_connections (
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
CREATE INDEX ix_tool_connections_owner
  ON agentstudio.tool_connections(owner_user_id,updated_at DESC);

CREATE TABLE agentstudio.tool_connection_headers (
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
CREATE INDEX ix_tool_connection_headers_owner
  ON agentstudio.tool_connection_headers(owner_user_id,tool_connection_id);

-- Approved, staging-only migration provenance and legacy-to-UUID crosswalk.
-- No API/Worker roles may read or write it; normal application runs are NOT
-- given implicit access to previous PocketBase record IDs.
CREATE TABLE agentstudio.legacy_agent_imports (
  source_snapshot_sha256 text NOT NULL
    CHECK(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_spec_id text NOT NULL UNIQUE
    CHECK(length(legacy_spec_id) BETWEEN 1 AND 64),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  target_spec_id uuid NOT NULL UNIQUE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(source_snapshot_sha256,legacy_spec_id),
  FOREIGN KEY(target_spec_id,owner_user_id)
    REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
ALTER TABLE agentstudio.legacy_agent_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.legacy_agent_imports FORCE ROW LEVEL SECURITY;

-- One run may reference exactly one agent spec or workflow. Composite
-- foreign keys prevent attaching another employee's private target.
CREATE TABLE agentstudio.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  kind text NOT NULL CHECK (kind IN ('agent','workflow')),
  agent_spec_id uuid,
  workflow_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','awaiting_approval','paused',
                      'succeeded','failed','cancelled')),
  instruction text NOT NULL DEFAULT '',
  result_text text NOT NULL DEFAULT '' CHECK (length(result_text)<=20000),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(checkpoint)='object'),
  step_count integer NOT NULL DEFAULT 0 CHECK (step_count>=0),
  last_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (id,owner_user_id),
  FOREIGN KEY (agent_spec_id,owner_user_id)
    REFERENCES agentstudio.agent_specs(id,owner_user_id),
  FOREIGN KEY (workflow_id,owner_user_id)
    REFERENCES agentstudio.workflows(id,owner_user_id),
  CHECK (
    (kind='agent' AND agent_spec_id IS NOT NULL AND workflow_id IS NULL)
    OR (kind='workflow' AND workflow_id IS NOT NULL AND agent_spec_id IS NULL)
  )
);
CREATE INDEX ix_runs_owner_status ON agentstudio.runs(owner_user_id,status,updated_at DESC);
CREATE INDEX ix_runs_queue ON agentstudio.runs(status,created_at);

CREATE TABLE agentstudio.run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  run_id uuid NOT NULL,
  step_key text NOT NULL CHECK(length(step_key) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','awaiting_approval','succeeded','failed','skipped')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,step_key),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);
CREATE INDEX ix_run_steps_owner ON agentstudio.run_steps(owner_user_id,run_id,created_at);

-- Durable queue; lease_version is a fencing counter. No exactly-once claims
-- for third-party HTTP POST: see external_effects below.
CREATE TABLE agentstudio.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  run_id uuid,
  kind text NOT NULL CONSTRAINT ck_jobs_kind CHECK(kind IN ('run_tick','schedule_dispatch','knowledge_ingest','workflow_tick')),
  dedupe_key text NOT NULL CHECK(length(dedupe_key) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','leased','succeeded','failed','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 30),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_token uuid,
  lease_version bigint NOT NULL DEFAULT 0 CHECK(lease_version>=0),
  lease_until timestamptz,
  last_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id,kind,dedupe_key),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
  CHECK(status <> 'leased' OR
    (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX ix_jobs_dispatch ON agentstudio.jobs(status,scheduled_at,id);
CREATE INDEX ix_jobs_lease_expiry ON agentstudio.jobs(lease_until)
  WHERE status='leased';

CREATE TABLE agentstudio.run_leases (
  run_id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  lease_owner text NOT NULL,
  lease_token uuid NOT NULL,
  fence_version bigint NOT NULL DEFAULT 1 CHECK(fence_version>0),
  lease_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);

-- Third-party writes are deliberately fail-closed after ambiguous results.
CREATE TABLE agentstudio.external_effects (
  run_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  step_key text NOT NULL CHECK(length(step_key) BETWEEN 1 AND 160),
  tool_name text NOT NULL,
  arguments_sha256 text NOT NULL CHECK(arguments_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('started','succeeded','unknown')),
  result_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,step_key),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);
CREATE INDEX ix_external_effects_owner_status
  ON agentstudio.external_effects(owner_user_id,status,updated_at DESC);

CREATE TABLE agentstudio.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  run_id uuid NOT NULL,
  step_key text NOT NULL,
  requested_by uuid NOT NULL REFERENCES agentstudio.users(id),
  decided_by uuid REFERENCES agentstudio.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','expired')),
  reason_code text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(run_id,step_key),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
  CHECK ((status='pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (status<>'pending' AND decided_at IS NOT NULL))
);
CREATE INDEX ix_approvals_owner_pending ON agentstudio.approvals(owner_user_id,status,requested_at DESC);

CREATE TABLE agentstudio.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  kind text NOT NULL CHECK (kind IN ('agent','workflow')),
  agent_spec_id uuid,
  workflow_id uuid,
  name text NOT NULL,
  recurrence jsonb NOT NULL CHECK(jsonb_typeof(recurrence)='object'),
  time_zone text NOT NULL,
  next_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,owner_user_id),
  FOREIGN KEY (agent_spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id),
  FOREIGN KEY (workflow_id,owner_user_id) REFERENCES agentstudio.workflows(id,owner_user_id),
  CHECK (
    (kind='agent' AND agent_spec_id IS NOT NULL AND workflow_id IS NULL)
    OR (kind='workflow' AND workflow_id IS NOT NULL AND agent_spec_id IS NULL)
  ),
  -- The first PostgreSQL scheduler draft capability must NEVER make work due.
  CONSTRAINT ck_schedule_draft_inert CHECK(
    recurrence->>'config_format' IS DISTINCT FROM 'pg_schedule_draft_v1'
    OR (enabled=false AND next_at IS NULL))
);
CREATE INDEX ix_schedules_due ON agentstudio.schedules(next_at)
  WHERE enabled=true;

CREATE TABLE agentstudio.schedule_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  schedule_id uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  run_id uuid,
  status text NOT NULL CHECK(status IN ('pending','started','succeeded','failed','skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id,scheduled_for),
  FOREIGN KEY (schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);

CREATE TABLE agentstudio.knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  team_id uuid REFERENCES agentstudio.teams(id),
  visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team')),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK(visibility <> 'team' OR team_id IS NOT NULL)
);
CREATE INDEX ix_kb_owner ON agentstudio.knowledge_bases(owner_user_id,updated_at DESC);

CREATE TABLE agentstudio.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  base_id uuid NOT NULL,
  filename text NOT NULL,
  object_key text NOT NULL, -- internal object storage reference; NOT a public URL
  mime_type text NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','indexed','failed','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id),
  FOREIGN KEY (base_id,owner_user_id)
    REFERENCES agentstudio.knowledge_bases(id,owner_user_id)
);
CREATE INDEX ix_knowledge_documents_base
  ON agentstudio.knowledge_documents(owner_user_id,base_id,created_at);
-- A document can be deliberately replaced after soft deletion, but duplicate
-- active content must not be ingested twice during concurrent requests.
CREATE UNIQUE INDEX ux_knowledge_document_active_hash
  ON agentstudio.knowledge_documents(owner_user_id,base_id,sha256)
  WHERE status <> 'deleted';


-- 1536 is a schema-pilot dimension, NOT the selection of a real embedding
-- provider. Reassess this type/index before ingesting production documents.
CREATE TABLE agentstudio.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  document_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK(chunk_index>=0),
  text_content text NOT NULL,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,chunk_index),
  FOREIGN KEY (document_id,owner_user_id)
    REFERENCES agentstudio.knowledge_documents(id,owner_user_id),
  CHECK (embedding IS NULL OR embedding_model IS NOT NULL)
);
CREATE INDEX ix_knowledge_chunks_owner_doc
  ON agentstudio.knowledge_chunks(owner_user_id,document_id,chunk_index);
CREATE INDEX ix_knowledge_chunks_vector
  ON agentstudio.knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- One-use handoff, no shared credentials or original KB pointers.
CREATE TABLE agentstudio.template_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  source_spec_id uuid NOT NULL,
  safe_snapshot jsonb NOT NULL CHECK(jsonb_typeof(safe_snapshot)='object'),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES agentstudio.users(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Deliberately no FK to the source spec: reviewed snapshot remains
  -- redeemable after the original Agent was edited or deleted.
  -- The eventual API must verify ownership BEFORE issuing an invite.
  CHECK((redeemed_at IS NULL AND redeemed_by IS NULL) OR
        (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL))
);
-- A reviewed invitation is immutable, even if a future API accidentally
-- attempts to alter its snapshot after publishing a code.
CREATE FUNCTION agentstudio.reject_invite_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $invite$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.source_spec_id IS DISTINCT FROM OLD.source_spec_id
    OR NEW.safe_snapshot IS DISTINCT FROM OLD.safe_snapshot
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'immutable_template_invite_fields'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.redeemed_at IS NOT NULL AND
    (NEW.redeemed_at IS DISTINCT FROM OLD.redeemed_at
     OR NEW.redeemed_by IS DISTINCT FROM OLD.redeemed_by)
  THEN
    RAISE EXCEPTION 'template_invite_already_redeemed'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$invite$;
CREATE TRIGGER trg_invite_snapshot_immutable
BEFORE UPDATE ON agentstudio.template_invites
FOR EACH ROW EXECUTE FUNCTION agentstudio.reject_invite_snapshot_mutation();
CREATE INDEX ix_template_invites_owner
  ON agentstudio.template_invites(owner_user_id,created_at DESC);

-- Metadata-only, no raw prompts, documents, credentials or HTTP payloads.
CREATE TABLE agentstudio.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  run_id uuid,
  action text NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  result text NOT NULL CHECK(result IN ('succeeded','failed','denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);
CREATE INDEX ix_audit_events_owner_time
  ON agentstudio.audit_events(owner_user_id,occurred_at DESC);

-- Security boundary: staging credentials MUST NOT be a PostgreSQL superuser.
-- Placeholder NOLOGIN group roles receive only the minimum pilot table grants.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') THEN
    CREATE ROLE agentstudio_api NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agentstudio_worker') THEN
    CREATE ROLE agentstudio_worker NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname='agentstudio_model_broker') THEN
    -- No login and no membership for Worker/API. An independently
    -- authenticated credential broker must receive explicit membership.
    CREATE ROLE agentstudio_model_broker NOLOGIN NOINHERIT
      NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_api,agentstudio_worker;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_model_broker;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA agentstudio TO agentstudio_api;
-- Migration ledger and team membership grants are controlled by the migrator.
REVOKE ALL ON agentstudio.legacy_agent_imports FROM agentstudio_api,agentstudio_worker;
REVOKE ALL ON agentstudio.schema_migrations FROM agentstudio_api;
-- Employee provisioning/status changes are administered by a separate,
-- non-public identity service, never by this ordinary application DB role.
REVOKE INSERT,UPDATE,DELETE ON agentstudio.users FROM agentstudio_api;

REVOKE INSERT,UPDATE,DELETE ON agentstudio.team_memberships FROM agentstudio_api;
-- Audit trails and reviewed shares are not deletable via the normal API role.
REVOKE UPDATE,DELETE ON agentstudio.audit_events FROM agentstudio_api;
REVOKE DELETE ON agentstudio.template_invites FROM agentstudio_api;
REVOKE DELETE ON agentstudio.users FROM agentstudio_api;


-- Worker may claim/finish its existing queue, but must not change
-- ownership, kind, payload or deduplication identity.
GRANT SELECT,UPDATE(status,attempts,scheduled_at,lease_owner,
  lease_token,lease_version,lease_until,last_error_code,updated_at)
  ON agentstudio.jobs TO agentstudio_worker;
-- Worker gets only the columns needed to STOP, never to replay, a run with
-- an ambiguous external write. No result_text or HTTP request data exposed.
GRANT SELECT(run_id,owner_user_id,status)
  ON agentstudio.external_effects TO agentstudio_worker;
-- Worker sees only status/identity metadata, never employee prompts or full
-- Agent/Workflow specifications, and may not edit users or run content.
GRANT SELECT(id,status) ON agentstudio.users TO agentstudio_worker;
GRANT SELECT(id,owner_user_id,status) ON agentstudio.runs TO agentstudio_worker;



-- RLS is owner-only for the pilot; team memberships do not grant access
-- until an authenticated team permission API and corresponding tests exist.
CREATE FUNCTION agentstudio.actor_id() RETURNS uuid
LANGUAGE SQL STABLE AS $actor$
  SELECT NULLIF(current_setting('agentstudio.actor_id',true),'')::uuid
$actor$;
REVOKE ALL ON FUNCTION agentstudio.actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_model_broker;

-- Resolve an independently VERIFIED issuer/sub pair to an active, provisioned
-- employee. SECURITY DEFINER can inspect users before actor_id is set; it
-- returns only the UUID, never another employee's profile or role.
-- DO NOT expose this function as a public HTTP/RPC endpoint.
CREATE FUNCTION agentstudio.identity_user_id(
  verified_issuer text, verified_subject text
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, agentstudio
AS $identity$
  SELECT id FROM agentstudio.users
  WHERE external_issuer=verified_issuer
    AND external_subject=verified_subject
    AND status='active'
$identity$;
REVOKE ALL ON FUNCTION agentstudio.identity_user_id(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.identity_user_id(text,text)
  TO agentstudio_api;

GRANT EXECUTE ON FUNCTION agentstudio.identity_user_id(text,text)
  TO agentstudio_model_broker;

-- Worker can become API role for existing run processing; remove the API
-- role's SELECT over secret envelope columns. Ordinary API may INSERT and
-- UPDATE encrypted blobs but cannot SELECT/export them. A separate model
-- broker role is the ONLY app role allowed to decrypt per-owner credentials.
REVOKE SELECT ON agentstudio.model_connections FROM agentstudio_api;
GRANT SELECT (id,owner_user_id,name,provider,base_url,api_key_tail,
  enabled,status,last_latency_ms,last_checked_at,models,last_error,
  revision,created_at,updated_at)
  ON agentstudio.model_connections TO agentstudio_api;
GRANT SELECT (id,owner_user_id,provider,base_url,enabled,status,models,
  revision,last_checked_at,api_key_ciphertext,api_key_nonce,api_key_tag)
  ON agentstudio.model_connections TO agentstudio_model_broker;
-- API may inspect key names and perform encrypted upserts, but cannot read
-- stored header values. The separate Broker role is read-only for secret access.
REVOKE SELECT ON agentstudio.tool_connection_headers FROM agentstudio_api;
GRANT INSERT,UPDATE,DELETE ON agentstudio.tool_connection_headers TO agentstudio_api;
GRANT SELECT (id,owner_user_id,tool_connection_id,header_name,created_at,updated_at)
  ON agentstudio.tool_connection_headers TO agentstudio_api;
GRANT SELECT (id,owner_user_id,tool_connection_id,header_name,
  value_ciphertext,value_nonce,value_tag,created_at,updated_at)
  ON agentstudio.tool_connection_headers TO agentstudio_model_broker;

-- The real API service MUST validate JWT signatures/issuer/audience/JWKS before
-- invoking identity_user_id, and use a NON-SUPERUSER database login permitted
-- to SET ROLE agentstudio_api. Never use POSTGRES_USER/admin credentials.


ALTER TABLE agentstudio.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_owner ON agentstudio.users TO agentstudio_api
  USING(id=agentstudio.actor_id()) WITH CHECK(id=agentstudio.actor_id());

ALTER TABLE agentstudio.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.teams FORCE ROW LEVEL SECURITY;
CREATE POLICY teams_creator ON agentstudio.teams TO agentstudio_api
  USING(created_by=agentstudio.actor_id()) WITH CHECK(created_by=agentstudio.actor_id());

ALTER TABLE agentstudio.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.team_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY team_members_owner ON agentstudio.team_memberships TO agentstudio_api
  USING(user_id=agentstudio.actor_id()) WITH CHECK(user_id=agentstudio.actor_id());

-- Every table containing employee data MUST have an explicit owner policy.
-- Worker is an internal service role and may only claim durable jobs.
DO $policies$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'agent_specs','workflows','runs','run_steps','jobs','run_leases',
    'external_effects','approvals','schedules','schedule_occurrences',
    'knowledge_bases','knowledge_documents','knowledge_chunks',
    'model_connections','tool_connections','tool_connection_headers',
    'template_invites','audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format(
      'CREATE POLICY %I ON agentstudio.%I TO agentstudio_api ' ||
      'USING (owner_user_id=agentstudio.actor_id()) ' ||
      'WITH CHECK (owner_user_id=agentstudio.actor_id())',
      'owner_'||tab,tab
    );
  END LOOP;
END
$policies$;
-- Owner only, SELECT-only, separate service role; the credential Broker
-- can never UPDATE, INSERT or DELETE connection data or audit history.
CREATE POLICY broker_model_credentials ON agentstudio.model_connections
  FOR SELECT TO agentstudio_model_broker
  USING (owner_user_id=agentstudio.actor_id());
CREATE POLICY broker_tool_connection_headers ON agentstudio.tool_connection_headers
  FOR SELECT TO agentstudio_model_broker
  USING (owner_user_id=agentstudio.actor_id());
CREATE POLICY worker_job_queue ON agentstudio.jobs
  TO agentstudio_worker USING (true) WITH CHECK (true);
-- Dedicated worker policies are required for safe lease scope. The effect
-- policy below is indispensable: otherwise RLS hides ambiguous writes and
-- the anti-replay subquery silently sees zero rows.
CREATE POLICY worker_run_status ON agentstudio.runs
  FOR SELECT TO agentstudio_worker USING(true);
CREATE POLICY worker_user_active ON agentstudio.users
  FOR SELECT TO agentstudio_worker USING(true);

CREATE POLICY worker_effect_safety_read ON agentstudio.external_effects
  FOR SELECT TO agentstudio_worker USING (true);


INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v8_001','Empty PostgreSQL 17/pgvector staging schema with owner-only RLS');
INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v8_004','Model execution result column included in fresh stage schema');

INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg_v8_005','Staging-only original Agent ID crosswalk, no automatic conversion');

COMMIT;

-- CRITICAL:
-- - No data copied from existing PocketBase/SQLite.
-- - No production credentials or login roles provisioned here.
-- - Future backend MUST validate employee JWT/OIDC, then SET LOCAL
--   agentstudio.actor_id = a DB user UUID inside each transaction.
-- - SET LOCAL alone isn't authentication: never expose DB/app role directly.
-- - Runtime API/Worker repository implementation is NOT in this migration.
