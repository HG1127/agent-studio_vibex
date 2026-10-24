-- Isolated foundation only. No Agent/Workflow adapter, operator enablement,
-- provider call, production cutover or per-step charge consent is enabled here.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_038') THEN
    RAISE EXCEPTION 'knowledge_execution_requires_reviewed_pg_v9_038';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_execution') THEN
    CREATE ROLE agentstudio_knowledge_execution NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE rolname='agentstudio_knowledge_execution' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
    AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)) THEN
    RAISE EXCEPTION 'unsafe_knowledge_execution_role';
  END IF;
END $preflight$;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_execution;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_employee_active(uuid) TO agentstudio_knowledge_execution;
-- The helper cannot log in or be assumed by any service. Its only outward
-- results are a boolean or a sealed source containing hashes, never prompts,
-- job bearer tokens, document contents, provider credentials or vectors.
GRANT SELECT(id,owner_user_id,run_id,kind,payload,status,lease_token,lease_version,lease_owner,lease_until) ON agentstudio.jobs TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,kind,status,workflow_id,agent_spec_id,instruction,checkpoint) ON agentstudio.runs TO agentstudio_knowledge_execution;
GRANT SELECT(run_id,owner_user_id,step_key,status,reason_code) ON agentstudio.approvals TO agentstudio_knowledge_execution;
GRANT SELECT(run_id,owner_user_id,step_key,status,tool_name,arguments_sha256) ON agentstudio.external_effects TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,revision) ON agentstudio.workflows,agentstudio.agent_specs TO agentstudio_knowledge_execution;
CREATE POLICY knowledge_execution_jobs ON agentstudio.jobs FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_runs ON agentstudio.runs FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_approvals ON agentstudio.approvals FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_effects ON agentstudio.external_effects FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_workflows ON agentstudio.workflows FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_specs ON agentstudio.agent_specs FOR SELECT TO agentstudio_knowledge_execution USING(true);
ALTER TABLE agentstudio.knowledge_query_jobs ADD COLUMN execution_source jsonb,
  ADD COLUMN source_run_id uuid,ADD COLUMN source_step_key text,
  ADD CONSTRAINT knowledge_query_source_shape CHECK(
    execution_source IS NULL AND source_run_id IS NULL AND source_step_key IS NULL OR
    jsonb_typeof(execution_source)='object' AND octet_length(execution_source::text)<=4096 AND source_run_id IS NOT NULL AND source_step_key IS NOT NULL);
-- No cascading FK: deleting/replacing a run must never delete a billing fence.
CREATE UNIQUE INDEX knowledge_query_execution_once ON agentstudio.knowledge_query_jobs(reader_user_id,source_run_id,source_step_key) WHERE source_run_id IS NOT NULL;
CREATE FUNCTION agentstudio.knowledge_execution_source_current(p_reader uuid,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j record; r record; data jsonb; state_spec jsonb; autonomous boolean; parent text; ids uuid[];
BEGIN
  IF p_reader IS NULL OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR
    (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_source) key) IS DISTINCT FROM
    ARRAY['base_ids','checkpoint_sha256','execution_mode','input_sha256','job_id','lease_owner','lease_sha256','lease_version','parent_step_key','run_id','step_key']::text[] OR
    coalesce(p_source->>'execution_mode','') NOT IN ('workflow_native_v2','agent_native_v2') OR jsonb_typeof(p_source->'lease_version') IS DISTINCT FROM 'number' OR
    coalesce(p_source->>'lease_sha256','') !~ '^[a-f0-9]{64}$' OR coalesce(p_source->>'checkpoint_sha256','') !~ '^[a-f0-9]{64}$' OR
    coalesce(p_source->>'input_sha256','') !~ '^[a-f0-9]{64}$' OR coalesce(p_source->>'lease_owner','') !~ '^[A-Za-z0-9_-]{1,120}$' OR
    coalesce(p_source->>'step_key','') !~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$' OR coalesce(p_source->>'lease_version','') !~ '^[1-9][0-9]{0,15}$' OR
    NOT agentstudio.knowledge_employee_active(p_reader) THEN RETURN false; END IF;
  autonomous:=p_source->>'execution_mode'='agent_native_v2';parent:=p_source->>'parent_step_key';
  SELECT id,owner_user_id,run_id,kind,payload,status,lease_token,lease_version,lease_owner,lease_until INTO j FROM agentstudio.jobs
    WHERE id=(p_source->>'job_id')::uuid AND owner_user_id=p_reader AND run_id=(p_source->>'run_id')::uuid;
  IF NOT FOUND OR j.status<>'leased' OR j.lease_until<=clock_timestamp() OR j.lease_version IS DISTINCT FROM (p_source->>'lease_version')::bigint OR
    j.lease_owner IS DISTINCT FROM p_source->>'lease_owner' OR encode(sha256(convert_to(j.lease_token::text,'UTF8')),'hex') IS DISTINCT FROM p_source->>'lease_sha256' OR
    j.kind<>(CASE WHEN autonomous THEN 'run_tick' ELSE 'workflow_tick' END) OR j.payload->>'phase' IS DISTINCT FROM p_source->>'execution_mode' THEN RETURN false; END IF;
  SELECT id,owner_user_id,kind,status,workflow_id,agent_spec_id,instruction,checkpoint INTO r FROM agentstudio.runs WHERE id=j.run_id AND owner_user_id=p_reader;
  IF NOT FOUND OR r.status<>'running' OR r.kind<>(CASE WHEN autonomous THEN 'agent' ELSE 'workflow' END) OR
    r.checkpoint->>'stage' IS DISTINCT FROM (CASE WHEN autonomous THEN 'agent_v2_effect_started' ELSE 'workflow_v2_effect_started' END) OR
    r.checkpoint->>'execution_mode' IS DISTINCT FROM p_source->>'execution_mode' OR
    encode(sha256(convert_to(r.checkpoint::text,'UTF8')),'hex') IS DISTINCT FROM p_source->>'checkpoint_sha256' OR
    r.checkpoint->'machine'->>'format' IS DISTINCT FROM 'workflow_native_v2' OR r.checkpoint->'machine'->>'instruction' IS DISTINCT FROM r.instruction OR
    r.checkpoint->'machine'->>'graph_sha256' IS DISTINCT FROM j.payload->>'graph_sha256' THEN RETURN false; END IF;
  IF autonomous THEN
    IF parent IS NULL OR r.workflow_id IS NOT NULL OR r.agent_spec_id::text IS DISTINCT FROM j.payload->>'agent_spec_id' OR r.checkpoint->>'spec_revision' IS DISTINCT FROM j.payload->>'spec_revision' OR
      NOT EXISTS(SELECT 1 FROM agentstudio.agent_specs s WHERE s.id=r.agent_spec_id AND s.owner_user_id=p_reader AND s.revision::text=j.payload->>'spec_revision') THEN RETURN false; END IF;
  ELSE
    IF r.workflow_id::text IS DISTINCT FROM j.payload->>'workflow_id' OR r.checkpoint->>'workflow_revision' IS DISTINCT FROM j.payload->>'workflow_revision' OR
      NOT EXISTS(SELECT 1 FROM agentstudio.workflows w WHERE w.id=r.workflow_id AND w.owner_user_id=p_reader AND w.revision::text=j.payload->>'workflow_revision') THEN RETURN false; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.approvals a WHERE a.run_id=r.id AND a.owner_user_id=p_reader AND a.step_key=p_source->>'step_key'
      AND a.status='approved' AND a.reason_code='wf2:'||(p_source->>'input_sha256')) OR
    NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=r.id AND e.owner_user_id=p_reader AND e.step_key=p_source->>'step_key'
      AND e.status='started' AND e.tool_name='workflow:tool' AND e.arguments_sha256=p_source->>'input_sha256') OR
    NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=r.id AND e.owner_user_id=p_reader AND e.step_key='wf2_tool:'||(p_source->>'step_key')
      AND e.status='started' AND e.tool_name='workflow.tool_bound_dispatch' AND e.arguments_sha256=p_source->>'input_sha256') THEN RETURN false; END IF;
  IF parent IS NULL THEN
    IF p_source->>'step_key' !~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$' THEN RETURN false; END IF;
    SELECT node->'data' INTO data FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') node
      WHERE node->>'id'=substring(p_source->>'step_key' FROM 11) AND node->>'type'='tool';
    IF data->>'tool' IS DISTINCT FROM 'knowledge_search' OR data?'tool_binding' OR data?'mcp_binding' THEN RETURN false; END IF;
  ELSE
    state_spec:=r.checkpoint->'agent_state';
    IF parent !~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$' OR p_source->>'step_key' !~ ('^'||parent||'_a(0[1-9]|[12][0-9]|30)t$') OR
      state_spec->>'format' IS DISTINCT FROM 'workflow_agent_v2' OR state_spec->>'parent_step_key' IS DISTINCT FROM parent OR
      coalesce(state_spec->>'snapshot_sha256','') !~ '^[a-f0-9]{64}$' OR r.checkpoint->'agent_dispatch'->>'step_key' IS DISTINCT FROM p_source->>'step_key' OR
      r.checkpoint->'agent_dispatch'->>'input_sha256' IS DISTINCT FROM p_source->>'input_sha256' OR r.checkpoint->'agent_dispatch'->>'kind' IS DISTINCT FROM 'tool' OR
      r.checkpoint->'agent_dispatch'->>'parent_step_key' IS DISTINCT FROM parent OR
      NOT EXISTS(SELECT 1 FROM agentstudio.agent_specs s WHERE s.id=(state_spec->>'spec_id')::uuid AND s.owner_user_id=p_reader AND s.revision::text=state_spec->>'spec_revision') OR
      NOT EXISTS(SELECT 1 FROM agentstudio.approvals a WHERE a.run_id=r.id AND a.owner_user_id=p_reader AND a.step_key=parent
        AND a.status='approved' AND a.reason_code='wf2:'||(state_spec->>'parent_input_sha256')) THEN RETURN false; END IF;
    IF autonomous AND r.agent_spec_id::text IS DISTINCT FROM state_spec->>'spec_id' THEN RETURN false; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') node WHERE node->>'id'=substring(parent FROM 11)
      AND node->>'type'='agent' AND node->'data'->'agent_binding'->>'spec_id'=state_spec->>'spec_id' AND node->'data'->'agent_binding'->>'spec_revision'=state_spec->>'spec_revision') THEN RETURN false; END IF;
    data:=state_spec->'spec';IF NOT (data->'tools' ? 'knowledge_search') THEN RETURN false; END IF;
  END IF;
  SELECT array_agg(x::uuid ORDER BY x::uuid) INTO ids FROM jsonb_array_elements_text(data->'knowledge_base_ids') x;
  RETURN coalesce(cardinality(ids) BETWEEN 1 AND 3 AND to_jsonb(ids)=p_source->'base_ids',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_execution_source_seal(p_reader uuid,p_source jsonb,p_bases uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE snapshot jsonb; sealed jsonb;
BEGIN
  IF jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR p_source?'checkpoint_sha256' OR p_source?'base_ids' THEN RETURN NULL; END IF;
  SELECT checkpoint INTO snapshot FROM agentstudio.runs WHERE id=(p_source->>'run_id')::uuid AND owner_user_id=p_reader;
  SELECT array_agg(x ORDER BY x) INTO p_bases FROM unnest(p_bases)x;
  sealed:=p_source||jsonb_build_object('checkpoint_sha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),'base_ids',p_bases);
  IF NOT agentstudio.knowledge_execution_source_current(p_reader,sealed) THEN RETURN NULL; END IF;
  RETURN sealed;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN NULL;
END $fn$;
ALTER FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb) OWNER TO agentstudio_knowledge_execution;
ALTER FUNCTION agentstudio.knowledge_execution_source_seal(uuid,jsonb,uuid[]) OWNER TO agentstudio_knowledge_execution;
REVOKE ALL ON FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb),agentstudio.knowledge_execution_source_seal(uuid,jsonb,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb),agentstudio.knowledge_execution_source_seal(uuid,jsonb,uuid[]) TO agentstudio_knowledge_query;
CREATE FUNCTION agentstudio.knowledge_query_execution_submit(p_request uuid,p_bases uuid[],p_query text,p_mode text,p_limit integer,p_profile uuid,p_version bigint,p_consent bigint,p_ack text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); sealed jsonb; prior agentstudio.knowledge_query_jobs%ROWTYPE; digest text; expected uuid; answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();
  sealed:=agentstudio.knowledge_execution_source_seal(actor,p_source,p_bases);
  IF sealed IS NULL THEN RAISE EXCEPTION 'knowledge_execution_source_changed' USING ERRCODE='P0409'; END IF;
  digest:=substring(encode(sha256(convert_to('agentstudio.workflow.knowledge_query.v1:'||actor::text||':'||(sealed->>'run_id')||':'||(sealed->>'step_key'),'UTF8')),'hex') FROM 1 FOR 32);
  expected:=(substring(digest FROM 1 FOR 8)||'-'||substring(digest FROM 9 FOR 4)||'-'||substring(digest FROM 13 FOR 4)||'-'||substring(digest FROM 17 FOR 4)||'-'||substring(digest FROM 21))::uuid;
  IF p_request IS DISTINCT FROM expected THEN RAISE EXCEPTION 'knowledge_execution_request_id_changed' USING ERRCODE='P0409'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6638));
  SELECT * INTO prior FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=actor AND request_id=p_request;
  IF FOUND AND (prior.source_run_id IS DISTINCT FROM (sealed->>'run_id')::uuid OR prior.source_step_key IS DISTINCT FROM sealed->>'step_key') THEN
    RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='P0409'; END IF;
  answer:=agentstudio.knowledge_query_submit(p_request,p_bases,p_query,p_mode,p_limit,p_profile,p_version,p_consent,p_ack);
  IF prior.id IS NULL THEN
    UPDATE agentstudio.knowledge_query_jobs SET execution_source=sealed,source_run_id=(sealed->>'run_id')::uuid,source_step_key=sealed->>'step_key'
      WHERE reader_user_id=actor AND request_id=p_request;
  END IF;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'knowledge_query_execution_submit','knowledge_query',p_request::text,'succeeded',jsonb_build_object('run_id',sealed->>'run_id','step_key',sealed->>'step_key','replayed',answer->'replayed'));
  RETURN answer;
END $fn$;
ALTER FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) OWNER TO agentstudio_knowledge_query;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) TO agentstudio_api;
-- Existing claim/reserve/recheck/finish all call this function. Both sides of
-- provider I/O now require the same still-approved originating execution.
CREATE OR REPLACE FUNCTION agentstudio.knowledge_query_job_current(p_job uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL OR j.expires_at<=clock_timestamp() OR NOT agentstudio.knowledge_query_reader_current(j.reader_user_id,j.profile_id,j.profile_revision,j.consent_revision) THEN RETURN false; END IF;
  IF j.execution_source IS NOT NULL AND NOT agentstudio.knowledge_execution_source_current(j.reader_user_id,j.execution_source) THEN RETURN false; END IF;
  RETURN (agentstudio.knowledge_query_scope(j.reader_user_id,j.base_ids,true)->'fence')=j.scope_fence;
EXCEPTION WHEN SQLSTATE 'P0403' OR SQLSTATE 'P0404' THEN RETURN false;
END $fn$;
ALTER FUNCTION agentstudio.knowledge_query_job_current(uuid) OWNER TO agentstudio_knowledge_query;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_039','Inactive execution-source foundation for approved knowledge tools; durable logical-step and current-lease fences');
COMMIT;
