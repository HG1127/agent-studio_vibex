-- Isolated optional063 candidate. No runtime/provider/production activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole AND rolsuper)
    OR session_user<>current_user OR pg_is_in_recovery()
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_062')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_063')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE starts_with(proname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,'agent_template_market_') OR starts_with(typname,'_agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE starts_with(conname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE starts_with(tgname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE starts_with(nspname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE starts_with(collname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE starts_with(conname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE starts_with(opcname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE starts_with(opfname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server WHERE starts_with(srvname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper WHERE starts_with(fdwname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_statistic_ext WHERE starts_with(stxname,'agent_template_market_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
  THEN RAISE EXCEPTION 'agent_template_market_installation_refused'; END IF;
END $check$;

CREATE TABLE agentstudio.agent_template_market_publications(
  id uuid NOT NULL,publisher_user_id uuid,source_spec_id uuid,source_sha256 text,built_in boolean NOT NULL,
  state text NOT NULL CHECK(state IN('public','unlisted','deleted')),revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  name text,description text,category text,use_count bigint NOT NULL DEFAULT 0 CHECK(use_count BETWEEN 0 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(id),
  CHECK((built_in AND publisher_user_id IS NULL AND source_spec_id IS NULL AND source_sha256 IS NULL AND state='public') OR (NOT built_in AND publisher_user_id IS NOT NULL)),
  CHECK((state='deleted' AND name IS NULL AND description IS NULL AND category IS NULL AND source_spec_id IS NULL AND source_sha256 IS NULL) OR
    (state<>'deleted' AND name IS NOT NULL AND description IS NOT NULL AND category IS NOT NULL AND category IN('research','knowledge','data','other') AND (built_in OR (source_spec_id IS NOT NULL AND source_sha256 IS NOT NULL AND source_sha256 ~ '^[a-f0-9]{64}$')))),
  CHECK(state='deleted' OR (agentstudio.agent_design_text_valid(name,120,true) AND agentstudio.agent_design_text_valid(description,120,true)))
);
CREATE INDEX agent_template_market_publications_owner ON agentstudio.agent_template_market_publications(publisher_user_id,created_at,id);
CREATE TABLE agentstudio.agent_template_market_snapshots(
  template_id uuid NOT NULL,snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=524288),
  PRIMARY KEY(template_id),FOREIGN KEY(template_id) REFERENCES agentstudio.agent_template_market_publications(id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_template_market_receipts(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('publish','use','unpublish','republish','delete')),
  intent_sha256 text NOT NULL CHECK(intent_sha256 ~ '^[a-f0-9]{64}$'),receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id)
);
CREATE TABLE agentstudio.agent_template_market_tombstones(
  template_id uuid NOT NULL,owner_user_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 2 AND 9007199254740991),
  snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(template_id),
  FOREIGN KEY(template_id) REFERENCES agentstudio.agent_template_market_publications(id) ON DELETE RESTRICT
);
DO $private$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['agent_template_market_publications','agent_template_market_snapshots','agent_template_market_receipts','agent_template_market_tombstones'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch',item);
  END LOOP;
END $private$;

CREATE FUNCTION agentstudio.agent_template_market_context() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;
BEGIN
  PERFORM agentstudio.agent_design_session('agentstudio_api');owner:=agentstudio.actor_id();
  PERFORM agentstudio.agent_design_native(owner);
  RETURN owner;
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_keys(jsonb,text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE WHEN jsonb_typeof($1)='object' THEN $1-$2='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($1))=cardinality($2) ELSE false END
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_int(jsonb,bigint) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE WHEN jsonb_typeof($1)='number' AND $1#>>'{}' ~ '^(0|[1-9][0-9]{0,15})$' THEN ($1#>>'{}')::numeric BETWEEN $2 AND 9007199254740991 ELSE false END
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_text(jsonb,integer,boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT jsonb_typeof($1)='string' AND agentstudio.agent_design_text_valid($1#>>'{}',$2,$3)
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_builtin(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT CASE (CASE WHEN $1 ~ '^[A-Za-z_]+$' THEN lower($1) ELSE $1 END)
    WHEN 'calculate' THEN 'calculate' WHEN '计算器' THEN 'calculate' WHEN '数学计算' THEN 'calculate' WHEN '统计计算' THEN 'calculate'
    WHEN 'summarize' THEN 'summarize' WHEN '文本摘要' THEN 'summarize' WHEN '内容摘要' THEN 'summarize'
    WHEN 'knowledge_search' THEN 'knowledge_search' WHEN '知识库检索' THEN 'knowledge_search'
    WHEN 'web_search' THEN 'web_search' WHEN '网络搜索' THEN 'web_search' WHEN '网页搜索' THEN 'web_search' WHEN '联网搜索' THEN 'web_search'
    WHEN 'web_fetch' THEN 'web_fetch' WHEN '网页内容提取' THEN 'web_fetch' WHEN '网页抓取' THEN 'web_fetch' END
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_trim(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT btrim($1,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_clean(jsonb,integer,boolean) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE raw text;clean text;
BEGIN
  IF jsonb_typeof($1)<>'string' THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  raw:=$1#>>'{}';clean:=agentstudio.agent_template_market_trim(raw);
  IF agentstudio.collaboration_utf16_length(raw)>$2 OR agentstudio.agent_design_text_valid(clean,$2,$3) IS NOT TRUE OR EXISTS(SELECT 1 FROM generate_series(1,length(raw)) n WHERE ascii(substr(raw,n,1)) BETWEEN 1 AND 8 OR ascii(substr(raw,n,1)) IN(11,12,127) OR ascii(substr(raw,n,1)) BETWEEN 14 AND 31) THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  RETURN clean;
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_project(jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v jsonb:=$1;k text;item jsonb;binding jsonb;name text;builtin text;tools jsonb:='[]';shadow text[]:='{}';shadow_builtin text[]:='{}';unknown_tools integer:=0;unknown_fields integer;safe jsonb;descriptions jsonb;items jsonb;
BEGIN
  IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['goal','task_scope','deliverables','task_plan','done_criteria','tools'] THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  descriptions:=jsonb_build_object('goal',agentstudio.agent_template_market_clean(v->'goal',3000,true),'task_scope',agentstudio.agent_template_market_clean(v->'task_scope',4000,false));
  FOREACH k IN ARRAY ARRAY['deliverables','task_plan','done_criteria'] LOOP
    IF jsonb_typeof(v->k)<>'array' OR jsonb_array_length(v->k)>30 THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
    items:='[]';FOR item IN SELECT value FROM jsonb_array_elements(v->k) LOOP items:=items||to_jsonb(agentstudio.agent_template_market_clean(item,500,false)); END LOOP;
    descriptions:=descriptions||jsonb_build_object(k,items);
  END LOOP;
  FOREACH k IN ARRAY ARRAY['http_tools','mcp_tools','knowledge_base_ids','quality_checks'] LOOP
    IF v?k AND (jsonb_typeof(v->k)<>'array' OR jsonb_array_length(v->k)>(CASE k WHEN 'http_tools' THEN 10 WHEN 'mcp_tools' THEN 10 WHEN 'quality_checks' THEN 12 ELSE 10 END)) THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['http_tools','mcp_tools'] LOOP
    FOR binding IN SELECT value FROM jsonb_array_elements(coalesce(v->k,'[]')) LOOP
      IF jsonb_typeof(binding)<>'object' OR jsonb_typeof(binding->'name')<>'string' THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
      name:=agentstudio.agent_template_market_trim(binding->>'name');shadow:=array_append(shadow,name);builtin:=agentstudio.agent_template_market_builtin(name);
      IF builtin IS NOT NULL THEN shadow_builtin:=array_append(shadow_builtin,builtin); END IF;
    END LOOP;
  END LOOP;
  IF jsonb_typeof(v->'tools')<>'array' OR jsonb_array_length(v->'tools')>50 OR (v?'require_approval' AND jsonb_typeof(v->'require_approval')<>'boolean') OR (v?'require_plan_review' AND jsonb_typeof(v->'require_plan_review')<>'boolean') THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v->'tools') LOOP
    name:=agentstudio.agent_template_market_clean(item,300,false);builtin:=agentstudio.agent_template_market_builtin(name);
    IF name=ANY(shadow) OR builtin IS NULL OR builtin=ANY(shadow_builtin) THEN unknown_tools:=unknown_tools+1;
    ELSIF NOT tools ? builtin THEN tools:=tools||to_jsonb(builtin); END IF;
  END LOOP;
  SELECT count(*) INTO unknown_fields FROM jsonb_object_keys(v) n WHERE n NOT IN('goal','task_scope','deliverables','task_plan','done_criteria','tools','knowledge_base_ids','quality_checks','require_approval','require_plan_review','model_binding','http_tools','mcp_tools','knowledge_retrieval');
  safe:=descriptions||jsonb_build_object('tools',tools,'knowledge_base_ids','[]'::jsonb,'quality_checks','[]'::jsonb,'require_approval',true,'require_plan_review',coalesce(v->'require_plan_review','false'));
  RETURN jsonb_build_object('snapshot',jsonb_build_object('protocol','agent_template_market_snapshot_v1','spec',safe),'removed',jsonb_build_object('model_binding',coalesce(v->'model_binding'<>'null',false),'http_tools',coalesce(jsonb_array_length(v->'http_tools'),0),'mcp_tools',coalesce(jsonb_array_length(v->'mcp_tools'),0),'knowledge_bases',coalesce(jsonb_array_length(v->'knowledge_base_ids'),0),'knowledge_retrieval',coalesce(v->'knowledge_retrieval'<>'null',false),'quality_checks',coalesce(jsonb_array_length(v->'quality_checks'),0),'unknown_tools',unknown_tools,'unknown_fields',unknown_fields),'authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_safe_snapshot(jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE projected jsonb;
BEGIN
  IF agentstudio.agent_template_market_keys($1,ARRAY['protocol','spec']) IS NOT TRUE OR $1->>'protocol'<>'agent_template_market_snapshot_v1' THEN RAISE EXCEPTION 'agent_template_market_invalid_snapshot'; END IF;
  projected:=agentstudio.agent_template_market_project($1->'spec')->'snapshot';
  IF projected IS DISTINCT FROM $1 OR octet_length(agentstudio.agent_design_compact(projected))>524288 THEN RAISE EXCEPTION 'agent_template_market_invalid_snapshot'; END IF;
  RETURN projected;
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_private_source(uuid,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
<<market_source_locals>>
DECLARE s record;r record;h record;profile record;consent record;kb_native record;native jsonb;proof jsonb:='[]';projection jsonb;ids uuid[];model_ids uuid[];base_ids uuid[];base_owners uuid[];id uuid;k text;t jsonb;resource_kind text;table_name text;header_table text;foreign_key text;row_json jsonb;source_hash text;profile_connection uuid;header_count integer;
BEGIN
  native:=agentstudio.agent_design_native($1);
  SELECT a.*,a.xmin::text AS row_version INTO s FROM agentstudio.agent_specs a WHERE a.id=$2 AND a.owner_user_id=$1 FOR SHARE;
  IF NOT FOUND OR s.visibility<>'private' OR NOT s.requires_approval OR s.revision<1 OR s.revision>9007199254740991 THEN RAISE EXCEPTION 'agent_template_market_source_unavailable'; END IF;
  projection:=agentstudio.agent_template_market_project(s.spec);
  proof:=jsonb_build_array(jsonb_build_object('kind','source','sha256',encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex')));
  IF s.spec?'knowledge_retrieval' THEN SELECT connection_id INTO profile_connection FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=$1;IF profile_connection IS NULL THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF; END IF;
  IF s.spec?'model_binding' AND (jsonb_typeof(s.spec->'model_binding')<>'object' OR NOT agentstudio.agent_design_uuid(s.spec->'model_binding'->'connection_id')) THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
  SELECT coalesce(array_agg(DISTINCT value ORDER BY value),'{}') INTO model_ids FROM unnest(ARRAY[(s.spec->'model_binding'->>'connection_id')::uuid,profile_connection]) value WHERE value IS NOT NULL;
  FOREACH id IN ARRAY model_ids LOOP
    SELECT a.*,a.xmin::text AS row_version INTO r FROM agentstudio.model_connections a WHERE a.id=market_source_locals.id AND a.owner_user_id=$1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
    proof:=proof||jsonb_build_array(jsonb_build_object('kind','model','sha256',encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')));
  END LOOP;
  FOREACH resource_kind IN ARRAY ARRAY['http','mcp'] LOOP
    IF resource_kind='http' THEN k:='http_tools';table_name:='tool_connections';header_table:='tool_connection_headers';foreign_key:='tool_connection_id';
    ELSE k:='mcp_tools';table_name:='mcp_connections';header_table:='mcp_connection_headers';foreign_key:='mcp_connection_id'; END IF;
    FOR t IN SELECT value FROM jsonb_array_elements(coalesce(s.spec->k,'[]')) LOOP IF agentstudio.agent_design_uuid(t->'connection_id') IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF; END LOOP;
    SELECT coalesce(array_agg(DISTINCT (value->>'connection_id')::uuid ORDER BY (value->>'connection_id')::uuid),'{}') INTO ids FROM jsonb_array_elements(coalesce(s.spec->k,'[]'));
    FOREACH id IN ARRAY ids LOOP
      EXECUTE format('SELECT to_jsonb(a)||jsonb_build_object(''row_version'',a.xmin::text) FROM agentstudio.%I a WHERE a.id=$1 AND a.owner_user_id=$2 FOR SHARE',table_name) INTO row_json USING id,$1;
      IF row_json IS NULL THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
      proof:=proof||jsonb_build_array(jsonb_build_object('kind',resource_kind,'sha256',encode(sha256(convert_to(row_json::text,'UTF8')),'hex')));
      header_count:=0;
      FOR h IN EXECUTE format('SELECT a.*,a.xmin::text AS row_version FROM agentstudio.%I a WHERE a.%I=$1 AND a.owner_user_id=$2 ORDER BY a.id LIMIT 21 FOR SHARE',header_table,foreign_key) USING id,$1 LOOP
        header_count:=header_count+1;IF header_count>20 THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
        proof:=proof||jsonb_build_array(jsonb_build_object('kind',resource_kind||'_header','sha256',encode(sha256(convert_to(to_jsonb(h)::text,'UTF8')),'hex')));
      END LOOP;
    END LOOP;
  END LOOP;
  FOR t IN SELECT value FROM jsonb_array_elements(coalesce(s.spec->'knowledge_base_ids','[]')) LOOP IF agentstudio.agent_design_uuid(to_jsonb(lower(t#>>'{}'))) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF; END LOOP;
  SELECT coalesce(array_agg(DISTINCT lower(value)::uuid ORDER BY lower(value)::uuid),'{}') INTO base_ids FROM jsonb_array_elements_text(coalesce(s.spec->'knowledge_base_ids','[]'));
  SELECT coalesce(array_agg(DISTINCT kb_owner.owner_user_id ORDER BY kb_owner.owner_user_id),'{}') INTO base_owners FROM agentstudio.knowledge_bases AS kb_owner WHERE kb_owner.id=ANY(market_source_locals.base_ids);
  FOREACH id IN ARRAY base_owners LOOP PERFORM pg_advisory_xact_lock(hashtextextended(id::text,6635)); END LOOP;
  FOREACH id IN ARRAY base_ids LOOP
    SELECT a.*,a.xmin::text AS row_version INTO r FROM agentstudio.knowledge_bases a WHERE a.id=market_source_locals.id FOR SHARE;
    IF NOT FOUND OR r.visibility<>'private' OR NOT r.owner_user_id=ANY(base_owners) THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
    SELECT ac.user_id,ac.governance_revision INTO kb_native FROM agentstudio_auth.accounts ac JOIN agentstudio.users u ON u.id=ac.user_id WHERE ac.user_id=r.owner_user_id AND ac.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1';
    IF NOT FOUND OR kb_native.governance_revision IS NULL OR kb_native.governance_revision NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
    proof:=proof||jsonb_build_array(jsonb_build_object('kind','knowledge','sha256',encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'native',to_jsonb(kb_native)));
    IF r.owner_user_id<>$1 THEN
      SELECT a.*,a.xmin::text AS row_version INTO h FROM agentstudio.knowledge_access a WHERE a.base_id=market_source_locals.id AND a.owner_user_id=r.owner_user_id AND a.recipient_user_id=$1 FOR SHARE;
      IF NOT FOUND OR h.revoked OR h.access_role NOT IN('viewer','editor') OR (s.spec?'knowledge_retrieval' AND NOT h.semantic_allowed) THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
      proof:=proof||jsonb_build_array(jsonb_build_object('kind','knowledge_grant','sha256',encode(sha256(convert_to(to_jsonb(h)::text,'UTF8')),'hex')));
    END IF;
  END LOOP;
  IF s.spec?'knowledge_retrieval' THEN
    SELECT a.*,a.xmin::text AS row_version INTO profile FROM agentstudio.knowledge_embedding_profiles a WHERE a.owner_user_id=$1 FOR SHARE;
    SELECT a.*,a.xmin::text AS row_version INTO consent FROM agentstudio.knowledge_embedding_consents a WHERE a.owner_user_id=$1 FOR SHARE;
    IF profile.owner_user_id IS NULL OR consent.owner_user_id IS NULL OR profile.connection_id IS DISTINCT FROM profile_connection THEN RAISE EXCEPTION 'agent_template_market_source_resource_changed'; END IF;
    proof:=proof||jsonb_build_array(jsonb_build_object('kind','retrieval','sha256',encode(sha256(convert_to(jsonb_build_array(to_jsonb(profile),to_jsonb(consent))::text,'UTF8')),'hex')));
  END IF;
  IF jsonb_array_length(proof)>512 OR octet_length(proof::text)>131072 THEN RAISE EXCEPTION 'agent_template_market_source_too_large'; END IF;
  source_hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_template_market_source_v1','native',native-'identity','proof',proof));
  RETURN jsonb_build_object('source',jsonb_build_object('spec_id',s.id,'revision',s.revision,'source_sha256',source_hash),'name',agentstudio.agent_template_market_clean(to_jsonb(s.name),120,true),'snapshot',projection->'snapshot','removed',projection->'removed','authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_source(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;
BEGIN
  owner:=agentstudio.agent_template_market_context();IF $1 IS NULL THEN RAISE EXCEPTION 'agent_template_market_invalid_source'; END IF;
  RETURN agentstudio.agent_template_market_private_source(owner,$1);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_source_pin(jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT agentstudio.agent_template_market_keys($1,ARRAY['spec_id','revision','source_sha256']) AND agentstudio.agent_design_uuid($1->'spec_id') AND agentstudio.agent_template_market_int($1->'revision',1) AND jsonb_typeof($1->'source_sha256')='string' AND $1->>'source_sha256' ~ '^[a-f0-9]{64}$'
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_pin(jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT agentstudio.agent_template_market_keys($1,ARRAY['template_id','revision','snapshot_sha256']) AND agentstudio.agent_design_uuid($1->'template_id') AND agentstudio.agent_template_market_int($1->'revision',1) AND jsonb_typeof($1->'snapshot_sha256')='string' AND $1->>'snapshot_sha256' ~ '^[a-f0-9]{64}$'
$fn$;
CREATE FUNCTION agentstudio.agent_template_market_publish_preview(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;fresh jsonb;name text;
BEGIN
  owner:=agentstudio.agent_template_market_context();
  IF (agentstudio.agent_template_market_keys($1,ARRAY['action','source','name','description','category']) AND $1->>'action'='preview_publish' AND agentstudio.agent_template_market_source_pin($1->'source') AND agentstudio.agent_template_market_text($1->'name',120,false) AND agentstudio.agent_template_market_text($1->'description',120,true) AND $1->>'category' IN('research','knowledge','data','other')) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_preview'; END IF;
  fresh:=agentstudio.agent_template_market_private_source(owner,($1->'source'->>'spec_id')::uuid);
  IF fresh->'source' IS DISTINCT FROM $1->'source' THEN RAISE EXCEPTION 'agent_template_market_source_changed'; END IF;
  name:=coalesce(nullif($1->>'name',''),fresh->>'name');IF agentstudio.agent_design_text_valid(name,120,true) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_name'; END IF;
  RETURN jsonb_build_object('source',fresh->'source','name',name,'description',$1->'description','category',$1->'category','snapshot',fresh->'snapshot','snapshot_sha256',agentstudio.agent_design_digest(fresh->'snapshot'),'removed',fresh->'removed','public_text_review_required',true,'authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_load(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE p record;snapshot jsonb;
BEGIN
  SELECT * INTO p FROM agentstudio.agent_template_market_publications WHERE id=$1 FOR SHARE;
  IF NOT FOUND OR p.state<>'public' OR EXISTS(SELECT 1 FROM agentstudio.agent_template_market_tombstones WHERE template_id=$1) THEN RAISE EXCEPTION 'agent_template_market_unavailable'; END IF;
  SELECT s.snapshot INTO snapshot FROM agentstudio.agent_template_market_snapshots s WHERE s.template_id=$1 FOR SHARE;
  snapshot:=agentstudio.agent_template_market_safe_snapshot(snapshot);
  IF snapshot IS NULL OR agentstudio.agent_design_digest(snapshot) IS DISTINCT FROM p.snapshot_sha256 THEN RAISE EXCEPTION 'agent_template_market_corrupt_snapshot'; END IF;
  RETURN jsonb_build_object('publication',to_jsonb(p),'snapshot',snapshot);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_copy(jsonb,text,text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE snapshot jsonb;name text;spec jsonb;
BEGIN
  snapshot:=agentstudio.agent_template_market_safe_snapshot($1);name:=coalesce(nullif($3,''),$2);spec:=(snapshot->'spec')-'quality_checks';
  IF snapshot IS NULL OR agentstudio.agent_design_text_valid(name,120,true) IS NOT TRUE OR agentstudio.agent_design_text_valid(coalesce($3,''),120,false) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_copy'; END IF;
  RETURN jsonb_build_object('name',name,'spec',spec,'copy_sha256',agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_template_market_copy_candidate_v1','name',name,'spec',spec)),'resource_selection_required',true,'starts_run',false,'authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_use_preview(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;loaded jsonb;p jsonb;candidate jsonb;
BEGIN
  owner:=agentstudio.agent_template_market_context();
  IF (agentstudio.agent_template_market_keys($1,ARRAY['action','template','copy_name']) AND $1->>'action'='preview_use' AND agentstudio.agent_template_market_pin($1->'template') AND agentstudio.agent_template_market_text($1->'copy_name',120,false)) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_preview'; END IF;
  loaded:=agentstudio.agent_template_market_load(($1->'template'->>'template_id')::uuid);p:=loaded->'publication';
  IF ($1->'template'->>'revision')::bigint<>(p->>'revision')::bigint OR $1->'template'->>'snapshot_sha256' IS DISTINCT FROM p->>'snapshot_sha256' THEN RAISE EXCEPTION 'agent_template_market_template_changed'; END IF;
  candidate:=agentstudio.agent_template_market_copy(loaded->'snapshot',p->>'name',$1->>'copy_name');
  RETURN candidate||jsonb_build_object('template',$1->'template');
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_row(uuid,uuid,boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE p record;row_value jsonb;loaded jsonb;own_snapshot jsonb;
BEGIN
  SELECT * INTO p FROM agentstudio.agent_template_market_publications WHERE id=$1 FOR SHARE;
  IF NOT FOUND OR p.state='deleted' OR EXISTS(SELECT 1 FROM agentstudio.agent_template_market_tombstones WHERE template_id=$1) THEN RETURN NULL; END IF;
  IF $3 THEN
    IF p.state='public' THEN loaded:=agentstudio.agent_template_market_load($1);
    ELSIF p.publisher_user_id=$2 AND NOT p.built_in THEN
      SELECT s.snapshot INTO own_snapshot FROM agentstudio.agent_template_market_snapshots s WHERE s.template_id=$1 FOR SHARE;
      own_snapshot:=agentstudio.agent_template_market_safe_snapshot(own_snapshot);
      IF own_snapshot IS NULL OR agentstudio.agent_design_digest(own_snapshot) IS DISTINCT FROM p.snapshot_sha256 THEN RAISE EXCEPTION 'agent_template_market_corrupt_snapshot'; END IF;
      loaded:=jsonb_build_object('snapshot',own_snapshot);
    ELSE RETURN NULL; END IF;
  ELSIF p.publisher_user_id IS DISTINCT FROM $2 OR p.built_in THEN RETURN NULL; END IF;
  row_value:=jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'category',p.category,'source_spec_id',CASE WHEN p.publisher_user_id=$2 THEN coalesce(p.source_spec_id::text,'') ELSE '' END,'built_in',p.built_in,'public',p.state='public','use_count',p.use_count,'created',agentstudio.agent_design_date(p.created_at),'revision',p.revision,'snapshot_sha256',p.snapshot_sha256);
  IF $3 THEN row_value:=row_value||jsonb_build_object('spec',loaded->'snapshot'->'spec','author_tail',CASE WHEN p.built_in THEN '' ELSE right(replace(p.publisher_user_id::text,'-',''),4) END,'is_mine',coalesce(p.publisher_user_id=$2,false)); END IF;
  RETURN row_value;
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_market(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;id uuid;items jsonb:='[]';item jsonb;
BEGIN
  owner:=agentstudio.agent_template_market_context();
  IF (agentstudio.agent_template_market_keys($1,ARRAY['category','search']) AND $1->>'category' IN('all','research','knowledge','data','other') AND agentstudio.agent_template_market_text($1->'search',200,false)) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_query'; END IF;
  FOR id IN SELECT p.id FROM agentstudio.agent_template_market_publications p WHERE p.state='public' AND ($1->>'category'='all' OR p.category=$1->>'category') AND ($1->>'search'='' OR strpos(lower(p.name||' '||p.description||' '||p.category||' '||(CASE p.category WHEN 'research' THEN '研究' WHEN 'knowledge' THEN '问答' WHEN 'data' THEN '分析' ELSE '其他' END)),lower($1->>'search'))>0) ORDER BY p.use_count DESC,p.created_at DESC,p.id LIMIT 200 LOOP
    item:=agentstudio.agent_template_market_row(id,owner,true);IF item IS NOT NULL THEN items:=items||jsonb_build_array(item); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'items',items);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_mine() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;id uuid;items jsonb:='[]';item jsonb;
BEGIN
  owner:=agentstudio.agent_template_market_context();
  FOR id IN SELECT p.id FROM agentstudio.agent_template_market_publications p WHERE p.publisher_user_id=owner AND NOT p.built_in AND p.state<>'deleted' ORDER BY p.created_at DESC,p.id LIMIT 200 LOOP
    item:=agentstudio.agent_template_market_row(id,owner,false);IF item IS NOT NULL THEN items:=items||jsonb_build_array(item); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'items',items);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_detail(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;
BEGIN
  owner:=agentstudio.agent_template_market_context();IF $1 IS NULL THEN RAISE EXCEPTION 'agent_template_market_invalid_id'; END IF;
  RETURN agentstudio.agent_template_market_row($1,owner,true);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_receipt(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;receipt jsonb;
BEGIN
  owner:=agentstudio.agent_template_market_context();IF $1 IS NULL THEN RAISE EXCEPTION 'agent_template_market_invalid_request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':request:'||$1::text,631));
  SELECT r.receipt INTO receipt FROM agentstudio.agent_template_market_receipts r WHERE r.owner_user_id=owner AND r.request_id=$1;
  IF FOUND THEN RETURN jsonb_build_object('status','recorded','receipt',receipt); END IF;
  RETURN jsonb_build_object('status','not_recorded','request_id',$1);
END $fn$;
CREATE FUNCTION agentstudio.agent_template_market_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'agent_template_market_immutable_receipt';
END $fn$;
CREATE TRIGGER agent_template_market_receipts_immutable BEFORE UPDATE OR DELETE ON agentstudio.agent_template_market_receipts FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_template_market_immutable();
CREATE FUNCTION agentstudio.agent_template_market_record(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE owner uuid;action text;rid uuid;tid uuid;hash text;prior record;p record;fresh jsonb;candidate jsonb;snapshot jsonb;receipt jsonb;intent jsonb:=$1;sid uuid;agent record;safe jsonb;role_sha text;new_revision bigint;history_count integer;
BEGIN
  owner:=agentstudio.agent_template_market_context();action:=intent->>'action';
  IF (jsonb_typeof(intent)='object' AND agentstudio.agent_design_uuid(intent->'request_id') AND intent->'confirm'='true'::jsonb) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_intent'; END IF;
  IF action='publish' THEN
    IF (agentstudio.agent_template_market_keys(intent,ARRAY['action','request_id','source','name','description','category','expected_snapshot_sha256','confirm','acknowledgement']) AND agentstudio.agent_template_market_source_pin(intent->'source') AND agentstudio.agent_template_market_text(intent->'name',120,false) AND agentstudio.agent_template_market_text(intent->'description',120,true) AND intent->>'category' IN('research','knowledge','data','other') AND jsonb_typeof(intent->'expected_snapshot_sha256')='string' AND intent->>'expected_snapshot_sha256' ~ '^[a-f0-9]{64}$' AND intent->>'acknowledgement'='PUBLISH_REVIEWED_AGENT_TEMPLATE') IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_intent'; END IF;
  ELSIF action='use' THEN
    IF (agentstudio.agent_template_market_keys(intent,ARRAY['action','request_id','template','copy_name','expected_copy_sha256','confirm']) AND agentstudio.agent_template_market_pin(intent->'template') AND agentstudio.agent_template_market_text(intent->'copy_name',120,false) AND jsonb_typeof(intent->'expected_copy_sha256')='string' AND intent->>'expected_copy_sha256' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_intent'; END IF;
  ELSIF action IN('unpublish','republish','delete') THEN
    IF (agentstudio.agent_template_market_keys(intent,ARRAY['action','request_id','template','confirm']) AND agentstudio.agent_template_market_pin(intent->'template')) IS NOT TRUE THEN RAISE EXCEPTION 'agent_template_market_invalid_intent'; END IF;
  ELSE RAISE EXCEPTION 'agent_template_market_invalid_intent'; END IF;
  rid:=(intent->>'request_id')::uuid;hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_template_market_intent_v1','operation',action,'intent',intent));
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':request:'||rid::text,631));
  SELECT * INTO prior FROM agentstudio.agent_template_market_receipts r WHERE r.owner_user_id=owner AND r.request_id=rid;
  IF FOUND THEN IF prior.intent_sha256<>hash OR prior.operation<>action THEN RAISE EXCEPTION 'agent_template_market_request_conflict'; END IF;RETURN prior.receipt; END IF;
  IF action='publish' THEN
    fresh:=agentstudio.agent_template_market_publish_preview((intent-ARRAY['request_id','expected_snapshot_sha256','confirm','acknowledgement'])||jsonb_build_object('action','preview_publish'));
    IF fresh->>'snapshot_sha256' IS DISTINCT FROM intent->>'expected_snapshot_sha256' THEN RAISE EXCEPTION 'agent_template_market_source_changed'; END IF;
    tid:=gen_random_uuid();
    INSERT INTO agentstudio.agent_template_market_publications(id,publisher_user_id,source_spec_id,source_sha256,built_in,state,revision,snapshot_sha256,name,description,category)
      VALUES(tid,owner,(fresh->'source'->>'spec_id')::uuid,fresh->'source'->>'source_sha256',false,'public',1,fresh->>'snapshot_sha256',fresh->>'name',fresh->>'description',fresh->>'category');
    INSERT INTO agentstudio.agent_template_market_snapshots(template_id,snapshot) VALUES(tid,fresh->'snapshot');
    receipt:=jsonb_build_object('operation','publish','request_id',rid,'item',agentstudio.agent_template_market_row(tid,owner,false));
  ELSE
    tid:=(intent->'template'->>'template_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended('template:'||tid::text,630));
    SELECT * INTO p FROM agentstudio.agent_template_market_publications WHERE id=tid FOR UPDATE;
    IF NOT FOUND OR p.state='deleted' OR EXISTS(SELECT 1 FROM agentstudio.agent_template_market_tombstones WHERE template_id=tid) THEN RAISE EXCEPTION 'agent_template_market_unavailable'; END IF;
    IF p.revision<>(intent->'template'->>'revision')::bigint OR p.snapshot_sha256 IS DISTINCT FROM intent->'template'->>'snapshot_sha256' THEN RAISE EXCEPTION 'agent_template_market_template_changed'; END IF;
    IF action='use' THEN
      IF p.state<>'public' OR p.use_count>=9007199254740991 THEN RAISE EXCEPTION 'agent_template_market_unavailable'; END IF;
      fresh:=agentstudio.agent_template_market_load(tid);candidate:=agentstudio.agent_template_market_copy(fresh->'snapshot',p.name,intent->>'copy_name');
      IF candidate->>'copy_sha256' IS DISTINCT FROM intent->>'expected_copy_sha256' THEN RAISE EXCEPTION 'agent_template_market_copy_changed'; END IF;
      sid:=gen_random_uuid();safe:=candidate->'spec';
      INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec,requires_approval,revision) VALUES(sid,owner,candidate->>'name',safe,true,1) RETURNING * INTO agent;
      IF agent.id IS DISTINCT FROM sid OR agent.owner_user_id IS DISTINCT FROM owner OR agent.name IS DISTINCT FROM candidate->>'name' OR agent.spec IS DISTINCT FROM safe OR agent.requires_approval IS DISTINCT FROM true OR agent.revision<>1 OR agent.visibility<>'private' OR agent.team_id IS NOT NULL THEN RAISE EXCEPTION 'agent_template_market_unsafe_copy'; END IF;
      role_sha:=agentstudio.agent_optimization_role_sha(agent.id,agent.owner_user_id,agent.name,agent.revision,agent.spec);
      INSERT INTO agentstudio.agent_collaboration_revisions(id,owner_user_id,spec_id,actor_user_id,kind,spec_revision,source_sha256,safe_spec,note)
        VALUES(gen_random_uuid(),owner,sid,owner,'edited',1,role_sha,agentstudio.collaboration_safe_text(safe),'Owner copied reviewed template');
      SELECT count(*) INTO history_count FROM agentstudio.agent_collaboration_revisions WHERE spec_id=sid;
      IF history_count<>1 OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_collaboration_revisions WHERE spec_id=sid AND owner_user_id=owner AND actor_user_id=owner AND kind='edited' AND spec_revision=1 AND source_sha256=role_sha AND safe_spec=agentstudio.collaboration_safe_text(safe) AND source_revision_id IS NULL AND proposal_id IS NULL) THEN RAISE EXCEPTION 'agent_template_market_history_required'; END IF;
      UPDATE agentstudio.agent_template_market_publications SET use_count=use_count+1,updated_at=clock_timestamp() WHERE id=tid;
      receipt:=jsonb_build_object('operation','use','request_id',rid,'template_id',tid,'revision',p.revision,'snapshot_sha256',p.snapshot_sha256,'spec_id',sid,'spec_revision',1,'use_count',p.use_count+1);
    ELSE
      IF p.built_in OR p.publisher_user_id IS DISTINCT FROM owner THEN RAISE EXCEPTION 'agent_template_market_owner_required'; END IF;
      IF p.revision>=9007199254740991 OR (action='unpublish' AND p.state<>'public') OR (action='republish' AND p.state<>'unlisted') THEN RAISE EXCEPTION 'agent_template_market_state_changed'; END IF;
      new_revision:=p.revision+1;
      IF action='delete' THEN
        INSERT INTO agentstudio.agent_template_market_tombstones(template_id,owner_user_id,revision,snapshot_sha256) VALUES(tid,owner,new_revision,p.snapshot_sha256);
        DELETE FROM agentstudio.agent_template_market_snapshots WHERE template_id=tid;
        UPDATE agentstudio.agent_template_market_publications SET state='deleted',revision=new_revision,name=NULL,description=NULL,category=NULL,source_spec_id=NULL,source_sha256=NULL,updated_at=clock_timestamp() WHERE id=tid;
      ELSE
        SELECT s.snapshot INTO snapshot FROM agentstudio.agent_template_market_snapshots s WHERE s.template_id=tid FOR SHARE;
        snapshot:=agentstudio.agent_template_market_safe_snapshot(snapshot);
        IF snapshot IS NULL OR agentstudio.agent_design_digest(snapshot) IS DISTINCT FROM p.snapshot_sha256 THEN RAISE EXCEPTION 'agent_template_market_corrupt_snapshot'; END IF;
        UPDATE agentstudio.agent_template_market_publications SET state=(CASE action WHEN 'republish' THEN 'public' ELSE 'unlisted' END),revision=new_revision,updated_at=clock_timestamp() WHERE id=tid;
      END IF;
      receipt:=jsonb_build_object('operation',action,'request_id',rid,'template_id',tid,'revision',new_revision,'snapshot_sha256',p.snapshot_sha256,'public',action='republish','deleted',action='delete');
    END IF;
  END IF;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,'agent.template_market.'||action,'agent_template',tid::text,'succeeded',jsonb_build_object('request_id',rid,'intent_sha256',hash,'operation',action,'copied_spec_id',sid,'provider_called',false));
  INSERT INTO agentstudio.agent_template_market_receipts(owner_user_id,request_id,operation,intent_sha256,receipt) VALUES(owner,rid,action,hash,receipt);
  RETURN receipt;
END $fn$;
DO $acl$ DECLARE p record;BEGIN
  FOR p IN SELECT n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) AS args FROM pg_catalog.pg_proc pr JOIN pg_catalog.pg_namespace n ON n.oid=pr.pronamespace WHERE n.nspname='agentstudio' AND starts_with(pr.proname,'agent_template_market_') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch',p.nspname,p.proname,p.args);
  END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_template_market_source(uuid),agentstudio.agent_template_market_publish_preview(jsonb),agentstudio.agent_template_market_use_preview(jsonb),agentstudio.agent_template_market_market(jsonb),agentstudio.agent_template_market_mine(),agentstudio.agent_template_market_detail(uuid),agentstudio.agent_template_market_receipt(uuid),agentstudio.agent_template_market_record(jsonb) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_063','Optional Native-owner reviewed Agent template publication/frozen snapshot/independent private copy/lifecycle/immutable receipt; no production activation');
COMMIT;
