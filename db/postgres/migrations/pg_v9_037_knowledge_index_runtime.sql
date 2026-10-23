-- Independent owner-consented indexing. No public paid route or login creation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_036') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('agentstudio_knowledge_index','agentstudio_knowledge_index_worker','agentstudio_knowledge_index_broker'))
    THEN RAISE EXCEPTION 'knowledge_index_requires_reviewed_pg_v9_036_and_new_roles'; END IF;
END
$guard$;
CREATE ROLE agentstudio_knowledge_index NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
CREATE ROLE agentstudio_knowledge_index_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
CREATE ROLE agentstudio_knowledge_index_broker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_index,agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker;
GRANT SELECT(version) ON agentstudio.schema_migrations TO agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_consent_actor(),agentstudio.knowledge_employee_active(uuid) TO agentstudio_knowledge_index;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_status(uuid) TO agentstudio_knowledge_index;
-- This helper and both daemons have no ciphertext or authentication-table grants.
GRANT SELECT(id,external_issuer,external_subject) ON agentstudio.users TO agentstudio_knowledge_index;
GRANT SELECT(id,owner_user_id,provider,enabled,models,revision) ON agentstudio.model_connections TO agentstudio_knowledge_index;
GRANT SELECT(id,owner_user_id,visibility) ON agentstudio.knowledge_bases TO agentstudio_knowledge_index;
GRANT SELECT(id,owner_user_id,base_id,status) ON agentstudio.knowledge_documents TO agentstudio_knowledge_index;
GRANT SELECT(id,owner_user_id,document_id,chunk_index,text_content) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_index;
GRANT SELECT ON agentstudio.knowledge_embedding_profiles,agentstudio.knowledge_embedding_consents TO agentstudio_knowledge_index;
GRANT UPDATE(dimensions) ON agentstudio.knowledge_embedding_profiles TO agentstudio_knowledge_index;
GRANT SELECT,UPDATE,DELETE ON agentstudio.knowledge_embedding_queue TO agentstudio_knowledge_index;
GRANT SELECT,INSERT,UPDATE ON agentstudio.knowledge_embedding_vectors TO agentstudio_knowledge_index;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_knowledge_index;
DO $policies$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['users','model_connections','knowledge_bases','knowledge_documents','knowledge_chunks','knowledge_embedding_profiles',
    'knowledge_embedding_consents','knowledge_embedding_queue','knowledge_embedding_vectors'] LOOP
    EXECUTE format('CREATE POLICY knowledge_index_private ON agentstudio.%I TO agentstudio_knowledge_index USING(true) WITH CHECK(true)',name);
  END LOOP;
END
$policies$;
CREATE POLICY knowledge_index_audit ON agentstudio.audit_events FOR INSERT TO agentstudio_knowledge_index WITH CHECK(true);
CREATE TABLE agentstudio.knowledge_index_activations(
  owner_user_id uuid PRIMARY KEY REFERENCES agentstudio.users(id),profile_id uuid NOT NULL,consent_revision bigint NOT NULL CHECK(consent_revision>0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agentstudio.knowledge_index_activation_receipts(
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=2048),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_user_id,request_id)
);
-- Deliberately no profile/base/chunk FK: deletion cannot erase an uncertain bill.
CREATE TABLE agentstudio.knowledge_index_attempts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),base_id uuid NOT NULL,
  profile_id uuid NOT NULL,profile_revision bigint NOT NULL CHECK(profile_revision>0),consent_revision bigint NOT NULL CHECK(consent_revision>0),
  connection_id uuid NOT NULL,connection_revision bigint NOT NULL CHECK(connection_revision>0),model_name text NOT NULL,base_url text NOT NULL,
  chunk_count integer NOT NULL CHECK(chunk_count BETWEEN 1 AND 12),status text NOT NULL CHECK(status IN ('prepared','dispatched','succeeded','unknown','discarded')),
  worker_id uuid NOT NULL,token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_index_attempts_expiry ON agentstudio.knowledge_index_attempts(owner_user_id,base_id,status,lease_until);
CREATE TABLE agentstudio.knowledge_index_attempt_chunks(
  attempt_id uuid NOT NULL REFERENCES agentstudio.knowledge_index_attempts(id),ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 12),
  profile_id uuid NOT NULL,consent_revision bigint NOT NULL,chunk_id uuid NOT NULL,chunk_sha256 text NOT NULL CHECK(chunk_sha256 ~ '^[a-f0-9]{64}$'),
  reserved boolean NOT NULL DEFAULT true,PRIMARY KEY(attempt_id,ordinal)
);
CREATE UNIQUE INDEX knowledge_index_no_replay ON agentstudio.knowledge_index_attempt_chunks(profile_id,consent_revision,chunk_id,chunk_sha256) WHERE reserved;
DO $tables$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['knowledge_index_activations','knowledge_index_activation_receipts','knowledge_index_attempts','knowledge_index_attempt_chunks'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker',name);
    EXECUTE format('GRANT SELECT,INSERT ON agentstudio.%I TO agentstudio_knowledge_index',name);
    EXECUTE format('CREATE POLICY knowledge_index_private ON agentstudio.%I TO agentstudio_knowledge_index USING(true) WITH CHECK(true)',name);
  END LOOP;
END
$tables$;
GRANT UPDATE ON agentstudio.knowledge_index_activations,agentstudio.knowledge_index_attempts TO agentstudio_knowledge_index;
GRANT UPDATE(reserved) ON agentstudio.knowledge_index_attempt_chunks TO agentstudio_knowledge_index;
CREATE FUNCTION agentstudio.knowledge_index_enabled() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF current_setting('agentstudio.knowledge_index_runtime_enabled',true) IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'knowledge_index_runtime_disabled' USING ERRCODE='P0403'; END IF;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_current(p_owner uuid,p_profile uuid,p_version bigint,p_consent bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_employee_active(p_owner) AND EXISTS(
    SELECT 1 FROM agentstudio.knowledge_embedding_profiles p JOIN agentstudio.knowledge_embedding_consents e ON e.owner_user_id=p.owner_user_id
      JOIN agentstudio.knowledge_index_activations a ON a.owner_user_id=p.owner_user_id
      JOIN agentstudio.model_connections c ON c.id=p.connection_id AND c.owner_user_id=p.owner_user_id
    WHERE p.owner_user_id=p_owner AND p.configuration_id=p_profile AND p.revision=p_version AND p.enabled
      AND e.profile_id=p.configuration_id AND e.profile_revision=p.revision AND e.revision=p_consent AND e.index_enabled
      AND a.profile_id=p.configuration_id AND a.consent_revision=e.revision
      AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name)
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_valid(p_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce((SELECT agentstudio.knowledge_index_current(a.owner_user_id,a.profile_id,a.profile_revision,a.consent_revision)
    AND EXISTS(SELECT 1 FROM agentstudio.knowledge_bases b WHERE b.id=a.base_id AND b.owner_user_id=a.owner_user_id AND b.visibility='private')
    AND a.chunk_count=(SELECT count(*) FROM agentstudio.knowledge_index_attempt_chunks x WHERE x.attempt_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_index_attempt_chunks x
      LEFT JOIN agentstudio.knowledge_chunks c ON c.id=x.chunk_id AND c.owner_user_id=a.owner_user_id
      LEFT JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=a.owner_user_id
      WHERE x.attempt_id=a.id AND (c.id IS NULL OR d.base_id IS DISTINCT FROM a.base_id OR d.status IS DISTINCT FROM 'indexed'
        OR x.chunk_sha256 IS DISTINCT FROM encode(sha256(convert_to(c.text_content,'UTF8')),'hex')))
    FROM agentstudio.knowledge_index_attempts a WHERE a.id=p_attempt),false)
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_authorize(p_request uuid,p_consent bigint,p_profile uuid,p_version bigint,p_ack text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); digest text; old_digest text; answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  IF p_request IS NULL OR p_consent IS NULL OR p_consent<1 OR p_profile IS NULL OR p_version IS NULL OR p_version<1 OR
    p_ack IS DISTINCT FROM 'START_OWNER_EMBEDDING_INDEX_AND_ACCEPT_PROVIDER_CHARGES'
    THEN RAISE EXCEPTION 'invalid_knowledge_index_authorization' USING ERRCODE='P0400'; END IF;
  digest:=encode(sha256(convert_to(jsonb_build_array(p_consent,p_profile,p_version,p_ack)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6635));
  PERFORM agentstudio.knowledge_embedding_consent_actor();
  SELECT request_sha256,result INTO old_digest,answer FROM agentstudio.knowledge_index_activation_receipts WHERE actor_user_id=actor AND request_id=p_request;
  IF FOUND THEN
    IF old_digest<>digest THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',answer,'replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_profiles p JOIN agentstudio.knowledge_embedding_consents e ON e.owner_user_id=p.owner_user_id
    JOIN agentstudio.model_connections c ON c.id=p.connection_id AND c.owner_user_id=actor
    WHERE p.owner_user_id=actor AND p.configuration_id=p_profile AND p.revision=p_version AND p.enabled
      AND e.revision=p_consent AND e.profile_id=p_profile AND e.profile_revision=p_version AND e.index_enabled
      AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name)
    THEN RAISE EXCEPTION 'embedding_index_authorization_changed' USING ERRCODE='P0409'; END IF;
  INSERT INTO agentstudio.knowledge_index_activations(owner_user_id,profile_id,consent_revision) VALUES(actor,p_profile,p_consent)
    ON CONFLICT(owner_user_id) DO UPDATE SET profile_id=excluded.profile_id,consent_revision=excluded.consent_revision,updated_at=now();
  answer:=jsonb_build_object('request_id',p_request,'profile_id',p_profile,'profile_revision',p_version,'consent_revision',p_consent,'authorized',true);
  INSERT INTO agentstudio.knowledge_index_activation_receipts(actor_user_id,request_id,request_sha256,result) VALUES(actor,p_request,digest,answer);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'knowledge_index_authorize','knowledge_embedding_profile',actor::text,'succeeded',answer);
  RETURN jsonb_build_object('item',answer,'replayed',false);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_authorization_receipt(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  IF p_request IS NULL THEN RAISE EXCEPTION 'invalid_knowledge_index_authorization' USING ERRCODE='P0400'; END IF;
  SELECT result INTO answer FROM agentstudio.knowledge_index_activation_receipts WHERE actor_user_id=actor AND request_id=p_request;
  RETURN answer;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_status(p_base uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_consent_actor(); answer jsonb; p agentstudio.knowledge_embedding_profiles%ROWTYPE; consent bigint;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  answer:=agentstudio.knowledge_embedding_status(p_base);
  SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor;
  SELECT revision INTO consent FROM agentstudio.knowledge_embedding_consents WHERE owner_user_id=actor;
  RETURN answer||jsonb_build_object('profile_id',p.configuration_id,'consent_revision',coalesce(consent,0),
    'index_authorized',agentstudio.knowledge_index_current(actor,p.configuration_id,p.revision,consent),
    'unknown_attempts',(SELECT count(*) FROM agentstudio.knowledge_index_attempts a WHERE a.owner_user_id=actor AND a.base_id=p_base
      AND (a.status='unknown' OR a.status='dispatched' AND a.lease_until<=clock_timestamp())),
    'active_attempts',(SELECT count(*) FROM agentstudio.knowledge_index_attempts a WHERE a.owner_user_id=actor AND a.base_id=p_base
      AND a.status IN ('prepared','dispatched') AND a.lease_until>clock_timestamp()));
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_prune_queue(p_owner uuid,p_base uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  DELETE FROM agentstudio.knowledge_embedding_queue q USING agentstudio.knowledge_embedding_profiles p
    WHERE q.owner_user_id=p_owner AND q.base_id=p_base AND p.owner_user_id=p_owner AND q.profile_revision=p.revision
      AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
        LEFT JOIN agentstudio.knowledge_embedding_vectors v ON v.chunk_id=c.id AND v.owner_user_id=p_owner AND v.profile_revision=p.revision
          AND v.chunk_sha256=encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AND public.vector_dims(v.embedding)=p.dimensions
        WHERE c.owner_user_id=p_owner AND d.base_id=p_base AND d.status='indexed' AND v.chunk_id IS NULL)
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_claim(p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE candidate record; p agentstudio.knowledge_embedding_profiles%ROWTYPE; consent bigint; picked jsonb; attempt uuid; token text; expired record;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  IF p_worker IS NULL THEN RAISE EXCEPTION 'invalid_knowledge_index_claim' USING ERRCODE='P0400'; END IF;
  FOR candidate IN SELECT q.owner_user_id,q.base_id FROM agentstudio.knowledge_embedding_queue q
    JOIN agentstudio.knowledge_embedding_profiles profile ON profile.owner_user_id=q.owner_user_id
    JOIN agentstudio.knowledge_embedding_consents e ON e.owner_user_id=q.owner_user_id
    WHERE q.profile_revision=profile.revision AND agentstudio.knowledge_index_current(profile.owner_user_id,profile.configuration_id,profile.revision,e.revision)
    ORDER BY q.updated_at,q.owner_user_id,q.base_id LIMIT 32 LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.owner_user_id::text,6635)) THEN CONTINUE; END IF;
    SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=candidate.owner_user_id FOR UPDATE;
    SELECT revision INTO consent FROM agentstudio.knowledge_embedding_consents WHERE owner_user_id=candidate.owner_user_id;
    IF NOT agentstudio.knowledge_index_current(p.owner_user_id,p.configuration_id,p.revision,consent) THEN CONTINUE; END IF;
    FOR expired IN SELECT id,status FROM agentstudio.knowledge_index_attempts WHERE owner_user_id=p.owner_user_id AND base_id=candidate.base_id
      AND status IN ('prepared','dispatched') AND lease_until<=clock_timestamp() ORDER BY lease_until LIMIT 32 FOR UPDATE LOOP
      IF expired.status='dispatched' THEN
        UPDATE agentstudio.knowledge_index_attempts SET status='unknown',updated_at=now() WHERE id=expired.id;
      ELSIF agentstudio.knowledge_index_valid(expired.id) THEN
        attempt:=expired.id;EXIT;
      ELSE
        UPDATE agentstudio.knowledge_index_attempts SET status='discarded',updated_at=now() WHERE id=expired.id;
        UPDATE agentstudio.knowledge_index_attempt_chunks SET reserved=false WHERE attempt_id=expired.id;
      END IF;
    END LOOP;
    IF attempt IS NULL THEN
      SELECT jsonb_agg(jsonb_build_object('id',c.id,'sha256',c.sha256) ORDER BY c.id) INTO picked FROM(
        SELECT c.id,encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AS sha256 FROM agentstudio.knowledge_chunks c
        JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
        WHERE c.owner_user_id=p.owner_user_id AND d.base_id=candidate.base_id AND d.status='indexed'
          AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_vectors v WHERE v.chunk_id=c.id AND v.owner_user_id=p.owner_user_id
            AND v.profile_revision=p.revision AND v.chunk_sha256=encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AND public.vector_dims(v.embedding)=p.dimensions)
          AND NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_index_attempt_chunks x WHERE x.profile_id=p.configuration_id AND x.consent_revision=consent
            AND x.chunk_id=c.id AND x.chunk_sha256=encode(sha256(convert_to(c.text_content,'UTF8')),'hex') AND x.reserved)
        ORDER BY c.id LIMIT 12)c;
      IF picked IS NULL THEN
        PERFORM agentstudio.knowledge_index_prune_queue(p.owner_user_id,candidate.base_id);
        UPDATE agentstudio.knowledge_embedding_queue SET updated_at=now() WHERE owner_user_id=p.owner_user_id AND base_id=candidate.base_id;
        CONTINUE;
      END IF;
      attempt:=gen_random_uuid();
      INSERT INTO agentstudio.knowledge_index_attempts(id,owner_user_id,base_id,profile_id,profile_revision,consent_revision,connection_id,connection_revision,model_name,base_url,chunk_count,status,worker_id,token_sha256,lease_until)
        VALUES(attempt,p.owner_user_id,candidate.base_id,p.configuration_id,p.revision,consent,p.connection_id,p.connection_revision,p.model_name,p.base_url,jsonb_array_length(picked),'prepared',p_worker,repeat('0',64),clock_timestamp()+interval '45 seconds');
      INSERT INTO agentstudio.knowledge_index_attempt_chunks(attempt_id,ordinal,profile_id,consent_revision,chunk_id,chunk_sha256)
        SELECT attempt,x.ordinality,p.configuration_id,consent,(x.value->>'id')::uuid,x.value->>'sha256' FROM jsonb_array_elements(picked) WITH ORDINALITY x;
    END IF;
    token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
    UPDATE agentstudio.knowledge_index_attempts SET worker_id=p_worker,token_sha256=encode(sha256(convert_to(token,'UTF8')),'hex'),
      lease_until=clock_timestamp()+interval '45 seconds',updated_at=now() WHERE id=attempt;
    RETURN jsonb_build_object('attempt_id',attempt,'worker_id',p_worker,'lease_token',token);
  END LOOP;
  RETURN NULL;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_reserve(p_attempt uuid,p_worker uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE a agentstudio.knowledge_index_attempts%ROWTYPE; answer jsonb;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  SELECT * INTO a FROM agentstudio.knowledge_index_attempts WHERE id=p_attempt;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.owner_user_id::text,6635));
  SELECT * INTO a FROM agentstudio.knowledge_index_attempts WHERE id=p_attempt FOR UPDATE;
  IF a.status<>'prepared' OR a.worker_id IS DISTINCT FROM p_worker OR p_token IS NULL OR length(p_token)<>64 OR
    a.token_sha256<>encode(sha256(convert_to(p_token,'UTF8')),'hex') OR a.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
  IF NOT agentstudio.knowledge_index_valid(a.id) THEN
    UPDATE agentstudio.knowledge_index_attempts SET status='discarded',updated_at=now() WHERE id=a.id;
    UPDATE agentstudio.knowledge_index_attempt_chunks SET reserved=false WHERE attempt_id=a.id;
    RETURN NULL;
  END IF;
  UPDATE agentstudio.knowledge_index_attempts SET status='dispatched',updated_at=now() WHERE id=a.id;
  SELECT jsonb_build_object('owner_id',a.owner_user_id,'identity',jsonb_build_object('issuer',u.external_issuer,'subject',u.external_subject),
    'connection_id',a.connection_id,'connection_revision',a.connection_revision,'model_name',a.model_name,'base_url',a.base_url,
    'dimensions',p.dimensions,'input',(SELECT jsonb_agg(c.text_content ORDER BY x.ordinal) FROM agentstudio.knowledge_index_attempt_chunks x
      JOIN agentstudio.knowledge_chunks c ON c.id=x.chunk_id AND c.owner_user_id=a.owner_user_id WHERE x.attempt_id=a.id)) INTO answer
    FROM agentstudio.users u JOIN agentstudio.knowledge_embedding_profiles p ON p.owner_user_id=u.id WHERE u.id=a.owner_user_id;
  RETURN answer;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_recheck(p_attempt uuid,p_worker uuid,p_token text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  RETURN EXISTS(SELECT 1 FROM agentstudio.knowledge_index_attempts a WHERE a.id=p_attempt AND a.worker_id=p_worker AND a.status='dispatched'
    AND a.lease_until>clock_timestamp() AND a.token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND agentstudio.knowledge_index_valid(a.id));
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_index_finish(p_attempt uuid,p_worker uuid,p_token text,p_vectors jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE a agentstudio.knowledge_index_attempts%ROWTYPE; dims integer; expected integer; item jsonb; v public.vector; chunk record;
BEGIN
  PERFORM agentstudio.knowledge_index_enabled();
  SELECT * INTO a FROM agentstudio.knowledge_index_attempts WHERE id=p_attempt;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.owner_user_id::text,6635));
  SELECT dimensions INTO expected FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=a.owner_user_id FOR UPDATE;
  SELECT * INTO a FROM agentstudio.knowledge_index_attempts WHERE id=p_attempt FOR UPDATE;
  IF a.status<>'dispatched' OR a.worker_id IS DISTINCT FROM p_worker OR p_token IS NULL OR
    a.token_sha256<>encode(sha256(convert_to(p_token,'UTF8')),'hex') THEN RETURN NULL; END IF;
  IF a.lease_until<=clock_timestamp() OR NOT agentstudio.knowledge_index_valid(a.id) OR p_vectors IS NULL THEN
    UPDATE agentstudio.knowledge_index_attempts SET status='unknown',updated_at=now() WHERE id=a.id;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_vectors)<>'array' OR jsonb_array_length(p_vectors)<>a.chunk_count OR octet_length(p_vectors::text)>1572864
    THEN RAISE EXCEPTION 'invalid_knowledge_index_vectors' USING ERRCODE='P0400'; END IF;
  FOR chunk IN SELECT * FROM agentstudio.knowledge_index_attempt_chunks WHERE attempt_id=a.id ORDER BY ordinal LOOP
    item:=p_vectors->(chunk.ordinal-1);
    IF jsonb_typeof(item)<>'array' OR jsonb_array_length(item) NOT BETWEEN 2 AND 3072 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item) x WHERE jsonb_typeof(x)<>'number')
      THEN RAISE EXCEPTION 'invalid_knowledge_index_vectors' USING ERRCODE='P0400'; END IF;
    v:=item::text::public.vector;dims:=coalesce(dims,public.vector_dims(v));
    IF public.vector_dims(v)<>dims OR (expected IS NOT NULL AND expected<>dims) OR abs(public.vector_norm(v)-1)>0.001
      THEN RAISE EXCEPTION 'invalid_knowledge_index_vectors' USING ERRCODE='P0400'; END IF;
    INSERT INTO agentstudio.knowledge_embedding_vectors(chunk_id,owner_user_id,profile_revision,chunk_sha256,embedding)
      VALUES(chunk.chunk_id,a.owner_user_id,a.profile_revision,chunk.chunk_sha256,v)
      ON CONFLICT(chunk_id) DO UPDATE SET profile_revision=excluded.profile_revision,chunk_sha256=excluded.chunk_sha256,embedding=excluded.embedding,updated_at=now();
  END LOOP;
  UPDATE agentstudio.knowledge_embedding_profiles SET dimensions=dims WHERE owner_user_id=a.owner_user_id;
  UPDATE agentstudio.knowledge_index_attempts SET status='succeeded',updated_at=now() WHERE id=a.id;
  PERFORM agentstudio.knowledge_index_prune_queue(a.owner_user_id,a.base_id);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(a.owner_user_id,a.owner_user_id,'knowledge_index_complete','knowledge_base',a.base_id::text,'succeeded',jsonb_build_object('attempt_id',a.id,'chunks',a.chunk_count,'dimensions',dims));
  RETURN jsonb_build_object('status','indexed','chunks',a.chunk_count);
END
$fn$;
DO $functions$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['knowledge_index_enabled()','knowledge_index_current(uuid,uuid,bigint,bigint)','knowledge_index_valid(uuid)',
    'knowledge_index_authorize(uuid,bigint,uuid,bigint,text)','knowledge_index_authorization_receipt(uuid)','knowledge_index_status(uuid)',
    'knowledge_index_prune_queue(uuid,uuid)','knowledge_index_claim(uuid)',
    'knowledge_index_reserve(uuid,uuid,text)','knowledge_index_recheck(uuid,uuid,text)','knowledge_index_finish(uuid,uuid,text,jsonb)'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_knowledge_index';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_knowledge_index_worker,agentstudio_knowledge_index_broker';
  END LOOP;
END
$functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_index_authorize(uuid,bigint,uuid,bigint,text),agentstudio.knowledge_index_authorization_receipt(uuid),agentstudio.knowledge_index_status(uuid) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_index_claim(uuid) TO agentstudio_knowledge_index_worker;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_index_reserve(uuid,uuid,text),agentstudio.knowledge_index_recheck(uuid,uuid,text),agentstudio.knowledge_index_finish(uuid,uuid,text,jsonb) TO agentstudio_knowledge_index_broker;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_037','Owner activated index leases, private dispatch fence and durable ambiguity ledger');
COMMIT;
