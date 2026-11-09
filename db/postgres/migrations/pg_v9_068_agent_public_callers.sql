-- Isolated optional F11/F12. Independent caller credentials and bounded Owner
-- consent reuse the original Agent admission, leased Worker and private Broker.
-- No deployment, login role, provider secret, employee-cookie public entry or
-- migration of a legacy reversible key. 067 is an independent optional domain.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_user<>session_user OR pg_is_in_recovery() OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=current_user::regrole AND rolsuper)
  OR EXISTS(SELECT 1 FROM pg_roles WHERE NOT rolsuper AND pg_has_role(oid,current_user::regrole,'MEMBER'))
  OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_066') OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_068')
  OR EXISTS(SELECT 1 FROM pg_class WHERE starts_with(relname,'agent_caller_')) OR EXISTS(SELECT 1 FROM pg_proc WHERE starts_with(proname,'agent_caller_'))
  OR EXISTS(SELECT 1 FROM pg_type WHERE starts_with(typname,'agent_caller_') OR starts_with(typname,'_agent_caller_'))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE starts_with(rolname,'agentstudio_caller_'))
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE starts_with(conname,'agent_caller_')) OR EXISTS(SELECT 1 FROM pg_trigger WHERE starts_with(tgname,'agent_caller_'))
  OR EXISTS(SELECT 1 FROM pg_policy WHERE starts_with(polname,'agent_caller_')) OR EXISTS(SELECT 1 FROM pg_namespace WHERE starts_with(nspname,'agent_caller_'))
  OR EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
 THEN RAISE EXCEPTION 'agent_caller_installation_refused';END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_caller_budgets(
 owner_user_id uuid PRIMARY KEY,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740989),epoch bigint NOT NULL CHECK(epoch BETWEEN 1 AND 9007199254740989),
 enabled boolean NOT NULL,daily_run_limit integer NOT NULL CHECK(daily_run_limit BETWEEN 1 AND 200),daily_model_limit integer NOT NULL CHECK(daily_model_limit BETWEEN 1 AND 2000),
 daily_tool_limit integer NOT NULL CHECK(daily_tool_limit BETWEEN 0 AND 4000),concurrent_limit integer NOT NULL CHECK(concurrent_limit BETWEEN 1 AND 3),
 usage_day date NOT NULL,run_count integer NOT NULL CHECK(run_count BETWEEN 0 AND 200),model_count integer NOT NULL CHECK(model_count BETWEEN 0 AND 2000),tool_count integer NOT NULL CHECK(tool_count BETWEEN 0 AND 4000),
 fee_ack text CHECK(fee_ack='ALLOW_MY_PUBLISHED_AGENT_CALLER_EXECUTION_WITHIN_THESE_LIMITS'),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(enabled=(fee_ack IS NOT NULL))
);
CREATE TABLE agentstudio.agent_caller_credentials(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('api','embed')),name text NOT NULL CHECK(agentstudio.collaboration_utf16_length(name) BETWEEN 1 AND 30 AND btrim(name)=name),
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740989),revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740989),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),token_tail text NOT NULL CHECK(token_tail ~ '^[A-Za-z0-9_-]{8}$'),
 owner_epoch bigint NOT NULL,budget_epoch bigint NOT NULL,spec_id uuid NOT NULL,version_id uuid NOT NULL,version_sha256 text NOT NULL CHECK(version_sha256 ~ '^[a-f0-9]{64}$'),head_revision bigint NOT NULL,
 origins jsonb NOT NULL CHECK(jsonb_typeof(origins)='array' AND jsonb_array_length(origins) BETWEEN 1 AND 10),limits jsonb NOT NULL CHECK(jsonb_typeof(limits)='object' AND octet_length(limits::text)<=4096),theme jsonb,
 enabled boolean NOT NULL,revoked boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(NOT revoked OR NOT enabled),CHECK((kind='embed' AND jsonb_typeof(theme)='object') OR (kind='api' AND theme IS NULL)),UNIQUE(id,owner_user_id)
);
CREATE INDEX agent_caller_credentials_owner ON agentstudio.agent_caller_credentials(owner_user_id,created_at,id);
CREATE TABLE agentstudio.agent_caller_credential_events(
 owner_user_id uuid NOT NULL,credential_id uuid,generation bigint NOT NULL,request_id uuid NOT NULL,action text NOT NULL CHECK(action IN('budget','create','rotate','revoke','configure_embed')),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id)
);
CREATE TABLE agentstudio.agent_caller_execution_sources(
 source_id uuid PRIMARY KEY,invocation_id uuid NOT NULL UNIQUE,owner_user_id uuid NOT NULL,credential_id uuid NOT NULL,generation bigint NOT NULL,budget_epoch bigint NOT NULL,owner_epoch bigint NOT NULL,
 version_id uuid NOT NULL,version_sha256 text NOT NULL,head_revision bigint NOT NULL,copy_sha256 text NOT NULL CHECK(copy_sha256 ~ '^[a-f0-9]{64}$'),copy_xmin text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(source_id,invocation_id,owner_user_id)
);
CREATE TABLE agentstudio.agent_caller_invocations(
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,credential_id uuid NOT NULL,generation bigint NOT NULL,source_id uuid NOT NULL UNIQUE,run_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),graph_sha256 text NOT NULL CHECK(graph_sha256 ~ '^[a-f0-9]{64}$'),session_id uuid NOT NULL,mode text NOT NULL CHECK(mode IN('public','owner_test')),origin text NOT NULL,version_id uuid NOT NULL,version_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(credential_id,generation,request_id),
 FOREIGN KEY(source_id,id,owner_user_id) REFERENCES agentstudio.agent_caller_execution_sources(source_id,invocation_id,owner_user_id),FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);
CREATE INDEX agent_caller_invocations_owner ON agentstudio.agent_caller_invocations(owner_user_id,created_at,id);
CREATE INDEX agent_caller_invocations_key ON agentstudio.agent_caller_invocations(credential_id,created_at,id);
CREATE TABLE agentstudio.agent_caller_receipts(
 scope text NOT NULL CHECK(scope IN('owner','run')),principal_id uuid NOT NULL,generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740989),request_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=16384),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(scope,principal_id,generation,request_id),
 UNIQUE(scope,principal_id,generation,request_id,request_sha256)
);
CREATE TABLE agentstudio.agent_caller_contexts(
 scope text NOT NULL DEFAULT 'run' CHECK(scope='run'),principal_id uuid NOT NULL,generation bigint NOT NULL,request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 owner_user_id uuid NOT NULL,source_id uuid NOT NULL,invocation_id uuid NOT NULL,run_id uuid NOT NULL,choice jsonb NOT NULL CHECK(jsonb_typeof(choice)='object' AND octet_length(choice::text)<=16384),
 origin text NOT NULL,mode text NOT NULL CHECK(mode IN('public','owner_test')),restore_actor text NOT NULL,backend_pid integer NOT NULL CHECK(backend_pid>0),transaction_id text NOT NULL CHECK(transaction_id ~ '^[1-9][0-9]{0,19}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(principal_id,generation,request_id),UNIQUE(backend_pid,transaction_id),
 FOREIGN KEY(scope,principal_id,generation,request_id,request_sha256) REFERENCES agentstudio.agent_caller_receipts(scope,principal_id,generation,request_id,request_sha256) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE agentstudio.agent_caller_step_reservations(
 invocation_id uuid NOT NULL,owner_user_id uuid NOT NULL,run_id uuid NOT NULL,step_key text NOT NULL CHECK(step_key ~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$'),input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN('agent','model','tool')),tool_name text NOT NULL,knowledge_charge boolean NOT NULL,job_id uuid NOT NULL,lease_version bigint NOT NULL CHECK(lease_version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(run_id,step_key)
);
DO $private$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['budgets','credentials','credential_events','execution_sources','invocations','receipts','contexts','step_reservations'] LOOP
  EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY','agent_caller_'||t);EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY','agent_caller_'||t);
  EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch','agent_caller_'||t);
 END LOOP;
END $private$;
CREATE FUNCTION agentstudio.agent_caller_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'agent_caller_immutable_evidence';END $fn$;
DO $immutable$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['credential_events','execution_sources','invocations','receipts','contexts','step_reservations'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON agentstudio.%I FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_caller_immutable()','agent_caller_'||t||'_immutable','agent_caller_'||t);
 END LOOP;
END $immutable$;
CREATE FUNCTION agentstudio.agent_caller_uint(jsonb,bigint,bigint) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT CASE WHEN jsonb_typeof($1)='number' AND $1#>>'{}' ~ '^(0|[1-9][0-9]{0,15})$' THEN ($1#>>'{}')::numeric BETWEEN $2 AND $3 ELSE false END
$fn$;
CREATE FUNCTION agentstudio.agent_caller_origin(text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v text;v_port text;
BEGIN
 IF octet_length($1)>240 OR $1 !~ '^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(:[1-9][0-9]{0,4})?$' THEN RETURN false;END IF;
 v:=substring($1 FROM '^https://([^\[][^:]*)(:|$)');
 IF v IS NOT NULL AND EXISTS(SELECT 1 FROM regexp_split_to_table(v,'\.') p WHERE length(p)>63 OR p='' OR p !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') THEN RETURN false;END IF;
 v_port:=substring($1 FROM ':([0-9]+)$');IF v_port IS NOT NULL AND (v_port::integer>65535 OR v_port::integer=443) THEN RETURN false;END IF;
 RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_theme(jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT agentstudio.agent_template_market_keys($1,ARRAY['title','accent','position']) IS TRUE AND jsonb_typeof($1->'title')='string' AND agentstudio.collaboration_utf16_length($1->>'title')<=40
  AND $1->>'accent' IN('coral','sunset','ocean','forest') AND $1->>'position' IN('bottom_right','bottom_left')
$fn$;
CREATE FUNCTION agentstudio.agent_caller_limits(jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a jsonb;
BEGIN
 IF agentstudio.agent_template_market_keys($1,ARRAY['per_minute','per_day','max_steps','max_model_calls','max_tool_calls','allowed_tools','public_knowledge','knowledge_charge']) IS NOT TRUE
  OR agentstudio.agent_caller_uint($1->'per_minute',1,6) IS NOT TRUE OR agentstudio.agent_caller_uint($1->'per_day',1,200) IS NOT TRUE
  OR agentstudio.agent_caller_uint($1->'max_steps',1,10) IS NOT TRUE OR agentstudio.agent_caller_uint($1->'max_model_calls',1,10) IS NOT TRUE OR agentstudio.agent_caller_uint($1->'max_tool_calls',0,20) IS NOT TRUE
  OR jsonb_typeof($1->'public_knowledge') IS DISTINCT FROM 'boolean' OR jsonb_typeof($1->'allowed_tools') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 a:=$1->'allowed_tools';IF jsonb_array_length(a)>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(a) x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$')
  OR (SELECT count(*) FROM jsonb_array_elements(a))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(a) x) THEN RETURN false;END IF;
 RETURN $1->'knowledge_charge'='null'::jsonb OR ($1->'public_knowledge'='true'::jsonb AND $1->'knowledge_charge'='"PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL"'::jsonb);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_run_choice(jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT agentstudio.agent_template_market_keys($1,ARRAY['request_id','session_id','input','fee_ack','confirm']) IS TRUE AND agentstudio.agent_design_uuid($1->'request_id') IS TRUE AND agentstudio.agent_design_uuid($1->'session_id') IS TRUE
  AND jsonb_typeof($1->'input')='string' AND btrim($1->>'input')=$1->>'input' AND agentstudio.collaboration_utf16_length($1->>'input') BETWEEN 1 AND 2000
  AND $1->>'input' !~ 'acs_(api|embed)_[a-f0-9-]{36}_g[1-9][0-9]{0,15}_[A-Za-z0-9_-]{43}' AND $1->'confirm'='true'::jsonb AND $1->>'fee_ack'='RUN_ONCE_WITHIN_OWNER_APPROVED_LIMITS'
$fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_choice(jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a text;r jsonb;o jsonb;
BEGIN
 IF jsonb_typeof($1) IS DISTINCT FROM 'object' OR agentstudio.agent_design_uuid($1->'request_id') IS NOT TRUE OR $1->'confirm' IS DISTINCT FROM 'true'::jsonb THEN RETURN false;END IF;a:=$1->>'action';
 IF a='budget' THEN RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','expected_revision','enabled','daily_run_limit','daily_model_limit','daily_tool_limit','concurrent_limit','fee_ack','confirm']) IS TRUE
  AND agentstudio.agent_caller_uint($1->'expected_revision',0,9007199254740988) IS TRUE AND jsonb_typeof($1->'enabled')='boolean' AND agentstudio.agent_caller_uint($1->'daily_run_limit',1,200) IS TRUE
  AND agentstudio.agent_caller_uint($1->'daily_model_limit',1,2000) IS TRUE AND agentstudio.agent_caller_uint($1->'daily_tool_limit',0,4000) IS TRUE AND agentstudio.agent_caller_uint($1->'concurrent_limit',1,3) IS TRUE
  AND (($1->'enabled'='true'::jsonb AND $1->>'fee_ack'='ALLOW_MY_PUBLISHED_AGENT_CALLER_EXECUTION_WITHIN_THESE_LIMITS') OR ($1->'enabled'='false'::jsonb AND $1->'fee_ack'='null'::jsonb));END IF;
 IF a IN('revoke','configure_embed') THEN
  IF agentstudio.agent_design_uuid($1->'credential_id') IS NOT TRUE OR agentstudio.agent_caller_uint($1->'expected_revision',1,9007199254740988) IS NOT TRUE THEN RETURN false;END IF;
  IF a='revoke' THEN RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','credential_id','expected_revision','confirm']) IS TRUE;END IF;
  RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','credential_id','expected_revision','enabled','theme','confirm']) IS TRUE AND jsonb_typeof($1->'enabled')='boolean' AND agentstudio.agent_caller_theme($1->'theme') IS TRUE;
 END IF;
 IF a NOT IN('create','rotate') OR agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','kind','name','release','budget_revision','origins','expires_days','limits','theme','fee_ack','confirm']||CASE WHEN a='rotate' THEN ARRAY['credential_id','expected_revision'] ELSE ARRAY[]::text[] END) IS NOT TRUE THEN RETURN false;END IF;
 IF a='rotate' AND (agentstudio.agent_design_uuid($1->'credential_id') IS NOT TRUE OR agentstudio.agent_caller_uint($1->'expected_revision',1,9007199254740988) IS NOT TRUE) THEN RETURN false;END IF;
 IF $1->>'kind' NOT IN('api','embed') OR jsonb_typeof($1->'name') IS DISTINCT FROM 'string' OR btrim($1->>'name') IS DISTINCT FROM $1->>'name' OR agentstudio.collaboration_utf16_length($1->>'name') NOT BETWEEN 1 AND 30
  OR $1->>'fee_ack' IS DISTINCT FROM 'ALLOW_MY_PUBLISHED_AGENT_CALLER_EXECUTION_WITHIN_THESE_LIMITS' OR agentstudio.agent_caller_uint($1->'budget_revision',1,9007199254740988) IS NOT TRUE
  OR agentstudio.agent_caller_uint($1->'expires_days',1,90) IS NOT TRUE OR agentstudio.agent_caller_limits($1->'limits') IS NOT TRUE
  OR NOT (($1->>'kind'='api' AND $1->'theme'='null'::jsonb) OR ($1->>'kind'='embed' AND agentstudio.agent_caller_theme($1->'theme') IS TRUE)) THEN RETURN false;END IF;
 r:=$1->'release';IF agentstudio.agent_template_market_keys(r,ARRAY['spec_id','version_id','version_sha256','head_revision']) IS NOT TRUE OR agentstudio.agent_design_uuid(r->'spec_id') IS NOT TRUE OR agentstudio.agent_design_uuid(r->'version_id') IS NOT TRUE
  OR jsonb_typeof(r->'version_sha256') IS DISTINCT FROM 'string' OR r->>'version_sha256' !~ '^[a-f0-9]{64}$' OR agentstudio.agent_caller_uint(r->'head_revision',1,9007199254740988) IS NOT TRUE THEN RETURN false;END IF;
 o:=$1->'origins';IF jsonb_typeof(o) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 RETURN jsonb_array_length(o) BETWEEN 1 AND 10 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o) x WHERE jsonb_typeof(x)<>'string' OR agentstudio.agent_caller_origin(x#>>'{}') IS NOT TRUE)
  AND (SELECT count(*) FROM jsonb_array_elements(o))=(SELECT count(DISTINCT x) FROM jsonb_array_elements(o) x);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_token_hash(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT encode(sha256(convert_to('agent_caller_secret_v1:'||$1,'UTF8')),'hex')
$fn$;
CREATE FUNCTION agentstudio.agent_caller_metadata(agentstudio.agent_caller_credentials) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT (to_jsonb($1)-ARRAY['token_sha256','owner_user_id','owner_epoch','budget_epoch'])||jsonb_build_object('authorization_current',
  ($1).enabled AND NOT ($1).revoked AND ($1).expires_at>clock_timestamp() AND EXISTS(
   SELECT 1 FROM agentstudio.agent_caller_budgets b JOIN agentstudio_auth.accounts a ON a.user_id=b.owner_user_id JOIN agentstudio.users u ON u.id=a.user_id
   JOIN agentstudio.agent_release_heads h ON h.owner_user_id=b.owner_user_id AND h.spec_id=($1).spec_id
   JOIN agentstudio.agent_release_versions v ON v.id=h.active_version_id AND v.owner_user_id=h.owner_user_id AND v.spec_id=h.spec_id
   WHERE b.owner_user_id=($1).owner_user_id AND b.enabled AND b.epoch=($1).budget_epoch AND a.enabled AND a.share_enabled AND a.governance_revision=($1).owner_epoch
    AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND h.active_version_id=($1).version_id AND h.revision=($1).head_revision AND v.status='published' AND agentstudio.release_version_sha(v.id)=($1).version_sha256))
$fn$;
CREATE FUNCTION agentstudio.agent_caller_release(uuid,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE h record;v record;
BEGIN
 SELECT * INTO h FROM agentstudio.agent_release_heads WHERE spec_id=($2->>'spec_id')::uuid AND owner_user_id=$1 FOR SHARE;
 IF NOT FOUND OR h.active_version_id IS DISTINCT FROM ($2->>'version_id')::uuid OR h.revision IS DISTINCT FROM ($2->>'head_revision')::bigint THEN RAISE EXCEPTION 'agent_caller_release_changed';END IF;
 SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=h.active_version_id AND spec_id=h.spec_id AND owner_user_id=$1 FOR SHARE;
 IF NOT FOUND OR v.status<>'published' OR agentstudio.release_version_sha(v.id) IS DISTINCT FROM $2->>'version_sha256' THEN RAISE EXCEPTION 'agent_caller_release_changed';END IF;
 RETURN jsonb_build_object('name',v.name_snapshot,'spec',v.spec_snapshot,'version_id',v.id,'version_sha256',$2->>'version_sha256','spec_id',v.spec_id,'head_revision',h.revision);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_rows() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE n jsonb;o uuid;b jsonb;k jsonb;a jsonb;
BEGIN
 n:=agentstudio.agent_internal_share_context(false);o:=(n->>'owner_user_id')::uuid;
 SELECT to_jsonb(x)-'owner_user_id' INTO b FROM agentstudio.agent_caller_budgets x WHERE owner_user_id=o;
 SELECT coalesce(jsonb_agg(agentstudio.agent_caller_metadata(x) ORDER BY created_at DESC,id),'[]'::jsonb) INTO k FROM agentstudio.agent_caller_credentials x WHERE owner_user_id=o;
 SELECT coalesce(jsonb_agg(x.item ORDER BY x.name,x.spec_id),'[]'::jsonb) INTO a FROM(
  SELECT h.spec_id,v.name_snapshot AS name,jsonb_build_object('name',v.name_snapshot,'release',jsonb_build_object('spec_id',h.spec_id,'version_id',v.id,'version_sha256',agentstudio.release_version_sha(v.id),'head_revision',h.revision),'tool_names',coalesce(v.spec_snapshot->'tools','[]'::jsonb),'knowledge_selected',coalesce(jsonb_array_length(v.spec_snapshot->'knowledge_base_ids'),0)>0,'has_model',coalesce(jsonb_typeof(v.spec_snapshot->'model_binding')='object',false)) AS item
  FROM agentstudio.agent_release_heads h JOIN agentstudio.agent_release_versions v ON v.id=h.active_version_id AND v.spec_id=h.spec_id AND v.owner_user_id=h.owner_user_id WHERE h.owner_user_id=o AND v.status='published'
 )x;
 RETURN jsonb_build_object('protocol','agent_caller_owner_workspace_v1','budget',b,'credentials',k,'agents',a,'owner_epoch',n->'epoch');
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_receipt(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE n jsonb;r record;
BEGIN
 n:=agentstudio.agent_internal_share_context(false);
 SELECT * INTO r FROM agentstudio.agent_caller_receipts WHERE scope='owner' AND principal_id=(n->>'owner_user_id')::uuid AND generation=0 AND request_id=$1;
 IF NOT FOUND THEN RETURN NULL;END IF;RETURN jsonb_build_object('protocol','agent_caller_owner_reply_v1','receipt',r.receipt,'replayed',true);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_change(jsonb,uuid,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE n jsonb;o uuid;a text;q uuid;h text;p record;b agentstudio.agent_caller_budgets;k agentstudio.agent_caller_credentials;v jsonb;outcome jsonb;receipt jsonb;v_current bigint:=0;g bigint;now_at timestamptz;
BEGIN
 n:=agentstudio.agent_internal_share_context(false);o:=(n->>'owner_user_id')::uuid;
 IF agentstudio.agent_caller_owner_choice($1) IS NOT TRUE THEN RAISE EXCEPTION 'agent_caller_invalid_choice';END IF;
 a:=$1->>'action';q:=($1->>'request_id')::uuid;h:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_caller_owner_intent_v1','purpose','published_agent_caller_authorization','choice',$1));
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':caller-owner:'||q::text,681));
 SELECT * INTO p FROM agentstudio.agent_caller_receipts WHERE scope='owner' AND principal_id=o AND generation=0 AND request_id=q;
 IF FOUND THEN IF p.request_sha256<>h THEN RAISE EXCEPTION 'agent_caller_request_conflict';END IF;RETURN jsonb_build_object('protocol','agent_caller_owner_reply_v1','receipt',p.receipt,'replayed',true);END IF;
 IF a IN('create','rotate') THEN PERFORM agentstudio.agent_internal_share_member(o,true);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':caller-budget',682));
 SELECT * INTO b FROM agentstudio.agent_caller_budgets WHERE owner_user_id=o FOR UPDATE;
 now_at:=clock_timestamp();
 IF a='budget' THEN
  v_current:=coalesce(b.revision,0);IF v_current<>($1->>'expected_revision')::bigint THEN RAISE EXCEPTION 'agent_caller_revision_changed';END IF;
  INSERT INTO agentstudio.agent_caller_budgets(owner_user_id,revision,epoch,enabled,daily_run_limit,daily_model_limit,daily_tool_limit,concurrent_limit,usage_day,run_count,model_count,tool_count,fee_ack,updated_at)
   VALUES(o,v_current+1,coalesce(b.epoch,0)+1,($1->>'enabled')::boolean,($1->>'daily_run_limit')::integer,($1->>'daily_model_limit')::integer,($1->>'daily_tool_limit')::integer,($1->>'concurrent_limit')::integer,
    coalesce(b.usage_day,(now_at AT TIME ZONE 'UTC')::date),coalesce(b.run_count,0),coalesce(b.model_count,0),coalesce(b.tool_count,0),$1->>'fee_ack',now_at)
   ON CONFLICT(owner_user_id) DO UPDATE SET revision=excluded.revision,epoch=excluded.epoch,enabled=excluded.enabled,daily_run_limit=excluded.daily_run_limit,daily_model_limit=excluded.daily_model_limit,daily_tool_limit=excluded.daily_tool_limit,concurrent_limit=excluded.concurrent_limit,fee_ack=excluded.fee_ack,updated_at=excluded.updated_at RETURNING * INTO b;
  outcome:=jsonb_build_object('budget',to_jsonb(b)-'owner_user_id');g:=0;
 ELSE
  IF a<>'create' THEN
   SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=($1->>'credential_id')::uuid AND owner_user_id=o FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_not_found';END IF;
   IF k.revision<>($1->>'expected_revision')::bigint THEN RAISE EXCEPTION 'agent_caller_revision_changed';END IF;
  END IF;
  IF a IN('create','rotate') THEN
   IF b.owner_user_id IS NULL OR NOT b.enabled OR b.revision<>($1->>'budget_revision')::bigint THEN RAISE EXCEPTION 'agent_caller_budget_unavailable';END IF;
   IF a='create' THEN
    IF $2 IS NULL OR EXISTS(SELECT 1 FROM agentstudio.agent_caller_credentials WHERE id=$2) OR (SELECT count(*) FROM agentstudio.agent_caller_credentials WHERE owner_user_id=o)>=100 THEN RAISE EXCEPTION 'agent_caller_key_limit';END IF;k.id:=$2;k.generation:=0;k.revision:=0;
   ELSIF k.kind IS DISTINCT FROM $1->>'kind' OR $2 IS DISTINCT FROM k.id THEN RAISE EXCEPTION 'agent_caller_key_changed';END IF;
   g:=k.generation+1;
   IF $3 IS NULL OR $3 !~ ('^acs_'||($1->>'kind')||'_'||k.id::text||'_g'||g::text||'_[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'agent_caller_invalid_secret';END IF;
   v:=agentstudio.agent_caller_release(o,$1->'release');
   IF jsonb_typeof(v->'spec'->'model_binding') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text($1->'limits'->'allowed_tools') t WHERE NOT v->'spec'->'tools' ? t) THEN RAISE EXCEPTION 'agent_caller_invalid_tool_scope';END IF;
   INSERT INTO agentstudio.agent_caller_credentials(id,owner_user_id,kind,name,generation,revision,token_sha256,token_tail,owner_epoch,budget_epoch,spec_id,version_id,version_sha256,head_revision,origins,limits,theme,enabled,revoked,expires_at,created_at,updated_at)
    VALUES(k.id,o,$1->>'kind',$1->>'name',g,k.revision+1,agentstudio.agent_caller_token_hash($3),right($3,8),(n->>'epoch')::bigint,b.epoch,(v->>'spec_id')::uuid,(v->>'version_id')::uuid,v->>'version_sha256',(v->>'head_revision')::bigint,$1->'origins',$1->'limits',nullif($1->'theme','null'::jsonb),true,false,now_at+make_interval(days=>($1->>'expires_days')::integer),coalesce(k.created_at,now_at),now_at)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,generation=excluded.generation,revision=excluded.revision,token_sha256=excluded.token_sha256,token_tail=excluded.token_tail,owner_epoch=excluded.owner_epoch,budget_epoch=excluded.budget_epoch,spec_id=excluded.spec_id,version_id=excluded.version_id,version_sha256=excluded.version_sha256,head_revision=excluded.head_revision,origins=excluded.origins,limits=excluded.limits,theme=excluded.theme,enabled=true,revoked=false,expires_at=excluded.expires_at,updated_at=excluded.updated_at RETURNING * INTO k;
  ELSIF a='revoke' THEN
   IF k.revoked THEN RAISE EXCEPTION 'agent_caller_key_unavailable';END IF;
   UPDATE agentstudio.agent_caller_credentials SET revision=revision+1,enabled=false,revoked=true,updated_at=now_at WHERE id=k.id RETURNING * INTO k;g:=k.generation;
  ELSE
   IF k.kind<>'embed' OR k.revoked OR (NOT k.enabled AND ($1->>'enabled')::boolean) THEN RAISE EXCEPTION 'agent_caller_rotation_required';END IF;
   UPDATE agentstudio.agent_caller_credentials SET revision=revision+1,enabled=($1->>'enabled')::boolean,theme=$1->'theme',updated_at=now_at WHERE id=k.id RETURNING * INTO k;g:=k.generation;
  END IF;
  outcome:=jsonb_build_object('credential',agentstudio.agent_caller_metadata(k));
 END IF;
 receipt:=jsonb_build_object('protocol','agent_caller_owner_receipt_v1','request_id',q,'request_sha256',h,'action',a,'outcome',outcome,'provider_called',false,'secret_recoverable',false);
 INSERT INTO agentstudio.agent_caller_credential_events(owner_user_id,credential_id,generation,request_id,action,request_sha256,evidence) VALUES(o,CASE WHEN a='budget' THEN NULL ELSE k.id END,g,q,a,h,outcome);
 INSERT INTO agentstudio.agent_caller_receipts(scope,principal_id,generation,request_id,request_sha256,receipt) VALUES('owner',o,0,q,h,receipt);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(o,o,'agent.caller.'||a,'agent_caller',CASE WHEN a='budget' THEN o::text ELSE k.id::text END,'succeeded',jsonb_build_object('request_id',q,'request_sha256',h,'generation',g,'provider_called',false));
 RETURN jsonb_build_object('protocol','agent_caller_owner_reply_v1','receipt',receipt,'replayed',false);
END $fn$;
-- Runtime proof intentionally does not call the API-only login verifier: the
-- original leased Worker has its existing exact API+Worker parents. No RPC
-- grants are added to those parents, and every step separately proves a lease.
CREATE FUNCTION agentstudio.agent_caller_runtime_session() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r record;parents text[];
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'agent_caller_session_refused';END IF;
 SELECT * INTO r FROM pg_roles WHERE rolname=session_user;
 SELECT array_agg(p.rolname::text ORDER BY p.rolname) INTO parents FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option;
 IF r.oid IS NULL OR NOT r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
  OR parents IS NULL OR parents NOT IN(ARRAY['agentstudio_api']::text[],ARRAY['agentstudio_api','agentstudio_worker']::text[])
  OR (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)<>cardinality(parents)
  OR (SELECT count(*) FROM pg_roles WHERE rolname<>session_user AND pg_has_role(session_user,oid,'MEMBER'))<>cardinality(parents)
 THEN RAISE EXCEPTION 'agent_caller_session_refused';END IF;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_current(uuid,bigint,text,boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE k agentstudio.agent_caller_credentials;n jsonb;b record;v jsonb;
BEGIN
 SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=$1;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_authorization_required';END IF;
 n:=agentstudio.agent_internal_share_member(k.owner_user_id,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(k.owner_user_id::text||':caller-budget',682));
 SELECT * INTO b FROM agentstudio.agent_caller_budgets WHERE owner_user_id=k.owner_user_id FOR SHARE;
 SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=$1 FOR SHARE;
 IF k.generation IS DISTINCT FROM $2 OR NOT k.enabled OR k.revoked OR k.expires_at<=clock_timestamp() OR k.owner_epoch<>(n->>'epoch')::bigint
  OR b.owner_user_id IS NULL OR NOT b.enabled OR k.budget_epoch<>b.epoch OR ($4 AND NOT k.origins ? $3) THEN RAISE EXCEPTION 'agent_caller_authorization_required';END IF;
 v:=agentstudio.agent_caller_release(k.owner_user_id,jsonb_build_object('spec_id',k.spec_id,'version_id',k.version_id,'version_sha256',k.version_sha256,'head_revision',k.head_revision));
 RETURN jsonb_build_object('owner_user_id',k.owner_user_id,'generation',k.generation,'owner_epoch',k.owner_epoch,'budget_epoch',k.budget_epoch,'release',v,'limits',k.limits);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_auth(text,uuid,bigint,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE k record;v jsonb;
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');
 IF $5 NOT IN('public','owner_test') OR agentstudio.agent_caller_origin($4) IS NOT TRUE THEN RAISE EXCEPTION 'agent_caller_authorization_required';END IF;
 IF $5='public' AND agentstudio.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'agent_caller_public_actor_required';END IF;
 SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=$2;
 IF NOT FOUND OR ($5='owner_test' AND (agentstudio.actor_id() IS DISTINCT FROM k.owner_user_id OR $1 IS NOT NULL))
  OR ($5='public' AND ($1 IS NULL OR $1 !~ ('^acs_'||k.kind||'_'||k.id::text||'_g'||$3::text||'_[A-Za-z0-9_-]{43}$') OR k.token_sha256 IS DISTINCT FROM agentstudio.agent_caller_token_hash($1))) THEN RAISE EXCEPTION 'agent_caller_authorization_required';END IF;
 v:=agentstudio.agent_internal_share_member(k.owner_user_id,true);
 RETURN jsonb_build_object('owner_user_id',k.owner_user_id);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_verify_source(uuid,uuid,uuid,jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE s record;i record;c record;v jsonb;r record;marker jsonb;run_row record;
BEGIN
 PERFORM agentstudio.agent_caller_runtime_session();
 IF agentstudio.actor_id() IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 SELECT * INTO s FROM agentstudio.agent_caller_execution_sources WHERE source_id=$3;
 IF NOT FOUND THEN
  IF $4 IS NOT NULL AND $4<>'null'::jsonb OR EXISTS(SELECT 1 FROM agentstudio.agent_caller_invocations WHERE run_id=$1) THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;RETURN false;
 END IF;
 IF s.owner_user_id IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 v:=agentstudio.agent_caller_current(s.credential_id,s.generation,'',false);
 IF (v->>'budget_epoch')::bigint IS DISTINCT FROM s.budget_epoch OR (v->>'owner_epoch')::bigint IS DISTINCT FROM s.owner_epoch OR v->'release'->>'version_sha256' IS DISTINCT FROM s.version_sha256 THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 SELECT revision,spec,xmin::text AS row_xmin INTO r FROM agentstudio.agent_specs WHERE id=$3 AND owner_user_id=$2 FOR SHARE;
 IF NOT FOUND OR r.revision<>1 OR r.row_xmin<>s.copy_xmin OR agentstudio.release_source_sha($3) IS DISTINCT FROM s.copy_sha256 OR r.spec IS DISTINCT FROM v->'release'->'spec' THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 SELECT * INTO i FROM agentstudio.agent_caller_invocations WHERE id=s.invocation_id AND source_id=$3 AND owner_user_id=$2;
 IF NOT FOUND THEN
  SELECT * INTO c FROM agentstudio.agent_caller_contexts WHERE source_id=$3 AND owner_user_id=$2 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()::text;
  IF NOT FOUND OR c.principal_id<>s.credential_id OR c.generation<>s.generation OR $1 IS NOT NULL AND $1<>c.run_id OR $4 IS NOT NULL AND $4<>'null'::jsonb THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
  RETURN true;
 END IF;
 marker:=jsonb_build_object('protocol','agent_caller_binding_v1','invocation_id',i.id,'credential_id',i.credential_id,'generation',i.generation,'source_id',i.source_id);
 IF i.run_id IS DISTINCT FROM $1 OR $4 IS DISTINCT FROM marker OR i.credential_id<>s.credential_id OR i.generation<>s.generation THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 SELECT * INTO c FROM agentstudio.agent_caller_contexts WHERE invocation_id=i.id AND owner_user_id=$2;
 SELECT * INTO run_row FROM agentstudio.runs WHERE id=$1 AND owner_user_id=$2;
 IF c.invocation_id IS NULL OR run_row.id IS NULL OR run_row.agent_spec_id IS DISTINCT FROM $3 OR run_row.kind<>'agent' OR run_row.instruction IS DISTINCT FROM c.choice->>'input'
  OR run_row.checkpoint->'caller_binding' IS DISTINCT FROM marker OR run_row.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2' OR run_row.checkpoint#>>'{machine,graph_sha256}' IS DISTINCT FROM i.graph_sha256
  OR run_row.checkpoint ?| ARRAY['memory_context','node_debug'] THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_finish(uuid,bigint,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE c record;r record;s record;v jsonb;receipt jsonb;marker jsonb;
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');
 SELECT * INTO c FROM agentstudio.agent_caller_contexts WHERE principal_id=$1 AND generation=$2 AND request_id=$3 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()::text;
 IF NOT FOUND OR agentstudio.actor_id() IS DISTINCT FROM c.owner_user_id THEN RAISE EXCEPTION 'agent_caller_context_required';END IF;
 v:=agentstudio.agent_caller_current($1,$2,c.origin,c.mode='public');
 PERFORM agentstudio.agent_caller_verify_source(NULL,c.owner_user_id,c.source_id,NULL);
 SELECT * INTO s FROM agentstudio.agent_caller_execution_sources WHERE source_id=c.source_id;
 SELECT * INTO r FROM agentstudio.runs WHERE id=c.run_id AND owner_user_id=c.owner_user_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'agent' OR r.agent_spec_id IS DISTINCT FROM c.source_id OR r.workflow_id IS NOT NULL OR r.status<>'queued' OR r.instruction IS DISTINCT FROM c.choice->>'input'
  OR r.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2' OR r.checkpoint->'spec_revision' IS DISTINCT FROM '1'::jsonb OR r.checkpoint ? 'caller_binding'
  OR r.checkpoint#>'{graph,nodes,1,data,agent_binding}' IS DISTINCT FROM jsonb_build_object('spec_id',c.source_id,'spec_revision',1)
  OR r.checkpoint#>'{graph,nodes,1,data,max_steps}' IS DISTINCT FROM v->'limits'->'max_steps'
  OR r.checkpoint ?| ARRAY['memory_context','node_debug','agent_state','agent_dispatch','manual_pause'] OR EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE run_id=c.run_id)
  OR (SELECT count(*) FROM agentstudio.jobs WHERE run_id=c.run_id AND owner_user_id=c.owner_user_id AND kind='run_tick' AND status='queued' AND payload->>'phase'='agent_native_v2' AND payload->>'agent_spec_id'=c.source_id::text)<>1 THEN RAISE EXCEPTION 'agent_caller_admission_not_recorded';END IF;
 INSERT INTO agentstudio.agent_caller_invocations(id,owner_user_id,credential_id,generation,source_id,run_id,request_id,request_sha256,graph_sha256,session_id,mode,origin,version_id,version_sha256)
  VALUES(c.invocation_id,c.owner_user_id,$1,$2,c.source_id,c.run_id,$3,c.request_sha256,r.checkpoint#>>'{machine,graph_sha256}',(c.choice->>'session_id')::uuid,c.mode,c.origin,s.version_id,s.version_sha256);
 marker:=jsonb_build_object('protocol','agent_caller_binding_v1','invocation_id',c.invocation_id,'credential_id',$1,'generation',$2,'source_id',c.source_id);
 UPDATE agentstudio.runs SET checkpoint=jsonb_set(checkpoint,'{caller_binding}',marker),updated_at=clock_timestamp() WHERE id=c.run_id AND owner_user_id=c.owner_user_id;
 receipt:=jsonb_build_object('protocol','agent_caller_run_receipt_v1','invocation_id',c.invocation_id,'request_id',$3,'request_sha256',c.request_sha256,'credential_id',$1,'generation',$2,'version_id',s.version_id,'version_sha256',s.version_sha256,'admitted_ms',floor(extract(epoch FROM c.created_at)*1000)::bigint,'starts_worker',false,'provider_called',false);
 INSERT INTO agentstudio.agent_caller_receipts(scope,principal_id,generation,request_id,request_sha256,receipt) VALUES('run',$1,$2,$3,c.request_sha256,receipt);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES(c.owner_user_id,c.owner_user_id,c.run_id,'agent.caller.admit','agent_caller_invocation',c.invocation_id::text,'succeeded',jsonb_build_object('mode',c.mode,'credential_id',$1,'generation',$2,'request_id',$3,'request_sha256',c.request_sha256,'version_id',s.version_id,'version_sha256',s.version_sha256,'provider_called',false));
 PERFORM set_config('agentstudio.actor_id',c.restore_actor,true);
 IF coalesce(current_setting('agentstudio.actor_id',true),'')<>c.restore_actor THEN RAISE EXCEPTION 'agent_caller_context_required';END IF;
 RETURN jsonb_build_object('protocol','agent_caller_run_reply_v1','receipt',receipt,'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_confirm(text,uuid,bigint,text,text,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v jsonb;p record;h text;
BEGIN
 IF agentstudio.agent_caller_run_choice($6) IS NOT TRUE THEN RAISE EXCEPTION 'agent_caller_invalid_choice';END IF;
 v:=agentstudio.agent_caller_auth($1,$2,$3,$4,$5);v:=agentstudio.agent_caller_current($2,$3,$4,$5='public');
 h:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_caller_run_intent_v1','purpose','one_budgeted_published_agent_invocation','credential_id',$2,'generation',$3,'origin',$4,'mode',$5,'choice',$6));
 SELECT * INTO p FROM agentstudio.agent_caller_receipts WHERE scope='run' AND principal_id=$2 AND generation=$3 AND request_id=($6->>'request_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_not_found';END IF;
 IF p.request_sha256<>h THEN RAISE EXCEPTION 'agent_caller_request_conflict';END IF;
 RETURN jsonb_build_object('protocol','agent_caller_run_reply_v1','receipt',p.receipt,'replayed',true);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_reserve_step(uuid,uuid,uuid,bigint,text,text,text,text,text,boolean,text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE j record;r record;i record;k record;b agentstudio.agent_caller_budgets;p record;v jsonb;today date;models integer;tools integer;model_units integer;tool_units integer;
BEGIN
 PERFORM agentstudio.agent_caller_runtime_session();
 -- A private Broker/API login cannot mint a Worker reservation even with an
 -- employee actor. The unchanged original Worker must own the actual live job.
 IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'agent_caller_worker_lease_required';END IF;
 SELECT * INTO j FROM agentstudio.jobs WHERE id=$2 AND run_id=$1 AND status='leased' AND kind='run_tick' AND payload->>'phase'='agent_native_v2' AND lease_token=$3 AND lease_version=$4 AND lease_owner=$5 AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR agentstudio.actor_id() IS DISTINCT FROM j.owner_user_id THEN RAISE EXCEPTION 'agent_caller_worker_lease_required';END IF;
 SELECT * INTO r FROM agentstudio.runs WHERE id=$1 AND owner_user_id=j.owner_user_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'agent' OR r.status NOT IN('queued','running','awaiting_approval') OR agentstudio.agent_design_digest(r.checkpoint) IS DISTINCT FROM $11 THEN RAISE EXCEPTION 'agent_caller_step_changed';END IF;
 IF agentstudio.agent_caller_verify_source(r.id,r.owner_user_id,r.agent_spec_id,r.checkpoint->'caller_binding') IS NOT TRUE THEN RETURN false;END IF;
 SELECT * INTO i FROM agentstudio.agent_caller_invocations WHERE run_id=$1;
 SELECT * INTO b FROM agentstudio.agent_caller_budgets WHERE owner_user_id=i.owner_user_id FOR UPDATE;
 SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=i.credential_id;
 IF $6 !~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$' OR $7 !~ '^[a-f0-9]{64}$' OR $8 NOT IN('agent','model','tool') OR $9 IS NULL OR $10 IS NULL THEN RAISE EXCEPTION 'agent_caller_step_changed';END IF;
 SELECT * INTO p FROM agentstudio.agent_caller_step_reservations WHERE run_id=$1 AND step_key=$6;
 IF FOUND THEN IF p.invocation_id<>i.id OR p.input_sha256<>$7 OR p.kind<>$8 OR p.tool_name<>$9 OR p.knowledge_charge<>$10 THEN RAISE EXCEPTION 'agent_caller_step_changed';END IF;RETURN true;END IF;
 IF $8='tool' AND (NOT k.limits->'allowed_tools' ? $9 OR ($9='knowledge_search' AND (k.limits->'public_knowledge' IS DISTINCT FROM 'true'::jsonb OR $10 AND k.limits->>'knowledge_charge' IS DISTINCT FROM 'PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL')))
  OR $8<>'tool' AND ($9<>'' OR $10) THEN RAISE EXCEPTION 'agent_caller_tool_not_authorized';END IF;
 IF $8='model' AND $6 !~ ('^wf2_00002_agent_a(0[1-9]|10)m$') OR $8='tool' AND $6 !~ '^wf2_00002_agent_a(0[1-9]|10)t$' OR $8='agent' AND $6<>'wf2_00002_agent' THEN RAISE EXCEPTION 'agent_caller_step_changed';END IF;
 IF $8 IN('model','tool') AND substring($6 FROM '_a([0-9]{2})[mt]$')::integer>(k.limits->>'max_steps')::integer THEN RAISE EXCEPTION 'agent_caller_run_limit';END IF;
 model_units:=CASE WHEN $8='model' OR $8='tool' AND $9='summarize' THEN 1 ELSE 0 END;tool_units:=CASE WHEN $8='tool' THEN 1 ELSE 0 END;
 SELECT coalesce(sum(CASE WHEN kind='model' OR kind='tool' AND tool_name='summarize' THEN 1 ELSE 0 END),0),coalesce(sum(CASE WHEN kind='tool' THEN 1 ELSE 0 END),0) INTO models,tools FROM agentstudio.agent_caller_step_reservations WHERE invocation_id=i.id;
 IF models+model_units>(k.limits->>'max_model_calls')::integer OR tools+tool_units>(k.limits->>'max_tool_calls')::integer THEN RAISE EXCEPTION 'agent_caller_run_limit';END IF;
 today:=(clock_timestamp() AT TIME ZONE 'UTC')::date;IF b.usage_day<>today THEN b.usage_day:=today;b.run_count:=0;b.model_count:=0;b.tool_count:=0;END IF;
 IF b.model_count+model_units>b.daily_model_limit OR b.tool_count+tool_units>b.daily_tool_limit THEN RAISE EXCEPTION 'agent_caller_owner_limit';END IF;
 UPDATE agentstudio.agent_caller_budgets SET usage_day=today,run_count=b.run_count,model_count=b.model_count+model_units,tool_count=b.tool_count+tool_units WHERE owner_user_id=i.owner_user_id;
 INSERT INTO agentstudio.agent_caller_step_reservations(invocation_id,owner_user_id,run_id,step_key,input_sha256,kind,tool_name,knowledge_charge,job_id,lease_version) VALUES(i.id,i.owner_user_id,$1,$6,$7,$8,$9,$10,$2,$4);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES(i.owner_user_id,i.owner_user_id,$1,'agent.caller.step_reserved','agent_caller_invocation',i.id::text,'succeeded',jsonb_build_object('step_key',$6,'input_sha256',$7,'kind',$8,'tool_name',$9,'knowledge_charge',$10,'model_units',model_units,'tool_units',tool_units,'credential_id',i.credential_id,'generation',i.generation));
 RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_verify_dispatch(uuid,text,text,text,text,boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r record;p record;
BEGIN
 PERFORM agentstudio.agent_caller_runtime_session();SELECT * INTO r FROM agentstudio.runs WHERE id=$1 AND owner_user_id=agentstudio.actor_id();
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_source_unavailable';END IF;
 IF agentstudio.agent_caller_verify_source(r.id,r.owner_user_id,r.agent_spec_id,r.checkpoint->'caller_binding') IS NOT TRUE THEN RETURN false;END IF;
 SELECT * INTO p FROM agentstudio.agent_caller_step_reservations WHERE run_id=$1 AND step_key=$2;
 IF NOT FOUND OR p.owner_user_id<>r.owner_user_id OR p.input_sha256 IS DISTINCT FROM $3 OR p.kind IS DISTINCT FROM $4 OR p.tool_name IS DISTINCT FROM $5 OR p.knowledge_charge IS DISTINCT FROM $6 THEN RAISE EXCEPTION 'agent_caller_step_changed';END IF;
 RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_poll(text,uuid,bigint,text,text,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v jsonb;i record;r record;s text;
BEGIN
 v:=agentstudio.agent_caller_auth($1,$2,$3,$4,$5);v:=agentstudio.agent_caller_current($2,$3,$4,$5='public');
 SELECT * INTO i FROM agentstudio.agent_caller_invocations WHERE id=$6 AND credential_id=$2 AND generation=$3 AND mode=$5 AND origin=$4;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_not_found';END IF;
 -- Temporary server-verified actor is restored before returning. No DML,
 -- tick, claim or effect starts here; the original runtime remains separate.
 PERFORM set_config('agentstudio.actor_id',i.owner_user_id::text,true);
 SELECT * INTO r FROM agentstudio.runs WHERE id=i.run_id AND owner_user_id=i.owner_user_id;
 PERFORM agentstudio.agent_caller_verify_source(r.id,i.owner_user_id,r.agent_spec_id,r.checkpoint->'caller_binding');
 s:=CASE WHEN r.status='succeeded' THEN 'succeeded' WHEN r.status IN('failed','cancelled','queued','running') THEN r.status ELSE 'awaiting_owner' END;
 IF EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=i.run_id AND e.owner_user_id=i.owner_user_id AND (e.status='unknown' OR e.status='started' AND NOT EXISTS(SELECT 1 FROM agentstudio.jobs j WHERE j.run_id=i.run_id AND j.status='leased' AND j.lease_until>clock_timestamp()))) THEN s:='unknown';END IF;
 PERFORM set_config('agentstudio.actor_id',CASE WHEN $5='public' THEN '' ELSE i.owner_user_id::text END,true);
 RETURN jsonb_build_object('owner_user_id',i.owner_user_id,'run_id',i.run_id,'projection',jsonb_build_object('protocol','agent_caller_public_status_v1','invocation_id',i.id,'request_id',i.request_id,'status',s,'result',CASE WHEN s='succeeded' THEN left(coalesce(r.result_text,''),12000) ELSE '' END,'error_code',CASE WHEN s='unknown' THEN 'agent_caller_outcome_unknown' WHEN s='failed' THEN 'agent_caller_execution_failed' ELSE '' END,'created_ms',floor(extract(epoch FROM i.created_at)*1000)::bigint,'updated_ms',greatest(floor(extract(epoch FROM i.created_at)*1000)::bigint,floor(extract(epoch FROM r.updated_at)*1000)::bigint),'can_replay',false));
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_history() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE n jsonb;o uuid;items jsonb;stats jsonb;
BEGIN
 n:=agentstudio.agent_internal_share_context(false);o:=(n->>'owner_user_id')::uuid;
 SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC,x.id),'[]'::jsonb) INTO items FROM(
  SELECT i.id,i.created_at,jsonb_build_object('id',i.id,'run_id',i.run_id,'credential_id',i.credential_id,'generation',i.generation,'request_id',i.request_id,'session_id',i.session_id,'mode',i.mode,'origin',i.origin,'version_id',i.version_id,'version_sha256',i.version_sha256,'created_ms',floor(extract(epoch FROM i.created_at)*1000)::bigint,'updated_ms',floor(extract(epoch FROM r.updated_at)*1000)::bigint,'status',r.status,'input',r.instruction,'result',CASE WHEN r.status='succeeded' THEN left(r.result_text,12000) ELSE '' END,'unresolved',EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=i.run_id AND e.owner_user_id=o AND e.status IN('started','unknown'))) AS item
  FROM agentstudio.agent_caller_invocations i JOIN agentstudio.runs r ON r.id=i.run_id AND r.owner_user_id=o WHERE i.owner_user_id=o ORDER BY i.created_at DESC,i.id LIMIT 100
 )x;
 SELECT jsonb_build_object('total',count(*),'succeeded',count(*) FILTER(WHERE r.status='succeeded'),'failed',count(*) FILTER(WHERE r.status IN('failed','cancelled')),'active',count(*) FILTER(WHERE r.status IN('queued','running','awaiting_approval','awaiting_input','paused')),'unknown',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=i.run_id AND e.owner_user_id=o AND e.status='unknown')),'retained',true) INTO stats
  FROM agentstudio.agent_caller_invocations i JOIN agentstudio.runs r ON r.id=i.run_id AND r.owner_user_id=o WHERE i.owner_user_id=o;
 RETURN jsonb_build_object('protocol','agent_caller_owner_history_v1','items',items,'stats',stats);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_embed(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE k record;v jsonb;
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');IF agentstudio.actor_id() IS NOT NULL THEN RAISE EXCEPTION 'agent_caller_public_actor_required';END IF;
 SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=$1 AND kind='embed';IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_not_found';END IF;
 v:=agentstudio.agent_caller_current(k.id,k.generation,'',false);
 RETURN jsonb_build_object('protocol','agent_caller_embed_renderer_v1','id',k.id,'generation',k.generation,'theme',k.theme,'origins',k.origins,'agent_name',v->'release'->>'name','authority',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_preflight(text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');
 IF agentstudio.actor_id() IS NOT NULL OR agentstudio.agent_caller_origin($1) IS NOT TRUE THEN RETURN false;END IF;
 -- A preflight never grants credential authority and never discloses an Owner
 -- or key. The actual request authenticates its current generation afresh.
 RETURN EXISTS(SELECT 1 FROM agentstudio.agent_caller_credentials k JOIN agentstudio.agent_caller_budgets b ON b.owner_user_id=k.owner_user_id JOIN agentstudio_auth.accounts a ON a.user_id=k.owner_user_id JOIN agentstudio.users u ON u.id=k.owner_user_id
  WHERE k.enabled AND NOT k.revoked AND k.expires_at>clock_timestamp() AND k.origins ? $1 AND b.enabled AND b.epoch=k.budget_epoch AND a.enabled AND a.share_enabled AND a.governance_revision=k.owner_epoch AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1');
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_owner_test_scope(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE n jsonb;i record;
BEGIN
 n:=agentstudio.agent_internal_share_context(false);
 SELECT * INTO i FROM agentstudio.agent_caller_invocations WHERE id=$1 AND owner_user_id=(n->>'owner_user_id')::uuid AND mode='owner_test';
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_caller_not_found';END IF;
 RETURN jsonb_build_object('credential_id',i.credential_id,'generation',i.generation,'origin',i.origin);
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_internal_sources() RETURNS uuid[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE n jsonb;ids uuid[];
BEGIN
 n:=agentstudio.agent_internal_share_context(false);
 SELECT coalesce(array_agg(source_id),'{}'::uuid[]) INTO ids FROM agentstudio.agent_caller_execution_sources WHERE owner_user_id=(n->>'owner_user_id')::uuid;
 RETURN ids;
END $fn$;
CREATE FUNCTION agentstudio.agent_caller_begin(text,uuid,bigint,text,text,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE v jsonb;o uuid;h text;p record;b agentstudio.agent_caller_budgets;k record;source uuid:=gen_random_uuid();invocation uuid:=gen_random_uuid();run uuid:=gen_random_uuid();now_at timestamptz;today date;active_count integer;restore text;
BEGIN
 IF agentstudio.agent_caller_run_choice($6) IS NOT TRUE THEN RAISE EXCEPTION 'agent_caller_invalid_choice';END IF;
 v:=agentstudio.agent_caller_auth($1,$2,$3,$4,$5);o:=(v->>'owner_user_id')::uuid;restore:=coalesce(current_setting('agentstudio.actor_id',true),'');
 h:=agentstudio.agent_design_digest(jsonb_build_object('protocol','agent_caller_run_intent_v1','purpose','one_budgeted_published_agent_invocation','credential_id',$2,'generation',$3,'origin',$4,'mode',$5,'choice',$6));
 PERFORM pg_advisory_xact_lock(hashtextextended($2::text||':caller-request:'||$3::text||':'||($6->>'request_id'),683));
 SELECT * INTO p FROM agentstudio.agent_caller_receipts WHERE scope='run' AND principal_id=$2 AND generation=$3 AND request_id=($6->>'request_id')::uuid;
 IF FOUND THEN IF p.request_sha256<>h THEN RAISE EXCEPTION 'agent_caller_request_conflict';END IF;RETURN jsonb_build_object('recorded',true,'receipt',p.receipt);END IF;
 -- Serialize all keys and generations for this Owner. Other runs are read
 -- without row locks so admission cannot invert the Worker's run -> budget lock.
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||':caller-budget',682));
 SELECT * INTO b FROM agentstudio.agent_caller_budgets WHERE owner_user_id=o FOR UPDATE;
 v:=agentstudio.agent_caller_current($2,$3,$4,$5='public');SELECT * INTO k FROM agentstudio.agent_caller_credentials WHERE id=$2;
 now_at:=clock_timestamp();today:=(now_at AT TIME ZONE 'UTC')::date;
 IF b.usage_day<>today THEN b.usage_day:=today;b.run_count:=0;b.model_count:=0;b.tool_count:=0;END IF;
 SELECT count(*) INTO active_count FROM agentstudio.agent_caller_invocations i JOIN agentstudio.runs r ON r.id=i.run_id AND r.owner_user_id=i.owner_user_id WHERE i.owner_user_id=o AND r.status IN('queued','running','awaiting_approval','awaiting_input','paused');
 IF b.run_count>=b.daily_run_limit OR active_count>=b.concurrent_limit OR EXISTS(SELECT 1 FROM agentstudio.agent_caller_invocations i JOIN agentstudio.external_effects e ON e.run_id=i.run_id AND e.owner_user_id=i.owner_user_id WHERE i.owner_user_id=o AND e.status IN('started','unknown')) THEN RAISE EXCEPTION 'agent_caller_owner_limit';END IF;
 IF (SELECT count(*) FROM agentstudio.agent_caller_invocations WHERE credential_id=$2 AND created_at>=now_at-interval '1 minute')>=(k.limits->>'per_minute')::integer
  OR (SELECT count(*) FROM agentstudio.agent_caller_invocations WHERE credential_id=$2 AND created_at>=(today::timestamp AT TIME ZONE 'UTC'))>=(k.limits->>'per_day')::integer
  OR EXISTS(SELECT 1 FROM agentstudio.agent_caller_invocations i JOIN agentstudio.runs r ON r.id=i.run_id WHERE i.credential_id=$2 AND i.session_id=($6->>'session_id')::uuid AND r.status IN('queued','running','awaiting_approval','awaiting_input','paused')) THEN RAISE EXCEPTION 'agent_caller_key_limit';END IF;
 UPDATE agentstudio.agent_caller_budgets SET usage_day=today,run_count=b.run_count+1,model_count=b.model_count,tool_count=b.tool_count WHERE owner_user_id=o;
 -- The published snapshot, never the current draft, becomes the original
 -- runtime's internal Agent source. Its actual row SHA/xmin are sealed below.
 INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec,revision,requires_approval) VALUES(source,o,v->'release'->>'name',v->'release'->'spec',1,true);
 INSERT INTO agentstudio.agent_caller_execution_sources(source_id,invocation_id,owner_user_id,credential_id,generation,budget_epoch,owner_epoch,version_id,version_sha256,head_revision,copy_sha256,copy_xmin)
  SELECT source,invocation,o,$2,$3,k.budget_epoch,k.owner_epoch,k.version_id,k.version_sha256,k.head_revision,agentstudio.release_source_sha(source),xmin::text FROM agentstudio.agent_specs WHERE id=source;
 INSERT INTO agentstudio.agent_caller_contexts(principal_id,generation,request_id,request_sha256,owner_user_id,source_id,invocation_id,run_id,choice,origin,mode,restore_actor,backend_pid,transaction_id)
  VALUES($2,$3,($6->>'request_id')::uuid,h,o,source,invocation,run,$6,$4,$5,restore,pg_backend_pid(),pg_current_xact_id()::text);
 PERFORM set_config('agentstudio.actor_id',o::text,true);
 RETURN jsonb_build_object('recorded',false,'owner_user_id',o,'source_id',source,'invocation_id',invocation,'run_id',run,'max_steps',k.limits->'max_steps','version_id',k.version_id,'version_sha256',k.version_sha256);
END $fn$;
DO $acl$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'agent_caller_') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch',f);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_caller_owner_rows(),agentstudio.agent_caller_owner_receipt(uuid),agentstudio.agent_caller_owner_change(jsonb,uuid,text),agentstudio.agent_caller_begin(text,uuid,bigint,text,text,jsonb),agentstudio.agent_caller_finish(uuid,bigint,uuid),agentstudio.agent_caller_confirm(text,uuid,bigint,text,text,jsonb),agentstudio.agent_caller_poll(text,uuid,bigint,text,text,uuid),agentstudio.agent_caller_owner_history(),agentstudio.agent_caller_embed(uuid),agentstudio.agent_caller_preflight(text),agentstudio.agent_caller_owner_test_scope(uuid),agentstudio.agent_caller_internal_sources(),agentstudio.agent_caller_verify_source(uuid,uuid,uuid,jsonb),agentstudio.agent_caller_reserve_step(uuid,uuid,uuid,bigint,text,text,text,text,text,boolean,text),agentstudio.agent_caller_verify_dispatch(uuid,text,text,text,text,boolean) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_068','Optional independent published-Agent API/embed callers: hashed once-displayed generation credentials, exact Origin, Owner budget/fees, immutable published execution source, original leased Worker/Broker and read-only public polling; no production activation');
COMMIT;
