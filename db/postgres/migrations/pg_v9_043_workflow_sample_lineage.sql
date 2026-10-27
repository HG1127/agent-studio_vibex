-- Original provenance for automatic historical samples. No runtime activation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_042') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_lineage') THEN
    RAISE EXCEPTION 'sample_lineage_requires_reviewed_pg_v9_042_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_knowledge_lineage NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_lineage;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_knowledge_lineage;
CREATE TABLE agentstudio.workflow_sample_lineage(
  reader_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  debug_sha256 text NOT NULL CHECK(debug_sha256 ~ '^[a-f0-9]{64}$'),
  provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object' AND octet_length(provenance::text)<=4096),
  source_run_id uuid,
  source_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(reader_user_id,run_id),
  CHECK((provenance->>'kind'='manual' AND source_run_id IS NULL AND source_sha256 IS NULL) OR
    (provenance->>'kind'='history' AND source_run_id IS NOT NULL AND source_run_id<>run_id AND source_sha256 IS NOT NULL AND source_sha256 ~ '^[a-f0-9]{64}$'))
);
-- Deleting a source/target cannot silently erase its provenance fence.
ALTER TABLE agentstudio.workflow_sample_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.workflow_sample_lineage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.workflow_sample_lineage FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.workflow_sample_lineage TO agentstudio_knowledge_lineage;
CREATE POLICY sample_lineage_private ON agentstudio.workflow_sample_lineage TO agentstudio_knowledge_lineage USING(true) WITH CHECK(true);

-- Existing metadata role already reads these columns; no new raw text,
-- credential, account, vector or ordinary table grants are introduced.
CREATE FUNCTION agentstudio.knowledge_lineage_context(p_reader uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r record; debug jsonb;
BEGIN
  IF NOT coalesce(agentstudio.knowledge_employee_active(p_reader),false) THEN RETURN NULL; END IF;
  SELECT id,workflow_id,kind,status,instruction,checkpoint,step_count INTO r FROM agentstudio.runs WHERE id=p_run AND owner_user_id=p_reader;
  IF NOT FOUND OR coalesce(r.checkpoint->>'execution_mode','') NOT IN ('workflow_native_v2','agent_native_v2') THEN RETURN NULL; END IF;
  debug:=r.checkpoint->'node_debug';
  IF debug IS NOT NULL AND (r.kind<>'workflow' OR r.checkpoint->>'execution_mode'<>'workflow_native_v2' OR jsonb_typeof(debug)<>'object') THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('workflow_id',r.workflow_id,'workflow_revision',r.checkpoint->'workflow_revision','debug',debug IS NOT NULL,
    'debug_sha256',CASE WHEN debug IS NULL THEN NULL ELSE encode(sha256(convert_to(debug::text,'UTF8')),'hex') END,
    'provenance',debug->'samples'->'provenance',
    'source_sha256',encode(sha256(convert_to(jsonb_build_array(r.workflow_id,r.checkpoint->'graph',r.checkpoint->'machine',r.instruction)::text,'UTF8')),'hex'),
    'registerable',r.status='queued' AND r.step_count=0 AND r.checkpoint->>'stage'='workflow_v2_queued' AND
      coalesce((r.checkpoint->'machine'->>'cursor')::integer,-1)=0 AND NOT EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=p_run AND owner_user_id=p_reader));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN NULL;
END $fn$;
ALTER FUNCTION agentstudio.knowledge_lineage_context(uuid,uuid) OWNER TO agentstudio_knowledge_execution;
REVOKE ALL ON FUNCTION agentstudio.knowledge_lineage_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_lineage_context(uuid,uuid) TO agentstudio_knowledge_lineage;

ALTER FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) RENAME TO knowledge_query_execution_observations_before_lineage;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_observations_before_lineage(uuid,uuid,text) FROM PUBLIC,agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_observations_before_lineage(uuid,uuid,text) TO agentstudio_knowledge_lineage;

CREATE FUNCTION agentstudio.knowledge_lineage_walk(p_reader uuid,p_run uuid,p_seen uuid[]) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; item agentstudio.workflow_sample_lineage%ROWTYPE; source jsonb;
BEGIN
  IF p_run IS NULL OR p_seen IS NULL OR cardinality(p_seen)>=8 OR p_run=ANY(p_seen) THEN RETURN false; END IF;
  context:=agentstudio.knowledge_lineage_context(p_reader,p_run);
  IF context IS NULL THEN RETURN false; END IF;
  SELECT * INTO item FROM agentstudio.workflow_sample_lineage WHERE reader_user_id=p_reader AND run_id=p_run;
  IF NOT FOUND THEN RETURN context->'debug'='false'::jsonb; END IF;
  IF context->'debug' IS DISTINCT FROM 'true'::jsonb OR context->>'debug_sha256' IS DISTINCT FROM item.debug_sha256 OR
    context->'provenance' IS DISTINCT FROM item.provenance THEN RETURN false; END IF;
  IF item.source_run_id IS NULL THEN RETURN item.provenance='{"kind":"manual"}'::jsonb; END IF;
  source:=agentstudio.knowledge_lineage_context(p_reader,item.source_run_id);
  IF source IS NULL OR source->>'source_sha256' IS DISTINCT FROM item.source_sha256 OR
    source->>'workflow_id' IS DISTINCT FROM item.provenance->>'workflow_id' OR source->'workflow_revision' IS DISTINCT FROM item.provenance->'workflow_revision' OR
    NOT agentstudio.knowledge_query_execution_observations_before_lineage(p_reader,item.source_run_id,'') THEN RETURN false; END IF;
  RETURN agentstudio.knowledge_lineage_walk(p_reader,item.source_run_id,p_seen||p_run);
END $fn$;
CREATE FUNCTION agentstudio.knowledge_lineage_register(p_run uuid,p_source_sha text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE reader uuid:=agentstudio.actor_id(); context jsonb; origin jsonb; source jsonb; source_id uuid;
BEGIN
  context:=agentstudio.knowledge_lineage_context(reader,p_run);origin:=context->'provenance';
  IF context IS NULL OR context->'debug' IS DISTINCT FROM 'true'::jsonb OR context->'registerable' IS DISTINCT FROM 'true'::jsonb OR
    origin IS NULL OR jsonb_typeof(origin)<>'object' OR octet_length(origin::text)>4096 THEN RETURN false; END IF;
  IF origin->>'kind'='manual' THEN
    IF origin<>'{"kind":"manual"}'::jsonb OR p_source_sha IS NOT NULL THEN RETURN false; END IF;
  ELSIF origin->>'kind'='history' THEN
    IF origin-ARRAY['kind','run_id','workflow_id','workflow_revision','output_version','input','nodes']<>'{}'::jsonb OR
      NOT(origin?&ARRAY['kind','run_id','workflow_id','workflow_revision','output_version','input','nodes']) OR
      jsonb_typeof(origin->'input')<>'boolean' OR jsonb_typeof(origin->'nodes')<>'array' OR jsonb_array_length(origin->'nodes')>40 OR
      origin->>'output_version' !~ '^[a-f0-9]{64}$' OR (origin->'input'='false'::jsonb AND jsonb_array_length(origin->'nodes')=0) THEN RETURN false; END IF;
    source_id:=(origin->>'run_id')::uuid;
    source:=agentstudio.knowledge_lineage_context(reader,source_id);
    IF source_id=p_run OR source IS NULL OR source->>'source_sha256' IS DISTINCT FROM p_source_sha OR
      context->>'workflow_id' IS DISTINCT FROM origin->>'workflow_id' OR source->>'workflow_id' IS DISTINCT FROM origin->>'workflow_id' OR
      source->'workflow_revision' IS DISTINCT FROM origin->'workflow_revision' OR
      NOT agentstudio.knowledge_query_execution_observations_before_lineage(reader,source_id,'') OR
      NOT agentstudio.knowledge_lineage_walk(reader,source_id,ARRAY[p_run]) THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  INSERT INTO agentstudio.workflow_sample_lineage(reader_user_id,run_id,debug_sha256,provenance,source_run_id,source_sha256)
    VALUES(reader,p_run,context->>'debug_sha256',origin,source_id,p_source_sha);
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_lineage_current(p_reader uuid,p_run uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_lineage_walk(p_reader,p_run,'{}'::uuid[])
$fn$;
DO $functions$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['knowledge_lineage_walk(uuid,uuid,uuid[])','knowledge_lineage_register(uuid,text)','knowledge_lineage_current(uuid,uuid)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_lineage';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_lineage_register(uuid,text) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_lineage_current(uuid,uuid) TO agentstudio_knowledge_query;
CREATE FUNCTION agentstudio.knowledge_query_execution_observations_current(p_reader uuid,p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_before_lineage(p_reader,p_run,p_current_step) AND agentstudio.knowledge_lineage_current(p_reader,p_run)
$fn$;
ALTER FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) OWNER TO agentstudio_knowledge_query;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION agentstudio.knowledge_query_execution_validate_run(p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_current(agentstudio.actor_id(),p_run,p_current_step)
$fn$;
-- Recompile the queued-query predicate after renaming its observation callee;
-- existing connections must resolve the combined lineage predicate too.
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
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_043','Private immutable manual/historical debug provenance; bounded original-source lineage across output reuse');
COMMIT;
