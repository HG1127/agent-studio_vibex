-- Optional Worker-attested failure metadata. No text, provider, prompt input,
-- implicit storage consent or default fresh050 activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_052')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_053')
    OR to_regclass('agentstudio.agent_memory_failure_sources') IS NOT NULL
    OR to_regprocedure('agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'agent_memory_failure_source_requires_reviewed_052'; END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_memory_failure_sources(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  job_id uuid NOT NULL,
  lease_version bigint NOT NULL,
  worker_sha256 text NOT NULL,
  protocol text NOT NULL,
  source_sha256 text NOT NULL,
  graph_sha256 text NOT NULL,
  error_code text NOT NULL,
  owner_epoch bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,run_id),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(job_id) REFERENCES agentstudio.jobs(id) ON DELETE RESTRICT
);
CREATE FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE leased record; task record; prior record; epoch bigint; source_hash text; worker_hash text;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER')
    OR $1 IS NULL OR $2 IS NULL OR $3 IS NULL OR $4 IS NULL
    OR $3 NOT BETWEEN 1 AND 9007199254740990 OR $4 !~ '^[A-Za-z0-9_-]{1,120}$'
  THEN RAISE EXCEPTION 'agent_memory_failure_worker_required'; END IF;
  SELECT * INTO leased FROM agentstudio.jobs WHERE id=$1 AND kind='run_tick'
    AND payload->>'phase'='agent_native_v2' AND status='leased'
    AND lease_token=$2 AND lease_version=$3 AND lease_owner=$4
    AND lease_until>clock_timestamp() FOR SHARE;
  IF NOT FOUND OR leased.owner_user_id IS DISTINCT FROM agentstudio.actor_id()
  THEN RAISE EXCEPTION 'agent_memory_failure_lease_required'; END IF;
  SELECT * INTO task FROM agentstudio.runs WHERE id=leased.run_id
    AND owner_user_id=leased.owner_user_id AND kind='agent' FOR SHARE;
  IF NOT FOUND OR task.status<>'failed' OR task.finished_at IS NULL
    OR task.finished_at>clock_timestamp() OR task.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2'
    OR task.agent_spec_id::text IS DISTINCT FROM leased.payload->>'agent_spec_id'
    OR task.checkpoint->>'spec_revision' IS DISTINCT FROM leased.payload->>'spec_revision'
    OR task.checkpoint->'machine'->>'graph_sha256' IS DISTINCT FROM leased.payload->>'graph_sha256'
    OR task.last_error_code IS NULL OR task.last_error_code !~ '^[a-z][a-z0-9_]{0,119}$'
    OR leased.payload->>'graph_sha256' IS NULL OR leased.payload->>'graph_sha256' !~ '^[a-f0-9]{64}$'
    OR EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=task.id
      AND e.owner_user_id=task.owner_user_id AND e.status IN('started','unknown'))
  THEN RAISE EXCEPTION 'agent_memory_failure_terminal_required'; END IF;
  -- Attest a real failure even if disabling this known Native employee was
  -- its cause. This historical epoch grants no new automatic storage consent;
  -- 052 separately checks the currently active epoch before writing memory.
  SELECT a.governance_revision INTO epoch FROM agentstudio_auth.accounts a
    WHERE a.user_id=task.owner_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_memory_failure_native_owner_required'; END IF;
  PERFORM 1 FROM agentstudio.users u WHERE u.id=task.owner_user_id
    AND u.external_issuer='urn:agentstudio:local:v1' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_memory_failure_native_owner_required'; END IF;
  source_hash:=agentstudio.agent_memory_run_source_sha256(task.id);
  IF epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740990
    OR source_hash IS NULL OR source_hash !~ '^[a-f0-9]{64}$'
    OR leased.lease_until<=clock_timestamp()
  THEN RAISE EXCEPTION 'agent_memory_failure_source_unavailable'; END IF;
  worker_hash:=encode(sha256(convert_to($4,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(task.owner_user_id::text||':'||task.id::text,530));
  SELECT * INTO prior FROM agentstudio.agent_memory_failure_sources
    WHERE owner_user_id=task.owner_user_id AND run_id=task.id;
  IF FOUND THEN
    IF prior.job_id IS DISTINCT FROM leased.id OR prior.lease_version IS DISTINCT FROM $3
      OR prior.worker_sha256 IS DISTINCT FROM worker_hash OR prior.source_sha256 IS DISTINCT FROM source_hash
      OR prior.graph_sha256 IS DISTINCT FROM leased.payload->>'graph_sha256'
      OR prior.error_code IS DISTINCT FROM task.last_error_code OR prior.owner_epoch IS DISTINCT FROM epoch
      OR prior.protocol IS DISTINCT FROM 'agent_memory_failure_source_v1'
    THEN RAISE EXCEPTION 'agent_memory_failure_source_conflict'; END IF;
    RETURN false;
  END IF;
  INSERT INTO agentstudio.agent_memory_failure_sources(owner_user_id,run_id,job_id,lease_version,worker_sha256,
    protocol,source_sha256,graph_sha256,error_code,owner_epoch)
    VALUES(task.owner_user_id,task.id,leased.id,$3,worker_hash,'agent_memory_failure_source_v1',
      source_hash,leased.payload->>'graph_sha256',task.last_error_code,epoch);
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) TO agentstudio_worker;
ALTER TABLE agentstudio.agent_memory_failure_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_failure_sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_memory_failure_sources
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT SELECT ON agentstudio.agent_memory_failure_sources TO agentstudio_api;
CREATE POLICY agent_memory_failure_owner_read ON agentstudio.agent_memory_failure_sources FOR SELECT TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_053',
  'Optional immutable leased-Worker Native failure source metadata; no storage, prompt or fee activation');
COMMIT;
