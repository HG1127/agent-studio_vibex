-- Reader-billed retrieval. Raw vectors and document/provider material stay private.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_037') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_query')
    THEN RAISE EXCEPTION 'knowledge_query_requires_reviewed_pg_v9_037_and_new_role'; END IF;
END $guard$;
CREATE ROLE agentstudio_knowledge_query NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_query;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id(),agentstudio.knowledge_embedding_consent_actor(),agentstudio.knowledge_employee_active(uuid),agentstudio.knowledge_access_mode(uuid) TO agentstudio_knowledge_query;
GRANT SELECT(id,external_issuer,external_subject) ON agentstudio.users TO agentstudio_knowledge_query;
GRANT SELECT(id,owner_user_id,provider,enabled,models,revision) ON agentstudio.model_connections TO agentstudio_knowledge_query;
GRANT SELECT(id,owner_user_id,visibility,revision) ON agentstudio.knowledge_bases TO agentstudio_knowledge_query;
GRANT SELECT(id,owner_user_id,base_id,status,filename,created_at) ON agentstudio.knowledge_documents TO agentstudio_knowledge_query;
GRANT SELECT(id,owner_user_id,document_id,chunk_index,text_content) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_query;
GRANT SELECT ON agentstudio.knowledge_access,agentstudio.knowledge_embedding_profiles,agentstudio.knowledge_embedding_consents,agentstudio.knowledge_embedding_vectors TO agentstudio_knowledge_query;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_knowledge_query;
DO $policies$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['users','model_connections','knowledge_bases','knowledge_documents','knowledge_chunks','knowledge_access','knowledge_embedding_profiles','knowledge_embedding_consents','knowledge_embedding_vectors'] LOOP
    EXECUTE format('CREATE POLICY knowledge_query_private ON agentstudio.%I FOR SELECT TO agentstudio_knowledge_query USING(true)',name);
  END LOOP;
END $policies$;
CREATE POLICY knowledge_query_audit ON agentstudio.audit_events FOR INSERT TO agentstudio_knowledge_query WITH CHECK(true);
CREATE TABLE agentstudio.knowledge_query_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reader_user_id uuid NOT NULL REFERENCES agentstudio.users(id),request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),base_ids uuid[] NOT NULL CHECK(cardinality(base_ids) BETWEEN 1 AND 10),
  query_text text CHECK(length(query_text) BETWEEN 1 AND 300),scope_fence jsonb,result_refs jsonb,
  requested_mode text NOT NULL CHECK(requested_mode IN ('auto','lexical','semantic','hybrid')),requested_limit integer NOT NULL CHECK(requested_limit BETWEEN 1 AND 8),
  profile_id uuid,profile_revision bigint,consent_revision bigint,connection_id uuid,connection_revision bigint,model_name text,base_url text,
  status text NOT NULL CHECK(status IN ('prepared','dispatched','succeeded','unknown','rejected','expired')),failure_reason text NOT NULL DEFAULT '',
  worker_id uuid,token_sha256 text,lease_until timestamptz,dispatch_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT(now()+interval '15 minutes'),
  UNIQUE(reader_user_id,request_id),CHECK(token_sha256 IS NULL OR token_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK(result_refs IS NULL OR jsonb_typeof(result_refs)='object' AND octet_length(result_refs::text)<=16384)
);
CREATE INDEX knowledge_query_claim_order ON agentstudio.knowledge_query_jobs(status,created_at);
CREATE INDEX knowledge_query_reader_rate ON agentstudio.knowledge_query_jobs(reader_user_id,created_at);
ALTER TABLE agentstudio.knowledge_query_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_query_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.knowledge_query_jobs FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker;
GRANT SELECT,INSERT,UPDATE ON agentstudio.knowledge_query_jobs TO agentstudio_knowledge_query;
CREATE POLICY knowledge_query_private ON agentstudio.knowledge_query_jobs TO agentstudio_knowledge_query USING(true) WITH CHECK(true);
CREATE FUNCTION agentstudio.knowledge_query_enabled() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN IF current_setting('agentstudio.knowledge_query_runtime_enabled',true) IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'knowledge_query_runtime_disabled' USING ERRCODE='P0403'; END IF; END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_scope(p_reader uuid,p_bases uuid[],p_semantic boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE bid uuid; b record; a record; p agentstudio.knowledge_embedding_profiles%ROWTYPE; r agentstudio.knowledge_embedding_profiles%ROWTYPE;
  role text; reader_valid boolean; consent_valid boolean; compatible boolean; total bigint; indexed bigint; reason text; fence jsonb:='[]'; sources jsonb:='[]';
BEGIN
  IF NOT agentstudio.knowledge_employee_active(p_reader) THEN RAISE EXCEPTION 'knowledge_employee_inactive' USING ERRCODE='P0403'; END IF;
  IF p_bases IS NULL OR cardinality(p_bases) NOT BETWEEN 1 AND 10 OR cardinality(p_bases)<>(SELECT count(DISTINCT x) FROM unnest(p_bases)x)
    THEN RAISE EXCEPTION 'invalid_knowledge_query_scope' USING ERRCODE='P0400'; END IF;
  PERFORM set_config('agentstudio.actor_id',p_reader::text,true);
  SELECT * INTO r FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=p_reader;
  reader_valid:=coalesce(r.enabled,false) AND EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=r.connection_id AND c.owner_user_id=p_reader
    AND c.enabled AND c.provider='openai' AND c.revision=r.connection_revision AND c.models ? r.model_name);
  consent_valid:=reader_valid AND EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_consents e WHERE e.owner_user_id=p_reader AND e.profile_id=r.configuration_id
    AND e.profile_revision=r.revision AND e.query_enabled);
  FOREACH bid IN ARRAY p_bases LOOP
    role:=agentstudio.knowledge_access_mode(bid);
    IF role IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
    IF role<>'owner' AND current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true'
      THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
    SELECT id,owner_user_id,revision INTO b FROM agentstudio.knowledge_bases WHERE id=bid;
    SELECT revision,semantic_allowed INTO a FROM agentstudio.knowledge_access WHERE base_id=bid AND recipient_user_id=p_reader AND NOT revoked;
    SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=b.owner_user_id;
    compatible:=p_semantic AND reader_valid AND coalesce(p.enabled,false) AND (role='owner' OR coalesce(a.semantic_allowed,false))
      AND p.model_name=r.model_name AND p.base_url=r.base_url AND EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=p.connection_id
        AND c.owner_user_id=b.owner_user_id AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name);
    compatible:=coalesce(compatible,false);
    reason:=CASE WHEN role<>'owner' AND NOT coalesce(a.semantic_allowed,false) THEN 'shared_semantic_not_authorized'
      WHEN NOT reader_valid THEN 'embedding_not_configured' WHEN NOT compatible THEN 'shared_semantic_incompatible' ELSE '' END;
    SELECT count(*),count(v.chunk_id) INTO total,indexed FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
      LEFT JOIN agentstudio.knowledge_embedding_vectors v ON v.chunk_id=c.id AND v.owner_user_id=b.owner_user_id AND v.profile_revision=p.revision
        AND v.chunk_sha256=encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AND public.vector_dims(v.embedding)=p.dimensions AND abs(public.vector_norm(v.embedding)-1)<=0.001 AND compatible
      WHERE c.owner_user_id=b.owner_user_id AND d.base_id=bid AND d.status='indexed';
    fence:=fence||jsonb_build_array(jsonb_build_object('base_id',bid,'owner_id',b.owner_user_id,'base_revision',b.revision,'role',role,
      'access_revision',CASE WHEN role='owner' THEN 0 ELSE a.revision END,'semantic_allowed',CASE WHEN role='owner' THEN true ELSE a.semantic_allowed END,
      'profile_id',CASE WHEN compatible THEN p.configuration_id ELSE NULL END,'profile_revision',CASE WHEN compatible THEN p.revision ELSE 0 END));
    sources:=sources||jsonb_build_array(jsonb_build_object('base_id',bid,'owner_id',b.owner_user_id,'shared',role<>'owner','compatible',compatible,
      'profile_revision',p.revision,'dimensions',p.dimensions,'indexed',indexed,'total',total,'reason',reason));
  END LOOP;
  RETURN jsonb_build_object('fence',fence,'sources',sources,'reader_valid',reader_valid,'consent_valid',consent_valid,
    'profile_id',r.configuration_id,'profile_revision',r.revision,'dimensions',r.dimensions,
    'eligible',(SELECT count(*) FROM jsonb_array_elements(sources)x WHERE (x->>'compatible')::boolean AND (x->>'indexed')::bigint>0),
    'shared_blocked',EXISTS(SELECT 1 FROM jsonb_array_elements(sources)x WHERE (x->>'shared')::boolean AND NOT (x->>'compatible')::boolean));
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_reader_current(p_reader uuid,p_profile uuid,p_version bigint,p_consent bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_employee_active(p_reader) AND EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_profiles p
    JOIN agentstudio.knowledge_embedding_consents e ON e.owner_user_id=p.owner_user_id JOIN agentstudio.model_connections c ON c.id=p.connection_id AND c.owner_user_id=p_reader
    WHERE p.owner_user_id=p_reader AND p.configuration_id=p_profile AND p.revision=p_version AND p.enabled AND e.profile_id=p_profile AND e.profile_revision=p_version
      AND e.revision=p_consent AND e.query_enabled AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name)
$fn$;
CREATE FUNCTION agentstudio.knowledge_query_rank(p_plan jsonb,p_query text,p_limit integer,p_mode text,p_vector public.vector,p_fallback text DEFAULT '') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  WITH sources AS(SELECT x.* FROM jsonb_to_recordset(p_plan->'sources') AS x(base_id uuid,owner_id uuid,shared boolean,compatible boolean,profile_revision bigint,dimensions integer,indexed bigint,total bigint)),
  words AS(SELECT word,ordinality AS ord FROM regexp_split_to_table(lower(p_query),'[^a-z0-9一-鿿]+') WITH ORDINALITY AS w(word,ordinality) WHERE length(word)>1),
  terms AS(SELECT term FROM(SELECT CASE WHEN word ~ '^[一-鿿]+$' AND length(word)>2 THEN substring(word FROM n FOR 2) ELSE word END AS term,ord,n
    FROM words CROSS JOIN LATERAL generate_series(1,CASE WHEN word ~ '^[一-鿿]+$' AND length(word)>2 THEN length(word)-1 ELSE 1 END)n ORDER BY ord,n LIMIT 30)t),
  lex_candidates AS MATERIALIZED(SELECT s.base_id,c.* FROM sources s CROSS JOIN LATERAL(
    SELECT k.id AS chunk_id,k.document_id,k.chunk_index,k.text_content,d.filename FROM agentstudio.knowledge_chunks k JOIN agentstudio.knowledge_documents d ON d.id=k.document_id AND d.owner_user_id=k.owner_user_id
      WHERE k.owner_user_id=s.owner_id AND d.base_id=s.base_id AND d.status='indexed' ORDER BY d.created_at DESC,k.chunk_index,k.id LIMIT 1600)c),
  lex_scores AS(SELECT c.*,(CASE WHEN strpos(lower(c.text_content),lower(p_query))>0 THEN 30 ELSE 0 END)+coalesce((SELECT sum(
    CASE WHEN strpos(lower(c.text_content),t.term)>0 THEN 3 ELSE 0 END+CASE WHEN strpos(lower(c.filename),t.term)>0 THEN 2 ELSE 0 END) FROM terms t),
    CASE WHEN strpos(lower(c.text_content),lower(p_query))>0 THEN 3 ELSE 0 END) AS lexical_score FROM lex_candidates c),
  lex_rank AS(SELECT *,row_number() OVER(ORDER BY lexical_score DESC,chunk_id) AS position FROM lex_scores WHERE lexical_score>0 ORDER BY lexical_score DESC,chunk_id LIMIT p_limit),
  sem_candidates AS MATERIALIZED(SELECT s.base_id,c.* FROM sources s CROSS JOIN LATERAL(
    SELECT k.id AS chunk_id,k.document_id,k.text_content,v.embedding,v.updated_at AS vector_updated_at FROM agentstudio.knowledge_chunks k JOIN agentstudio.knowledge_documents d ON d.id=k.document_id AND d.owner_user_id=k.owner_user_id
      JOIN agentstudio.knowledge_embedding_vectors v ON v.chunk_id=k.id AND v.owner_user_id=k.owner_user_id AND v.profile_revision=s.profile_revision
        AND v.chunk_sha256=encode(sha256(convert_to(k.text_content,'UTF8')),'hex')
      WHERE p_vector IS NOT NULL AND s.compatible AND k.owner_user_id=s.owner_id AND d.base_id=s.base_id AND d.status='indexed'
      ORDER BY d.created_at DESC,k.chunk_index,k.id LIMIT 700)c),
  sem_scores AS(SELECT *,CASE WHEN public.vector_dims(embedding)=public.vector_dims(p_vector) AND abs(public.vector_norm(embedding)-1)<=0.001
      THEN greatest(-1::double precision,least(1::double precision,1-(embedding OPERATOR(public.<=>) p_vector))) ELSE NULL END AS semantic_score FROM sem_candidates),
  sem_rank AS(SELECT *,row_number() OVER(ORDER BY semantic_score DESC,chunk_id) AS position FROM sem_scores WHERE semantic_score>=0.18),
  mixed AS(SELECT base_id,chunk_id,document_id,text_content,CASE WHEN p_vector IS NULL THEN lexical_score::double precision ELSE 1.0/(60+position) END AS score,
      NULL::double precision AS semantic_score,NULL::timestamptz AS vector_updated_at FROM lex_rank WHERE p_mode<>'semantic' OR p_vector IS NULL
    UNION ALL SELECT base_id,chunk_id,document_id,text_content,1.4/(60+position),semantic_score,vector_updated_at FROM sem_rank),
  combined AS(SELECT base_id,chunk_id,document_id,encode(sha256(convert_to(text_content,'UTF8')),'hex') AS sha256,
    sum(score)*(CASE WHEN p_vector IS NULL THEN 1 ELSE 1000 END) AS score,max(semantic_score) AS semantic_score,max(vector_updated_at) AS vector_updated_at
    FROM mixed GROUP BY base_id,chunk_id,document_id,text_content),
  hits AS(SELECT * FROM combined ORDER BY score DESC,chunk_id LIMIT p_limit)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(h)) ORDER BY score DESC,chunk_id) FROM hits h),'[]'::jsonb),
    'retrieval',CASE WHEN p_vector IS NULL THEN 'lexical' WHEN p_mode='semantic' THEN 'semantic' ELSE 'hybrid' END,'total_matches',(SELECT count(*) FROM combined),
    'scanned_candidates',(SELECT count(*) FROM lex_candidates)+(SELECT count(*) FROM sem_candidates),
    'candidate_limit_reached',EXISTS(SELECT 1 FROM lex_candidates GROUP BY base_id HAVING count(*)>=1600) OR EXISTS(SELECT 1 FROM sem_candidates GROUP BY base_id HAVING count(*)>=700),
    'semantic_status',CASE WHEN p_fallback<>'' THEN p_fallback WHEN p_vector IS NULL THEN 'skipped'
      WHEN (p_plan->>'shared_blocked')::boolean OR EXISTS(SELECT 1 FROM sources WHERE compatible AND (indexed<total OR dimensions<>public.vector_dims(p_vector))) THEN 'partial' ELSE 'ok' END,
    'semantic_indexed',coalesce((SELECT sum(indexed) FROM sources WHERE compatible),0),'semantic_total',coalesce((SELECT sum(total) FROM sources WHERE compatible),0),
    'shared_semantic_used',p_vector IS NOT NULL AND EXISTS(SELECT 1 FROM sources WHERE shared AND compatible AND indexed>0 AND dimensions=public.vector_dims(p_vector)),
    'shared_lexical_only',(p_plan->>'shared_blocked')::boolean)
$fn$;
CREATE FUNCTION agentstudio.knowledge_query_refs_valid(p_job uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_query_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.result_refs->'items') x
    LEFT JOIN agentstudio.knowledge_chunks c ON c.id=(x->>'chunk_id')::uuid
    LEFT JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    WHERE j.id=p_job AND (c.id IS NULL OR d.id IS DISTINCT FROM (x->>'document_id')::uuid OR d.base_id IS DISTINCT FROM (x->>'base_id')::uuid OR d.status IS DISTINCT FROM 'indexed'
      OR x->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(c.text_content,'UTF8')),'hex') OR
      x ? 'semantic_score' AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_vectors v WHERE v.chunk_id=c.id AND v.owner_user_id=c.owner_user_id
        AND v.chunk_sha256=x->>'sha256' AND v.updated_at=(x->>'vector_updated_at')::timestamptz)))
$fn$;
CREATE FUNCTION agentstudio.knowledge_query_get(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); j agentstudio.knowledge_query_jobs%ROWTYPE; plan jsonb; result jsonb; status text; error text;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=actor AND request_id=p_request;
  IF NOT FOUND THEN RETURN NULL; END IF;
  status:=j.status;error:=j.failure_reason;
  IF j.expires_at<=clock_timestamp() THEN status:='expired';
  ELSE
    plan:=agentstudio.knowledge_query_scope(actor,j.base_ids,j.profile_id IS NOT NULL);
    IF plan->'fence' IS DISTINCT FROM j.scope_fence OR j.profile_id IS NOT NULL AND NOT agentstudio.knowledge_query_reader_current(actor,j.profile_id,j.profile_revision,j.consent_revision)
      THEN status:='unavailable';error:='knowledge_query_scope_changed';
    ELSIF j.status='succeeded' THEN
      IF NOT agentstudio.knowledge_query_refs_valid(j.id) THEN status:='unavailable';error:='knowledge_query_content_changed';
      ELSE
        SELECT (j.result_refs-'items')||jsonb_build_object('items',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'base_id',x->>'base_id','chunk_id',c.id,'document_id',d.id,'filename',d.filename,'chunk_index',c.chunk_index,
          'citation',d.filename||'#chunk-'||c.chunk_index,'text',substring(c.text_content FROM 1 FOR 1200),'score',x->'score','semantic_score',x->'semantic_score')) ORDER BY n),'[]'::jsonb))
          INTO result FROM jsonb_array_elements(j.result_refs->'items') WITH ORDINALITY h(x,n)
          JOIN agentstudio.knowledge_chunks c ON c.id=(x->>'chunk_id')::uuid JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id;
        IF (agentstudio.knowledge_query_scope(actor,j.base_ids,j.profile_id IS NOT NULL)->'fence') IS DISTINCT FROM j.scope_fence OR NOT agentstudio.knowledge_query_refs_valid(j.id)
          THEN status:='unavailable';error:='knowledge_query_scope_changed';result:=NULL; END IF;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('request_id',j.request_id,'status',status,'error_code',error,'billing_may_have_occurred',j.dispatch_started_at IS NOT NULL,'result',result);
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_submit(p_request uuid,p_bases uuid[],p_query text,p_mode text,p_limit integer,p_profile uuid,p_version bigint,p_consent bigint,p_ack text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); p agentstudio.knowledge_embedding_profiles%ROWTYPE; plan jsonb; digest text; prior text;
  fallback text:=''; paid boolean:=false; answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();
  IF p_request IS NULL OR p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 1 AND 300 OR p_mode IS NULL OR p_mode NOT IN ('auto','lexical','semantic','hybrid')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 8 OR p_ack IS NOT NULL AND p_ack<>'PAY_ONCE_FOR_THIS_READER_QUERY'
    OR p_ack IS NOT NULL AND (p_profile IS NULL OR p_version IS NULL OR p_consent IS NULL OR p_version<1 OR p_consent<1)
    OR p_ack IS NULL AND (p_profile IS NOT NULL OR p_version IS NOT NULL OR p_consent IS NOT NULL) OR p_mode IN ('semantic','hybrid') AND p_ack IS NULL
    THEN RAISE EXCEPTION 'invalid_knowledge_query_request' USING ERRCODE='P0400'; END IF;
  p_query:=btrim(p_query);SELECT array_agg(x ORDER BY x) INTO p_bases FROM unnest(p_bases)x;
  digest:=encode(sha256(convert_to(jsonb_build_array(p_bases,p_query,p_mode,p_limit,p_profile,p_version,p_consent,p_ack)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6638));PERFORM agentstudio.knowledge_embedding_consent_actor();
  SELECT request_sha256 INTO prior FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF prior<>digest THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',agentstudio.knowledge_query_get(p_request),'replayed',true);
  END IF;
  IF (SELECT count(*) FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=actor AND created_at>now()-interval '1 minute')>=30
    OR (SELECT count(*) FROM agentstudio.knowledge_query_jobs WHERE reader_user_id=actor AND status IN ('prepared','dispatched') AND expires_at>clock_timestamp())>=4
    THEN RAISE EXCEPTION 'knowledge_query_rate_limited' USING ERRCODE='P0429'; END IF;
  plan:=agentstudio.knowledge_query_scope(actor,p_bases,p_mode<>'lexical');
  IF p_ack IS NOT NULL AND NOT agentstudio.knowledge_query_reader_current(actor,p_profile,p_version,p_consent)
    THEN RAISE EXCEPTION 'knowledge_query_profile_changed' USING ERRCODE='P0409'; END IF;
  IF p_mode='lexical' THEN fallback:='skipped';
  ELSIF NOT (plan->>'reader_valid')::boolean THEN fallback:='not_configured';
  ELSIF NOT (plan->>'consent_valid')::boolean THEN fallback:='query_not_authorized';
  ELSIF p_mode IN ('semantic','hybrid') AND (plan->>'shared_blocked')::boolean THEN RAISE EXCEPTION 'shared_semantic_incompatible' USING ERRCODE='P0409';
  ELSIF (plan->>'eligible')::integer=0 THEN fallback:='not_indexed';
  ELSIF p_ack IS NULL THEN fallback:='query_charge_not_confirmed';
  ELSE paid:=true; END IF;
  IF NOT paid AND p_mode IN ('semantic','hybrid') THEN RAISE EXCEPTION 'embedding_not_indexed' USING ERRCODE='P0409'; END IF;
  IF NOT paid THEN plan:=agentstudio.knowledge_query_scope(actor,p_bases,false); END IF;
  SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor;
  INSERT INTO agentstudio.knowledge_query_jobs(reader_user_id,request_id,request_sha256,base_ids,query_text,requested_mode,requested_limit,scope_fence,
    profile_id,profile_revision,consent_revision,connection_id,connection_revision,model_name,base_url,status,result_refs)
    VALUES(actor,p_request,digest,p_bases,p_query,p_mode,p_limit,plan->'fence',CASE WHEN paid THEN p.configuration_id END,CASE WHEN paid THEN p.revision END,
      CASE WHEN paid THEN p_consent END,CASE WHEN paid THEN p.connection_id END,CASE WHEN paid THEN p.connection_revision END,
      CASE WHEN paid THEN p.model_name END,CASE WHEN paid THEN p.base_url END,CASE WHEN paid THEN 'prepared' ELSE 'succeeded' END,
      CASE WHEN paid THEN NULL ELSE agentstudio.knowledge_query_rank(plan,p_query,p_limit,'lexical',NULL,fallback) END);
  RETURN jsonb_build_object('item',agentstudio.knowledge_query_get(p_request),'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_job_current(p_job uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL OR j.expires_at<=clock_timestamp() OR NOT agentstudio.knowledge_query_reader_current(j.reader_user_id,j.profile_id,j.profile_revision,j.consent_revision) THEN RETURN false; END IF;
  RETURN (agentstudio.knowledge_query_scope(j.reader_user_id,j.base_ids,true)->'fence')=j.scope_fence;
EXCEPTION WHEN SQLSTATE 'P0403' OR SQLSTATE 'P0404' THEN RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_claim(p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE candidate record; j agentstudio.knowledge_query_jobs%ROWTYPE; token text;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();IF p_worker IS NULL THEN RAISE EXCEPTION 'invalid_knowledge_query_claim' USING ERRCODE='P0400'; END IF;
  UPDATE agentstudio.knowledge_query_jobs SET query_text=NULL,scope_fence=NULL,result_refs=NULL,status=CASE WHEN status='prepared' THEN 'expired' WHEN status='dispatched' THEN 'unknown' ELSE status END
    WHERE id IN(SELECT id FROM agentstudio.knowledge_query_jobs WHERE expires_at<=clock_timestamp() AND query_text IS NOT NULL ORDER BY expires_at LIMIT 32);
  UPDATE agentstudio.knowledge_query_jobs SET status='unknown',failure_reason='knowledge_query_outcome_unknown',updated_at=now()
    WHERE id IN(SELECT id FROM agentstudio.knowledge_query_jobs WHERE status='dispatched' AND lease_until<=clock_timestamp() ORDER BY lease_until LIMIT 32);
  FOR candidate IN SELECT id,reader_user_id FROM agentstudio.knowledge_query_jobs WHERE status='prepared' AND expires_at>clock_timestamp()
    AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY created_at LIMIT 32 LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.reader_user_id::text,6638)) THEN CONTINUE; END IF;
    SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
    IF j.id IS NULL OR j.status<>'prepared' OR j.lease_until>clock_timestamp() THEN CONTINUE; END IF;
    IF NOT agentstudio.knowledge_query_job_current(j.id) THEN
      UPDATE agentstudio.knowledge_query_jobs SET status='rejected',failure_reason='knowledge_query_scope_changed',updated_at=now() WHERE id=j.id;CONTINUE;
    END IF;
    token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
    UPDATE agentstudio.knowledge_query_jobs SET worker_id=p_worker,token_sha256=encode(sha256(convert_to(token,'UTF8')),'hex'),lease_until=clock_timestamp()+interval '45 seconds',updated_at=now() WHERE id=j.id;
    RETURN jsonb_build_object('attempt_id',j.id,'worker_id',p_worker,'lease_token',token);
  END LOOP;RETURN NULL;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_reserve(p_job uuid,p_worker uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE; answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(j.reader_user_id::text,6638));
  SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job FOR UPDATE;
  IF j.status<>'prepared' OR j.worker_id IS DISTINCT FROM p_worker OR j.lease_until<=clock_timestamp() OR p_token IS NULL OR
    j.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(p_token,'UTF8')),'hex') THEN RETURN NULL; END IF;
  IF NOT agentstudio.knowledge_query_job_current(j.id) THEN
    UPDATE agentstudio.knowledge_query_jobs SET status='rejected',failure_reason='knowledge_query_scope_changed',updated_at=now() WHERE id=j.id;RETURN NULL;
  END IF;
  UPDATE agentstudio.knowledge_query_jobs SET status='dispatched',dispatch_started_at=now(),updated_at=now() WHERE id=j.id;
  SELECT jsonb_build_object('owner_id',j.reader_user_id,'identity',jsonb_build_object('issuer',u.external_issuer,'subject',u.external_subject),
    'connection_id',j.connection_id,'connection_revision',j.connection_revision,'model_name',j.model_name,'base_url',j.base_url,'dimensions',p.dimensions,'input',jsonb_build_array(j.query_text)) INTO answer
    FROM agentstudio.users u JOIN agentstudio.knowledge_embedding_profiles p ON p.owner_user_id=u.id WHERE u.id=j.reader_user_id;
  RETURN answer;
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_recheck(p_job uuid,p_worker uuid,p_token text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN PERFORM agentstudio.knowledge_query_enabled();
  RETURN EXISTS(SELECT 1 FROM agentstudio.knowledge_query_jobs j WHERE j.id=p_job AND j.status='dispatched' AND j.worker_id=p_worker AND j.lease_until>clock_timestamp()
    AND j.token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND agentstudio.knowledge_query_job_current(j.id));
END $fn$;
CREATE FUNCTION agentstudio.knowledge_query_finish(p_job uuid,p_worker uuid,p_token text,p_vector jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE j agentstudio.knowledge_query_jobs%ROWTYPE; plan jsonb; result jsonb; v public.vector; fallback text:='';
BEGIN
  PERFORM agentstudio.knowledge_query_enabled();SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job;
  IF j.id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(j.reader_user_id::text,6638));SELECT * INTO j FROM agentstudio.knowledge_query_jobs WHERE id=p_job FOR UPDATE;
  IF j.status<>'dispatched' OR j.worker_id IS DISTINCT FROM p_worker OR p_token IS NULL OR j.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(p_token,'UTF8')),'hex') THEN RETURN NULL; END IF;
  IF j.lease_until<=clock_timestamp() OR NOT agentstudio.knowledge_query_job_current(j.id) THEN
    UPDATE agentstudio.knowledge_query_jobs SET status='unknown',failure_reason='knowledge_query_scope_changed',updated_at=now() WHERE id=j.id;RETURN NULL; END IF;
  IF p_vector IS NULL AND j.requested_mode<>'auto' THEN
    UPDATE agentstudio.knowledge_query_jobs SET status='unknown',failure_reason='knowledge_query_outcome_unknown',updated_at=now() WHERE id=j.id;RETURN NULL; END IF;
  plan:=agentstudio.knowledge_query_scope(j.reader_user_id,j.base_ids,true);
  IF p_vector IS NOT NULL THEN
    IF jsonb_typeof(p_vector)<>'array' OR jsonb_array_length(p_vector) NOT BETWEEN 2 AND 3072 OR octet_length(p_vector::text)>131072
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_vector)x WHERE jsonb_typeof(x)<>'number') THEN RAISE EXCEPTION 'invalid_query_vector' USING ERRCODE='P0400'; END IF;
    v:=p_vector::text::public.vector;
    IF abs(public.vector_norm(v)-1)>0.001 THEN RAISE EXCEPTION 'invalid_query_vector' USING ERRCODE='P0400'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'sources')x WHERE (x->>'compatible')::boolean AND (x->>'indexed')::integer>0 AND (x->>'dimensions')::integer=public.vector_dims(v)) THEN
      IF j.requested_mode<>'auto' THEN UPDATE agentstudio.knowledge_query_jobs SET status='unknown',failure_reason='embedding_dimensions_changed',updated_at=now() WHERE id=j.id;RETURN NULL;
      ELSE v:=NULL;fallback:='dimensions_changed'; END IF;
    END IF;
  ELSE fallback:='provider_error'; END IF;
  result:=agentstudio.knowledge_query_rank(plan,j.query_text,j.requested_limit,j.requested_mode,v,fallback);
  IF NOT agentstudio.knowledge_query_job_current(j.id) THEN
    UPDATE agentstudio.knowledge_query_jobs SET status='unknown',failure_reason='knowledge_query_scope_changed',updated_at=now() WHERE id=j.id;RETURN NULL; END IF;
  UPDATE agentstudio.knowledge_query_jobs SET status='succeeded',result_refs=result,updated_at=now() WHERE id=j.id;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(j.reader_user_id,j.reader_user_id,'knowledge_query_complete','knowledge_query',j.id::text,'succeeded',jsonb_build_object('request_id',j.request_id,'retrieval',result->>'retrieval','fallback',fallback));
  RETURN jsonb_build_object('status','retrieved');
END $fn$;
DO $functions$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY['knowledge_query_enabled()','knowledge_query_scope(uuid,uuid[],boolean)','knowledge_query_reader_current(uuid,uuid,bigint,bigint)',
    'knowledge_query_rank(jsonb,text,integer,text,public.vector,text)','knowledge_query_refs_valid(uuid)','knowledge_query_get(uuid)',
    'knowledge_query_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text)','knowledge_query_job_current(uuid)','knowledge_query_claim(uuid)',
    'knowledge_query_reserve(uuid,uuid,text)','knowledge_query_recheck(uuid,uuid,text)','knowledge_query_finish(uuid,uuid,text,jsonb)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_knowledge_query';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text),agentstudio.knowledge_query_get(uuid) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_claim(uuid) TO agentstudio_knowledge_index_worker;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_reserve(uuid,uuid,text),agentstudio.knowledge_query_recheck(uuid,uuid,text),agentstudio.knowledge_query_finish(uuid,uuid,text,jsonb) TO agentstudio_knowledge_index_broker;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_038','Reader-paid one-shot semantic/hybrid queries with current-ACL receipts and bounded lexical fallback');
COMMIT;
