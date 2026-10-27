-- Owner/run context receipts in the reviewed fresh050 source sequence.
-- A receipt requires the original private context even after a field is stripped.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_049')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_050')
    OR to_regclass('agentstudio.agent_memory_run_contexts') IS NOT NULL
  THEN RAISE EXCEPTION 'agent_memory_context_requires_reviewed_049'; END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_memory_run_contexts(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  spec_revision bigint NOT NULL CHECK(spec_revision BETWEEN 1 AND 9007199254740991),
  protocol text NOT NULL CHECK(protocol='agent_memory_context_v1'),
  graph_sha256 text NOT NULL CHECK(graph_sha256 ~ '^[a-f0-9]{64}$'),
  context_sha256 text NOT NULL CHECK(context_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,run_id),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT
);
ALTER TABLE agentstudio.agent_memory_run_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_run_contexts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_memory_run_contexts FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT SELECT ON agentstudio.agent_memory_run_contexts TO agentstudio_api;
GRANT INSERT(owner_user_id,run_id,spec_id,spec_revision,protocol,graph_sha256,context_sha256) ON agentstudio.agent_memory_run_contexts TO agentstudio_api;
CREATE POLICY agent_memory_context_owner_read ON agentstudio.agent_memory_run_contexts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_context_owner_insert ON agentstudio.agent_memory_run_contexts FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_050',
  'Insert-only owner/run memory context receipts; no automatic writeback or payment grant');
COMMIT;
