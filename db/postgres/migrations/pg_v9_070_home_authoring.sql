-- OPTIONAL 070: original employee Home authoring metadata only.
-- Never changes default050/complete069, execution spec, Worker or tool grants.
-- Source candidate only: not installed or SQL-runtime verified locally.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery()
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_catalog.pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_070')
 OR pg_catalog.to_regclass('agentstudio.agent_specs') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.actor_id()') IS NULL
 OR pg_catalog.to_regclass('agentstudio.agent_spec_authoring') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'home_authoring_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN
  RAISE EXCEPTION 'original_home_authoring_preflight_refused';
 END IF;
END $preflight$;

-- Match JavaScript UTF-16 bounds without a data-access or definer capability.
CREATE FUNCTION agentstudio.home_authoring_utf16_length(p_value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(p_value,'') c WHERE c<>''
$fn$;
CREATE FUNCTION agentstudio.home_authoring_valid(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE keys text[]; source text; template_key text; item jsonb; value text;
 trim_chars constant text=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 SELECT array_agg(k ORDER BY k COLLATE "C") INTO keys FROM jsonb_object_keys(p_value) k;
 IF keys IS DISTINCT FROM ARRAY['format','source','template_key','tool_requirements']::text[]
 OR p_value->>'format' IS DISTINCT FROM 'agentstudio.home-authoring.v1'
 OR jsonb_typeof(p_value->'source') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_value->'template_key') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_value->'tool_requirements') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 source=p_value->>'source'; template_key=p_value->>'template_key';
 IF source NOT IN('create','template') OR agentstudio.home_authoring_utf16_length(template_key)>120
 OR template_key<>btrim(template_key,trim_chars)
 OR EXISTS(SELECT 1 FROM regexp_split_to_table(template_key,'') c WHERE c<>'' AND (ascii(c)<32 OR ascii(c)=127))
 OR source='create' AND template_key<>'' OR source='template' AND template_key=''
 OR jsonb_array_length(p_value->'tool_requirements')>20 THEN RETURN false; END IF;
 FOR item IN SELECT jsonb_array_elements(p_value->'tool_requirements') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  value=item#>>'{}';
  IF btrim(value,trim_chars)='' OR agentstudio.home_authoring_utf16_length(value)>300
  OR EXISTS(SELECT 1 FROM regexp_split_to_table(value,'') c WHERE c<>'' AND (ascii(c)<32 OR ascii(c)=127)) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.home_authoring_utf16_length(text),agentstudio.home_authoring_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.home_authoring_utf16_length(text),agentstudio.home_authoring_valid(jsonb) TO agentstudio_api;

CREATE TABLE agentstudio.agent_spec_authoring(
 agent_spec_id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL,
 authoring jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT agent_spec_authoring_owner_fk FOREIGN KEY(agent_spec_id,owner_user_id)
  REFERENCES agentstudio.agent_specs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT agent_spec_authoring_valid_ck CHECK(agentstudio.home_authoring_valid(authoring))
);
REVOKE ALL ON agentstudio.agent_spec_authoring FROM PUBLIC;
ALTER TABLE agentstudio.agent_spec_authoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_spec_authoring FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_spec_authoring_owner ON agentstudio.agent_spec_authoring TO agentstudio_api
 USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.agent_spec_authoring TO agentstudio_api;
GRANT INSERT(agent_spec_id,owner_user_id,authoring) ON agentstudio.agent_spec_authoring TO agentstudio_api;
GRANT UPDATE(authoring,updated_at) ON agentstudio.agent_spec_authoring TO agentstudio_api;
-- No DELETE, Worker/Broker/PUBLIC grant, role creation or execution-spec change.
INSERT INTO agentstudio.schema_migrations(version,description)
 VALUES('pg_v9_070','Original employee Home authoring metadata; display/requirements only');
COMMIT;
