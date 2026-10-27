-- Proposed isolated shared knowledge runtime. No activation or provider calls.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_033')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_content' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls)
  THEN RAISE EXCEPTION 'knowledge_runtime_requires_reviewed_pg_v9_033'; END IF;
END
$guard$;
CREATE FUNCTION agentstudio.knowledge_runtime_scope(p_bases uuid[]) RETURNS TABLE(base_id uuid,owner_user_id uuid,access_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE bid uuid; access text;
BEGIN
  IF current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'shared_knowledge_execution_disabled' USING ERRCODE='P0403'; END IF;
  IF p_bases IS NULL OR cardinality(p_bases)>3 OR cardinality(p_bases)<>(SELECT count(DISTINCT entry) FROM unnest(p_bases) AS entry)
    THEN RAISE EXCEPTION 'invalid_agent_knowledge_scope' USING ERRCODE='P0400'; END IF;
  FOREACH bid IN ARRAY p_bases LOOP
    access:=agentstudio.knowledge_access_mode(bid);
    IF access IS NULL THEN RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404'; END IF;
    RETURN QUERY SELECT b.id,b.owner_user_id,access FROM agentstudio.knowledge_bases b WHERE b.id=bid;
  END LOOP;
END
$fn$;
CREATE FUNCTION agentstudio.knowledge_runtime_search(p_base uuid,p_query text) RETURNS TABLE(document_id uuid,filename text,chunk_index integer,snippet text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  PERFORM * FROM agentstudio.knowledge_runtime_scope(ARRAY[p_base]);
  IF p_query IS NULL OR length(btrim(p_query))<1 OR length(p_query)>80 OR p_query ~ '[[:cntrl:]]'
    THEN RAISE EXCEPTION 'invalid_agent_knowledge_query' USING ERRCODE='P0400'; END IF;
  RETURN QUERY SELECT c.document_id,d.filename,c.chunk_index,
    substring(c.text_content FROM greatest(1,strpos(lower(c.text_content),lower(p_query))-85) FOR 300)
    FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id
    WHERE d.base_id=p_base AND d.status='indexed' AND strpos(lower(c.text_content),lower(p_query))>0
    ORDER BY d.created_at DESC,c.chunk_index,c.id LIMIT 2;
END
$fn$;
ALTER FUNCTION agentstudio.knowledge_runtime_scope(uuid[]) OWNER TO agentstudio_knowledge_content;
ALTER FUNCTION agentstudio.knowledge_runtime_search(uuid,text) OWNER TO agentstudio_knowledge_content;
REVOKE ALL ON FUNCTION agentstudio.knowledge_runtime_scope(uuid[]),agentstudio.knowledge_runtime_search(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_runtime_scope(uuid[]),agentstudio.knowledge_runtime_search(uuid,text) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_034','Proposed current scoped runtime knowledge refs and bounded keyword evidence; no credential/vector grants');
COMMIT;
