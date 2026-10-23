-- Single-shot Agent's original keyword evidence. No activation/provider calls.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_041') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_agent') THEN
    RAISE EXCEPTION 'agent_observations_require_reviewed_pg_v9_041_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_knowledge_agent NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_agent;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_knowledge_agent;
CREATE TABLE agentstudio.knowledge_agent_observations(
  reader_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  input_sha256 text CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  query_sha256 text NOT NULL CHECK(query_sha256 ~ '^[a-f0-9]{64}$'),
  corpus_sha256 text NOT NULL CHECK(corpus_sha256 ~ '^[a-f0-9]{64}$'),
  base_ids uuid[] NOT NULL CHECK(cardinality(base_ids) BETWEEN 0 AND 3),
  execution_source jsonb NOT NULL CHECK(jsonb_typeof(execution_source)='object' AND octet_length(execution_source::text)<=4096),
  scope_fence jsonb NOT NULL CHECK(jsonb_typeof(scope_fence)='array' AND octet_length(scope_fence::text)<=4096),
  result_refs jsonb NOT NULL CHECK(jsonb_typeof(result_refs)='array' AND jsonb_array_length(result_refs)<=6 AND octet_length(result_refs::text)<=8192),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(reader_user_id,run_id)
);
-- No cascading FK may erase the original source fence.
ALTER TABLE agentstudio.knowledge_agent_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_agent_observations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.knowledge_agent_observations FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.knowledge_agent_observations TO agentstudio_knowledge_agent;
GRANT UPDATE(input_sha256) ON agentstudio.knowledge_agent_observations TO agentstudio_knowledge_agent;
CREATE POLICY agent_observations_private ON agentstudio.knowledge_agent_observations TO agentstudio_knowledge_agent USING(true) WITH CHECK(true);
GRANT SELECT(step_count) ON agentstudio.runs TO agentstudio_knowledge_execution;

-- Metadata stays behind the existing execution role. No raw text, account,
-- credential, vector or business-table grants to the new ledger helper.
CREATE FUNCTION agentstudio.knowledge_agent_source(p_reader uuid,p_source jsonb,p_bases uuid[],p_preparing boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j record; r record; s record; version bigint;
BEGIN
  IF p_reader IS NULL OR NOT coalesce(agentstudio.knowledge_employee_active(p_reader),false) OR
    p_source IS NULL OR jsonb_typeof(p_source)<>'object' OR octet_length(p_source::text)>4096 OR
    p_preparing IS NULL OR p_bases IS NULL OR cardinality(p_bases) NOT BETWEEN 0 AND 3 OR
    cardinality(p_bases)<>(SELECT count(DISTINCT x) FROM unnest(p_bases)x) OR
    p_source-ARRAY['run_id','job_id','lease_sha256','lease_version','lease_owner','spec_id','spec_revision']<>'{}'::jsonb OR
    NOT(p_source?&ARRAY['run_id','job_id','lease_sha256','lease_version','lease_owner']) OR
    p_source->>'lease_sha256' !~ '^[a-f0-9]{64}$' OR p_source->>'lease_owner' !~ '^[A-Za-z0-9_-]{1,120}$' THEN RETURN NULL; END IF;
  SELECT id,owner_user_id,run_id,payload INTO j FROM agentstudio.jobs WHERE id=(p_source->>'job_id')::uuid AND
    run_id=(p_source->>'run_id')::uuid AND owner_user_id=p_reader AND kind='run_tick' AND payload->>'phase'='model' AND
    status='leased' AND lease_until>clock_timestamp() AND lease_version=(p_source->>'lease_version')::bigint AND
    lease_owner=p_source->>'lease_owner' AND encode(sha256(convert_to(lease_token::text,'UTF8')),'hex')=p_source->>'lease_sha256';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id,agent_spec_id,status,checkpoint INTO r FROM agentstudio.runs WHERE id=j.run_id AND owner_user_id=p_reader AND kind='agent' AND
    coalesce(checkpoint->>'execution_mode','')<>'agent_native_v2';
  IF NOT FOUND OR r.status IS DISTINCT FROM (CASE WHEN p_preparing THEN 'queued' ELSE 'running' END) OR
    r.checkpoint->>'stage' IS DISTINCT FROM (CASE WHEN p_preparing THEN 'model_queued' ELSE 'model_running' END) THEN RETURN NULL; END IF;
  version:=(j.payload->>'spec_revision')::bigint;
  SELECT id,revision,spec INTO s FROM agentstudio.agent_specs WHERE id=r.agent_spec_id AND owner_user_id=p_reader;
  IF NOT FOUND OR version<1 OR s.revision<>version OR (r.checkpoint->>'spec_revision')::bigint IS DISTINCT FROM version OR
    coalesce(s.spec->'knowledge_base_ids','[]'::jsonb)<>to_jsonb(p_bases) OR s.spec?'knowledge_retrieval' OR
    coalesce(jsonb_array_length(s.spec->'http_tools'),0)>0 OR coalesce(jsonb_array_length(s.spec->'mcp_tools'),0)>0 OR
    cardinality(p_bases)>0 AND NOT(coalesce(s.spec->'tools','[]'::jsonb)?'knowledge_search') OR
    NOT EXISTS(SELECT 1 FROM agentstudio.approvals WHERE run_id=j.run_id AND owner_user_id=p_reader AND step_key='model' AND status='approved') THEN RETURN NULL; END IF;
  IF s.spec?'model_binding' AND NOT EXISTS(SELECT 1 FROM agentstudio.model_connections m WHERE m.id=(s.spec->'model_binding'->>'connection_id')::uuid AND m.owner_user_id=p_reader AND
    m.revision=(s.spec->'model_binding'->>'connection_revision')::bigint AND m.enabled AND m.status='ok' AND m.models?(s.spec->'model_binding'->>'model_id')) THEN RETURN NULL; END IF;
  IF p_preparing THEN
    IF p_source?'spec_id' OR p_source?'spec_revision' OR EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=j.run_id AND owner_user_id=p_reader AND step_key='model') THEN RETURN NULL; END IF;
    RETURN p_source||jsonb_build_object('spec_id',s.id,'spec_revision',version);
  END IF;
  IF p_source->>'spec_id' IS DISTINCT FROM s.id::text OR (p_source->>'spec_revision')::bigint IS DISTINCT FROM version OR
    NOT EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=j.run_id AND owner_user_id=p_reader AND step_key='model' AND tool_name='model.generate' AND status='started') THEN RETURN NULL; END IF;
  RETURN p_source;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN NULL;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_agent_effect_current(p_reader uuid,p_run uuid,p_sha text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(agentstudio.knowledge_employee_active(p_reader),false) AND EXISTS(
    SELECT 1 FROM agentstudio.runs r JOIN agentstudio.approvals a ON a.run_id=r.id AND a.owner_user_id=r.owner_user_id AND a.step_key='model'
    JOIN agentstudio.external_effects e ON e.run_id=r.id AND e.owner_user_id=r.owner_user_id AND e.step_key='model'
    WHERE r.id=p_run AND r.owner_user_id=p_reader AND r.kind='agent' AND coalesce(r.checkpoint->>'execution_mode','')<>'agent_native_v2' AND
      a.status='approved' AND e.tool_name='model.generate' AND e.arguments_sha256=p_sha AND e.status IN ('started','succeeded'))
$fn$;
CREATE FUNCTION agentstudio.knowledge_agent_before_model(p_reader uuid,p_run uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce(agentstudio.knowledge_employee_active(p_reader),false) AND EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=p_run AND r.owner_user_id=p_reader AND
    r.kind='agent' AND r.status<>'succeeded' AND coalesce(r.checkpoint->>'execution_mode','')<>'agent_native_v2' AND r.step_count<2 AND
    NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=r.id AND e.owner_user_id=r.owner_user_id AND e.step_key='model'))
$fn$;
CREATE FUNCTION agentstudio.knowledge_agent_observation_current(p_reader uuid,p_run uuid,p_sealed boolean,p_live boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE item agentstudio.knowledge_agent_observations%ROWTYPE; fence jsonb;
BEGIN
  SELECT * INTO item FROM agentstudio.knowledge_agent_observations WHERE reader_user_id=p_reader AND run_id=p_run;
  IF NOT FOUND THEN RETURN false; END IF;
  fence:=CASE WHEN cardinality(item.base_ids)=0 THEN '[]'::jsonb ELSE agentstudio.knowledge_keyword_scope(p_reader,item.base_ids) END;
  IF fence IS DISTINCT FROM item.scope_fence OR agentstudio.knowledge_keyword_corpus_fence(item.base_ids) IS DISTINCT FROM item.corpus_sha256 OR
    NOT agentstudio.knowledge_keyword_content_current(item.result_refs) OR
    p_live AND agentstudio.knowledge_agent_source(p_reader,item.execution_source,item.base_ids,false) IS NULL OR
    p_sealed AND (item.input_sha256 IS NULL OR NOT agentstudio.knowledge_agent_effect_current(p_reader,p_run,item.input_sha256)) THEN RETURN false; END IF;
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_agent_prepare(p_source jsonb,p_bases uuid[],p_query text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE reader uuid:=agentstudio.actor_id(); sealed jsonb; fence jsonb; snapshot jsonb; evidence jsonb;
BEGIN
  sealed:=agentstudio.knowledge_agent_source(reader,p_source,p_bases,true);
  fence:=CASE WHEN cardinality(p_bases)=0 THEN '[]'::jsonb ELSE agentstudio.knowledge_keyword_scope(reader,p_bases) END;
  IF sealed IS NULL OR fence IS NULL THEN RAISE EXCEPTION 'agent_knowledge_source_changed' USING ERRCODE='P0409'; END IF;
  IF cardinality(p_bases)=0 THEN snapshot:=jsonb_build_object('hits','[]'::jsonb,'refs','[]'::jsonb,'corpus_sha256',agentstudio.knowledge_keyword_corpus_fence(p_bases));
  ELSE snapshot:=agentstudio.knowledge_keyword_snapshot(p_bases,p_query); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('citation',x->'citation','snippet',x->'snippet') ORDER BY n),'[]'::jsonb) INTO evidence FROM jsonb_array_elements(snapshot->'hits') WITH ORDINALITY t(x,n);
  IF cardinality(p_bases)>0 AND agentstudio.knowledge_keyword_scope(reader,p_bases) IS DISTINCT FROM fence OR
    agentstudio.knowledge_keyword_corpus_fence(p_bases) IS DISTINCT FROM snapshot->>'corpus_sha256' OR NOT agentstudio.knowledge_keyword_content_current(snapshot->'refs') THEN
    RAISE EXCEPTION 'agent_knowledge_content_changed' USING ERRCODE='P0409'; END IF;
  INSERT INTO agentstudio.knowledge_agent_observations(reader_user_id,run_id,evidence_sha256,query_sha256,corpus_sha256,base_ids,execution_source,scope_fence,result_refs)
    VALUES(reader,(sealed->>'run_id')::uuid,encode(sha256(convert_to(evidence::text,'UTF8')),'hex'),encode(sha256(convert_to(coalesce(p_query,''),'UTF8')),'hex'),
      snapshot->>'corpus_sha256',p_bases,sealed,fence,snapshot->'refs');
  RETURN snapshot->'hits';
END $fn$;
CREATE FUNCTION agentstudio.knowledge_agent_seal(p_run uuid,p_sha text,p_evidence jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE reader uuid:=agentstudio.actor_id(); changed integer;
BEGIN
  IF p_sha IS NULL OR p_sha !~ '^[a-f0-9]{64}$' OR p_evidence IS NULL OR jsonb_typeof(p_evidence)<>'array' OR octet_length(p_evidence::text)>16384 OR
    NOT agentstudio.knowledge_agent_observation_current(reader,p_run,false,true) OR NOT agentstudio.knowledge_agent_effect_current(reader,p_run,p_sha) THEN RETURN false; END IF;
  UPDATE agentstudio.knowledge_agent_observations SET input_sha256=p_sha WHERE reader_user_id=reader AND run_id=p_run AND input_sha256 IS NULL AND
    evidence_sha256=encode(sha256(convert_to(p_evidence::text,'UTF8')),'hex');
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_agent_validate_input(p_run uuid,p_sha text,p_evidence jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT p_evidence IS NOT NULL AND jsonb_typeof(p_evidence)='array' AND octet_length(p_evidence::text)<=16384 AND
    agentstudio.knowledge_agent_observation_current(agentstudio.actor_id(),p_run,true,true) AND EXISTS(
      SELECT 1 FROM agentstudio.knowledge_agent_observations WHERE reader_user_id=agentstudio.actor_id() AND run_id=p_run AND input_sha256=p_sha AND
        evidence_sha256=encode(sha256(convert_to(p_evidence::text,'UTF8')),'hex'))
$fn$;
CREATE FUNCTION agentstudio.knowledge_agent_validate_run(p_run uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE reader uuid:=agentstudio.actor_id();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_agent_observations WHERE reader_user_id=reader AND run_id=p_run) THEN
    RETURN agentstudio.knowledge_agent_before_model(reader,p_run); END IF;
  RETURN agentstudio.knowledge_agent_observation_current(reader,p_run,true,false);
END $fn$;
DO $functions$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['knowledge_agent_source(uuid,jsonb,uuid[],boolean)','knowledge_agent_effect_current(uuid,uuid,text)','knowledge_agent_before_model(uuid,uuid)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_execution';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION agentstudio.'||f||' TO agentstudio_knowledge_agent';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['knowledge_agent_observation_current(uuid,uuid,boolean,boolean)','knowledge_agent_prepare(jsonb,uuid[],text)','knowledge_agent_seal(uuid,text,jsonb)',
    'knowledge_agent_validate_input(uuid,text,jsonb)','knowledge_agent_validate_run(uuid)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_agent';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_scope(uuid,uuid[]),agentstudio.knowledge_keyword_snapshot(uuid[],text),
  agentstudio.knowledge_keyword_corpus_fence(uuid[]),agentstudio.knowledge_keyword_content_current(jsonb) TO agentstudio_knowledge_agent;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_agent_prepare(jsonb,uuid[],text),agentstudio.knowledge_agent_seal(uuid,text,jsonb),
  agentstudio.knowledge_agent_validate_input(uuid,text,jsonb),agentstudio.knowledge_agent_validate_run(uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_042','Private original single-shot Agent keyword evidence, atomic effect sealing and current input/public-output validation');
COMMIT;
