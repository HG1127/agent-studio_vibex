-- Isolated native embedding settings, variable-dimension storage and queue.
-- No provider call, paid dispatch, Worker activation or public vector route.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_034')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_embedding')
  THEN RAISE EXCEPTION 'knowledge_embedding_requires_reviewed_pg_v9_034_and_new_role'; END IF;
END
$guard$;
CREATE ROLE agentstudio_knowledge_embedding NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
-- Readonly startup may inspect version identifiers, never migration bodies.
GRANT SELECT(version) ON agentstudio.schema_migrations TO agentstudio_api;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_embedding;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id(),agentstudio.knowledge_employee_active(uuid) TO agentstudio_knowledge_embedding;
GRANT SELECT(id,owner_user_id,provider,base_url,enabled,models,revision) ON agentstudio.model_connections TO agentstudio_knowledge_embedding;
GRANT SELECT(id,owner_user_id,visibility) ON agentstudio.knowledge_bases TO agentstudio_knowledge_embedding;
GRANT SELECT(id,owner_user_id,base_id,status,filename) ON agentstudio.knowledge_documents TO agentstudio_knowledge_embedding;
GRANT SELECT(id,owner_user_id,document_id,chunk_index,text_content) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_embedding;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_knowledge_embedding;
CREATE POLICY knowledge_embedding_models ON agentstudio.model_connections FOR SELECT TO agentstudio_knowledge_embedding USING(true);
CREATE POLICY knowledge_embedding_bases ON agentstudio.knowledge_bases FOR SELECT TO agentstudio_knowledge_embedding USING(true);
CREATE POLICY knowledge_embedding_documents ON agentstudio.knowledge_documents FOR SELECT TO agentstudio_knowledge_embedding USING(true);
CREATE POLICY knowledge_embedding_chunks ON agentstudio.knowledge_chunks FOR SELECT TO agentstudio_knowledge_embedding USING(true);
CREATE POLICY knowledge_embedding_audit ON agentstudio.audit_events FOR INSERT TO agentstudio_knowledge_embedding WITH CHECK(true);
ALTER TABLE agentstudio.knowledge_chunks ADD CONSTRAINT knowledge_chunks_id_owner UNIQUE(id,owner_user_id);
CREATE TABLE agentstudio.knowledge_embedding_profiles(
  owner_user_id uuid PRIMARY KEY REFERENCES agentstudio.users(id),
  connection_id uuid NOT NULL,
  connection_revision bigint NOT NULL CHECK(connection_revision>0),
  model_name text NOT NULL CHECK(model_name ~ '^[A-Za-z0-9_.:/-]{2,128}$'),
  base_url text NOT NULL CHECK(length(base_url) BETWEEN 8 AND 2048 AND base_url !~ '[[:cntrl:]]'),
  revision bigint NOT NULL CHECK(revision>0),
  enabled boolean NOT NULL,
  dimensions integer CHECK(dimensions BETWEEN 2 AND 3072),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(connection_id,owner_user_id) REFERENCES agentstudio.model_connections(id,owner_user_id) ON DELETE CASCADE
);
CREATE TABLE agentstudio.knowledge_embedding_vectors(
  chunk_id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.knowledge_embedding_profiles(owner_user_id) ON DELETE CASCADE,
  profile_revision bigint NOT NULL CHECK(profile_revision>0),
  chunk_sha256 text NOT NULL CHECK(chunk_sha256 ~ '^[a-f0-9]{64}$'),
  embedding public.vector NOT NULL CHECK(public.vector_dims(embedding) BETWEEN 2 AND 3072),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(chunk_id,owner_user_id) REFERENCES agentstudio.knowledge_chunks(id,owner_user_id) ON DELETE CASCADE
);
-- Keep all supported dimensions. A later search must guard the dimension
-- before evaluating distance; vector HNSW cannot index 3072 dimensions.
CREATE INDEX knowledge_embedding_vectors_profile ON agentstudio.knowledge_embedding_vectors(owner_user_id,profile_revision);
CREATE TABLE agentstudio.knowledge_embedding_queue(
  owner_user_id uuid NOT NULL REFERENCES agentstudio.knowledge_embedding_profiles(owner_user_id) ON DELETE CASCADE,
  base_id uuid NOT NULL,
  profile_revision bigint NOT NULL CHECK(profile_revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_user_id,base_id),
  FOREIGN KEY(base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id) ON DELETE CASCADE
);
CREATE TABLE agentstudio.knowledge_embedding_receipts(
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,request_id)
);
DO $tables$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['knowledge_embedding_profiles','knowledge_embedding_vectors','knowledge_embedding_queue','knowledge_embedding_receipts'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch',name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.%I TO agentstudio_knowledge_embedding',name);
    EXECUTE format('CREATE POLICY knowledge_embedding_private ON agentstudio.%I TO agentstudio_knowledge_embedding USING(true) WITH CHECK(true)',name);
  END LOOP;
END
$tables$;
REVOKE UPDATE,DELETE ON agentstudio.knowledge_embedding_receipts FROM agentstudio_knowledge_embedding;
-- Content routines already serialize quota checks with base-row FOR UPDATE.
-- Fence the owner BEFORE entering those routines; a row-trigger-only owner
-- lock would invert that order against configure/rebuild queue foreign keys.
ALTER FUNCTION agentstudio.knowledge_content_import(uuid,uuid,text,text,text) RENAME TO knowledge_content_import_without_embedding_fence;
ALTER FUNCTION agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) RENAME TO knowledge_content_delete_without_embedding_fence;
REVOKE ALL ON FUNCTION agentstudio.knowledge_content_import_without_embedding_fence(uuid,uuid,text,text,text),
  agentstudio.knowledge_content_delete_without_embedding_fence(uuid,uuid,uuid,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch;
CREATE FUNCTION agentstudio.knowledge_content_import(p_base uuid,p_request uuid,p_filename text,p_mime text,p_text text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE access text:=agentstudio.knowledge_access_mode(p_base); owner uuid;
BEGIN
  IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  IF access NOT IN ('owner','editor') THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  SELECT owner_user_id INTO owner FROM agentstudio.knowledge_bases WHERE id=p_base;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,6635));
  RETURN agentstudio.knowledge_content_import_without_embedding_fence(p_base,p_request,p_filename,p_mime,p_text);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_delete(p_base uuid,p_request uuid,p_document uuid,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE access text:=agentstudio.knowledge_access_mode(p_base); owner uuid;
BEGIN
  IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  IF access NOT IN ('owner','editor') THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  SELECT owner_user_id INTO owner FROM agentstudio.knowledge_bases WHERE id=p_base;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,6635));
  RETURN agentstudio.knowledge_content_delete_without_embedding_fence(p_base,p_request,p_document,p_sha256);
END
$fn$;
ALTER FUNCTION agentstudio.knowledge_content_import(uuid,uuid,text,text,text) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) OWNER TO agentstudio_knowledge_content;
REVOKE ALL ON FUNCTION agentstudio.knowledge_content_import(uuid,uuid,text,text,text),agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_content_import(uuid,uuid,text,text,text),agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) TO agentstudio_api;
CREATE FUNCTION agentstudio.knowledge_embedding_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id();
BEGIN
  IF current_setting('agentstudio.knowledge_embedding_settings_enabled',true) IS DISTINCT FROM 'true'
    OR current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'knowledge_embedding_settings_disabled' USING ERRCODE='P0403'; END IF;
  IF actor IS NULL OR NOT agentstudio.knowledge_employee_active(actor)
    THEN RAISE EXCEPTION 'knowledge_employee_inactive' USING ERRCODE='P0403'; END IF;
  RETURN actor;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_actor(); p agentstudio.knowledge_embedding_profiles%ROWTYPE; valid boolean;
BEGIN
  SELECT * INTO p FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('configured',false,'revision',0,'connection_id',NULL,'connection_revision',NULL,'model_name','','base_url','','dimensions',NULL,'connection_valid',false); END IF;
  SELECT EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=p.connection_id AND c.owner_user_id=actor
    AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name) INTO valid;
  RETURN jsonb_build_object('configured',p.enabled,'revision',p.revision,'connection_id',p.connection_id,
    'connection_revision',p.connection_revision,'model_name',p.model_name,'base_url',p.base_url,'dimensions',p.dimensions,'connection_valid',valid);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_receipt(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_actor(); answer jsonb;
BEGIN
  IF p_request IS NULL THEN RAISE EXCEPTION 'invalid_embedding_request' USING ERRCODE='P0400'; END IF;
  SELECT result INTO answer FROM agentstudio.knowledge_embedding_receipts WHERE actor_user_id=actor AND request_id=p_request;
  RETURN answer;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_status(p_base uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_actor(); setting jsonb; total bigint; indexed bigint; valid boolean; version bigint; dims integer; queued boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_bases WHERE id=p_base AND owner_user_id=actor AND visibility='private')
    THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  setting:=agentstudio.knowledge_embedding_settings(); valid:=(setting->>'configured')::boolean AND (setting->>'connection_valid')::boolean;
  version:=(setting->>'revision')::bigint; dims:=(setting->>'dimensions')::integer;
  SELECT count(*),count(v.chunk_id) INTO total,indexed FROM agentstudio.knowledge_chunks c
    JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    LEFT JOIN agentstudio.knowledge_embedding_vectors v ON v.chunk_id=c.id AND v.owner_user_id=actor
      AND v.profile_revision=version AND v.chunk_sha256=encode(sha256(convert_to(c.text_content,'UTF8')),'hex')
      AND public.vector_dims(v.embedding)=dims AND valid
    WHERE c.owner_user_id=actor AND d.base_id=p_base AND d.status='indexed';
  SELECT EXISTS(SELECT 1 FROM agentstudio.knowledge_embedding_queue q WHERE q.owner_user_id=actor AND q.base_id=p_base AND q.profile_revision=version) AND valid AND total>indexed INTO queued;
  RETURN jsonb_build_object('base_id',p_base,'profile_revision',version,'configured',(setting->>'configured')::boolean,
    'connection_valid',(setting->>'connection_valid')::boolean,'dimensions',dims,'total',total,'indexed',indexed,
    'pending',total-indexed,'queued',queued,'ready',valid AND total>0 AND total=indexed);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_change(p_request uuid,p_expected bigint,p_action text,p_connection uuid,p_connection_revision bigint,p_model text,p_endpoint text,p_base uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.knowledge_embedding_actor(); previous agentstudio.knowledge_embedding_profiles%ROWTYPE;
  version bigint; digest text; old_digest text; answer jsonb; same boolean:=false; queued bigint;
BEGIN
  IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_action IS NULL OR p_action NOT IN ('configure','disable','rebuild')
    THEN RAISE EXCEPTION 'invalid_embedding_request' USING ERRCODE='P0400'; END IF;
  IF p_action='configure' THEN
    IF p_connection IS NULL OR p_connection_revision IS NULL OR p_connection_revision<1 OR p_model IS NULL
      OR p_model !~ '^[A-Za-z0-9_.:/-]{2,128}$' OR p_endpoint IS NULL OR length(p_endpoint)>2048
      OR p_endpoint ~ '[[:cntrl:]]' OR p_endpoint !~ '^(https://[A-Za-z0-9.-]+(:443)?|http://(127\.0\.0\.1|localhost):[0-9]{1,5})(/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*)?$' OR p_base IS NOT NULL
      THEN RAISE EXCEPTION 'invalid_embedding_request' USING ERRCODE='P0400'; END IF;
  ELSIF p_connection IS NOT NULL OR p_connection_revision IS NOT NULL OR p_model IS NOT NULL OR p_endpoint IS NOT NULL
    OR (p_action='disable' AND p_base IS NOT NULL) OR (p_action='rebuild' AND p_base IS NULL)
    THEN RAISE EXCEPTION 'invalid_embedding_request' USING ERRCODE='P0400'; END IF;
  digest:=encode(sha256(convert_to(jsonb_build_object('expected_revision',p_expected,'action',p_action,'connection_id',p_connection,
    'connection_revision',p_connection_revision,'model_name',p_model,'base_url',p_endpoint,'base_id',p_base)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6635));
  SELECT r.request_sha256,r.result INTO old_digest,answer FROM agentstudio.knowledge_embedding_receipts r WHERE r.actor_user_id=actor AND r.request_id=p_request;
  IF FOUND THEN
    IF old_digest<>digest THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',answer,'replayed',true);
  END IF;
  SELECT * INTO previous FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=actor FOR UPDATE;
  version:=coalesce(previous.revision,0);
  IF version<>p_expected THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='P0409'; END IF;
  IF p_action='configure' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=p_connection AND c.owner_user_id=actor AND c.enabled
      AND c.provider='openai' AND c.revision=p_connection_revision AND c.models ? p_model)
      THEN RAISE EXCEPTION 'embedding_connection_unavailable' USING ERRCODE='P0409'; END IF;
    same:=coalesce(previous.enabled AND previous.connection_id=p_connection AND previous.connection_revision=p_connection_revision
      AND previous.model_name=p_model AND previous.base_url=p_endpoint,false);
    IF NOT same THEN
      DELETE FROM agentstudio.knowledge_embedding_vectors WHERE owner_user_id=actor;
      DELETE FROM agentstudio.knowledge_embedding_queue WHERE owner_user_id=actor;
      version:=version+1;
      INSERT INTO agentstudio.knowledge_embedding_profiles(owner_user_id,connection_id,connection_revision,model_name,base_url,revision,enabled)
        VALUES(actor,p_connection,p_connection_revision,p_model,p_endpoint,version,true)
        ON CONFLICT(owner_user_id) DO UPDATE SET connection_id=excluded.connection_id,connection_revision=excluded.connection_revision,
          model_name=excluded.model_name,base_url=excluded.base_url,revision=excluded.revision,enabled=true,dimensions=NULL,updated_at=now();
      INSERT INTO agentstudio.knowledge_embedding_queue(owner_user_id,base_id,profile_revision)
        SELECT actor,b.id,version FROM agentstudio.knowledge_bases b WHERE b.owner_user_id=actor AND b.visibility='private'
        AND EXISTS(SELECT 1 FROM agentstudio.knowledge_documents d JOIN agentstudio.knowledge_chunks c ON c.document_id=d.id AND c.owner_user_id=d.owner_user_id
          WHERE d.base_id=b.id AND d.owner_user_id=actor AND d.status='indexed');
    END IF;
  ELSIF p_action='disable' THEN
    DELETE FROM agentstudio.knowledge_embedding_vectors WHERE owner_user_id=actor;
    DELETE FROM agentstudio.knowledge_embedding_queue WHERE owner_user_id=actor;
    IF previous.enabled THEN
      version:=version+1;
      UPDATE agentstudio.knowledge_embedding_profiles SET enabled=false,dimensions=NULL,revision=version,updated_at=now() WHERE owner_user_id=actor;
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_bases WHERE id=p_base AND owner_user_id=actor AND visibility='private')
      THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
    IF NOT coalesce(previous.enabled,false) OR NOT EXISTS(SELECT 1 FROM agentstudio.model_connections c WHERE c.id=previous.connection_id
      AND c.owner_user_id=actor AND c.enabled AND c.provider='openai' AND c.revision=previous.connection_revision AND c.models ? previous.model_name)
      THEN RAISE EXCEPTION 'embedding_connection_unavailable' USING ERRCODE='P0409'; END IF;
    DELETE FROM agentstudio.knowledge_embedding_vectors v USING agentstudio.knowledge_chunks c,agentstudio.knowledge_documents d
      WHERE v.owner_user_id=actor AND v.chunk_id=c.id AND c.document_id=d.id AND d.owner_user_id=actor AND d.base_id=p_base;
    DELETE FROM agentstudio.knowledge_embedding_queue WHERE owner_user_id=actor AND base_id=p_base;
    INSERT INTO agentstudio.knowledge_embedding_queue(owner_user_id,base_id,profile_revision)
      SELECT actor,p_base,version WHERE EXISTS(SELECT 1 FROM agentstudio.knowledge_documents d JOIN agentstudio.knowledge_chunks c ON c.document_id=d.id AND c.owner_user_id=d.owner_user_id
        WHERE d.owner_user_id=actor AND d.base_id=p_base AND d.status='indexed');
  END IF;
  SELECT count(*) INTO queued FROM agentstudio.knowledge_embedding_queue WHERE owner_user_id=actor;
  answer:=jsonb_build_object('request_id',p_request,'action',p_action,'revision',version,'base_id',p_base,'configured',p_action<>'disable','queued_bases',queued);
  INSERT INTO agentstudio.knowledge_embedding_receipts(actor_user_id,request_id,request_sha256,result) VALUES(actor,p_request,digest,answer);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,'knowledge_embedding_'||p_action,'knowledge_embedding_profile',actor::text,'succeeded',jsonb_build_object('revision',version,'request_id',p_request,'unchanged',same));
  RETURN jsonb_build_object('item',answer,'replayed',false);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_embedding_enqueue_chunk() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE base uuid; version bigint;
BEGIN
  IF TG_OP='UPDATE' AND NEW.text_content IS NOT DISTINCT FROM OLD.text_content THEN RETURN NEW; END IF;
  -- Same owner lock as configure/disable/rebuild: never enqueue an old epoch
  -- after a concurrent configuration transaction has replaced its queue.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text,6635));
  DELETE FROM agentstudio.knowledge_embedding_vectors WHERE chunk_id=NEW.id;
  SELECT d.base_id,p.revision INTO base,version FROM agentstudio.knowledge_documents d
    JOIN agentstudio.knowledge_embedding_profiles p ON p.owner_user_id=d.owner_user_id AND p.enabled
    JOIN agentstudio.model_connections c ON c.id=p.connection_id AND c.owner_user_id=p.owner_user_id AND c.enabled
      AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name
    WHERE d.id=NEW.document_id AND d.owner_user_id=NEW.owner_user_id AND d.status='indexed' AND agentstudio.knowledge_employee_active(p.owner_user_id) FOR KEY SHARE OF p;
  IF FOUND THEN
    INSERT INTO agentstudio.knowledge_embedding_queue(owner_user_id,base_id,profile_revision) VALUES(NEW.owner_user_id,base,version)
      ON CONFLICT(owner_user_id,base_id) DO UPDATE SET profile_revision=excluded.profile_revision,updated_at=now();
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER knowledge_embedding_chunk_change AFTER INSERT OR UPDATE OF text_content ON agentstudio.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION agentstudio.knowledge_embedding_enqueue_chunk();
CREATE FUNCTION agentstudio.knowledge_embedding_enqueue_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE version bigint;
BEGIN
  IF NEW.status<>'indexed' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text,6635));
  IF NOT EXISTS(SELECT 1 FROM agentstudio.knowledge_chunks WHERE document_id=NEW.id AND owner_user_id=NEW.owner_user_id) THEN RETURN NEW; END IF;
  SELECT p.revision INTO version FROM agentstudio.knowledge_embedding_profiles p JOIN agentstudio.model_connections c
    ON c.id=p.connection_id AND c.owner_user_id=p.owner_user_id AND c.enabled AND c.provider='openai' AND c.revision=p.connection_revision AND c.models ? p.model_name
    WHERE p.owner_user_id=NEW.owner_user_id AND p.enabled AND agentstudio.knowledge_employee_active(p.owner_user_id) FOR KEY SHARE OF p;
  IF FOUND THEN
    INSERT INTO agentstudio.knowledge_embedding_queue(owner_user_id,base_id,profile_revision) VALUES(NEW.owner_user_id,NEW.base_id,version)
      ON CONFLICT(owner_user_id,base_id) DO UPDATE SET profile_revision=excluded.profile_revision,updated_at=now();
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER knowledge_embedding_document_change AFTER INSERT OR UPDATE OF status ON agentstudio.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION agentstudio.knowledge_embedding_enqueue_document();
DO $functions$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['knowledge_embedding_actor()','knowledge_embedding_settings()','knowledge_embedding_receipt(uuid)',
    'knowledge_embedding_status(uuid)','knowledge_embedding_change(uuid,bigint,text,uuid,bigint,text,text,uuid)','knowledge_embedding_enqueue_chunk()','knowledge_embedding_enqueue_document()'] LOOP
    EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_knowledge_embedding';
    EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC';
  END LOOP;
END
$functions$;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_settings(),agentstudio.knowledge_embedding_receipt(uuid),
  agentstudio.knowledge_embedding_status(uuid),agentstudio.knowledge_embedding_change(uuid,bigint,text,uuid,bigint,text,text,uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_035','Native owner embedding profile/receipts, 2..3072 dimension storage and incremental queue; no paid execution');
COMMIT;
