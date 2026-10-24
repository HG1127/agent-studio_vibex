-- Proposed isolated employee knowledge UI/content access. No activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_032')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_content')
  THEN RAISE EXCEPTION 'knowledge_content_requires_reviewed_pg_v9_032_and_new_content_role'; END IF;
END
$guard$;
CREATE ROLE agentstudio_knowledge_content NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_content;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id(),agentstudio.knowledge_access_mode(uuid) TO agentstudio_knowledge_content;
GRANT SELECT(id,owner_user_id,name,description,visibility,revision,created_at,updated_at)
  ON agentstudio.knowledge_bases TO agentstudio_knowledge_content;
GRANT SELECT(id,owner_user_id,base_id,filename,mime_type,sha256,status,created_at),
  INSERT(id,owner_user_id,base_id,filename,object_key,mime_type,sha256,status),DELETE
  ON agentstudio.knowledge_documents TO agentstudio_knowledge_content;
GRANT SELECT(id,owner_user_id,document_id,chunk_index,text_content),
  INSERT(owner_user_id,document_id,chunk_index,text_content),DELETE
  ON agentstudio.knowledge_chunks TO agentstudio_knowledge_content;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
  ON agentstudio.audit_events TO agentstudio_knowledge_content;
CREATE POLICY knowledge_content_bases ON agentstudio.knowledge_bases FOR SELECT TO agentstudio_knowledge_content USING(true);
CREATE POLICY knowledge_content_documents ON agentstudio.knowledge_documents TO agentstudio_knowledge_content USING(true) WITH CHECK(true);
CREATE POLICY knowledge_content_chunks ON agentstudio.knowledge_chunks TO agentstudio_knowledge_content USING(true) WITH CHECK(true);
CREATE POLICY knowledge_content_audit ON agentstudio.audit_events FOR INSERT TO agentstudio_knowledge_content WITH CHECK(true);
CREATE TABLE agentstudio.knowledge_content_receipts (
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  request_id uuid NOT NULL,
  base_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=2048),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,request_id),
  FOREIGN KEY(base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id) ON DELETE CASCADE
);
ALTER TABLE agentstudio.knowledge_content_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_content_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.knowledge_content_receipts FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.knowledge_content_receipts TO agentstudio_knowledge_content;
CREATE POLICY knowledge_content_receipts ON agentstudio.knowledge_content_receipts TO agentstudio_knowledge_content USING(true) WITH CHECK(true);

CREATE FUNCTION agentstudio.knowledge_content_metadata(p_base uuid) RETURNS TABLE(
  id uuid,owner_user_id uuid,name text,description text,revision bigint,access_role text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE access text:=agentstudio.knowledge_access_mode(p_base);
BEGIN
  IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  RETURN QUERY SELECT b.id,b.owner_user_id,b.name,b.description,b.revision,access
    FROM agentstudio.knowledge_bases b WHERE b.id=p_base AND b.visibility='private';
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_documents(p_base uuid) RETURNS TABLE(
  id uuid,filename text,mime_type text,sha256 text,status text,created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF agentstudio.knowledge_access_mode(p_base) IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  RETURN QUERY SELECT d.id,d.filename,d.mime_type,d.sha256,d.status,d.created_at
    FROM agentstudio.knowledge_documents d JOIN agentstudio.knowledge_bases b ON b.id=d.base_id AND b.owner_user_id=d.owner_user_id
    WHERE b.id=p_base AND d.status<>'deleted' ORDER BY d.created_at DESC,d.id LIMIT 100;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_search(p_base uuid,p_query text,p_limit integer) RETURNS TABLE(
  document_id uuid,filename text,chunk_index integer,snippet text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF agentstudio.knowledge_access_mode(p_base) IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  IF p_query IS NULL OR length(btrim(p_query))<2 OR length(p_query)>160 OR p_query ~ '[[:cntrl:]]'
    OR p_limit IS NULL OR p_limit<1 OR p_limit>10 THEN RAISE EXCEPTION 'invalid_search_query' USING ERRCODE='P0400'; END IF;
  RETURN QUERY SELECT c.document_id,d.filename,c.chunk_index,
    substring(c.text_content FROM greatest(1,strpos(lower(c.text_content),lower(btrim(p_query)))-120) FOR 360)
    FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    WHERE d.base_id=p_base AND d.status='indexed' AND strpos(lower(c.text_content),lower(btrim(p_query)))>0
    ORDER BY d.created_at DESC,c.chunk_index,c.id LIMIT p_limit;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_receipt(p_base uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE answer jsonb;
BEGIN
  IF agentstudio.knowledge_access_mode(p_base) IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  SELECT r.result INTO answer FROM agentstudio.knowledge_content_receipts r
    WHERE r.actor_user_id=agentstudio.actor_id() AND r.base_id=p_base AND r.request_id=p_request;
  RETURN answer;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_import(p_base uuid,p_request uuid,p_filename text,p_mime text,p_text text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id(); access text; owner uuid; fingerprint text; prior record;
  doc uuid:=gen_random_uuid(); digest text; answer jsonb; n integer; chars integer;
BEGIN
  access:=agentstudio.knowledge_access_mode(p_base);
  IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  IF access NOT IN ('owner','editor') THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  IF p_request IS NULL OR p_filename IS NULL OR length(p_filename)<1 OR length(p_filename)>180
    OR p_filename ~ '^[.]|[/\\]|[[:cntrl:]]'
    OR p_text IS NULL OR length(p_text)<1 OR length(p_text)>160000 OR p_text !~ '[^[:space:]]'
    OR p_mime IS NULL OR NOT (
      (p_filename ~* '[.]txt$' AND p_mime='text/plain') OR (p_filename ~* '[.](md|markdown)$' AND p_mime='text/markdown') OR
      (p_filename ~* '[.]csv$' AND p_mime='text/csv') OR (p_filename ~* '[.]tsv$' AND p_mime='text/tab-separated-values') OR
      (p_filename ~* '[.]json$' AND p_mime='application/json') OR (p_filename ~* '[.]html?$' AND p_mime='text/html') OR
      (p_filename ~* '[.]pdf$' AND p_mime='application/pdf') OR
      (p_filename ~* '[.]docx$' AND p_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  THEN RAISE EXCEPTION 'invalid_parsed_document' USING ERRCODE='P0400'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':knowledge-content:'||p_request::text,0));
  -- Concurrent imports and quota checks serialize per base. FOR UPDATE is
  -- performed by a dedicated column-only grant; no row is modified here.
  SELECT b.owner_user_id INTO owner FROM agentstudio.knowledge_bases b WHERE b.id=p_base FOR UPDATE;
  IF agentstudio.knowledge_access_mode(p_base) NOT IN ('owner','editor') OR agentstudio.knowledge_access_mode(p_base) IS NULL
    THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array('import',p_base,p_filename,p_mime,p_text)::text,'UTF8')),'hex');
  SELECT r.base_id,r.request_sha256,r.result INTO prior FROM agentstudio.knowledge_content_receipts r
    WHERE r.actor_user_id=actor AND r.request_id=p_request;
  IF FOUND THEN
    IF prior.base_id<>p_base OR prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'knowledge_content_request_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',prior.result,'replayed',true);
  END IF;
  SELECT count(*)::integer INTO n FROM agentstudio.knowledge_documents d WHERE d.base_id=p_base AND d.status<>'deleted';
  IF n>=100 THEN RAISE EXCEPTION 'knowledge_document_limit' USING ERRCODE='P0429'; END IF;
  digest:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM agentstudio.knowledge_documents d WHERE d.base_id=p_base AND d.sha256=digest AND d.status<>'deleted')
    THEN RAISE EXCEPTION 'duplicate_document' USING ERRCODE='P0409'; END IF;
  INSERT INTO agentstudio.knowledge_documents(id,owner_user_id,base_id,filename,object_key,mime_type,sha256,status)
    VALUES(doc,owner,p_base,p_filename,'inline-db:'||doc::text,p_mime,digest,'indexed');
  chars:=length(p_text);
  FOR n IN 0..((chars-1)/800) LOOP
    INSERT INTO agentstudio.knowledge_chunks(owner_user_id,document_id,chunk_index,text_content)
      VALUES(owner,doc,n,substring(p_text FROM n*800+1 FOR 800));
  END LOOP;
  answer:=jsonb_build_object('request_id',p_request,'action','import','document_id',doc,'filename',p_filename,'sha256',digest,'chunk_count',(chars+799)/800);
  INSERT INTO agentstudio.knowledge_content_receipts(actor_user_id,request_id,base_id,owner_user_id,request_sha256,result)
    VALUES(actor,p_request,p_base,owner,fingerprint,answer);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,actor,'knowledge.document_import','knowledge_base',p_base::text,'succeeded',answer);
  RETURN jsonb_build_object('item',answer,'replayed',false);
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_content_delete(p_base uuid,p_request uuid,p_document uuid,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id(); access text; owner uuid; fingerprint text; prior record; doc record; answer jsonb;
BEGIN
  access:=agentstudio.knowledge_access_mode(p_base);
  IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
  IF access NOT IN ('owner','editor') THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  IF p_request IS NULL OR p_document IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'invalid_document_delete' USING ERRCODE='P0400'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':knowledge-content:'||p_request::text,0));
  SELECT b.owner_user_id INTO owner FROM agentstudio.knowledge_bases b WHERE b.id=p_base FOR UPDATE;
  IF agentstudio.knowledge_access_mode(p_base) NOT IN ('owner','editor') OR agentstudio.knowledge_access_mode(p_base) IS NULL
    THEN RAISE EXCEPTION 'knowledge_editor_required' USING ERRCODE='P0403'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array('delete',p_base,p_document,p_sha256)::text,'UTF8')),'hex');
  SELECT r.base_id,r.request_sha256,r.result INTO prior FROM agentstudio.knowledge_content_receipts r WHERE r.actor_user_id=actor AND r.request_id=p_request;
  IF FOUND THEN
    IF prior.base_id<>p_base OR prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'knowledge_content_request_conflict' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('item',prior.result,'replayed',true);
  END IF;
  SELECT d.filename,d.sha256 INTO doc FROM agentstudio.knowledge_documents d WHERE d.id=p_document AND d.base_id=p_base AND d.owner_user_id=owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge_document_not_found' USING ERRCODE='P0404'; END IF;
  IF doc.sha256<>p_sha256 THEN RAISE EXCEPTION 'knowledge_document_changed' USING ERRCODE='P0409'; END IF;
  DELETE FROM agentstudio.knowledge_chunks c WHERE c.document_id=p_document AND c.owner_user_id=owner;
  DELETE FROM agentstudio.knowledge_documents d WHERE d.id=p_document AND d.base_id=p_base AND d.owner_user_id=owner;
  answer:=jsonb_build_object('request_id',p_request,'action','delete','document_id',p_document,'filename',doc.filename,'sha256',doc.sha256);
  INSERT INTO agentstudio.knowledge_content_receipts(actor_user_id,request_id,base_id,owner_user_id,request_sha256,result)
    VALUES(actor,p_request,p_base,owner,fingerprint,answer);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,actor,'knowledge.document_delete','knowledge_base',p_base::text,'succeeded',answer);
  RETURN jsonb_build_object('item',answer,'replayed',false);
END
$fn$;
-- PostgreSQL row locking requires some UPDATE privilege. This harmless metadata
-- column may be updated only by the no-login function owner; functions never do.
GRANT UPDATE(updated_at) ON agentstudio.knowledge_bases TO agentstudio_knowledge_content;
CREATE POLICY knowledge_content_base_lock ON agentstudio.knowledge_bases FOR UPDATE TO agentstudio_knowledge_content USING(true) WITH CHECK(true);
ALTER FUNCTION agentstudio.knowledge_content_metadata(uuid) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_documents(uuid) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_search(uuid,text,integer) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_receipt(uuid,uuid) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_import(uuid,uuid,text,text,text) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) OWNER TO agentstudio_knowledge_content;
REVOKE ALL ON FUNCTION agentstudio.knowledge_content_metadata(uuid),agentstudio.knowledge_content_documents(uuid),
  agentstudio.knowledge_content_search(uuid,text,integer),agentstudio.knowledge_content_receipt(uuid,uuid),
  agentstudio.knowledge_content_import(uuid,uuid,text,text,text),agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_content_metadata(uuid),agentstudio.knowledge_content_documents(uuid),
  agentstudio.knowledge_content_search(uuid,text,integer),agentstudio.knowledge_content_receipt(uuid,uuid),
  agentstudio.knowledge_content_import(uuid,uuid,text,text,text),agentstudio.knowledge_content_delete(uuid,uuid,uuid,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_033','Proposed bounded employee shared knowledge text operations and actor receipts; no vector/provider access');
COMMIT;
