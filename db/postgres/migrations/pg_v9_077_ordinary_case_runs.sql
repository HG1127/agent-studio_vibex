-- Source candidate only. This file has not been installed or executed.
-- Ordinary original-page case runs use actual Root runs/jobs/approvals. They
-- never create monitor checks, schedule occurrences or fabricated receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE owner_oid oid;
BEGIN
 SELECT relowner INTO owner_oid FROM pg_catalog.pg_class
 WHERE oid=to_regclass('agentstudio.monitor_live_cases');
 IF owner_oid IS NULL OR owner_oid<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR current_user<>session_user
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_074')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_077')
 OR to_regprocedure('agentstudio.autonomous_agent_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)') IS NULL
 OR to_regclass('agentstudio.ordinary_case_runs') IS NOT NULL
 OR to_regclass('agentstudio.ordinary_case_source_slots') IS NOT NULL
 OR to_regclass('agentstudio.ordinary_case_receipts') IS NOT NULL
 OR to_regclass('agentstudio.ordinary_case_dependencies') IS NOT NULL THEN
  RAISE EXCEPTION 'ordinary_case_pristine_074_owner_and_root_lease_required';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN
 ('agentstudio_api','agentstudio_worker','agentstudio_bound_dispatch','agentstudio_model_broker')
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
 AND NOT rolcreatedb AND NOT rolreplication)<>4 THEN
  RAISE EXCEPTION 'ordinary_case_runtime_roles_required';
 END IF;
END
$preflight$;

CREATE TABLE agentstudio.ordinary_case_runs(
 run_id uuid NOT NULL,
 job_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 question_id uuid,
 spec_id uuid NOT NULL,
 spec_revision bigint NOT NULL,
 governance_revision bigint NOT NULL,
 request_canonical text NOT NULL,
 request_sha256 text NOT NULL,
 case_snapshot jsonb NOT NULL,
 case_snapshot_sha256 text NOT NULL,
 binding jsonb NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT ordinary_case_runs_pkey PRIMARY KEY(run_id),
 CONSTRAINT ordinary_case_runs_uq1 UNIQUE(job_id),
 CONSTRAINT ordinary_case_runs_ck1 CHECK(spec_revision>0),
 CONSTRAINT ordinary_case_runs_ck2 CHECK(governance_revision>0),
 CONSTRAINT ordinary_case_runs_ck3 CHECK(request_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_runs_ck4 CHECK(jsonb_typeof(case_snapshot)='object'),
 CONSTRAINT ordinary_case_runs_ck5 CHECK(case_snapshot_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_runs_ck6 CHECK(jsonb_typeof(binding)='object'),
 CONSTRAINT ordinary_case_runs_ck7 CHECK(created_ms>0),
 CONSTRAINT ordinary_case_runs_uq2 UNIQUE(run_id,owner_user_id,case_id),
 CONSTRAINT ordinary_case_runs_fk1 FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
 CONSTRAINT ordinary_case_runs_fk2 FOREIGN KEY(job_id) REFERENCES agentstudio.jobs(id),
 CONSTRAINT ordinary_case_runs_fk3 FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id)
);
CREATE TABLE agentstudio.ordinary_case_source_slots(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 run_id uuid NOT NULL,
 case_id uuid NOT NULL,
 step_key text NOT NULL,
 input_sha256 text NOT NULL,
 parent_step_key text NOT NULL,
 claim_sha256 text NOT NULL,
 source_metadata jsonb NOT NULL,
 state text NOT NULL,
 error text NOT NULL,
 created_ms bigint NOT NULL,
 completed_ms bigint NOT NULL,
 CONSTRAINT ordinary_case_source_slots_pkey PRIMARY KEY(id),
 CONSTRAINT ordinary_case_source_slots_ck1 CHECK(step_key~'^[A-Za-z0-9_:-]{1,160}$'),
 CONSTRAINT ordinary_case_source_slots_ck2 CHECK(input_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_source_slots_ck3 CHECK(claim_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_source_slots_ck4 CHECK(jsonb_typeof(source_metadata)='object'),
 CONSTRAINT ordinary_case_source_slots_ck5 CHECK(state IN('started','captured','unknown')),
 CONSTRAINT ordinary_case_source_slots_ck6 CHECK(length(error)<=80),
 CONSTRAINT ordinary_case_source_slots_ck7 CHECK(created_ms>0),
 CONSTRAINT ordinary_case_source_slots_ck8 CHECK(completed_ms>=0),
 CONSTRAINT ordinary_case_source_slots_uq1 UNIQUE(run_id,step_key),
 CONSTRAINT ordinary_case_source_slots_uq2 UNIQUE(id,owner_user_id,run_id,case_id),
 CONSTRAINT ordinary_case_source_slots_fk1 FOREIGN KEY(run_id,owner_user_id,case_id)
  REFERENCES agentstudio.ordinary_case_runs(run_id,owner_user_id,case_id)
);
CREATE TABLE agentstudio.ordinary_case_receipts(
 id uuid NOT NULL,
 slot_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 run_id uuid NOT NULL,
 case_id uuid NOT NULL,
 step_key text NOT NULL,
 payload jsonb NOT NULL,
 canonical_payload text NOT NULL,
 content_hash text NOT NULL,
 source_scope jsonb NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT ordinary_case_receipts_pkey PRIMARY KEY(id),
 CONSTRAINT ordinary_case_receipts_uq1 UNIQUE(slot_id),
 CONSTRAINT ordinary_case_receipts_ck1 CHECK(jsonb_typeof(payload)='object'),
 CONSTRAINT ordinary_case_receipts_ck2 CHECK(content_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_receipts_ck3 CHECK(jsonb_typeof(source_scope)='object'),
 CONSTRAINT ordinary_case_receipts_ck4 CHECK(created_ms>0),
 CONSTRAINT ordinary_case_receipts_uq2 UNIQUE(run_id,step_key),
 CONSTRAINT ordinary_case_receipts_uq3 UNIQUE(id,owner_user_id,run_id,case_id),
 CONSTRAINT ordinary_case_receipts_fk1 FOREIGN KEY(slot_id,owner_user_id,run_id,case_id)
  REFERENCES agentstudio.ordinary_case_source_slots(id,owner_user_id,run_id,case_id)
);
CREATE TABLE agentstudio.ordinary_case_dependencies(
 run_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 source_run_id uuid NOT NULL,
 source_receipt_id uuid NOT NULL,
 step_key text NOT NULL,
 input_sha256 text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT ordinary_case_dependencies_ck1 CHECK(input_sha256~'^[a-f0-9]{64}$'),
 CONSTRAINT ordinary_case_dependencies_ck2 CHECK(created_ms>0),
 CONSTRAINT ordinary_case_dependencies_pkey PRIMARY KEY(run_id,source_run_id,source_receipt_id),
 CONSTRAINT ordinary_case_dependencies_ck3 CHECK(run_id<>source_run_id),
 CONSTRAINT ordinary_case_dependencies_fk1 FOREIGN KEY(run_id,owner_user_id,case_id)
  REFERENCES agentstudio.ordinary_case_runs(run_id,owner_user_id,case_id),
 CONSTRAINT ordinary_case_dependencies_fk2 FOREIGN KEY(source_run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);

CREATE FUNCTION agentstudio.ordinary_case_role(text) RETURNS void
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE login pg_catalog.pg_roles;
BEGIN
 SELECT * INTO login FROM pg_catalog.pg_roles WHERE rolname=session_user;
 IF $1 NOT IN('agentstudio_api','agentstudio_worker','agentstudio_bound_dispatch')
 OR current_setting('role')<>$1 OR NOT login.rolcanlogin OR login.rolinherit
 OR login.rolsuper OR login.rolbypassrls OR login.rolcreaterole OR login.rolcreatedb
 OR login.rolreplication OR NOT pg_has_role(login.oid,$1,'MEMBER')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members
  WHERE member=login.oid AND (admin_option OR inherit_option OR NOT set_option))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles g WHERE g.oid<>login.oid
 AND pg_has_role(login.oid,g.oid,'MEMBER')
 AND NOT (g.rolname=$1 OR ($1 IN('agentstudio_worker','agentstudio_api') AND g.rolname IN('agentstudio_api','agentstudio_worker') AND pg_has_role(login.oid,'agentstudio_worker','MEMBER'))))
 THEN RAISE EXCEPTION 'ordinary_case_private_role_required'; END IF;
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 RAISE EXCEPTION 'ordinary_case_immutable';
END
$fn$;
CREATE FUNCTION agentstudio.ordinary_case_slot_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP<>'UPDATE' OR OLD.state<>'started' OR NEW.state NOT IN('captured','unknown')
 OR NEW.completed_ms<OLD.created_ms OR NEW.completed_ms<=0
 OR (to_jsonb(NEW)-ARRAY['state','error','completed_ms']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','error','completed_ms'])
 THEN RAISE EXCEPTION 'ordinary_case_slot_transition_forbidden'; END IF;
 RETURN NEW;
END
$fn$;
CREATE TRIGGER ordinary_case_runs_immutable BEFORE UPDATE OR DELETE
 ON agentstudio.ordinary_case_runs FOR EACH ROW EXECUTE FUNCTION agentstudio.ordinary_case_immutable();
CREATE TRIGGER ordinary_case_receipts_immutable BEFORE UPDATE OR DELETE
 ON agentstudio.ordinary_case_receipts FOR EACH ROW EXECUTE FUNCTION agentstudio.ordinary_case_immutable();
CREATE TRIGGER ordinary_case_dependencies_immutable BEFORE UPDATE OR DELETE
 ON agentstudio.ordinary_case_dependencies FOR EACH ROW EXECUTE FUNCTION agentstudio.ordinary_case_immutable();
CREATE TRIGGER ordinary_case_source_slots_immutable BEFORE UPDATE OR DELETE
 ON agentstudio.ordinary_case_source_slots FOR EACH ROW EXECUTE FUNCTION agentstudio.ordinary_case_slot_guard();

CREATE FUNCTION agentstudio.ordinary_case_current(uuid,uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE b agentstudio.ordinary_case_runs; c agentstudio.monitor_live_cases;
 a bigint; snapshot jsonb;
BEGIN
 SELECT * INTO b FROM agentstudio.ordinary_case_runs
 WHERE run_id=$1 AND owner_user_id=$2 FOR SHARE;
 IF b.run_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM agentstudio.monitor_live_cases
 WHERE id=b.case_id AND owner_user_id=$2 FOR SHARE;
 SELECT account.governance_revision INTO a FROM agentstudio_auth.accounts account
 JOIN agentstudio.users u ON u.id=account.user_id
 WHERE account.user_id=$2 AND account.enabled AND u.status='active'
 AND u.external_issuer='urn:agentstudio:local:v1' FOR SHARE OF account,u;
 snapshot=jsonb_build_object('case_id',c.id,'title',c.title,'data_space',c.data_space,
 'questions',c.questions,'created_ms',c.created_ms);
 IF c.id IS NULL OR a IS DISTINCT FROM b.governance_revision OR a IS DISTINCT FROM agentstudio.agent_memory_outcome_epoch()
 OR snapshot IS DISTINCT FROM b.case_snapshot
 OR encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')<>b.case_snapshot_sha256
 OR NOT EXISTS(SELECT 1 FROM agentstudio.runs r JOIN agentstudio.jobs j
 ON j.id=b.job_id AND j.run_id=r.id AND j.owner_user_id=r.owner_user_id
 WHERE r.id=b.run_id AND r.owner_user_id=$2 AND r.kind='agent'
 AND r.agent_spec_id=b.spec_id AND r.checkpoint->>'execution_mode'='agent_native_v2'
 AND j.kind='run_tick' AND j.payload->>'phase'='agent_native_v2'
 AND j.payload->>'agent_spec_id'=b.spec_id::text
 AND j.payload->>'spec_revision'=b.spec_revision::text
 AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256')
 THEN RAISE EXCEPTION 'ordinary_case_binding_changed'; END IF;
 RETURN b.binding;
END
$fn$;
CREATE FUNCTION agentstudio.ordinary_case_lookup(uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id();
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_api');
 IF owner_id IS NULL THEN RAISE EXCEPTION 'ordinary_case_actor_required'; END IF;
 RETURN agentstudio.ordinary_case_current($1,owner_id);
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_bind(uuid,uuid,uuid,text,text,boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id(); epoch bigint;
 r agentstudio.runs; j agentstudio.jobs; c agentstudio.monitor_live_cases;
 prior agentstudio.ordinary_case_runs; request jsonb; snapshot jsonb;
 binding_base jsonb; binding jsonb; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_api');
 epoch=agentstudio.monitor_live_employee(owner_id);
 IF $1 IS NULL OR $2 IS NULL OR $4 IS NULL OR $5 IS NULL OR $6 IS NULL
 OR NOT agentstudio.monitor_live_json_valid($4::jsonb,$4,$5,100000)
 THEN RAISE EXCEPTION 'invalid_ordinary_case_admission'; END IF;
 request=$4::jsonb;
 IF jsonb_typeof(request->'business_case') IS DISTINCT FROM 'object'
 OR request->'business_case'->>'case_id' IS DISTINCT FROM $2::text
 OR nullif(request->'business_case'->>'question_id','') IS DISTINCT FROM $3::text
 THEN RAISE EXCEPTION 'ordinary_case_binding_changed'; END IF;
 SELECT * INTO r FROM agentstudio.runs WHERE id=$1 AND owner_user_id=owner_id
 AND kind='agent' AND workflow_id IS NULL FOR SHARE;
 SELECT * INTO STRICT j FROM agentstudio.jobs WHERE run_id=$1 AND owner_user_id=owner_id
 AND kind='run_tick' AND payload->>'phase'='agent_native_v2' FOR SHARE;
 SELECT * INTO c FROM agentstudio.monitor_live_cases WHERE id=$2
 AND owner_user_id=owner_id FOR UPDATE;
 IF r.id IS NULL OR j.id IS NULL OR c.id IS NULL
 OR r.checkpoint->>'execution_mode'<>'agent_native_v2'
 OR r.instruction IS DISTINCT FROM request->>'instruction'
 OR r.checkpoint->>'spec_revision' IS DISTINCT FROM request->>'expected_revision'
 OR j.payload->>'agent_spec_id' IS DISTINCT FROM r.agent_spec_id::text
 OR j.payload->>'spec_revision' IS DISTINCT FROM r.checkpoint->>'spec_revision'
 OR j.payload->>'graph_sha256' IS DISTINCT FROM r.checkpoint->'machine'->>'graph_sha256'
 OR EXISTS(SELECT 1 FROM agentstudio.schedule_execution_origins WHERE run_id=$1)
 OR EXISTS(SELECT 1 FROM agentstudio.monitor_live_checks WHERE run_id=$1)
 OR ($3 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.questions) q
 WHERE q->>'question_id'=$3::text))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.audit_events
 WHERE owner_user_id=owner_id AND actor_user_id=owner_id AND run_id=$1
 AND action='agent.v2_submit' AND target_kind='agent_run' AND target_id=$1::text
 AND result='succeeded')
 THEN RAISE EXCEPTION 'ordinary_case_actual_root_admission_required'; END IF;
 SELECT * INTO prior FROM agentstudio.ordinary_case_runs WHERE run_id=$1 FOR SHARE;
 IF prior.run_id IS NOT NULL THEN
  IF NOT $6 OR prior.owner_user_id<>owner_id OR prior.case_id<>$2
  OR prior.question_id IS DISTINCT FROM $3 OR prior.request_sha256<>$5
  THEN RAISE EXCEPTION 'ordinary_case_idempotency_conflict'; END IF;
  RETURN agentstudio.ordinary_case_current($1,owner_id);
 END IF;
 IF $6 OR r.status<>'queued' OR NOT EXISTS(SELECT 1 FROM agentstudio.runs fresh
 WHERE fresh.id=$1 AND fresh.xmin=pg_current_xact_id()::xid)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.jobs fresh WHERE fresh.id=j.id AND fresh.xmin=pg_current_xact_id()::xid)
 OR NOT EXISTS(SELECT 1 FROM agentstudio.audit_events fresh WHERE fresh.run_id=$1
 AND fresh.owner_user_id=owner_id AND fresh.action='agent.v2_submit'
 AND fresh.xmin=pg_current_xact_id()::xid) THEN RAISE EXCEPTION 'ordinary_case_cannot_rebind_existing_run'; END IF;
 snapshot=jsonb_build_object('case_id',c.id,'title',c.title,'data_space',c.data_space,
 'questions',c.questions,'created_ms',c.created_ms);
 binding_base=jsonb_build_object('protocol','ordinary_case_run_v1','owner_user_id',owner_id,
 'run_id',$1,'job_id',j.id,'case_id',$2,'question_id',$3,'spec_id',r.agent_spec_id,
 'spec_revision',(r.checkpoint->>'spec_revision')::bigint);
 binding=binding_base||jsonb_build_object('binding_sha256',
 encode(sha256(convert_to((binding_base||jsonb_build_object('request_sha256',$5,
 'case_snapshot',snapshot,'governance_revision',epoch))::text,'UTF8')),'hex'));
 INSERT INTO agentstudio.ordinary_case_runs(run_id,job_id,owner_user_id,case_id,question_id,
 spec_id,spec_revision,governance_revision,request_canonical,request_sha256,
 case_snapshot,case_snapshot_sha256,binding,created_ms)
 VALUES($1,j.id,owner_id,$2,$3,r.agent_spec_id,(r.checkpoint->>'spec_revision')::bigint,
 epoch,$4,$5,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),binding,stamp);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
 VALUES(owner_id,owner_id,$1,'business.case_run_admit','agent_run',$1::text,'succeeded',
 jsonb_build_object('case_id',$2,'question_id',$3,'job_id',j.id,'binding_sha256',binding->>'binding_sha256'));
 RETURN binding;
END
$fn$;

-- The proof is the exact Root Agent child hash preimage. Its configuration
-- cannot be substituted while retaining the actual approved input hash.
CREATE FUNCTION agentstudio.ordinary_case_effect_context(jsonb,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE request jsonb=$1; proof jsonb; identity record; owner_id uuid;
 r agentstudio.runs; binding jsonb; args jsonb;
BEGIN
 IF jsonb_typeof(request) IS DISTINCT FROM 'object'
 OR NOT request ?& ARRAY['claim','step_key','input_sha256','parent_step_key','execution_mode']
 OR (SELECT count(*) FROM jsonb_object_keys(request))<>5
 OR request->>'execution_mode'<>'agent_native_v2'
 OR jsonb_typeof(request->'claim') IS DISTINCT FROM 'object'
 OR NOT request->'claim' ?& ARRAY['job_id','run_id','lease_token','lease_version','lease_owner']
 OR (SELECT count(*) FROM jsonb_object_keys(request->'claim'))<>5
 OR NOT agentstudio.monitor_live_json_valid($2::jsonb,$2,request->>'input_sha256',131072)
 THEN RAISE EXCEPTION 'ordinary_case_original_effect_required'; END IF;
 proof=$2::jsonb;
 SELECT * INTO STRICT identity FROM agentstudio.autonomous_agent_tool_lease_identity(
 (request->'claim'->>'run_id')::uuid,(request->'claim'->>'job_id')::uuid,
 (request->'claim'->>'lease_token')::uuid,(request->'claim'->>'lease_version')::bigint,
 request->'claim'->>'lease_owner',request->>'step_key',request->>'input_sha256',
 request->>'parent_step_key');
 IF identity.issuer<>'urn:agentstudio:local:v1'
 THEN RAISE EXCEPTION 'ordinary_case_native_admission_required'; END IF;
 SELECT id INTO STRICT owner_id FROM agentstudio.users
 WHERE external_issuer=identity.issuer AND external_subject=identity.subject AND status='active';
 PERFORM set_config('agentstudio.actor_id',owner_id::text,true);
 binding=agentstudio.ordinary_case_current((request->'claim'->>'run_id')::uuid,owner_id);
 IF binding IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT r FROM agentstudio.runs
 WHERE id=(request->'claim'->>'run_id')::uuid AND owner_user_id=owner_id FOR SHARE;
 IF proof->>'parent_input_sha256' IS DISTINCT FROM r.checkpoint->'agent_state'->>'parent_input_sha256'
 OR proof->>'snapshot_sha256' IS DISTINCT FROM r.checkpoint->'agent_state'->>'snapshot_sha256'
 OR proof->>'step_key' IS DISTINCT FROM request->>'step_key'
 OR proof->>'kind'<>'tool'
 OR proof->'agent_context'->>'parent_step_key' IS DISTINCT FROM request->>'parent_step_key'
 OR r.checkpoint->'agent_state'->'case_business' IS DISTINCT FROM binding
 OR NOT EXISTS(SELECT 1 FROM agentstudio.external_effects e
 WHERE e.run_id=r.id AND e.owner_user_id=owner_id
 AND e.step_key='wf2_tool:'||(request->>'step_key')
 AND e.tool_name='workflow.tool_bound_dispatch' AND e.status='started'
 AND e.arguments_sha256=request->>'input_sha256')
 OR NOT agentstudio.knowledge_query_execution_validate_run(r.id,request->>'step_key')
 THEN RAISE EXCEPTION 'ordinary_case_effect_binding_changed'; END IF;
 args=(proof->'configuration'->>'params_template')::jsonb;
 IF jsonb_typeof(args) IS DISTINCT FROM 'object' OR proof->>'input' IS DISTINCT FROM
 proof->'configuration'->>'params_template'
 THEN RAISE EXCEPTION 'ordinary_case_original_arguments_required'; END IF;
 RETURN jsonb_build_object('binding',binding,'owner_user_id',owner_id,'run_id',r.id,
 'case_id',binding->>'case_id','question_id',binding->'question_id',
 'configuration',proof->'configuration','arguments',args);
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_source_metadata(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE cfg jsonb=$1->'configuration'; owner_id uuid=($1->>'owner_user_id')::uuid;
 connection agentstudio.tool_connections; fingerprint text; url text;
BEGIN
 IF cfg ? 'tool_binding' THEN
  SELECT * INTO STRICT connection FROM agentstudio.tool_connections
  WHERE id=(cfg->'tool_binding'->>'connection_id')::uuid AND owner_user_id=owner_id FOR SHARE;
  IF NOT connection.enabled OR connection.revision::text IS DISTINCT FROM
  cfg->'tool_binding'->>'connection_revision'
  THEN RAISE EXCEPTION 'ordinary_case_source_configuration_changed'; END IF;
  IF connection.method<>'GET' THEN RETURN NULL; END IF;
  fingerprint=agentstudio.monitor_live_connection_fingerprint(connection.id);
  IF fingerprint IS NULL THEN RAISE EXCEPTION 'ordinary_case_source_configuration_changed'; END IF;
  RETURN jsonb_build_object('kind','http','connection_id',connection.id,
  'connection_revision',connection.revision,'fingerprint',fingerprint);
 ELSIF cfg->>'tool'='web_fetch' THEN
  url=$1->'arguments'->>'url';
  IF jsonb_typeof($1->'arguments'->'url') IS DISTINCT FROM 'string'
  OR length(url) NOT BETWEEN 1 AND 4000 OR url!~'^https?://'
  THEN RAISE EXCEPTION 'ordinary_case_source_configuration_changed'; END IF;
  RETURN jsonb_build_object('kind','web_fetch','url_sha256',
  encode(sha256(convert_to(url,'UTF8')),'hex'));
 END IF;
 -- Other original tools still execute through their original Root adapter.
 -- They are not promoted into invented full-response evidence.
 RETURN NULL;
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_source_begin(jsonb,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; metadata jsonb; slot_id uuid=gen_random_uuid();
 owner_id uuid; run_id uuid; case_id uuid; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_bound_dispatch');
 context=agentstudio.ordinary_case_effect_context($1,$2);
 IF context IS NULL THEN RETURN NULL; END IF;
 metadata=agentstudio.ordinary_case_source_metadata(context);
 IF metadata IS NULL THEN RETURN NULL; END IF;
 owner_id=(context->>'owner_user_id')::uuid;run_id=(context->>'run_id')::uuid;
 case_id=(context->>'case_id')::uuid;
 INSERT INTO agentstudio.ordinary_case_source_slots(id,owner_user_id,run_id,case_id,
 step_key,input_sha256,parent_step_key,claim_sha256,source_metadata,state,error,created_ms,completed_ms)
 VALUES(slot_id,owner_id,run_id,case_id,$1->>'step_key',$1->>'input_sha256',
 $1->>'parent_step_key',encode(sha256(convert_to(($1->'claim')::text,'UTF8')),'hex'),
 metadata,'started','',stamp,0);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
 VALUES(owner_id,owner_id,run_id,'business.case_source_reserved','ordinary_case_source',
 slot_id::text,'succeeded',jsonb_build_object('case_id',case_id,'step_key',$1->>'step_key',
 'input_sha256',$1->>'input_sha256','kind',metadata->>'kind'));
 RETURN jsonb_build_object('slot_id',slot_id,'binding',context->'binding','source_metadata',metadata,
 'data_space',(SELECT data_space FROM agentstudio.monitor_live_cases WHERE id=case_id AND owner_user_id=owner_id));
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_source_finish(uuid,jsonb,text,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; slot agentstudio.ordinary_case_source_slots;
 receipt agentstudio.ordinary_case_receipts; payload jsonb; scope jsonb;
 owner_id uuid; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_bound_dispatch');
 context=agentstudio.ordinary_case_effect_context($2,$3);
 IF context IS NULL THEN RAISE EXCEPTION 'ordinary_case_effect_binding_changed'; END IF;
 owner_id=(context->>'owner_user_id')::uuid;
 SELECT * INTO STRICT slot FROM agentstudio.ordinary_case_source_slots
 WHERE id=$1 AND owner_user_id=owner_id AND run_id=(context->>'run_id')::uuid
 AND case_id=(context->>'case_id')::uuid FOR UPDATE;
 IF slot.step_key IS DISTINCT FROM $2->>'step_key'
 OR slot.input_sha256 IS DISTINCT FROM $2->>'input_sha256'
 OR slot.claim_sha256<>encode(sha256(convert_to(($2->'claim')::text,'UTF8')),'hex')
 OR slot.source_metadata IS DISTINCT FROM agentstudio.ordinary_case_source_metadata(context)
 OR NOT agentstudio.monitor_live_json_valid($4::jsonb,$4,$5,1048576)
 THEN RAISE EXCEPTION 'ordinary_case_source_binding_changed'; END IF;
 payload=$4::jsonb;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
 OR NOT payload ?& ARRAY['text','structuredContent','coverage','redacted','usable_as_evidence','http_response','data_space']
 OR (SELECT count(*) FROM jsonb_object_keys(payload))<>7
 OR jsonb_typeof(payload->'text') IS DISTINCT FROM 'string'
 OR octet_length(convert_to(payload->>'text','UTF8'))>131072
 OR payload->'coverage' IS DISTINCT FROM '{"stored_complete":true}'::jsonb
 OR jsonb_typeof(payload->'redacted') IS DISTINCT FROM 'boolean'
 OR payload->'usable_as_evidence' IS DISTINCT FROM to_jsonb(NOT (payload->>'redacted')::boolean)
 OR ((payload->>'redacted')::boolean AND payload->'structuredContent' IS DISTINCT FROM 'null'::jsonb)
 OR jsonb_typeof(payload->'http_response') IS DISTINCT FROM 'object'
 OR NOT payload->'http_response' ?& ARRAY['status','complete','empty','media_type']
 OR (SELECT count(*) FROM jsonb_object_keys(payload->'http_response'))<>4
 OR jsonb_typeof(payload->'http_response'->'status') IS DISTINCT FROM 'number'
 OR (payload->'http_response'->>'status')!~'^[0-9]{3}$'
 OR payload->'http_response'->'complete' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(payload->'http_response'->'empty') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(payload->'http_response'->'media_type') IS DISTINCT FROM 'string'
 OR length(payload->'http_response'->>'media_type')>120
 OR (payload->'http_response'->>'status')::integer NOT BETWEEN 200 AND 299
 OR payload->>'data_space' IS DISTINCT FROM
 (SELECT data_space FROM agentstudio.monitor_live_cases WHERE id=slot.case_id AND owner_user_id=owner_id)
 THEN RAISE EXCEPTION 'ordinary_case_actual_complete_response_required'; END IF;
 SELECT * INTO receipt FROM agentstudio.ordinary_case_receipts WHERE slot_id=$1;
 IF receipt.id IS NOT NULL THEN
  IF slot.state<>'captured' OR receipt.content_hash<>$5 OR receipt.payload<>payload
  THEN RAISE EXCEPTION 'ordinary_case_capture_conflict'; END IF;
  RETURN jsonb_build_object('result_id',receipt.id,'content_hash',receipt.content_hash,'replayed',true);
 END IF;
 IF slot.state<>'started' THEN RAISE EXCEPTION 'ordinary_case_capture_not_repeatable'; END IF;
 scope=jsonb_build_object('knowledge_base_ids','[]'::jsonb,'semantic_used',false,
 'documents','[]'::jsonb,'dependency_runs',coalesce((SELECT jsonb_agg(DISTINCT d.source_run_id)
 FROM agentstudio.ordinary_case_dependencies d WHERE d.run_id=slot.run_id
 AND d.owner_user_id=owner_id),'[]'::jsonb));
 INSERT INTO agentstudio.ordinary_case_receipts(id,slot_id,owner_user_id,run_id,case_id,
 step_key,payload,canonical_payload,content_hash,source_scope,created_ms)
 VALUES(gen_random_uuid(),slot.id,owner_id,slot.run_id,slot.case_id,slot.step_key,
 payload,$4,$5,scope,stamp) RETURNING * INTO receipt;
 UPDATE agentstudio.ordinary_case_source_slots SET state='captured',completed_ms=stamp WHERE id=slot.id;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
 VALUES(owner_id,owner_id,slot.run_id,'business.case_source_captured','ordinary_case_receipt',
 receipt.id::text,'succeeded',jsonb_build_object('case_id',slot.case_id,
 'slot_id',slot.id,'step_key',slot.step_key,'content_hash',$5,'redacted',payload->'redacted'));
 RETURN jsonb_build_object('result_id',receipt.id,'content_hash',receipt.content_hash,'replayed',false);
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_source_fail(uuid,jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE slot agentstudio.ordinary_case_source_slots;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_bound_dispatch');
 SELECT * INTO STRICT slot FROM agentstudio.ordinary_case_source_slots WHERE id=$1 FOR UPDATE;
 IF slot.run_id IS DISTINCT FROM ($2->'claim'->>'run_id')::uuid
 OR slot.step_key IS DISTINCT FROM $2->>'step_key'
 OR slot.input_sha256 IS DISTINCT FROM $2->>'input_sha256'
 OR slot.claim_sha256<>encode(sha256(convert_to(($2->'claim')::text,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'ordinary_case_source_binding_changed'; END IF;
 IF slot.state='started' THEN
  UPDATE agentstudio.ordinary_case_source_slots SET state='unknown',
  error='ordinary_case_source_outcome_unknown',
  completed_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE id=slot.id;
 END IF;
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_receipt_current(uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid=agentstudio.actor_id(); receipt agentstudio.ordinary_case_receipts;
 slot agentstudio.ordinary_case_source_slots; cfg jsonb; actual text;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_api');
 SELECT * INTO receipt FROM agentstudio.ordinary_case_receipts
 WHERE id=$1 AND owner_user_id=owner_id FOR SHARE;
 IF receipt.id IS NULL OR agentstudio.ordinary_case_current(receipt.run_id,owner_id) IS NULL
 THEN RETURN false; END IF;
 SELECT * INTO STRICT slot FROM agentstudio.ordinary_case_source_slots
 WHERE id=receipt.slot_id AND owner_user_id=owner_id AND run_id=receipt.run_id
 AND case_id=receipt.case_id AND step_key=receipt.step_key FOR SHARE;
 IF slot.state<>'captured' THEN RETURN false; END IF;
 cfg=slot.source_metadata;
 IF cfg->>'kind'='http' THEN
  actual=agentstudio.monitor_live_connection_fingerprint((cfg->>'connection_id')::uuid);
  IF actual IS DISTINCT FROM cfg->>'fingerprint' THEN RETURN false; END IF;
 ELSIF cfg->>'kind'<>'web_fetch' THEN RETURN false; END IF;
 RETURN agentstudio.knowledge_query_execution_validate_run(receipt.run_id,'');
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_dependency(jsonb,text,uuid,uuid) RETURNS void
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; owner_id uuid; v_run uuid; v_case uuid; found_source boolean=false;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_worker');
 context=agentstudio.ordinary_case_effect_context($1,$2);
 IF context IS NULL THEN RAISE EXCEPTION 'ordinary_case_binding_required'; END IF;
 owner_id=(context->>'owner_user_id')::uuid;v_run=(context->>'run_id')::uuid;
 v_case=(context->>'case_id')::uuid;
 IF NOT (
  (context->'configuration'->>'tool'='result_read'
   AND (context->'arguments'->>'result_id')::uuid=$4
   AND coalesce((context->'arguments'->>'run_id')::uuid,v_run)=$3)
  OR
  (context->'configuration'->>'tool'='business_record_write'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(context->'arguments'->'source_refs') ref
   WHERE (ref->>'run_id')::uuid=$3 AND (ref->>'result_id')::uuid=$4))
  OR
  (context->'configuration'->>'tool'='business_record_query'
   AND EXISTS(SELECT 1 FROM (
    SELECT r.source_refs FROM agentstudio.monitor_live_records r
    WHERE r.owner_user_id=owner_id AND r.case_id=v_case
    AND r.schema_id=context->'arguments'->>'schema_id'
    AND r.version=(SELECT max(v.version) FROM agentstudio.monitor_live_records v
      WHERE v.record_id=r.record_id AND v.owner_user_id=r.owner_user_id AND v.case_id=r.case_id)
    ORDER BY r.created_ms,r.record_id
    LIMIT coalesce((context->'arguments'->>'limit')::integer,5)
    OFFSET coalesce((context->'arguments'->>'offset')::bigint,0)
   ) actual CROSS JOIN LATERAL jsonb_array_elements(actual.source_refs) ref
   WHERE (ref->>'run_id')::uuid=$3 AND (ref->>'result_id')::uuid=$4))
 ) THEN RAISE EXCEPTION 'ordinary_case_approved_source_required'; END IF;
 SELECT EXISTS(
  SELECT 1 FROM agentstudio.ordinary_case_receipts s
  WHERE s.id=$4 AND s.owner_user_id=owner_id AND s.case_id=v_case AND s.run_id=$3
  UNION ALL
  SELECT 1 FROM agentstudio.monitor_live_receipts s
  WHERE s.id=$4 AND s.owner_user_id=owner_id AND s.case_id=v_case AND s.run_id=$3
 ) INTO found_source;
 IF NOT found_source OR NOT agentstudio.knowledge_query_execution_validate_run($3,'')
 THEN RAISE EXCEPTION 'ordinary_case_source_unavailable'; END IF;
 IF v_run<>$3 THEN
  INSERT INTO agentstudio.ordinary_case_dependencies(run_id,owner_user_id,case_id,
  source_run_id,source_receipt_id,step_key,input_sha256,created_ms)
  VALUES(v_run,owner_id,v_case,$3,$4,$1->>'step_key',$1->>'input_sha256',
  floor(extract(epoch FROM clock_timestamp())*1000)::bigint) ON CONFLICT DO NOTHING;
 END IF;
END
$fn$;

CREATE FUNCTION agentstudio.ordinary_case_record_write(jsonb,text,jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE context jsonb; owner_id uuid; v_run uuid; v_case uuid; original jsonb;
 current_record agentstudio.monitor_live_records; prior agentstudio.monitor_live_records;
 ref jsonb; v_record uuid; expected bigint; stamp bigint=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_worker');
 context=agentstudio.ordinary_case_effect_context($1,$2);
 IF context IS NULL OR context->'configuration'->>'tool'<>'business_record_write'
 THEN RAISE EXCEPTION 'ordinary_case_approved_write_required'; END IF;
 owner_id=(context->>'owner_user_id')::uuid;v_run=(context->>'run_id')::uuid;
 v_case=(context->>'case_id')::uuid;
 IF jsonb_typeof($3) IS DISTINCT FROM 'object'
 OR NOT $3 ?& ARRAY['record_id','expected_version','schema_id','payload','source_refs',
 'relation_versions','run_id','idempotency_key','request_hash','request_canonical']
 OR (SELECT count(*) FROM jsonb_object_keys($3))<>10
 OR NOT agentstudio.monitor_live_json_valid(($3->>'request_canonical')::jsonb,
 $3->>'request_canonical',$3->>'request_hash',100000)
 THEN RAISE EXCEPTION 'invalid_ordinary_case_record'; END IF;
 original=($3->>'request_canonical')::jsonb;
 IF original IS DISTINCT FROM context->'arguments'
 OR ($3->>'run_id')::uuid<>v_run
 OR $3->'schema_id' IS DISTINCT FROM original->'schema_id'
 OR $3->'payload' IS DISTINCT FROM original->'payload'
 OR $3->'expected_version' IS DISTINCT FROM original->'expected_version'
 OR $3->'idempotency_key' IS DISTINCT FROM original->'idempotency_key'
 OR (original ? 'record_id' AND $3->'record_id' IS DISTINCT FROM original->'record_id')
 OR NOT agentstudio.monitor_live_records_value_valid(($3->>'expected_version')::bigint+1,
 $3->>'schema_id',$3->'payload',$3->'source_refs',$3->'relation_versions',
 $3->>'idempotency_key',$3->>'request_hash')
 THEN RAISE EXCEPTION 'ordinary_case_approved_write_required'; END IF;
 IF $3->>'schema_id'='research.answer.v1'
 AND context->>'question_id' IS NOT NULL
 AND $3->'payload'->>'question_id' IS DISTINCT FROM context->>'question_id'
 THEN RAISE EXCEPTION 'ordinary_case_question_changed'; END IF;
 v_record=($3->>'record_id')::uuid;expected=($3->>'expected_version')::bigint;
 PERFORM 1 FROM agentstudio.monitor_live_cases WHERE id=v_case
 AND owner_user_id=owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'business_case_not_found'; END IF;
 SELECT * INTO current_record FROM agentstudio.monitor_live_records
 WHERE record_id=v_record AND owner_user_id=owner_id AND case_id=v_case
 ORDER BY version DESC LIMIT 1 FOR SHARE;
 -- A model may propose an unresolved person. Confirmed identity and edits to
 -- an existing PERSON remain actual employee-reviewed identity operations.
 IF $3->>'schema_id'='research.entity.v1' AND
 (($3->'payload'->>'entity_type'='PERSON' AND $3->'payload'->>'identity_status'='CONFIRMED')
 OR current_record.payload->>'entity_type'='PERSON')
 THEN RAISE EXCEPTION 'ordinary_case_employee_identity_review_required'; END IF;
 FOR ref IN SELECT * FROM jsonb_array_elements(original->'source_refs') LOOP
  PERFORM agentstudio.ordinary_case_dependency($1,$2,(ref->>'run_id')::uuid,(ref->>'result_id')::uuid);
 END LOOP;
 SELECT * INTO prior FROM agentstudio.monitor_live_records
 WHERE owner_user_id=owner_id AND case_id=v_case
 AND idempotency_key=$3->>'idempotency_key';
 IF prior.record_id IS NOT NULL THEN
  IF prior.request_hash<>$3->>'request_hash' THEN RAISE EXCEPTION 'business_idempotency_conflict'; END IF;
  RETURN jsonb_build_object('record_id',prior.record_id,'version',prior.version);
 END IF;
 IF coalesce(current_record.version,0)<>expected OR
 (current_record.record_id IS NOT NULL AND current_record.schema_id<>$3->>'schema_id')
 THEN RAISE EXCEPTION 'business_version_conflict'; END IF;
 INSERT INTO agentstudio.monitor_live_records(record_id,version,owner_user_id,case_id,
 schema_id,payload,source_refs,relation_versions,run_id,idempotency_key,request_hash,created_ms)
 VALUES(v_record,expected+1,owner_id,v_case,$3->>'schema_id',$3->'payload',$3->'source_refs',
 $3->'relation_versions',v_run,$3->>'idempotency_key',$3->>'request_hash',stamp);
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
 VALUES(owner_id,owner_id,v_run,'business.case_record_write','business_record',v_record::text,
 'succeeded',jsonb_build_object('case_id',v_case,'record_version',expected+1,
 'schema_id',$3->>'schema_id','request_hash',$3->>'request_hash',
 'step_key',$1->>'step_key','input_sha256',$1->>'input_sha256'));
 RETURN jsonb_build_object('record_id',v_record,'version',expected+1);
END
$fn$;

-- Exact grants, source manifests and final migration verification follow below.

CREATE FUNCTION agentstudio.ordinary_case_worker_probe(jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE identity record; owner_id uuid;
BEGIN
 PERFORM agentstudio.ordinary_case_role('agentstudio_worker');
 SELECT * INTO STRICT identity FROM agentstudio.autonomous_agent_tool_lease_identity(
 ($1->'claim'->>'run_id')::uuid,($1->'claim'->>'job_id')::uuid,
 ($1->'claim'->>'lease_token')::uuid,($1->'claim'->>'lease_version')::bigint,
 $1->'claim'->>'lease_owner',$1->>'step_key',$1->>'input_sha256',$1->>'parent_step_key');
 IF identity.issuer<>'urn:agentstudio:local:v1' THEN RAISE EXCEPTION 'ordinary_case_native_admission_required'; END IF;
 SELECT id INTO STRICT owner_id FROM agentstudio.users WHERE status='active'
 AND external_issuer=identity.issuer AND external_subject=identity.subject;
 PERFORM set_config('agentstudio.actor_id',owner_id::text,true);
 RETURN agentstudio.ordinary_case_current(($1->'claim'->>'run_id')::uuid,owner_id);
END
$fn$;

-- New077 objects only. Old074/075/076 functions, tables and ACLs remain untouched.
ALTER TABLE agentstudio.ordinary_case_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.ordinary_case_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.ordinary_case_runs FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT SELECT ON agentstudio.ordinary_case_runs TO agentstudio_api;
CREATE POLICY ordinary_case_runs_owner ON agentstudio.ordinary_case_runs FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
ALTER TABLE agentstudio.ordinary_case_source_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.ordinary_case_source_slots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.ordinary_case_source_slots FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT SELECT ON agentstudio.ordinary_case_source_slots TO agentstudio_api;
CREATE POLICY ordinary_case_source_slots_owner ON agentstudio.ordinary_case_source_slots FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
ALTER TABLE agentstudio.ordinary_case_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.ordinary_case_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.ordinary_case_receipts FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT SELECT ON agentstudio.ordinary_case_receipts TO agentstudio_api;
CREATE POLICY ordinary_case_receipts_owner ON agentstudio.ordinary_case_receipts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
ALTER TABLE agentstudio.ordinary_case_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.ordinary_case_dependencies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.ordinary_case_dependencies FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT SELECT ON agentstudio.ordinary_case_dependencies TO agentstudio_api;
CREATE POLICY ordinary_case_dependencies_owner ON agentstudio.ordinary_case_dependencies FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_role(text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_immutable() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_slot_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_current(uuid,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_lookup(uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_lookup(uuid) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_bind(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_bind(uuid,uuid,uuid,text,text,boolean) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_effect_context(jsonb,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_source_metadata(jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_source_begin(jsonb,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_source_begin(jsonb,text) TO agentstudio_bound_dispatch;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_source_finish(uuid,jsonb,text,text,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_source_finish(uuid,jsonb,text,text,text) TO agentstudio_bound_dispatch;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_source_fail(uuid,jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_source_fail(uuid,jsonb) TO agentstudio_bound_dispatch;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_receipt_current(uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_receipt_current(uuid) TO agentstudio_api;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_dependency(jsonb,text,uuid,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_dependency(jsonb,text,uuid,uuid) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_record_write(jsonb,text,jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_record_write(jsonb,text,jsonb) TO agentstudio_worker;
REVOKE ALL ON FUNCTION agentstudio.ordinary_case_worker_probe(jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_bound_dispatch,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.ordinary_case_worker_probe(jsonb) TO agentstudio_worker;
DO $verify$
DECLARE canonical_owner oid=(SELECT relowner FROM pg_catalog.pg_class WHERE oid=to_regclass('agentstudio.monitor_live_cases')); obj record;
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY(ARRAY['ordinary_case_runs','ordinary_case_source_slots','ordinary_case_receipts','ordinary_case_dependencies']) AND c.relowner=canonical_owner AND c.relrowsecurity AND c.relforcerowsecurity)<>4
 OR (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('agentstudio.autonomous_agent_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)')) IS DISTINCT FROM canonical_owner
 THEN RAISE EXCEPTION 'ordinary_case_final_owner_verification_failed'; END IF;
 FOR obj IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'ordinary_case_') LOOP
  IF obj.proowner<>canonical_owner OR NOT obj.prosecdef OR obj.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(obj.proacl,pg_catalog.acldefault('f',obj.proowner))) a WHERE a.grantee=0 OR a.grantor<>canonical_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable AND a.grantee<>canonical_owner)
  THEN RAISE EXCEPTION 'ordinary_case_final_function_verification_failed'; END IF;
 END LOOP;
END
$verify$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_077','Owned ordinary case runs, fenced source receipts and audited business record writes');
COMMIT;
