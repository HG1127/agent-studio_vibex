-- Isolated retained keyword evidence. No service activation or provider calls.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_040') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_keyword') THEN
    RAISE EXCEPTION 'keyword_observations_require_reviewed_pg_v9_040_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_knowledge_keyword NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_keyword;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_knowledge_keyword;
CREATE TABLE agentstudio.knowledge_keyword_observations(
  reader_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  step_key text NOT NULL CHECK(step_key ~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$'),
  input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
  query_sha256 text NOT NULL CHECK(query_sha256 ~ '^[a-f0-9]{64}$'),
  corpus_sha256 text NOT NULL CHECK(corpus_sha256 ~ '^[a-f0-9]{64}$'),
  base_ids uuid[] NOT NULL CHECK(cardinality(base_ids) BETWEEN 1 AND 3),
  execution_source jsonb NOT NULL CHECK(jsonb_typeof(execution_source)='object' AND octet_length(execution_source::text)<=4096),
  scope_fence jsonb NOT NULL CHECK(jsonb_typeof(scope_fence)='array' AND octet_length(scope_fence::text)<=4096),
  result_refs jsonb NOT NULL CHECK(jsonb_typeof(result_refs)='array' AND jsonb_array_length(result_refs)<=6 AND octet_length(result_refs::text)<=8192),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(reader_user_id,run_id,step_key)
);
-- No cascading FK: deleting a business record must not erase the source fence.
ALTER TABLE agentstudio.knowledge_keyword_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_keyword_observations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.knowledge_keyword_observations FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.knowledge_keyword_observations TO agentstudio_knowledge_keyword;
CREATE POLICY keyword_observations_private ON agentstudio.knowledge_keyword_observations TO agentstudio_knowledge_keyword USING(true) WITH CHECK(true);

-- Metadata-only helper: no new table/column grants to the execution role.
CREATE FUNCTION agentstudio.knowledge_keyword_scope(p_reader uuid,p_bases uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE bid uuid; b record; a record; fence jsonb:='[]';
BEGIN
  IF p_reader IS NULL OR NOT coalesce(agentstudio.knowledge_employee_active(p_reader),false) OR p_bases IS NULL OR
    cardinality(p_bases) NOT BETWEEN 1 AND 3 OR cardinality(p_bases)<>(SELECT count(DISTINCT x) FROM unnest(p_bases)x) THEN RETURN NULL; END IF;
  FOR bid IN SELECT x FROM unnest(p_bases)x ORDER BY x LOOP
    SELECT id,owner_user_id,visibility,revision INTO b FROM agentstudio.knowledge_bases WHERE id=bid;
    IF NOT FOUND OR b.visibility<>'private' OR NOT coalesce(agentstudio.knowledge_employee_active(b.owner_user_id),false) THEN RETURN NULL; END IF;
    IF b.owner_user_id=p_reader THEN
      fence:=fence||jsonb_build_array(jsonb_build_array(b.id,b.owner_user_id,b.visibility,b.revision,'owner'));
    ELSE
      IF current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
      SELECT access_role,revision INTO a FROM agentstudio.knowledge_access WHERE base_id=bid AND owner_user_id=b.owner_user_id AND recipient_user_id=p_reader AND NOT revoked;
      IF NOT FOUND OR a.access_role NOT IN ('viewer','editor') THEN RETURN NULL; END IF;
      fence:=fence||jsonb_build_array(jsonb_build_array(b.id,b.owner_user_id,b.visibility,b.revision,a.access_role,a.revision));
    END IF;
  END LOOP;
  RETURN fence;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_source(p_reader uuid,p_source jsonb,p_bases uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE sealed jsonb; snapshot jsonb; data jsonb;
BEGIN
  sealed:=agentstudio.knowledge_execution_source_seal(p_reader,p_source,p_bases);
  IF sealed IS NULL THEN RETURN NULL; END IF;
  SELECT checkpoint INTO snapshot FROM agentstudio.runs WHERE id=(sealed->>'run_id')::uuid AND owner_user_id=p_reader;
  IF sealed->>'parent_step_key' IS NULL THEN
    SELECT n->'data' INTO data FROM jsonb_array_elements(snapshot->'graph'->'nodes') n WHERE n->>'id'=substring(sealed->>'step_key' FROM 11);
  ELSE data:=snapshot->'agent_state'->'spec'; END IF;
  IF data IS NULL OR data?'knowledge_retrieval' THEN RETURN NULL; END IF;
  RETURN sealed;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_effect_current(p_reader uuid,p_run uuid,p_step text,p_sha text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM agentstudio.runs r JOIN agentstudio.approvals a ON a.run_id=r.id AND a.owner_user_id=r.owner_user_id AND a.step_key=p_step
   JOIN agentstudio.external_effects e ON e.run_id=r.id AND e.owner_user_id=r.owner_user_id AND e.step_key=p_step
   JOIN agentstudio.external_effects b ON b.run_id=r.id AND b.owner_user_id=r.owner_user_id AND b.step_key='wf2_tool:'||p_step
   WHERE r.id=p_run AND r.owner_user_id=p_reader AND a.status='approved' AND a.reason_code='wf2:'||p_sha
     AND e.status='succeeded' AND e.tool_name='workflow:tool' AND e.arguments_sha256=p_sha
     AND b.status='succeeded' AND b.tool_name='workflow.tool_bound_dispatch' AND b.arguments_sha256=p_sha)
$fn$;

-- Full text remains behind the existing content role. Only the private keyword
-- helper can call these functions. API/Worker/Broker cannot obtain raw refs.
CREATE FUNCTION agentstudio.knowledge_keyword_corpus_fence(p_bases uuid[]) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(d.id,d.owner_user_id,d.base_id,d.filename,d.mime_type,d.sha256,d.status,extract(epoch FROM d.created_at),
    c.id,c.chunk_index,encode(sha256(convert_to(c.text_content,'UTF8')),'hex'))::text,'UTF8')),'hex'),'' ORDER BY d.base_id,d.id,c.id),''),'UTF8')),'hex')
  FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
  WHERE d.base_id=ANY(p_bases) AND d.status='indexed'
$fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_snapshot(p_bases uuid[],p_query text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE bid uuid; item record; hits jsonb:='[]'; refs jsonb:='[]'; corpus text;
BEGIN
  IF p_bases IS NULL OR cardinality(p_bases) NOT BETWEEN 1 AND 3 OR p_query IS NULL OR length(btrim(p_query))<1 OR length(p_query)>80 OR p_query ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_keyword_observation_query' USING ERRCODE='P0400'; END IF;
  corpus:=agentstudio.knowledge_keyword_corpus_fence(p_bases);
  FOREACH bid IN ARRAY p_bases LOOP
    IF agentstudio.knowledge_access_mode(bid) IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
    FOR item IN SELECT c.id,c.owner_user_id,c.document_id,c.chunk_index,
      encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AS chunk_sha256,
      encode(sha256(convert_to(jsonb_build_array(d.id,d.owner_user_id,d.base_id,d.filename,d.mime_type,d.sha256,d.status,extract(epoch FROM d.created_at))::text,'UTF8')),'hex') AS document_sha256,
      d.filename,substring(c.text_content FROM greatest(1,strpos(lower(c.text_content),lower(p_query))-85) FOR 300) AS snippet
      FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
      WHERE d.base_id=bid AND d.status='indexed' AND strpos(lower(c.text_content),lower(p_query))>0 ORDER BY d.created_at DESC,c.chunk_index,c.id LIMIT 2 LOOP
      hits:=hits||jsonb_build_array(jsonb_build_object('baseId',bid,'documentId',item.document_id,'chunkIndex',item.chunk_index,'citation',item.filename||'#chunk-'||item.chunk_index,'snippet',item.snippet));
      refs:=refs||jsonb_build_array(jsonb_build_object('base_id',bid,'owner_user_id',item.owner_user_id,'document_id',item.document_id,'chunk_id',item.id,'chunk_index',item.chunk_index,
        'chunk_sha256',item.chunk_sha256,'document_sha256',item.document_sha256));
    END LOOP;
  END LOOP;
  IF corpus IS DISTINCT FROM agentstudio.knowledge_keyword_corpus_fence(p_bases) THEN
    RAISE EXCEPTION 'keyword_observation_content_changed' USING ERRCODE='P0409'; END IF;
  RETURN jsonb_build_object('hits',hits,'refs',refs,'corpus_sha256',corpus);
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_content_current(p_refs jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF p_refs IS NULL OR jsonb_typeof(p_refs)<>'array' OR jsonb_array_length(p_refs)>6 THEN RETURN false; END IF;
  RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_refs)x
    LEFT JOIN agentstudio.knowledge_chunks c ON c.id=(x->>'chunk_id')::uuid
    LEFT JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    WHERE c.id IS NULL OR d.id IS DISTINCT FROM (x->>'document_id')::uuid OR d.base_id IS DISTINCT FROM (x->>'base_id')::uuid OR
      c.owner_user_id IS DISTINCT FROM (x->>'owner_user_id')::uuid OR c.chunk_index IS DISTINCT FROM (x->>'chunk_index')::integer OR d.status IS DISTINCT FROM 'indexed' OR
      x->>'chunk_sha256' IS DISTINCT FROM encode(sha256(convert_to(c.text_content,'UTF8')),'hex') OR
      x->>'document_sha256' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_array(d.id,d.owner_user_id,d.base_id,d.filename,d.mime_type,d.sha256,d.status,extract(epoch FROM d.created_at))::text,'UTF8')),'hex'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_observations_current(p_reader uuid,p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE item record; count_seen integer:=0;
BEGIN
  FOR item IN SELECT * FROM agentstudio.knowledge_keyword_observations WHERE reader_user_id=p_reader AND run_id=p_run AND step_key<>coalesce(p_current_step,'') LOOP
    count_seen:=count_seen+1;
    IF count_seen>200 OR agentstudio.knowledge_keyword_scope(p_reader,item.base_ids) IS DISTINCT FROM item.scope_fence OR
      agentstudio.knowledge_keyword_corpus_fence(item.base_ids) IS DISTINCT FROM item.corpus_sha256 OR
      NOT agentstudio.knowledge_keyword_effect_current(p_reader,p_run,item.step_key,item.input_sha256) OR
      NOT agentstudio.knowledge_keyword_content_current(item.result_refs) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_submit(p_bases uuid[],p_query text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id(); sealed jsonb; fence jsonb; snapshot jsonb;
BEGIN
  sealed:=agentstudio.knowledge_keyword_source(actor,p_source,p_bases);
  fence:=agentstudio.knowledge_keyword_scope(actor,p_bases);
  IF sealed IS NULL OR fence IS NULL OR NOT agentstudio.knowledge_keyword_observations_current(actor,(sealed->>'run_id')::uuid,sealed->>'step_key') OR
    (SELECT count(*) FROM agentstudio.knowledge_keyword_observations WHERE reader_user_id=actor AND run_id=(sealed->>'run_id')::uuid)>=200 THEN
    RAISE EXCEPTION 'keyword_observation_source_changed' USING ERRCODE='P0409'; END IF;
  snapshot:=agentstudio.knowledge_keyword_snapshot(p_bases,p_query);
  IF agentstudio.knowledge_keyword_scope(actor,p_bases) IS DISTINCT FROM fence OR
    agentstudio.knowledge_keyword_corpus_fence(p_bases) IS DISTINCT FROM snapshot->>'corpus_sha256' OR NOT agentstudio.knowledge_keyword_content_current(snapshot->'refs') THEN
    RAISE EXCEPTION 'keyword_observation_content_changed' USING ERRCODE='P0409'; END IF;
  INSERT INTO agentstudio.knowledge_keyword_observations(reader_user_id,run_id,step_key,input_sha256,query_sha256,corpus_sha256,base_ids,execution_source,scope_fence,result_refs)
    VALUES(actor,(sealed->>'run_id')::uuid,sealed->>'step_key',sealed->>'input_sha256',encode(sha256(convert_to(p_query,'UTF8')),'hex'),snapshot->>'corpus_sha256',p_bases,sealed,fence,snapshot->'refs');
  RETURN snapshot->'hits';
END $fn$;
CREATE FUNCTION agentstudio.knowledge_keyword_step_current(p_run uuid,p_step text,p_sha text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id(); item agentstudio.knowledge_keyword_observations%ROWTYPE;
BEGIN
  SELECT * INTO item FROM agentstudio.knowledge_keyword_observations WHERE reader_user_id=actor AND run_id=p_run AND step_key=p_step AND input_sha256=p_sha;
  RETURN FOUND AND agentstudio.knowledge_execution_source_current(actor,item.execution_source) AND
    agentstudio.knowledge_keyword_scope(actor,item.base_ids) IS NOT DISTINCT FROM item.scope_fence AND
    agentstudio.knowledge_keyword_corpus_fence(item.base_ids) IS NOT DISTINCT FROM item.corpus_sha256 AND agentstudio.knowledge_keyword_content_current(item.result_refs);
END $fn$;
DO $functions$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['knowledge_keyword_scope(uuid,uuid[])','knowledge_keyword_source(uuid,jsonb,uuid[])','knowledge_keyword_effect_current(uuid,uuid,text,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_execution';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION agentstudio.'||f||' TO agentstudio_knowledge_keyword';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['knowledge_keyword_corpus_fence(uuid[])','knowledge_keyword_snapshot(uuid[],text)','knowledge_keyword_content_current(jsonb)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_content';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION agentstudio.'||f||' TO agentstudio_knowledge_keyword';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['knowledge_keyword_observations_current(uuid,uuid,text)','knowledge_keyword_submit(uuid[],text,jsonb)','knowledge_keyword_step_current(uuid,text,text)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||f||' OWNER TO agentstudio_knowledge_keyword';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||f||' FROM PUBLIC';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_submit(uuid[],text,jsonb),agentstudio.knowledge_keyword_step_current(uuid,text,text) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb) TO agentstudio_knowledge_keyword;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_observations_current(uuid,uuid,text) TO agentstudio_knowledge_query;
-- Queued paid queries must check earlier free keyword observations as well.
ALTER FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) RENAME TO knowledge_query_execution_observations_before_keyword;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_observations_before_keyword(uuid,uuid,text) FROM PUBLIC,agentstudio_api;
CREATE FUNCTION agentstudio.knowledge_query_execution_observations_current(p_reader uuid,p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_before_keyword(p_reader,p_run,p_current_step) AND agentstudio.knowledge_keyword_observations_current(p_reader,p_run,p_current_step)
$fn$;
ALTER FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) OWNER TO agentstudio_knowledge_query;
REVOKE ALL ON FUNCTION agentstudio.knowledge_query_execution_observations_current(uuid,uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION agentstudio.knowledge_query_execution_validate_run(p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_current(agentstudio.actor_id(),p_run,p_current_step)
$fn$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_041','Private retained keyword content/grant evidence; combined current-run validation without embedding consent or provider calls');
COMMIT;
