-- OPTIONAL072: exact shared Home knowledge metadata statistics only.
-- Explicit successor of separately verified070/071. No default installation,
-- new table/role/login, old routine edit, broad API table grant or provider call.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
SELECT pg_advisory_xact_lock(61824,20261030);
DO $preflight$
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery()
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_catalog.pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_070')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_071')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_072')
 OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname='agentstudio' AND c.relname IN('agent_spec_authoring','agent_spec_favorites') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND r.rolsuper)<>2
 OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('agentstudio.agent_spec_authoring'))<>8
 OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('agentstudio.agent_spec_favorites'))<>7
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname='agentstudio_knowledge_content' AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid))
 OR pg_catalog.to_regprocedure('agentstudio.knowledge_access_mode(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.knowledge_shared_bases()') IS NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (starts_with(t.typname,'original_home_knowledge_stats') OR starts_with(t.typname,'_original_home_knowledge_stats')))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND starts_with(c.conname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(p.polname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND NOT t.tgisinternal AND starts_with(t.tgname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'original_home_knowledge_stats'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN
  RAISE EXCEPTION 'original_home_knowledge_statistics_preflight_refused';
 END IF;
END $preflight$;
CREATE FUNCTION agentstudio.original_home_knowledge_stats(p_base uuid) RETURNS TABLE(
 id uuid,owner_user_id uuid,revision bigint,created_at timestamptz,updated_at timestamptz,
 document_count bigint,chunk_count bigint,access_role text
)
LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE access text;
BEGIN
 IF current_setting('agentstudio.original_home_knowledge_statistics_enabled',true) IS DISTINCT FROM 'true'
 OR current_setting('agentstudio.knowledge_sharing_enabled',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'knowledge_statistics_not_available' USING ERRCODE='P0403';
 END IF;
 -- Direct SQL callers cannot bypass dependency integrity by skipping the API
 -- catalog audit. These are the unchanged032 active-employee/ACL bodies.
 IF (SELECT count(*) FROM (VALUES
  ('agentstudio.knowledge_employee_active(uuid)','82321600c04a16d96d62997203d5d863955c18743ff2578668766b5b2aad44df'),
  ('agentstudio.knowledge_access_mode(uuid)','d403e834a01f796128a5ab6ce23ddbccf300ea5fa7b63ab0be58872ccead028d')
 ) AS expected(signature,digest)
 JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(expected.signature)
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
 WHERE p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
 AND r.rolname='agentstudio_knowledge_acl' AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid)
 AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.digest)<>2 THEN
  RAISE EXCEPTION 'knowledge_statistics_not_available' USING ERRCODE='P0403';
 END IF;
 access:=agentstudio.knowledge_access_mode(p_base);
 IF access IS NULL THEN
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
INSERT INTO agentstudio.schema_migrations(version,description)
 VALUES('pg_v9_072','Optional original Home shared knowledge statistics through existing active-employee ACL');
COMMIT;
