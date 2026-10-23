-- Isolated approved Tool execution only. All runtime switches remain off.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_039') THEN RAISE EXCEPTION 'semantic_tools_require_reviewed_pg_v9_039'; END IF;
END $preflight$;
ALTER TABLE agentstudio.approvals ADD COLUMN knowledge_query_charge_acknowledged boolean NOT NULL DEFAULT false;
ALTER TABLE agentstudio.knowledge_query_jobs ADD COLUMN execution_resource_sha256 text,
  ADD COLUMN execution_fee_binding jsonb,
  ADD COLUMN execution_evidence jsonb CHECK(execution_evidence IS NULL OR execution_source IS NOT NULL AND jsonb_typeof(execution_evidence)='object' AND octet_length(execution_evidence::text)<=16384),
  ADD CONSTRAINT knowledge_query_execution_metadata CHECK(
    (execution_resource_sha256 IS NULL AND execution_fee_binding IS NULL) OR
    (execution_source IS NOT NULL AND execution_resource_sha256 ~ '^[a-f0-9]{64}$' AND jsonb_typeof(execution_fee_binding)='object' AND octet_length(execution_fee_binding::text)<=1024));
GRANT SELECT(knowledge_query_charge_acknowledged) ON agentstudio.approvals TO agentstudio_knowledge_execution;
GRANT SELECT(spec) ON agentstudio.agent_specs TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,revision,enabled,status,provider,base_url,models) ON agentstudio.model_connections TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,revision,enabled,status,url,method,body_template,timeout_s) ON agentstudio.tool_connections TO agentstudio_knowledge_execution;
GRANT SELECT(id,tool_connection_id,header_name,updated_at) ON agentstudio.tool_connection_headers TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,revision,enabled,status,url,catalog) ON agentstudio.mcp_connections TO agentstudio_knowledge_execution;
GRANT SELECT(id,mcp_connection_id,header_name,updated_at) ON agentstudio.mcp_connection_headers TO agentstudio_knowledge_execution;
GRANT SELECT(id,owner_user_id,visibility,revision) ON agentstudio.knowledge_bases TO agentstudio_knowledge_execution;
GRANT SELECT(base_id,owner_user_id,recipient_user_id,access_role,semantic_allowed,revoked,revision) ON agentstudio.knowledge_access TO agentstudio_knowledge_execution;
CREATE POLICY knowledge_execution_models ON agentstudio.model_connections FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_tools ON agentstudio.tool_connections FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_tool_headers ON agentstudio.tool_connection_headers FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_mcp ON agentstudio.mcp_connections FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_mcp_headers ON agentstudio.mcp_connection_headers FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_bases ON agentstudio.knowledge_bases FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE POLICY knowledge_execution_access ON agentstudio.knowledge_access FOR SELECT TO agentstudio_knowledge_execution USING(true);
CREATE FUNCTION agentstudio.knowledge_tool_enabled() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF coalesce(current_setting('agentstudio.knowledge_tool_runtime_enabled',true),'false')<>'true' THEN
    RAISE EXCEPTION 'knowledge_tools_disabled' USING ERRCODE='P0403'; END IF;
END $fn$;
-- Hash only resources referenced by the frozen graph and its declared Agents.
-- Never hash whole rows: credential columns must not be read even by this role.
CREATE FUNCTION agentstudio.knowledge_execution_resource_fence(p_reader uuid,p_checkpoint jsonb) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
WITH nodes AS(SELECT n->'data' AS data FROM jsonb_array_elements(p_checkpoint->'graph'->'nodes') n),
agent_ids AS(SELECT (data->'agent_binding'->>'spec_id')::uuid id FROM nodes WHERE data?'agent_binding'
  UNION SELECT (p_checkpoint->'agent_state'->>'spec_id')::uuid WHERE p_checkpoint?'agent_state'),
specs AS(SELECT s.id,s.revision,s.spec FROM agentstudio.agent_specs s JOIN agent_ids a ON a.id=s.id WHERE s.owner_user_id=p_reader),
configs AS(SELECT data FROM nodes UNION ALL SELECT spec FROM specs),
models AS(SELECT DISTINCT (data->'model_binding'->>'connection_id')::uuid id FROM configs WHERE data?'model_binding'),
tools AS(SELECT (data->'tool_binding'->>'connection_id')::uuid id FROM configs WHERE data?'tool_binding'
  UNION SELECT (t->>'connection_id')::uuid FROM configs CROSS JOIN LATERAL jsonb_array_elements(coalesce(data->'http_tools','[]'::jsonb)) t),
mcps AS(SELECT (data->'mcp_binding'->>'connection_id')::uuid id FROM configs WHERE data?'mcp_binding'
  UNION SELECT (t->>'connection_id')::uuid FROM configs CROSS JOIN LATERAL jsonb_array_elements(coalesce(data->'mcp_tools','[]'::jsonb)) t),
bases AS(SELECT DISTINCT t::uuid id FROM configs CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(data->'knowledge_base_ids','[]'::jsonb)) t),
metadata AS(
  SELECT 'agent' kind,a.id::text id,jsonb_build_array(s.id,s.revision,s.spec) value FROM agent_ids a LEFT JOIN specs s ON s.id=a.id
  UNION ALL SELECT 'model',r.id::text,jsonb_build_array(c.id,c.revision,c.enabled,c.status,c.provider,c.base_url,c.models) FROM models r
    LEFT JOIN agentstudio.model_connections c ON c.id=r.id AND c.owner_user_id=p_reader
  UNION ALL SELECT 'tool',r.id::text,jsonb_build_array(c.id,c.revision,c.enabled,c.status,c.url,c.method,c.body_template,c.timeout_s,
    (SELECT jsonb_agg(jsonb_build_array(h.id,h.header_name,h.updated_at) ORDER BY h.id) FROM agentstudio.tool_connection_headers h WHERE h.tool_connection_id=c.id)) FROM tools r
    LEFT JOIN agentstudio.tool_connections c ON c.id=r.id AND c.owner_user_id=p_reader
  UNION ALL SELECT 'mcp',r.id::text,jsonb_build_array(c.id,c.revision,c.enabled,c.status,c.url,c.catalog,
    (SELECT jsonb_agg(jsonb_build_array(h.id,h.header_name,h.updated_at) ORDER BY h.id) FROM agentstudio.mcp_connection_headers h WHERE h.mcp_connection_id=c.id)) FROM mcps r
    LEFT JOIN agentstudio.mcp_connections c ON c.id=r.id AND c.owner_user_id=p_reader
  UNION ALL SELECT 'knowledge',r.id::text,jsonb_build_array(k.id,k.owner_user_id,k.visibility,k.revision,agentstudio.knowledge_employee_active(k.owner_user_id),
    a.access_role,a.semantic_allowed,a.revoked,a.revision) FROM bases r LEFT JOIN agentstudio.knowledge_bases k ON k.id=r.id
    LEFT JOIN agentstudio.knowledge_access a ON a.base_id=k.id AND a.recipient_user_id=p_reader
)
SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(kind,id,value) ORDER BY kind,id),'[]'::jsonb)::text,'UTF8')),'hex') FROM metadata
$fn$;
CREATE FUNCTION agentstudio.knowledge_execution_semantic_state(p_reader uuid,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_checkpoint jsonb; v_data jsonb; v_binding jsonb; v_fence text;
BEGIN
  IF NOT agentstudio.knowledge_execution_source_current(p_reader,p_source) THEN RETURN NULL; END IF;
  SELECT checkpoint INTO v_checkpoint FROM agentstudio.runs WHERE id=(p_source->>'run_id')::uuid AND owner_user_id=p_reader;
  IF p_source->>'parent_step_key' IS NULL THEN
    SELECT n->'data' INTO v_data FROM jsonb_array_elements(v_checkpoint->'graph'->'nodes') n WHERE n->>'id'=substring(p_source->>'step_key' FROM 11);
  ELSE v_data:=v_checkpoint->'agent_state'->'spec'; END IF;
  v_binding:=v_data->'knowledge_retrieval';
  IF jsonb_typeof(v_binding) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_binding) key) IS DISTINCT FROM
    ARRAY['consent_revision','mode','profile_id','profile_revision']::text[] OR
    coalesce(v_binding->>'mode','') NOT IN ('semantic','hybrid') OR
    NOT EXISTS(SELECT 1 FROM agentstudio.approvals a WHERE a.run_id=(p_source->>'run_id')::uuid AND a.owner_user_id=p_reader
      AND a.step_key=p_source->>'step_key' AND a.status='approved' AND a.knowledge_query_charge_acknowledged) THEN RETURN NULL; END IF;
  v_fence:=agentstudio.knowledge_execution_resource_fence(p_reader,v_checkpoint);
  RETURN jsonb_build_object('binding',v_binding,'resources_sha256',v_fence);
END $fn$;
CREATE FUNCTION agentstudio.knowledge_execution_observation_current(p_reader uuid,p_run uuid,p_step text,p_sha text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM agentstudio.runs r JOIN agentstudio.approvals a ON a.run_id=r.id AND a.owner_user_id=r.owner_user_id AND a.step_key=p_step
   JOIN agentstudio.external_effects e ON e.run_id=r.id AND e.owner_user_id=r.owner_user_id AND e.step_key=p_step
   JOIN agentstudio.external_effects b ON b.run_id=r.id AND b.owner_user_id=r.owner_user_id AND b.step_key='wf2_tool:'||p_step
   WHERE r.id=p_run AND r.owner_user_id=p_reader AND a.status='approved' AND a.reason_code='wf2:'||p_sha AND a.knowledge_query_charge_acknowledged
     AND e.status='succeeded' AND e.tool_name='workflow:tool' AND e.arguments_sha256=p_sha
     AND b.status='succeeded' AND b.tool_name='workflow.tool_bound_dispatch' AND b.arguments_sha256=p_sha)
$fn$;
-- Keep the old ledger implementation private; no API may bypass fee checks.
ALTER FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) RENAME TO knowledge_query_execution_submit_before_semantic;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_submit_before_semantic(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) FROM PUBLIC,agentstudio_api;
CREATE FUNCTION agentstudio.knowledge_query_execution_submit(p_request uuid,p_bases uuid[],p_query text,p_mode text,p_limit integer,p_profile uuid,p_version bigint,p_consent bigint,p_ack text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_actor uuid:=agentstudio.knowledge_embedding_consent_actor(); v_source jsonb; v_meta jsonb; v_answer jsonb; v_binding jsonb;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();
  PERFORM agentstudio.knowledge_tool_enabled();
  v_source:=agentstudio.knowledge_execution_source_seal(v_actor,p_source,p_bases);
  v_meta:=agentstudio.knowledge_execution_semantic_state(v_actor,v_source);v_binding:=v_meta->'binding';
  IF v_meta IS NULL OR p_limit NOT BETWEEN 1 AND 6 OR v_binding->>'mode' IS DISTINCT FROM p_mode OR
    (v_binding->>'profile_id')::uuid IS DISTINCT FROM p_profile OR (v_binding->>'profile_revision')::bigint IS DISTINCT FROM p_version OR
    (v_binding->>'consent_revision')::bigint IS DISTINCT FROM p_consent OR p_ack IS DISTINCT FROM 'PAY_ONCE_FOR_THIS_READER_QUERY' THEN
    RAISE EXCEPTION 'knowledge_execution_binding_changed' USING ERRCODE='P0409'; END IF;
  IF (SELECT count(*) FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=v_actor AND source_run_id=(v_source->>'run_id')::uuid)>=200 AND
    NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=v_actor AND request_id=p_request) THEN
    RAISE EXCEPTION 'knowledge_execution_observation_limit' USING ERRCODE='P0429'; END IF;
  v_answer:=agentstudio.knowledge_query_execution_submit_before_semantic(p_request,p_bases,p_query,p_mode,p_limit,p_profile,p_version,p_consent,p_ack,p_source);
  IF NOT (v_answer->>'replayed')::boolean THEN UPDATE agentstudio.knowledge_query_jobs SET execution_resource_sha256=v_meta->>'resources_sha256',execution_fee_binding=v_binding
    WHERE reader_user_id=v_actor AND request_id=p_request; END IF;
  RETURN v_answer;
END $fn$;
CREATE OR REPLACE FUNCTION agentstudio.knowledge_query_job_current(p_job uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE; v_meta jsonb;
BEGIN
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL OR j.expires_at<=clock_timestamp() OR NOT agentstudio.knowledge_query_reader_current(j.reader_user_id,j.profile_id,j.profile_revision,j.consent_revision) THEN RETURN false; END IF;
  IF j.execution_source IS NOT NULL THEN
    IF coalesce(current_setting('agentstudio.knowledge_tool_runtime_enabled',true),'false')<>'true' THEN RETURN false; END IF;
    v_meta:=agentstudio.knowledge_execution_semantic_state(j.reader_user_id,j.execution_source);
    IF v_meta IS NULL OR j.execution_resource_sha256 IS DISTINCT FROM v_meta->>'resources_sha256' OR j.execution_fee_binding IS DISTINCT FROM v_meta->'binding' THEN RETURN false; END IF;
    IF NOT agentstudio.knowledge_query_execution_observations_current(j.reader_user_id,j.source_run_id,j.source_step_key) THEN RETURN false; END IF;
  END IF;
  RETURN (agentstudio.knowledge_query_scope(j.reader_user_id,j.base_ids,true)->'fence')=j.scope_fence;
EXCEPTION WHEN SQLSTATE 'P0403' OR SQLSTATE 'P0404' THEN RETURN false;
END $fn$;
-- A Workflow may wait for a human beyond the short standalone query TTL.
-- Retain only references/hashes/fences for the completed effect. Query text and
-- public search snippets still expire and are purged by the existing Worker.
CREATE FUNCTION agentstudio.knowledge_query_execution_keep_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.execution_source IS NOT NULL AND NEW.status='succeeded' AND NEW.result_refs IS NOT NULL AND NEW.execution_evidence IS NULL THEN
    UPDATE agentstudio.knowledge_query_jobs SET execution_evidence=jsonb_build_object('scope_fence',NEW.scope_fence,'result_refs',NEW.result_refs)
      WHERE id=NEW.id AND execution_evidence IS NULL;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER knowledge_query_execution_evidence AFTER UPDATE OF status,result_refs ON agentstudio.knowledge_query_jobs
  FOR EACH ROW EXECUTE FUNCTION agentstudio.knowledge_query_execution_keep_evidence();
CREATE FUNCTION agentstudio.knowledge_query_execution_evidence_current(p_job uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL OR j.status<>'succeeded' OR j.execution_evidence IS NULL OR jsonb_typeof(j.execution_evidence->'result_refs'->'items') IS DISTINCT FROM 'array' OR
    NOT agentstudio.knowledge_query_reader_current(j.reader_user_id,j.profile_id,j.profile_revision,j.consent_revision) OR
    (agentstudio.knowledge_query_scope(j.reader_user_id,j.base_ids,true)->'fence') IS DISTINCT FROM j.execution_evidence->'scope_fence' THEN RETURN false; END IF;
  RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.execution_evidence->'result_refs'->'items') x
    LEFT JOIN agentstudio.knowledge_chunks c ON c.id=(x->>'chunk_id')::uuid
    LEFT JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    WHERE c.id IS NULL OR d.id IS DISTINCT FROM (x->>'document_id')::uuid OR d.base_id IS DISTINCT FROM (x->>'base_id')::uuid OR d.status IS DISTINCT FROM 'indexed'
      OR x->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(c.text_content,'UTF8')),'hex') OR
      x ? 'semantic_score' AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_vectors v WHERE v.chunk_id=c.id AND v.owner_user_id=c.owner_user_id
        AND v.chunk_sha256=x->>'sha256' AND v.updated_at=(x->>'vector_updated_at')::timestamptz));
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_execution_observations_current(p_reader uuid,p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j record; v_count integer:=0;
BEGIN
  p_current_step:=coalesce(p_current_step,'');
  IF p_reader IS NULL OR p_run IS NULL OR NOT coalesce(agentstudio.knowledge_employee_active(p_reader),false) THEN RETURN false; END IF;
  FOR j IN SELECT id,status,execution_source FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=p_reader AND source_run_id=p_run AND source_step_key<>p_current_step LOOP
    PERFORM agentstudio.knowledge_tool_enabled();
    v_count:=v_count+1;IF v_count>200 OR j.status<>'succeeded' THEN RETURN false; END IF;
    IF NOT agentstudio.knowledge_execution_observation_current(p_reader,p_run,j.execution_source->>'step_key',j.execution_source->>'input_sha256') THEN RETURN false; END IF;
    IF NOT agentstudio.knowledge_query_execution_evidence_current(j.id) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN SQLSTATE 'P0403' OR SQLSTATE 'P0404' OR SQLSTATE 'P0409' THEN RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_execution_validate_run(p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_current(agentstudio.actor_id(),p_run,p_current_step)
$fn$;
DO $functions$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['knowledge_execution_resource_fence(uuid,jsonb)','knowledge_execution_semantic_state(uuid,jsonb)','knowledge_execution_observation_current(uuid,uuid,text,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_execution';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION agentstudio.'||f||' TO agentstudio_knowledge_query';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb)','knowledge_query_execution_validate_run(uuid,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_query';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION agentstudio.'||f||' TO agentstudio_api';
  END LOOP;
  ALTER FUNCTION agentstudio.knowledge_tool_enabled() OWNER TO agentstudio_knowledge_query;
  REVOKE ALL ON FUNCTION agentstudio.knowledge_tool_enabled() FROM PUBLIC;
  ALTER FUNCTION agentstudio.knowledge_query_execution_keep_evidence() OWNER TO agentstudio_knowledge_query;
  ALTER FUNCTION agentstudio.knowledge_query_execution_evidence_current(uuid) OWNER TO agentstudio_knowledge_query;
  ALTER FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) OWNER TO agentstudio_knowledge_query;
  REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_keep_evidence(),agentstudio.knowledge_query_execution_evidence_current(uuid),agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) FROM PUBLIC;
END $functions$;
ALTER FUNCTION agentstudio.knowledge_query_job_current(uuid) OWNER TO agentstudio_knowledge_query;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_040','Approved semantic Tool charge intents, referenced-resource fences and current run observation validation');
COMMIT;
