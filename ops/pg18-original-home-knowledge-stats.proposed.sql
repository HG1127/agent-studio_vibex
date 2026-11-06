-- UNNUMBERED REVIEW PROPOSAL ONLY. Root owns numbering/installation and must
-- reconcile A071 first. No default050/complete069/070 source is changed here.
-- No role, login, table, policy, old routine or broad API grant is introduced.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery()
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_070')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_knowledge_content' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR pg_catalog.to_regprocedure('agentstudio.knowledge_access_mode(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.original_home_knowledge_stats(uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN
  RAISE EXCEPTION 'original_home_knowledge_stats_preflight_refused';
 END IF;
END $preflight$;
CREATE FUNCTION agentstudio.original_home_knowledge_stats(p_base uuid) RETURNS TABLE(
 id uuid,owner_user_id uuid,revision bigint,created_at timestamptz,updated_at timestamptz,
 document_count bigint,chunk_count bigint,access_role text
)
LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE access text;
BEGIN
 access:=agentstudio.knowledge_access_mode(p_base);
 IF access IS NULL OR (access<>'owner' AND current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true') THEN
  RAISE EXCEPTION 'knowledge_base_not_found' USING ERRCODE='P0404';
 END IF;
 RETURN QUERY SELECT b.id,b.owner_user_id,b.revision,b.created_at,b.updated_at,
  (SELECT count(*) FROM agentstudio.knowledge_documents d WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted'),
  (SELECT count(*) FROM agentstudio.knowledge_chunks c JOIN agentstudio.knowledge_documents d ON d.id=c.document_id AND d.owner_user_id=c.owner_user_id WHERE d.base_id=b.id AND d.owner_user_id=b.owner_user_id AND d.status<>'deleted'),
  access
 FROM agentstudio.knowledge_bases b WHERE b.id=p_base AND b.visibility='private';
END
$fn$;
ALTER FUNCTION agentstudio.original_home_knowledge_stats(uuid) OWNER TO agentstudio_knowledge_content;
REVOKE ALL ON FUNCTION agentstudio.original_home_knowledge_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.original_home_knowledge_stats(uuid) TO agentstudio_api;
COMMIT;
