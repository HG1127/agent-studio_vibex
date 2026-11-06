-- Optional isolated F27: one current Agent operation, explicitly delegated by
-- its verified Native Owner to one other currently active Native administrator.
-- No login roles, general manager Run access, credentials, Worker or provider.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole AND rolsuper) OR current_user<>session_user OR pg_is_in_recovery()
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
  OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_065') OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_066')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE starts_with(proname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,'agent_approval_delegation_') OR starts_with(typname,'_agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE starts_with(conname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE starts_with(tgname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE starts_with(nspname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE starts_with(collname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE starts_with(conname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE starts_with(opcname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE starts_with(opfname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server WHERE starts_with(srvname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper WHERE starts_with(fdwname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_statistic_ext WHERE starts_with(stxname,'agent_approval_delegation_'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
 THEN RAISE EXCEPTION 'approval_delegation_installation_refused';END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_approval_delegation_grants(
 run_id uuid NOT NULL PRIMARY KEY,owner_user_id uuid NOT NULL,reviewer_user_id uuid NOT NULL CHECK(owner_user_id<>reviewer_user_id),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740989),owner_epoch bigint NOT NULL CHECK(owner_epoch BETWEEN 1 AND 9007199254740989),reviewer_epoch bigint NOT NULL CHECK(reviewer_epoch BETWEEN 1 AND 9007199254740989),
 step_key text NOT NULL CHECK(step_key ~ '^(model|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$'),input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),run_source_sha256 text NOT NULL CHECK(run_source_sha256 ~ '^[a-f0-9]{64}$'),
 mode text NOT NULL CHECK(mode IN('model','agent_native_v2')),metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),review_note text NOT NULL CHECK(agentstudio.collaboration_utf16_length(review_note) BETWEEN 8 AND 500),knowledge_charge boolean NOT NULL,
 status text NOT NULL CHECK(status IN('active','revoked','approved','rejected')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX agent_approval_delegation_grants_reviewer ON agentstudio.agent_approval_delegation_grants(reviewer_user_id,expires_at,run_id);
CREATE TABLE agentstudio.agent_approval_delegation_events(
 run_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740989),owner_user_id uuid NOT NULL,reviewer_user_id uuid NOT NULL,actor_user_id uuid NOT NULL,
 request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),action text NOT NULL CHECK(action IN('grant','revoke','review')),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(run_id,revision)
);
CREATE TABLE agentstudio.agent_approval_delegation_receipts(
 actor_user_id uuid NOT NULL,request_id uuid NOT NULL,run_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),action text NOT NULL CHECK(action IN('grant','revoke','review')),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_user_id,request_id),UNIQUE(actor_user_id,request_id,run_id,request_sha256)
);
CREATE TABLE agentstudio.agent_approval_delegation_contexts(
 actor_user_id uuid NOT NULL,request_id uuid NOT NULL,run_id uuid NOT NULL,owner_user_id uuid NOT NULL CHECK(owner_user_id<>actor_user_id),request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 grant_revision bigint NOT NULL CHECK(grant_revision BETWEEN 1 AND 9007199254740988),owner_epoch bigint NOT NULL,reviewer_epoch bigint NOT NULL,step_key text NOT NULL,input_sha256 text NOT NULL,run_source_sha256 text NOT NULL,
 choice jsonb NOT NULL CHECK(jsonb_typeof(choice)='object' AND choice->>'action'='review' AND octet_length(choice::text)<=8192),backend_pid integer NOT NULL CHECK(backend_pid>0),transaction_id text NOT NULL CHECK(transaction_id ~ '^[1-9][0-9]{0,19}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_user_id,request_id),UNIQUE(backend_pid,transaction_id),
 FOREIGN KEY(actor_user_id,request_id,run_id,request_sha256) REFERENCES agentstudio.agent_approval_delegation_receipts(actor_user_id,request_id,run_id,request_sha256) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
DO $private$ DECLARE v_name text;BEGIN
 FOREACH v_name IN ARRAY ARRAY['grants','events','receipts','contexts'] LOOP
  EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY','agent_approval_delegation_'||v_name);
  EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY','agent_approval_delegation_'||v_name);
  EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch','agent_approval_delegation_'||v_name);
 END LOOP;
END $private$;
CREATE FUNCTION agentstudio.agent_approval_delegation_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'approval_delegation_immutable_evidence';END $fn$;
DO $immutable$ DECLARE v_name text;BEGIN
 FOREACH v_name IN ARRAY ARRAY['events','receipts','contexts'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON agentstudio.%I FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_approval_delegation_immutable()','agent_approval_delegation_'||v_name||'_immutable','agent_approval_delegation_'||v_name);
 END LOOP;
END $immutable$;
CREATE FUNCTION agentstudio.agent_approval_delegation_monotone() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF TG_OP='UPDATE' AND NEW.run_id=OLD.run_id AND NEW.owner_user_id=OLD.owner_user_id AND NEW.created_at=OLD.created_at AND NEW.revision=OLD.revision+1 AND NEW.updated_at>=OLD.updated_at THEN
  IF NEW.status='active' THEN RETURN NEW;END IF;
  IF OLD.status='active' AND NEW.status IN('revoked','approved','rejected') AND (to_jsonb(NEW)-ARRAY['revision','status','updated_at'])=(to_jsonb(OLD)-ARRAY['revision','status','updated_at']) THEN RETURN NEW;END IF;
 END IF;
 RAISE EXCEPTION 'approval_delegation_revision_transition_required';
END $fn$;
CREATE TRIGGER agent_approval_delegation_grants_monotone BEFORE UPDATE OR DELETE ON agentstudio.agent_approval_delegation_grants FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_approval_delegation_monotone();
CREATE FUNCTION agentstudio.agent_approval_delegation_member(uuid,boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_native jsonb;v_admin boolean;v_name text;
BEGIN
 IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'approval_delegation_native_required';END IF;
 v_native:=agentstudio.agent_design_native($1);
 SELECT a.is_admin INTO v_admin FROM agentstudio_auth.accounts a WHERE a.user_id=$1 FOR SHARE;
 IF NOT FOUND OR ($2 AND v_admin IS DISTINCT FROM true) THEN RAISE EXCEPTION 'approval_delegation_admin_required';END IF;
 SELECT u.display_name INTO v_name FROM agentstudio.users u WHERE u.id=$1 FOR SHARE;
 RETURN (v_native-'identity')||jsonb_build_object('is_admin',v_admin,'display_name',coalesce(nullif(v_name,''),'员工'));
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_context(boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');
 RETURN agentstudio.agent_approval_delegation_member(agentstudio.actor_id(),$1);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_ms(timestamp with time zone) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT floor(extract(epoch FROM $1)*1000)::bigint
$fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_choice(jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_action text;v_fee text;
BEGIN
 IF jsonb_typeof($1) IS DISTINCT FROM 'object' OR agentstudio.agent_design_uuid($1->'request_id') IS NOT TRUE OR agentstudio.agent_design_uuid($1->'run_id') IS NOT TRUE
  OR jsonb_typeof($1->'expected_grant_revision') IS DISTINCT FROM 'number' OR $1->>'expected_grant_revision' !~ '^[0-9]{1,16}$' THEN RETURN false;END IF;
 v_action:=$1->>'action';
 IF ($1->>'expected_grant_revision')::numeric NOT BETWEEN (CASE WHEN v_action='grant' THEN 0 ELSE 1 END) AND 9007199254740988 THEN RETURN false;END IF;
 IF v_action='revoke' THEN RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','run_id','expected_grant_revision']) IS TRUE;END IF;
 IF $1->'confirm' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof($1->'step_key') IS DISTINCT FROM 'string' OR $1->>'step_key' !~ '^(model|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$'
  OR agentstudio.agent_plan_workflow_sha($1->'input_sha256') IS NOT TRUE OR agentstudio.agent_plan_workflow_sha($1->'run_source_sha256') IS NOT TRUE
  OR NOT($1->'knowledge_query_charge'='null'::jsonb OR $1->'knowledge_query_charge'='"PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL"'::jsonb) THEN RETURN false;END IF;
 IF v_action='review' THEN
  RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','run_id','expected_grant_revision','step_key','input_sha256','run_source_sha256','decision','knowledge_query_charge','confirm']) IS TRUE
   AND $1->>'decision' IN('approved','rejected') AND ($1->>'decision'<>'rejected' OR $1->'knowledge_query_charge'='null'::jsonb);
 ELSIF v_action='grant' THEN
  RETURN agentstudio.agent_template_market_keys($1,ARRAY['action','request_id','run_id','expected_grant_revision','step_key','input_sha256','run_source_sha256','reviewer_id','review_note','expires_hours','knowledge_query_charge','confirm']) IS TRUE
   AND agentstudio.agent_design_uuid($1->'reviewer_id') IS TRUE AND agentstudio.agent_template_market_text($1->'review_note',500,true) IS TRUE AND agentstudio.collaboration_utf16_length($1->>'review_note')>=8
   AND jsonb_typeof($1->'expires_hours')='number' AND $1->>'expires_hours' ~ '^[0-9]{1,2}$' AND ($1->>'expires_hours')::integer BETWEEN 1 AND 72;
 END IF;
 RETURN false;
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_source_private(uuid,uuid,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' SET bytea_output='hex' AS $fn$
DECLARE v_run record;v_initial record;v_job record;v_job_json jsonb;v_jobs integer:=0;v_approval record;v_spec jsonb;v_mode text;v_input text;v_source jsonb;v_memory_ids uuid[];v_contexts jsonb;v_memories jsonb;v_receipts jsonb;v_human jsonb;
BEGIN
 IF $1 IS NULL OR $2 IS NULL OR $3 IS NULL OR $3 !~ '^(model|wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100})$' OR ($3<>'model' AND ($4 IS NULL OR $4 !~ '^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'approval_delegation_pending_changed';END IF;
 PERFORM agentstudio.agent_approval_delegation_member($1,false);
 SELECT r.kind,r.checkpoint->>'execution_mode' AS mode INTO v_initial FROM agentstudio.runs r WHERE r.id=$2 AND r.owner_user_id=$1;
 IF NOT FOUND OR v_initial.kind<>'agent' OR (v_initial.mode IS NOT NULL AND v_initial.mode<>'agent_native_v2') THEN RAISE EXCEPTION 'approval_delegation_run_not_found';END IF;
 v_mode:=CASE WHEN v_initial.mode='agent_native_v2' THEN 'agent_native_v2' ELSE 'model' END;
 -- Same jobs -> run -> approval order as the original autonomous Owner
 -- transaction. Model prepare jobs are already complete; no new job is made.
 FOR v_job IN SELECT to_jsonb(j)||jsonb_build_object('_row_xmin',j.xmin::text) AS value FROM agentstudio.jobs j
  WHERE j.run_id=$2 AND j.owner_user_id=$1 AND j.kind='run_tick' AND j.payload->>'phase'=CASE WHEN v_mode='model' THEN 'prepare' ELSE 'agent_native_v2' END ORDER BY j.id FOR UPDATE OF j LOOP
  v_jobs:=v_jobs+1;v_job_json:=v_job.value;
 END LOOP;
 IF v_jobs<>1 THEN RAISE EXCEPTION 'approval_delegation_pending_changed';END IF;
 SELECT r.*,r.xmin::text AS _row_xmin INTO v_run FROM agentstudio.runs r WHERE r.id=$2 AND r.owner_user_id=$1 AND r.kind='agent' FOR UPDATE;
 IF NOT FOUND OR v_run.status<>'awaiting_approval' OR v_run.workflow_id IS NOT NULL OR v_run.agent_spec_id IS NULL
  OR (v_mode='model' AND ($3<>'model' OR v_run.checkpoint->>'stage' IS DISTINCT FROM 'awaiting_model_approval' OR v_run.checkpoint->>'execution_mode' IS NOT NULL))
  OR (v_mode='agent_native_v2' AND ($3='model' OR v_run.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2')) THEN RAISE EXCEPTION 'approval_delegation_pending_changed';END IF;
 SELECT a.*,a.xmin::text AS _row_xmin INTO v_approval FROM agentstudio.approvals a WHERE a.run_id=$2 AND a.owner_user_id=$1 AND a.requested_by=$1 AND a.step_key=$3 FOR UPDATE;
 IF NOT FOUND OR v_approval.status<>'pending' OR v_approval.decided_by IS NOT NULL OR v_approval.decided_at IS NOT NULL OR (v_mode='agent_native_v2' AND v_approval.reason_code IS DISTINCT FROM 'wf2:'||$4)
  OR EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=$2 AND e.owner_user_id=$1 AND e.status IN('started','unknown')) THEN RAISE EXCEPTION 'approval_delegation_pending_changed';END IF;
 -- Reuse the actual063 full row/xmin/resource fingerprint and its established
 -- Agent -> model -> HTTP/MCP -> KB lock order before Node owner validation.
 v_spec:=agentstudio.agent_template_market_private_source($1,v_run.agent_spec_id);
 IF v_spec->'source'->>'revision' IS DISTINCT FROM v_run.checkpoint->>'spec_revision' THEN RAISE EXCEPTION 'approval_delegation_source_changed';END IF;
 v_input:=CASE WHEN v_mode='model' THEN agentstudio.agent_design_digest(jsonb_build_object('protocol','native_approval_delegation_model_input_v1','instruction',v_run.instruction,'checkpoint',v_run.checkpoint,'spec_source',v_spec->'source')) ELSE $4 END;
 IF $4 IS NOT NULL AND $4 IS DISTINCT FROM v_input THEN RAISE EXCEPTION 'approval_delegation_pending_changed';END IF;
 SELECT coalesce(array_agg(DISTINCT x.id),'{}'::uuid[]) INTO v_memory_ids FROM(
  SELECT CASE WHEN agentstudio.agent_design_uuid(m.value->'id') IS TRUE THEN (m.value->>'id')::uuid END AS id FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_run.checkpoint#>'{memory_context,memories}')='array' THEN v_run.checkpoint#>'{memory_context,memories}' ELSE '[]'::jsonb END) m
  UNION ALL SELECT CASE WHEN agentstudio.agent_design_uuid(v_run.checkpoint#>'{memory_context,remembered,id}') IS TRUE THEN (v_run.checkpoint#>>'{memory_context,remembered,id}')::uuid END
 ) x WHERE x.id IS NOT NULL;
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO v_contexts FROM(SELECT to_jsonb(c)||jsonb_build_object('_row_xmin',c.xmin::text) AS value FROM agentstudio.agent_memory_run_contexts c WHERE c.owner_user_id=$1 AND c.run_id=$2 ORDER BY c.run_id FOR SHARE OF c) x;
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO v_memories FROM(SELECT to_jsonb(e)||jsonb_build_object('_row_xmin',e.xmin::text) AS value FROM agentstudio.agent_memory_entries e WHERE e.owner_user_id=$1 AND e.id=ANY(v_memory_ids) ORDER BY e.id FOR SHARE OF e) x;
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO v_receipts FROM(SELECT to_jsonb(c)||jsonb_build_object('_row_xmin',c.xmin::text) AS value FROM agentstudio.agent_memory_receipts c WHERE c.owner_user_id=$1 AND c.memory_id=ANY(v_memory_ids) ORDER BY c.request_id FOR SHARE OF c) x;
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO v_human FROM(SELECT to_jsonb(h)||jsonb_build_object('_row_xmin',h.xmin::text) AS value FROM agentstudio.agent_human_input_responses h WHERE h.owner_user_id=$1 AND h.run_id=$2 ORDER BY h.step_key FOR SHARE OF h) x;
 v_source:=jsonb_build_object('protocol','native_approval_delegation_source_v1','run',to_jsonb(v_run),'job',v_job_json,'approval',to_jsonb(v_approval),'spec_source',v_spec->'source','memory_context_receipts',v_contexts,'memory_rows',v_memories,'memory_receipts',v_receipts,'human_responses',v_human,'step_key',$3,'input_sha256',v_input);
 RETURN jsonb_build_object('run_id',$2,'owner_user_id',$1,'mode',v_mode,'title',v_spec->'name','input_sha256',v_input,'run_source_sha256',agentstudio.agent_design_digest(v_source));
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_source(uuid,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_owner jsonb;
BEGIN
 v_owner:=agentstudio.agent_approval_delegation_context(false);
 RETURN agentstudio.agent_approval_delegation_source_private((v_owner->>'owner_user_id')::uuid,$1,$2,$3)-'owner_user_id';
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_metadata(jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_preview jsonb;v_name jsonb;v_count numeric;
BEGIN
 IF agentstudio.agent_template_market_keys($1,ARRAY['title','mode','tool_kind','tool_name','input_preview','knowledge_charge_required']) IS NOT TRUE
  OR agentstudio.agent_template_market_text($1->'title',120,true) IS NOT TRUE OR ($1->>'mode' IN('model','agent_native_v2')) IS NOT TRUE OR ($1->>'tool_kind' IN('model','tool','agent')) IS NOT TRUE
  OR ($1->>'tool_name' IN('model','agent','calculate','summarize','knowledge_search','web_search','web_fetch','http_tool','mcp_tool')) IS NOT TRUE OR jsonb_typeof($1->'knowledge_charge_required') IS DISTINCT FROM 'boolean'
  OR ($1->>'mode'='model' AND ($1->>'tool_kind'<>'model' OR $1->>'tool_name'<>'model' OR $1->'knowledge_charge_required'<>'false'::jsonb)) THEN RETURN false;END IF;
 v_preview:=$1->'input_preview';
 IF agentstudio.agent_template_market_keys(v_preview,ARRAY['values_hidden','field_count','field_names','fields_truncated','method','target_hostname']) IS NOT TRUE OR v_preview->'values_hidden' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(v_preview->'field_count') IS DISTINCT FROM 'number' OR v_preview->>'field_count' !~ '^[0-9]{1,16}$' OR jsonb_typeof(v_preview->'field_names') IS DISTINCT FROM 'array' OR jsonb_typeof(v_preview->'fields_truncated') IS DISTINCT FROM 'boolean'
  OR NOT(v_preview->'method'='null'::jsonb OR (jsonb_typeof(v_preview->'method')='string' AND v_preview->>'method' IN('GET','POST','PUT','PATCH','DELETE')))
  OR NOT(v_preview->'target_hostname'='null'::jsonb OR (jsonb_typeof(v_preview->'target_hostname')='string' AND v_preview->>'target_hostname' ~ '^[a-z0-9.-]{2,160}$')) THEN RETURN false;END IF;
 v_count:=(v_preview->>'field_count')::numeric;
 IF v_count>9007199254740991 OR jsonb_array_length(v_preview->'field_names')<>least(v_count,24) OR v_preview->'fields_truncated' IS DISTINCT FROM to_jsonb(v_count>24) THEN RETURN false;END IF;
 FOR v_name IN SELECT value FROM jsonb_array_elements(v_preview->'field_names') LOOP
  IF agentstudio.agent_template_market_text(v_name,60,false) IS NOT TRUE OR NOT(v_name='"[保密参数]"'::jsonb OR v_name#>>'{}' ~ '^[a-zA-Z0-9_一-鿿-]*$') THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_owner_rows() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_actor jsonb;v_id uuid;v_candidates jsonb;v_reviewers jsonb;v_grants jsonb;
BEGIN
 v_actor:=agentstudio.agent_approval_delegation_context(false);v_id:=(v_actor->>'owner_user_id')::uuid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'display_name',x.display_name) ORDER BY x.display_name,x.id),'[]'::jsonb) INTO v_reviewers FROM(SELECT u.id,coalesce(nullif(u.display_name,''),'负责人') AS display_name FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.id<>v_id AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled AND a.is_admin ORDER BY u.display_name,u.id LIMIT 100) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('run_id',x.id) ORDER BY x.updated_at DESC,x.id),'[]'::jsonb) INTO v_candidates FROM(SELECT r.id,r.updated_at FROM agentstudio.runs r WHERE r.owner_user_id=v_id AND r.kind='agent' AND r.status='awaiting_approval' AND r.workflow_id IS NULL AND (r.checkpoint->>'execution_mode' IS NULL OR r.checkpoint->>'execution_mode'='agent_native_v2') ORDER BY r.updated_at DESC,r.id LIMIT 60) x;
 SELECT coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('reviewer_current',a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1','reviewer_current_epoch',a.governance_revision)),'[]'::jsonb) INTO v_grants FROM agentstudio.agent_approval_delegation_grants g JOIN agentstudio_auth.accounts a ON a.user_id=g.reviewer_user_id JOIN agentstudio.users u ON u.id=a.user_id WHERE g.owner_user_id=v_id AND g.run_id IN(SELECT (x->>'run_id')::uuid FROM jsonb_array_elements(v_candidates) x);
 RETURN jsonb_build_object('reviewers',v_reviewers,'candidates',v_candidates,'grants',v_grants,'owner_epoch',v_actor->'epoch');
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_assigned() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE v_actor jsonb;v_owner jsonb;g record;v_source jsonb;v_items jsonb:='[]'::jsonb;
BEGIN
 v_actor:=agentstudio.agent_approval_delegation_context(true);
 FOR g IN SELECT * FROM agentstudio.agent_approval_delegation_grants WHERE reviewer_user_id=(v_actor->>'owner_user_id')::uuid AND status='active' AND expires_at>clock_timestamp() ORDER BY updated_at DESC,run_id LIMIT 80 LOOP
  BEGIN
   v_owner:=agentstudio.agent_approval_delegation_member(g.owner_user_id,false);
   IF g.owner_epoch<>(v_owner->>'epoch')::bigint OR g.reviewer_epoch<>(v_actor->>'epoch')::bigint THEN CONTINUE;END IF;
   v_source:=agentstudio.agent_approval_delegation_source_private(g.owner_user_id,g.run_id,g.step_key,g.input_sha256);
   IF v_source->>'run_source_sha256' IS DISTINCT FROM g.run_source_sha256 THEN CONTINUE;END IF;
   v_items:=v_items||jsonb_build_array(g.metadata||jsonb_build_object('run_id',g.run_id,'owner_name',v_owner->'display_name','review_note',g.review_note,'step_key',g.step_key,'input_sha256',g.input_sha256,'run_source_sha256',g.run_source_sha256,'grant_revision',g.revision,'expires_ms',agentstudio.agent_approval_delegation_ms(g.expires_at)));
  EXCEPTION WHEN raise_exception THEN CONTINUE;
  END;
 END LOOP;
 RETURN jsonb_build_object('protocol','native_approval_delegation_manager_list_v1','scope','current_reviewer','items',v_items);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_receipt(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_actor jsonb;v_receipt jsonb;
BEGIN
 v_actor:=agentstudio.agent_approval_delegation_context(false);IF $1 IS NULL THEN RAISE EXCEPTION 'approval_delegation_invalid_choice';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended((v_actor->>'owner_user_id')||':approval-delegation-request:'||$1::text,667));
 SELECT receipt INTO v_receipt FROM agentstudio.agent_approval_delegation_receipts WHERE actor_user_id=(v_actor->>'owner_user_id')::uuid AND request_id=$1;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_recorded','request_id',$1);END IF;
 RETURN jsonb_build_object('status','recorded','receipt',v_receipt);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_save(jsonb,jsonb,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE v_hash text;v_receipt jsonb;v_action text:=$1->>'action';
BEGIN
 v_hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','native_approval_delegation_intent_v1','purpose','one_current_agent_step','choice',$1));
 v_receipt:=jsonb_build_object('protocol','native_approval_delegation_receipt_v1','action',v_action,'request_id',$1->'request_id','request_sha256',v_hash,'run_id',$1->'run_id','grant_revision',$2->'revision');
 IF v_action='grant' THEN v_receipt:=v_receipt||jsonb_build_object('reviewer_id',$2->'reviewer_user_id','expires_ms',agentstudio.agent_approval_delegation_ms(($2->>'expires_at')::timestamptz));
 ELSIF v_action='revoke' THEN v_receipt:=v_receipt||jsonb_build_object('revoked',true);
 ELSE v_receipt:=v_receipt||jsonb_build_object('decision',$1->'decision','step_key',$1->'step_key','input_sha256',$1->'input_sha256','status',CASE WHEN $2->>'mode'='model' AND $1->>'decision'='rejected' THEN 'cancelled' ELSE 'queued' END,'reviewed',true,'starts_worker',false,'provider_called',false);
 END IF;
 INSERT INTO agentstudio.agent_approval_delegation_events(run_id,revision,owner_user_id,reviewer_user_id,actor_user_id,request_id,request_sha256,action,evidence) VALUES(($2->>'run_id')::uuid,($2->>'revision')::bigint,($2->>'owner_user_id')::uuid,($2->>'reviewer_user_id')::uuid,$3,($1->>'request_id')::uuid,v_hash,v_action,$2);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES(($2->>'owner_user_id')::uuid,$3,($2->>'run_id')::uuid,'agent.approval_delegation.'||v_action,'agent_run',$2->>'run_id','succeeded',jsonb_build_object('reviewer_user_id',$2->'reviewer_user_id','request_id',$1->'request_id','request_sha256',v_hash,'grant_revision',$2->'revision','step_key',$2->'step_key','input_sha256',$2->'input_sha256','run_source_sha256',$2->'run_source_sha256','provider_called',false));
 INSERT INTO agentstudio.agent_approval_delegation_receipts(actor_user_id,request_id,run_id,request_sha256,action,receipt) VALUES($3,($1->>'request_id')::uuid,($2->>'run_id')::uuid,v_hash,v_action,v_receipt);
 RETURN jsonb_build_object('protocol','native_approval_delegation_reply_v1','receipt',v_receipt,'replayed',false);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_change(jsonb,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET TimeZone='UTC' AS $fn$
DECLARE v_actor jsonb;v_reviewer jsonb;v_source jsonb;g record;v_current bigint:=0;v_id uuid;v_hash text;v_prior record;v_now timestamptz;
BEGIN
 v_actor:=agentstudio.agent_approval_delegation_context(false);v_id:=(v_actor->>'owner_user_id')::uuid;
 IF agentstudio.agent_approval_delegation_choice($1) IS NOT TRUE OR $1->>'action' NOT IN('grant','revoke') THEN RAISE EXCEPTION 'approval_delegation_invalid_choice';END IF;
 v_hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','native_approval_delegation_intent_v1','purpose','one_current_agent_step','choice',$1));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text||':approval-delegation-request:'||($1->>'request_id'),667));
 SELECT * INTO v_prior FROM agentstudio.agent_approval_delegation_receipts WHERE actor_user_id=v_id AND request_id=($1->>'request_id')::uuid;
 IF FOUND THEN IF v_prior.request_sha256 IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'approval_delegation_request_conflict';END IF;RETURN jsonb_build_object('protocol','native_approval_delegation_reply_v1','receipt',v_prior.receipt,'replayed',true);END IF;
 IF $1->>'action'='grant' THEN
  IF ($1->>'reviewer_id')::uuid=v_id OR agentstudio.agent_approval_delegation_metadata($2) IS NOT TRUE THEN RAISE EXCEPTION 'approval_delegation_invalid_reviewer';END IF;
  v_reviewer:=agentstudio.agent_approval_delegation_member(($1->>'reviewer_id')::uuid,true);
  v_source:=agentstudio.agent_approval_delegation_source_private(v_id,($1->>'run_id')::uuid,$1->>'step_key',$1->>'input_sha256');
  IF v_source->>'run_source_sha256' IS DISTINCT FROM $1->>'run_source_sha256' OR $2->>'mode' IS DISTINCT FROM v_source->>'mode' OR $2->>'title' IS DISTINCT FROM v_source->>'title'
   OR ($2->'knowledge_charge_required'='true'::jsonb) IS DISTINCT FROM ($1->'knowledge_query_charge'='"PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL"'::jsonb) THEN RAISE EXCEPTION 'approval_delegation_source_changed';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('approval-delegation-run:'||($1->>'run_id'),668));
 SELECT * INTO g FROM agentstudio.agent_approval_delegation_grants WHERE run_id=($1->>'run_id')::uuid FOR UPDATE;
 IF FOUND THEN IF g.owner_user_id<>v_id THEN RAISE EXCEPTION 'approval_delegation_run_not_found';END IF;v_current:=g.revision;END IF;
 IF v_current<>($1->>'expected_grant_revision')::bigint THEN RAISE EXCEPTION 'approval_delegation_revision_changed';END IF;v_now:=clock_timestamp();
 IF $1->>'action'='revoke' THEN
  IF v_current=0 OR g.status<>'active' THEN RAISE EXCEPTION 'approval_delegation_grant_unavailable';END IF;
  UPDATE agentstudio.agent_approval_delegation_grants SET revision=revision+1,status='revoked',updated_at=v_now WHERE run_id=g.run_id RETURNING * INTO g;
 ELSE
  INSERT INTO agentstudio.agent_approval_delegation_grants(run_id,owner_user_id,reviewer_user_id,revision,owner_epoch,reviewer_epoch,step_key,input_sha256,run_source_sha256,mode,metadata,review_note,knowledge_charge,status,expires_at,created_at,updated_at)
   VALUES(($1->>'run_id')::uuid,v_id,($1->>'reviewer_id')::uuid,v_current+1,(v_actor->>'epoch')::bigint,(v_reviewer->>'epoch')::bigint,$1->>'step_key',$1->>'input_sha256',$1->>'run_source_sha256',v_source->>'mode',$2,$1->>'review_note',$2->'knowledge_charge_required'='true'::jsonb,'active',v_now+make_interval(hours=>($1->>'expires_hours')::integer),v_now,v_now)
   ON CONFLICT(run_id) DO UPDATE SET reviewer_user_id=excluded.reviewer_user_id,revision=excluded.revision,owner_epoch=excluded.owner_epoch,reviewer_epoch=excluded.reviewer_epoch,step_key=excluded.step_key,input_sha256=excluded.input_sha256,run_source_sha256=excluded.run_source_sha256,mode=excluded.mode,metadata=excluded.metadata,review_note=excluded.review_note,knowledge_charge=excluded.knowledge_charge,status='active',expires_at=excluded.expires_at,updated_at=excluded.updated_at RETURNING * INTO g;
 END IF;
 RETURN agentstudio.agent_approval_delegation_save($1,to_jsonb(g),v_id);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_begin_review(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_actor jsonb;v_owner jsonb;v_id uuid;g record;v_source jsonb;v_hash text;v_prior record;
BEGIN
 v_actor:=agentstudio.agent_approval_delegation_context(true);v_id:=(v_actor->>'owner_user_id')::uuid;
 IF agentstudio.agent_approval_delegation_choice($1) IS NOT TRUE OR $1->>'action'<>'review' THEN RAISE EXCEPTION 'approval_delegation_invalid_choice';END IF;
 v_hash:=agentstudio.agent_design_digest(jsonb_build_object('protocol','native_approval_delegation_intent_v1','purpose','one_current_agent_step','choice',$1));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text||':approval-delegation-request:'||($1->>'request_id'),667));
 SELECT * INTO v_prior FROM agentstudio.agent_approval_delegation_receipts WHERE actor_user_id=v_id AND request_id=($1->>'request_id')::uuid;
 IF FOUND THEN IF v_prior.request_sha256 IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'approval_delegation_request_conflict';END IF;RETURN jsonb_build_object('recorded',true,'receipt',v_prior.receipt);END IF;
 SELECT * INTO g FROM agentstudio.agent_approval_delegation_grants WHERE run_id=($1->>'run_id')::uuid AND reviewer_user_id=v_id;
 IF NOT FOUND OR g.owner_user_id=v_id THEN RAISE EXCEPTION 'approval_delegation_grant_unavailable';END IF;
 v_owner:=agentstudio.agent_approval_delegation_member(g.owner_user_id,false);
 v_source:=agentstudio.agent_approval_delegation_source_private(g.owner_user_id,g.run_id,$1->>'step_key',$1->>'input_sha256');
 PERFORM pg_advisory_xact_lock(hashtextextended('approval-delegation-run:'||($1->>'run_id'),668));
 SELECT * INTO g FROM agentstudio.agent_approval_delegation_grants WHERE run_id=($1->>'run_id')::uuid FOR UPDATE;
 IF NOT FOUND OR g.status<>'active' OR g.reviewer_user_id<>v_id OR g.revision<>($1->>'expected_grant_revision')::bigint OR g.expires_at<=clock_timestamp()
  OR g.owner_epoch<>(v_owner->>'epoch')::bigint OR g.reviewer_epoch<>(v_actor->>'epoch')::bigint OR g.step_key IS DISTINCT FROM $1->>'step_key' OR g.input_sha256 IS DISTINCT FROM $1->>'input_sha256'
  OR g.run_source_sha256 IS DISTINCT FROM $1->>'run_source_sha256' OR g.run_source_sha256 IS DISTINCT FROM v_source->>'run_source_sha256'
  OR ($1->>'decision'='approved' AND g.knowledge_charge IS DISTINCT FROM ($1->'knowledge_query_charge'='"PAY_ONCE_FOR_THIS_APPROVED_KNOWLEDGE_TOOL"'::jsonb)) THEN RAISE EXCEPTION 'approval_delegation_grant_unavailable';END IF;
 INSERT INTO agentstudio.agent_approval_delegation_contexts(actor_user_id,request_id,run_id,owner_user_id,request_sha256,grant_revision,owner_epoch,reviewer_epoch,step_key,input_sha256,run_source_sha256,choice,backend_pid,transaction_id)
  VALUES(v_id,($1->>'request_id')::uuid,g.run_id,g.owner_user_id,v_hash,g.revision,g.owner_epoch,g.reviewer_epoch,g.step_key,g.input_sha256,g.run_source_sha256,$1,pg_backend_pid(),pg_current_xact_id()::text);
 PERFORM set_config('agentstudio.actor_id',g.owner_user_id::text,true);
 RETURN jsonb_build_object('recorded',false,'owner_user_id',g.owner_user_id,'mode',g.mode);
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_owner_actor(uuid,uuid,text,text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE c record;g record;v_owner jsonb;v_reviewer jsonb;
BEGIN
 PERFORM agentstudio.agent_design_session('agentstudio_api');
 SELECT * INTO c FROM agentstudio.agent_approval_delegation_contexts WHERE request_id=$1 AND run_id=$2 AND owner_user_id=agentstudio.actor_id() AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()::text;
 IF NOT FOUND OR c.step_key IS DISTINCT FROM $3 OR ($4 IS NULL AND c.step_key<>'model') OR ($4 IS NOT NULL AND c.input_sha256 IS DISTINCT FROM $4) THEN RAISE EXCEPTION 'approval_delegation_context_required';END IF;
 v_owner:=agentstudio.agent_approval_delegation_member(c.owner_user_id,false);v_reviewer:=agentstudio.agent_approval_delegation_member(c.actor_user_id,true);
 SELECT * INTO g FROM agentstudio.agent_approval_delegation_grants WHERE run_id=c.run_id;
 IF NOT FOUND OR g.status<>'active' OR g.expires_at<=clock_timestamp() OR g.revision<>c.grant_revision OR g.owner_user_id<>c.owner_user_id OR g.reviewer_user_id<>c.actor_user_id OR c.owner_epoch<>(v_owner->>'epoch')::bigint OR c.reviewer_epoch<>(v_reviewer->>'epoch')::bigint THEN RAISE EXCEPTION 'approval_delegation_context_required';END IF;
 RETURN c.actor_user_id;
END $fn$;
CREATE FUNCTION agentstudio.agent_approval_delegation_finish_review(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE c record;g record;v_actor uuid;v_status text;v_reply jsonb;v_approval record;v_run record;
BEGIN
 IF agentstudio.agent_approval_delegation_choice($1) IS NOT TRUE OR $1->>'action'<>'review' THEN RAISE EXCEPTION 'approval_delegation_invalid_choice';END IF;
 SELECT * INTO c FROM agentstudio.agent_approval_delegation_contexts WHERE request_id=($1->>'request_id')::uuid AND run_id=($1->>'run_id')::uuid AND owner_user_id=agentstudio.actor_id() AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()::text;
 IF NOT FOUND OR c.choice IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'approval_delegation_context_required';END IF;
 v_actor:=agentstudio.agent_approval_delegation_owner_actor(c.request_id,c.run_id,c.step_key,c.input_sha256);
 SELECT * INTO g FROM agentstudio.agent_approval_delegation_grants WHERE run_id=c.run_id FOR UPDATE;
 SELECT status,decided_by,decided_at INTO v_approval FROM agentstudio.approvals WHERE run_id=c.run_id AND owner_user_id=c.owner_user_id AND step_key=c.step_key;
 v_status:=CASE WHEN g.mode='model' AND $1->>'decision'='rejected' THEN 'cancelled' ELSE 'queued' END;
 SELECT status,kind INTO v_run FROM agentstudio.runs WHERE id=c.run_id AND owner_user_id=c.owner_user_id;
 IF v_approval.status IS DISTINCT FROM $1->>'decision' OR v_approval.decided_by IS DISTINCT FROM v_actor OR v_approval.decided_at IS NULL OR v_run.kind IS DISTINCT FROM 'agent' OR v_run.status IS DISTINCT FROM v_status THEN RAISE EXCEPTION 'approval_delegation_decision_not_recorded';END IF;
 UPDATE agentstudio.agent_approval_delegation_grants SET status=$1->>'decision',revision=revision+1,updated_at=clock_timestamp() WHERE run_id=c.run_id RETURNING * INTO g;
 v_reply:=agentstudio.agent_approval_delegation_save($1,to_jsonb(g),v_actor);
 PERFORM set_config('agentstudio.actor_id',v_actor::text,true);
 RETURN v_reply;
END $fn$;
DO $acl$ DECLARE v_routine regprocedure;BEGIN
 FOR v_routine IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'agent_approval_delegation_') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_review_worker,agentstudio_review_dispatch,agentstudio_design_worker,agentstudio_design_dispatch,agentstudio_plan_workflow_worker,agentstudio_plan_workflow_dispatch',v_routine);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION agentstudio.agent_approval_delegation_owner_rows(),agentstudio.agent_approval_delegation_source(uuid,text,text),agentstudio.agent_approval_delegation_assigned(),agentstudio.agent_approval_delegation_receipt(uuid),agentstudio.agent_approval_delegation_change(jsonb,jsonb),agentstudio.agent_approval_delegation_begin_review(jsonb),agentstudio.agent_approval_delegation_owner_actor(uuid,uuid,text,text),agentstudio.agent_approval_delegation_finish_review(jsonb) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_066','Optional exact-current-Agent-step Native Owner delegation to active admin, current source/governance revision, original Owner transaction and dual-identity immutable receipts; no general manager Run access or production activation');
COMMIT;
