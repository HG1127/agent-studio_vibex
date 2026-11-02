-- Proposed isolated078 only. No runtime flag, worker or production cutover.
--044 functions/owners/ACLs and its scheduler surface remain byte-for-byte intact.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_044') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_original_schedules') OR
    to_regclass('agentstudio.original_schedule_forms') IS NOT NULL OR
    to_regclass('agentstudio.original_schedule_operations') IS NOT NULL THEN
  RAISE EXCEPTION 'original_schedules_requires_reviewed044_and_new078';
 END IF;
END $preflight$;
CREATE ROLE agentstudio_original_schedules NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_original_schedules;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_original_schedules;
CREATE FUNCTION agentstudio.original_schedule_form_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>16 OR NOT p ?& ARRAY[
  'name','target_kind','target_id','instruction','max_steps','recurrence_kind','time_zone','start_date','local_time','weekday','interval_minutes',
  'model_connection_id','model_connection_revision','model_id','target_revision','anchor_at'] THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['name','target_kind','target_id','instruction','recurrence_kind','time_zone','start_date','local_time','model_connection_id','model_id','anchor_at']) k WHERE jsonb_typeof(p->k)<>'string') OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['max_steps','weekday','interval_minutes','target_revision']) k WHERE jsonb_typeof(p->k)<>'number') THEN RETURN false; END IF;
 IF length(btrim(p->>'name')) NOT BETWEEN 1 AND 120 OR p->>'name' ~ '[[:cntrl:]]' OR p->>'name'<>btrim(p->>'name') OR
    length(btrim(p->>'instruction')) NOT BETWEEN 1 AND 2000 OR p->>'instruction'<>btrim(p->>'instruction') OR
    p->>'target_kind' NOT IN('agent','workflow') OR p->>'recurrence_kind' NOT IN('once','interval','daily','weekly') OR
    p->>'target_id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR
    p->>'start_date' !~ '^\d{4}-\d\d-\d\d$' OR p->>'local_time' !~ '^([01]\d|2[0-3]):[0-5]\d$' OR
    p->>'anchor_at' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' OR
    length(p->>'time_zone') NOT BETWEEN 1 AND 80 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p->>'time_zone') OR
    p->>'target_revision' !~ '^[1-9][0-9]{0,15}$' OR p->>'max_steps' !~ '^[1-9][0-9]?$' OR
    p->>'weekday' !~ '^[0-6]$' OR p->>'interval_minutes' !~ '^[1-9][0-9]{1,4}$' THEN RETURN false; END IF;
 IF (p->>'target_revision')::numeric>=9007199254740991 OR (p->>'max_steps')::integer NOT BETWEEN 1 AND 30 OR (p->>'interval_minutes')::integer NOT BETWEEN 15 AND 10080 OR
    to_char((p->>'anchor_at')::timestamptz AT TIME ZONE(p->>'time_zone'),'YYYY-MM-DD')<>p->>'start_date' OR
    to_char((p->>'anchor_at')::timestamptz AT TIME ZONE(p->>'time_zone'),'HH24:MI')<>p->>'local_time' OR
    to_char((p->>'anchor_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p->>'anchor_at' OR to_char((p->>'anchor_at')::timestamptz AT TIME ZONE 'UTC','SS.MS')<>'00.000' THEN RETURN false; END IF;
  -- Match the original shared JS converter: earliest valid instant in a DST fold.
  -- Nine offset probes cover both sides of transitions without fabricating gaps.
  IF (p->>'anchor_at')::timestamptz IS DISTINCT FROM(
   WITH local AS(SELECT ((p->>'start_date')||' '||(p->>'local_time'))::timestamp AT TIME ZONE 'UTC' AS instant),
   probes AS(SELECT instant-(((instant+span*interval '1 hour') AT TIME ZONE(p->>'time_zone'))-((instant+span*interval '1 hour') AT TIME ZONE 'UTC')) AS candidate FROM local CROSS JOIN unnest(ARRAY[-48,-36,-24,-12,0,12,24,36,48]) span)
   SELECT min(candidate) FROM probes WHERE to_char(candidate AT TIME ZONE(p->>'time_zone'),'YYYY-MM-DD HH24:MI')=(p->>'start_date')||' '||(p->>'local_time')) THEN RETURN false;END IF;
  IF p->>'target_kind'='workflow' THEN RETURN p->>'model_connection_id'='' AND p->>'model_id'='' AND p->'model_connection_revision'='null'::jsonb; END IF;
 RETURN p->>'model_connection_id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
  p->>'model_id' ~ '^[A-Za-z0-9._:/-]{1,120}$' AND jsonb_typeof(p->'model_connection_revision')='number' AND
  p->>'model_connection_revision' ~ '^[1-9][0-9]{0,15}$' AND (p->>'model_connection_revision')::numeric<9007199254740991;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;
CREATE TABLE agentstudio.original_schedule_forms(
 schedule_id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,form jsonb NOT NULL CHECK(agentstudio.original_schedule_form_valid(form)),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740990),saved_schedule_revision bigint NOT NULL CHECK(saved_schedule_revision BETWEEN 1 AND 9007199254740990),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id),UNIQUE(schedule_id,owner_user_id)
);
CREATE TABLE agentstudio.original_schedule_operations(
 owner_user_id uuid NOT NULL,request_id uuid NOT NULL,schedule_id uuid NOT NULL,action text NOT NULL CHECK(action IN('save','enable','pause','delete','run_now','retry_start')),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),input jsonb NOT NULL CHECK(jsonb_typeof(input)='object' AND octet_length(input::text)<=32768),
 before_revision bigint,before_source_sha256 text,transaction_id bigint NOT NULL DEFAULT txid_current(),result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id),
 CHECK((before_revision IS NULL)=(before_source_sha256 IS NULL)),CHECK(before_revision IS NULL OR before_revision BETWEEN 1 AND 9007199254740990),
 CHECK(before_source_sha256 IS NULL OR before_source_sha256~'^[a-f0-9]{64}$'),CHECK(result IS NULL OR jsonb_typeof(result)='object' AND octet_length(result::text)<=16384),
 FOREIGN KEY(schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id) DEFERRABLE INITIALLY DEFERRED
);
DO $private$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['original_schedule_forms','original_schedule_operations'] LOOP
  EXECUTE 'REVOKE ALL ON agentstudio.'||t||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_scheduler,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
  EXECUTE 'ALTER TABLE agentstudio.'||t||' ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE agentstudio.'||t||' FORCE ROW LEVEL SECURITY';
  EXECUTE 'GRANT SELECT,INSERT ON agentstudio.'||t||' TO agentstudio_original_schedules';
  EXECUTE 'CREATE POLICY original_schedules_private ON agentstudio.'||t||' TO agentstudio_original_schedules USING(true) WITH CHECK(true)';
 END LOOP;
END $private$;
GRANT UPDATE(form,revision,saved_schedule_revision,updated_at) ON agentstudio.original_schedule_forms TO agentstudio_original_schedules;
GRANT UPDATE(result) ON agentstudio.original_schedule_operations TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at) ON agentstudio.schedules TO agentstudio_original_schedules;
GRANT INSERT(id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled) ON agentstudio.schedules TO agentstudio_original_schedules;
GRANT UPDATE(name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,execution,updated_at,deleted_at) ON agentstudio.schedules TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,schedule_id,scheduled_for,status,run_id,created_at,updated_at,schedule_revision,planned_run_id,manual,attempts,error_code) ON agentstudio.schedule_occurrences TO agentstudio_original_schedules;
GRANT SELECT(id,external_issuer,status) ON agentstudio.users TO agentstudio_original_schedules;
GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,name,revision,spec) ON agentstudio.agent_specs TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,name,revision) ON agentstudio.workflows TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,revision,models) ON agentstudio.model_connections TO agentstudio_original_schedules;
GRANT SELECT(id,owner_user_id,kind,status,checkpoint) ON agentstudio.runs TO agentstudio_original_schedules;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_original_schedules;
DO $scope$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['schedules','schedule_occurrences','agent_specs','workflows','model_connections','runs'] LOOP
  EXECUTE 'CREATE POLICY original_schedules_owner ON agentstudio.'||t||' TO agentstudio_original_schedules USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id())';
 END LOOP;
END $scope$;
CREATE POLICY original_schedules_active_user ON agentstudio.users TO agentstudio_original_schedules USING(id=agentstudio.actor_id());
CREATE POLICY original_schedules_active_account ON agentstudio_auth.accounts TO agentstudio_original_schedules USING(user_id=agentstudio.actor_id());
CREATE POLICY original_schedules_audit ON agentstudio.audit_events TO agentstudio_original_schedules FOR INSERT WITH CHECK(owner_user_id=agentstudio.actor_id() AND actor_user_id=agentstudio.actor_id());

CREATE FUNCTION agentstudio.original_schedule_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.actor_id();
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.id=actor AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled) THEN RAISE EXCEPTION 'original_schedule_actor_unavailable'; END IF;
 RETURN actor;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_rule(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 RETURN CASE p->>'recurrence_kind' WHEN 'once' THEN jsonb_build_object('kind','once','start_date',p->>'start_date','local_time',p->>'local_time')
  WHEN 'interval' THEN jsonb_build_object('kind','interval','interval_minutes',p->'interval_minutes')
  WHEN 'weekly' THEN jsonb_build_object('kind','weekly','local_time',p->>'local_time','weekday',p->'weekday')
  ELSE jsonb_build_object('kind','daily','local_time',p->>'local_time') END;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_binding(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN p->>'target_kind'='agent' THEN jsonb_build_object('connection_id',p->>'model_connection_id','connection_revision',p->'model_connection_revision','model_id',p->>'model_id') ELSE 'null'::jsonb END
$fn$;
CREATE FUNCTION agentstudio.original_schedule_material_sha(p_schedule uuid,p_owner uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(jsonb_build_object('id',s.id,'owner',s.owner_user_id,'name',s.name,'kind',s.kind,'agent',s.agent_spec_id,'workflow',s.workflow_id,'zone',s.time_zone,'revision',s.revision,'recurrence',s.recurrence,'execution',s.execution,'deleted_at',s.deleted_at,'form',f.form,'form_revision',f.revision,'saved_revision',f.saved_schedule_revision)::text,'UTF8')),'hex')
 FROM agentstudio.schedules s LEFT JOIN agentstudio.original_schedule_forms f ON f.schedule_id=s.id AND f.owner_user_id=s.owner_user_id WHERE s.id=p_schedule AND s.owner_user_id=p_owner
$fn$;
CREATE FUNCTION agentstudio.original_schedule_occurrence_sha(p_occurrence uuid,p_owner uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(jsonb_build_object('id',o.id,'owner',o.owner_user_id,'schedule',o.schedule_id,'revision',o.schedule_revision,'status',o.status,'attempts',o.attempts,'run',o.run_id,'planned_run',o.planned_run_id,'updated_at',o.updated_at)::text,'UTF8')),'hex')
 FROM agentstudio.schedule_occurrences o WHERE o.id=p_occurrence AND o.owner_user_id=p_owner
$fn$;
CREATE FUNCTION agentstudio.original_schedule_legacy_form(p_schedule uuid,p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s record; f jsonb; binding jsonb; anchor timestamptz; rule jsonb;
BEGIN
 SELECT id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=p_owner;
 IF s.id IS NULL OR s.recurrence->>'config_format' NOT IN('pg_schedule_execution_v2','pg_schedule_execution_v3') OR s.recurrence->'execution_supported'<>'true'::jsonb THEN RETURN NULL; END IF;
 rule=s.recurrence->'rule';anchor=(s.execution->>'anchor_at')::timestamptz;binding=s.execution->'model_binding';
 IF s.kind='agent' AND (binding IS NULL OR binding='null'::jsonb) THEN SELECT spec->'model_binding' INTO binding FROM agentstudio.agent_specs WHERE id=s.agent_spec_id AND owner_user_id=p_owner; END IF;
 f=jsonb_build_object('name',s.name,'target_kind',s.kind,'target_id',coalesce(s.agent_spec_id,s.workflow_id),'instruction',s.execution->>'instruction','max_steps',s.execution->'max_steps',
  'recurrence_kind',rule->>'kind','time_zone',s.time_zone,'start_date',to_char(anchor AT TIME ZONE s.time_zone,'YYYY-MM-DD'),'local_time',coalesce(rule->>'local_time',to_char(anchor AT TIME ZONE s.time_zone,'HH24:MI')),
  'weekday',coalesce(rule->'weekday','1'::jsonb),'interval_minutes',coalesce(rule->'interval_minutes','60'::jsonb),'model_connection_id',CASE WHEN s.kind='agent' THEN binding->>'connection_id' ELSE '' END,
  'model_connection_revision',CASE WHEN s.kind='agent' THEN binding->'connection_revision' ELSE 'null'::jsonb END,'model_id',CASE WHEN s.kind='agent' THEN binding->>'model_id' ELSE '' END,
  'target_revision',s.execution->'target_revision','anchor_at',to_char(anchor AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 RETURN CASE WHEN agentstudio.original_schedule_form_valid(f) THEN f END;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_public_row(p_schedule uuid,p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s record; f agentstudio.original_schedule_forms%ROWTYPE; draft jsonb; coherent boolean=false; origin text='incomplete';public_rule jsonb;
BEGIN
 SELECT id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=p_owner;IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM agentstudio.original_schedule_forms WHERE schedule_id=s.id AND owner_user_id=p_owner;
 IF f.schedule_id IS NOT NULL THEN draft=f.form;origin='original_v1';coherent=f.saved_schedule_revision=s.revision AND s.name=draft->>'name' AND s.kind=draft->>'target_kind' AND coalesce(s.agent_spec_id,s.workflow_id)::text=draft->>'target_id' AND s.time_zone=draft->>'time_zone' AND s.recurrence->'rule'=agentstudio.original_schedule_rule(draft);
 ELSE draft=agentstudio.original_schedule_legacy_form(s.id,p_owner);IF draft IS NOT NULL THEN origin='runtime_v3';coherent=true;END IF;END IF;
 IF s.recurrence->>'config_format' IN('pg_schedule_draft_v1','pg_schedule_execution_v2','pg_schedule_execution_v3') THEN public_rule=jsonb_strip_nulls(jsonb_build_object('kind',s.recurrence->'rule'->'kind','start_date',s.recurrence->'rule'->'start_date','local_time',s.recurrence->'rule'->'local_time','weekday',s.recurrence->'rule'->'weekday','interval_minutes',s.recurrence->'rule'->'interval_minutes'));END IF;
 RETURN jsonb_build_object('id',s.id,'owner_user_id',s.owner_user_id,'name',s.name,'kind',s.kind,'target_id',coalesce(s.agent_spec_id,s.workflow_id),'time_zone',s.time_zone,'enabled',s.enabled,'revision',s.revision,'next_at',s.next_at,'rule',public_rule,
  'created_at',s.created_at,'updated_at',s.updated_at,'deleted',s.deleted_at IS NOT NULL,'source_sha256',agentstudio.original_schedule_material_sha(s.id,p_owner),'form',draft,'form_origin',origin,'form_current',coherent,
  'last_due_at',(SELECT max(scheduled_for) FROM agentstudio.schedule_occurrences WHERE schedule_id=s.id AND owner_user_id=p_owner));
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_begin(p_request uuid,p_request_sha text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor(); o agentstudio.original_schedule_operations%ROWTYPE;s record;sid uuid;action text;body_sha text;existing boolean;v bigint;src text;occ record;
BEGIN
 IF p_request IS NULL OR p_request_sha !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR p_input->>'request_id' IS DISTINCT FROM p_request::text OR p_input->'confirm' IS DISTINCT FROM 'true'::jsonb OR octet_length(p_input::text)>32768 THEN RAISE EXCEPTION 'invalid_original_schedule_operation'; END IF;
 action=p_input->>'action';IF action NOT IN('save','enable','pause','delete','run_now','retry_start') THEN RAISE EXCEPTION 'invalid_original_schedule_operation'; END IF;
 body_sha=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':original_schedule:'||p_request::text,78));
 SELECT * INTO o FROM agentstudio.original_schedule_operations WHERE owner_user_id=actor AND request_id=p_request;
 IF o.request_id IS NOT NULL THEN IF o.request_sha256<>p_request_sha OR o.input_sha256<>body_sha OR o.action<>action OR o.result IS NULL THEN RAISE EXCEPTION 'original_schedule_request_conflict';END IF;RETURN jsonb_build_object('replayed',true,'receipt',jsonb_build_object('request_sha256',o.request_sha256,'result',o.result));END IF;
 existing=p_input->'id' IS DISTINCT FROM 'null'::jsonb;
 IF NOT existing THEN IF action<>'save' OR p_input->'expected_revision' IS DISTINCT FROM 'null'::jsonb OR p_input->'expected_source_sha256' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'invalid_original_schedule_precondition';END IF;sid=gen_random_uuid();
 ELSE
  sid=(p_input->>'id')::uuid;v=(p_input->>'expected_revision')::bigint;src=p_input->>'expected_source_sha256';
  SELECT id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s FROM agentstudio.schedules WHERE id=sid AND owner_user_id=actor AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'original_schedule_not_found';END IF;
  IF v IS NULL OR v<1 OR v>=9007199254740991 OR s.revision<>v OR src IS NULL OR src !~ '^[a-f0-9]{64}$' OR agentstudio.original_schedule_material_sha(sid,actor) IS DISTINCT FROM src THEN RAISE EXCEPTION 'original_schedule_source_changed';END IF;
 END IF;
 IF action='retry_start' THEN SELECT id,status,run_id,schedule_id,owner_user_id INTO occ FROM agentstudio.schedule_occurrences WHERE id=(p_input->>'occurrence_id')::uuid AND owner_user_id=actor AND schedule_id=sid FOR UPDATE;
  IF occ.id IS NULL OR occ.status<>'failed_start' OR occ.run_id IS NOT NULL OR agentstudio.original_schedule_occurrence_sha(occ.id,actor) IS DISTINCT FROM p_input->>'expected_occurrence_sha256' THEN RAISE EXCEPTION 'original_schedule_occurrence_changed';END IF;
 END IF;
 INSERT INTO agentstudio.original_schedule_operations(owner_user_id,request_id,schedule_id,action,request_sha256,input_sha256,input,before_revision,before_source_sha256)
 VALUES(actor,p_request,sid,action,p_request_sha,body_sha,p_input,v,src);
 RETURN jsonb_build_object('replayed',false,'schedule_id',sid,'before_revision',v);
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_put(p_request uuid,p_form jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();o agentstudio.original_schedule_operations%ROWTYPE;s record;target bigint;model uuid;expected bigint;current_form jsonb;
BEGIN
 SELECT * INTO o FROM agentstudio.original_schedule_operations WHERE owner_user_id=actor AND request_id=p_request AND transaction_id=txid_current() AND result IS NULL FOR UPDATE;
 IF o.request_id IS NULL OR o.action NOT IN('save','enable') OR NOT agentstudio.original_schedule_form_valid(p_form) THEN RAISE EXCEPTION 'invalid_original_schedule_form';END IF;
 IF o.action='save' AND p_form IS DISTINCT FROM o.input->'form' THEN RAISE EXCEPTION 'original_schedule_source_changed';END IF;
 IF p_form->>'target_kind'='agent' THEN SELECT revision INTO target FROM agentstudio.agent_specs WHERE id=(p_form->>'target_id')::uuid AND owner_user_id=actor FOR SHARE;
 ELSE SELECT revision INTO target FROM agentstudio.workflows WHERE id=(p_form->>'target_id')::uuid AND owner_user_id=actor FOR SHARE;END IF;
 IF target IS NULL OR target<>(p_form->>'target_revision')::bigint THEN RAISE EXCEPTION 'original_schedule_target_changed';END IF;
 IF p_form->>'target_kind'='agent' THEN SELECT id INTO model FROM agentstudio.model_connections WHERE id=(p_form->>'model_connection_id')::uuid AND owner_user_id=actor AND revision=(p_form->>'model_connection_revision')::bigint AND models ? (p_form->>'model_id') FOR SHARE;IF model IS NULL THEN RAISE EXCEPTION 'original_schedule_model_changed';END IF;END IF;
 IF o.action='enable' THEN
  SELECT id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s FROM agentstudio.schedules WHERE id=o.schedule_id AND owner_user_id=actor AND revision=o.before_revision AND NOT enabled AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'original_schedule_source_changed';END IF;current_form=agentstudio.original_schedule_public_row(s.id,actor);
  IF current_form->'form' IS DISTINCT FROM p_form OR current_form->'form_current' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'original_schedule_requires_reviewed_save';END IF;
 ELSE
  IF o.before_revision IS NULL THEN
   INSERT INTO agentstudio.schedules(id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled) VALUES(o.schedule_id,actor,p_form->>'name',p_form->>'target_kind',CASE WHEN p_form->>'target_kind'='agent' THEN(p_form->>'target_id')::uuid END,CASE WHEN p_form->>'target_kind'='workflow' THEN(p_form->>'target_id')::uuid END,p_form->>'time_zone',jsonb_build_object('config_format','pg_schedule_draft_v1','execution_supported',false,'rule',agentstudio.original_schedule_rule(p_form)),NULL,false) RETURNING id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s;
  ELSE
   UPDATE agentstudio.schedules SET name=p_form->>'name',kind=p_form->>'target_kind',agent_spec_id=CASE WHEN p_form->>'target_kind'='agent' THEN(p_form->>'target_id')::uuid END,workflow_id=CASE WHEN p_form->>'target_kind'='workflow' THEN(p_form->>'target_id')::uuid END,time_zone=p_form->>'time_zone',recurrence=jsonb_build_object('config_format','pg_schedule_draft_v1','execution_supported',false,'rule',agentstudio.original_schedule_rule(p_form)),next_at=NULL,execution='{}'::jsonb,updated_at=clock_timestamp()
   WHERE id=o.schedule_id AND owner_user_id=actor AND revision=o.before_revision+1 AND NOT enabled AND deleted_at IS NULL RETURNING id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at INTO s;
   IF s.id IS NULL THEN RAISE EXCEPTION 'original_schedule_source_changed';END IF;
  END IF;
 END IF;
 INSERT INTO agentstudio.original_schedule_forms(schedule_id,owner_user_id,form,saved_schedule_revision) VALUES(s.id,actor,p_form,s.revision)
 ON CONFLICT(schedule_id) DO UPDATE SET form=excluded.form,revision=agentstudio.original_schedule_forms.revision+1,saved_schedule_revision=excluded.saved_schedule_revision,updated_at=clock_timestamp() WHERE agentstudio.original_schedule_forms.owner_user_id=actor;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(actor,actor,CASE WHEN o.action='save' THEN 'schedule.original_save' ELSE 'schedule.original_adopt' END,'schedule',s.id::text,'succeeded',jsonb_build_object('request_id',o.request_id,'revision',s.revision,'form_sha256',encode(sha256(convert_to(p_form::text,'UTF8')),'hex'),'execution_authorized',false));
 RETURN agentstudio.original_schedule_public_row(s.id,actor);
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_tombstone(p_request uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();o agentstudio.original_schedule_operations%ROWTYPE;sid uuid;
BEGIN
 SELECT * INTO o FROM agentstudio.original_schedule_operations WHERE owner_user_id=actor AND request_id=p_request AND transaction_id=txid_current() AND result IS NULL AND action='delete' FOR UPDATE;
 IF o.request_id IS NULL THEN RAISE EXCEPTION 'original_schedule_operation_not_open';END IF;
 UPDATE agentstudio.schedules SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=o.schedule_id AND owner_user_id=actor AND revision=o.before_revision+1 AND NOT enabled AND deleted_at IS NULL RETURNING id INTO sid;
 IF sid IS NULL THEN RAISE EXCEPTION 'original_schedule_source_changed';END IF;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(actor,actor,'schedule.original_delete','schedule',sid::text,'succeeded',jsonb_build_object('request_id',p_request,'history_retained',true));RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_finish(p_request uuid,p_occurrence uuid DEFAULT NULL,p_planned_run uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();o agentstudio.original_schedule_operations%ROWTYPE;s record;f agentstudio.original_schedule_forms%ROWTYPE;occ record;authorized boolean=false;desired bigint;draft jsonb;auth jsonb;final_result jsonb;
BEGIN
 SELECT * INTO o FROM agentstudio.original_schedule_operations WHERE owner_user_id=actor AND request_id=p_request AND transaction_id=txid_current() AND result IS NULL FOR UPDATE;
 IF o.request_id IS NULL THEN RAISE EXCEPTION 'original_schedule_operation_not_open';END IF;
 SELECT id,owner_user_id,revision,enabled,deleted_at,execution INTO s FROM agentstudio.schedules WHERE id=o.schedule_id AND owner_user_id=actor FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'original_schedule_not_found';END IF;
 SELECT * INTO f FROM agentstudio.original_schedule_forms WHERE schedule_id=s.id AND owner_user_id=actor FOR UPDATE;
 desired=coalesce(o.before_revision,1);draft=f.form;auth=o.input->'authorization';authorized=o.action='enable' OR o.action='save' AND auth IS DISTINCT FROM 'null'::jsonb;
 IF o.action='save' THEN desired=coalesce(o.before_revision+1,1)+CASE WHEN authorized THEN 1 ELSE 0 END;
 ELSIF o.action IN('enable','pause','delete') THEN desired=o.before_revision+1;END IF;
 IF s.revision<>desired OR (s.deleted_at IS NOT NULL)<>(o.action='delete') THEN RAISE EXCEPTION 'original_schedule_finish_changed';END IF;
 IF o.action='save' AND (draft IS DISTINCT FROM o.input->'form' OR f.saved_schedule_revision<>desired-CASE WHEN authorized THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'original_schedule_finish_changed';END IF;
 IF authorized THEN
  IF f.schedule_id IS NULL OR NOT s.enabled OR jsonb_typeof(auth) IS DISTINCT FROM 'object' OR auth->>'background_ack'<>'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1' OR
     s.execution->>'instruction' IS DISTINCT FROM draft->>'instruction' OR s.execution->'target_revision' IS DISTINCT FROM draft->'target_revision' OR
     s.execution->'model_binding' IS DISTINCT FROM agentstudio.original_schedule_binding(draft) OR s.execution->>'anchor_at' IS DISTINCT FROM draft->>'anchor_at' OR
     s.execution->'max_steps' IS DISTINCT FROM CASE WHEN draft->>'target_kind'='workflow' THEN '1'::jsonb ELSE draft->'max_steps' END OR
     EXISTS(SELECT 1 FROM unnest(ARRAY['expires_at','max_occurrences','max_auto_effects','background_ack','knowledge_charge_ack']) k WHERE s.execution->k IS DISTINCT FROM auth->k) THEN RAISE EXCEPTION 'original_schedule_authority_unconfirmed';END IF;
 ELSIF o.action IN('save','pause','delete') AND s.enabled THEN RAISE EXCEPTION 'original_schedule_finish_changed';END IF;
 IF o.action IN('run_now','retry_start') THEN
  SELECT id,owner_user_id,schedule_id,schedule_revision,planned_run_id,run_id,status,manual,attempts INTO occ FROM agentstudio.schedule_occurrences WHERE id=p_occurrence AND owner_user_id=actor AND schedule_id=s.id FOR UPDATE;
  IF occ.id IS NULL OR occ.schedule_revision<>o.before_revision OR occ.planned_run_id IS DISTINCT FROM p_planned_run OR p_planned_run IS NULL OR occ.run_id IS NOT NULL OR occ.status<>'pending' OR occ.attempts<>0 OR o.action='run_now' AND NOT occ.manual OR o.action='retry_start' AND occ.id::text IS DISTINCT FROM o.input->>'occurrence_id' THEN RAISE EXCEPTION 'original_schedule_queue_unconfirmed';END IF;
 ELSIF p_occurrence IS NOT NULL OR p_planned_run IS NOT NULL THEN RAISE EXCEPTION 'original_schedule_queue_unconfirmed';END IF;
 IF f.schedule_id IS NOT NULL AND o.action NOT IN('run_now','retry_start') AND(o.action IN('save','enable') OR f.saved_schedule_revision=o.before_revision) THEN UPDATE agentstudio.original_schedule_forms SET saved_schedule_revision=s.revision,updated_at=CASE WHEN saved_schedule_revision<>s.revision THEN clock_timestamp() ELSE updated_at END WHERE schedule_id=s.id AND owner_user_id=actor;END IF;
 final_result=jsonb_build_object('request_id',p_request,'owner_user_id',actor,'schedule_id',s.id,'action',o.action,'before_revision',o.before_revision,'revision',s.revision,'enabled',s.enabled,'deleted',s.deleted_at IS NOT NULL,
  'source_sha256',agentstudio.original_schedule_material_sha(s.id,actor),'form_sha256',CASE WHEN draft IS NOT NULL THEN encode(sha256(convert_to(draft::text,'UTF8')),'hex') END,'occurrence_id',p_occurrence,'planned_run_id',p_planned_run,'status','confirmed');
 UPDATE agentstudio.original_schedule_operations SET result=final_result WHERE owner_user_id=actor AND request_id=p_request AND result IS NULL;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(actor,actor,'schedule.original_confirmed','schedule',s.id::text,'succeeded',jsonb_build_object('request_id',p_request,'action',o.action,'request_sha256',o.request_sha256,'before_revision',o.before_revision,'revision',s.revision,'occurrence_id',p_occurrence));
 RETURN jsonb_build_object('request_sha256',o.request_sha256,'result',final_result);
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_operation_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF OLD.result IS NOT NULL OR (to_jsonb(OLD)-'result') IS DISTINCT FROM (to_jsonb(NEW)-'result') OR NEW.result IS NULL THEN RAISE EXCEPTION 'original_schedule_receipt_immutable';END IF;RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_operation_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM agentstudio.original_schedule_operations WHERE owner_user_id=NEW.owner_user_id AND request_id=NEW.request_id AND result IS NOT NULL) THEN RAISE EXCEPTION 'original_schedule_operation_incomplete';END IF;RETURN NEW;
END $fn$;
CREATE TRIGGER original_schedule_receipt_immutable BEFORE UPDATE ON agentstudio.original_schedule_operations FOR EACH ROW EXECUTE FUNCTION agentstudio.original_schedule_operation_immutable();
CREATE CONSTRAINT TRIGGER original_schedule_receipt_complete AFTER INSERT OR UPDATE ON agentstudio.original_schedule_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agentstudio.original_schedule_operation_complete();
CREATE FUNCTION agentstudio.original_schedule_receipt(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();r jsonb;
BEGIN
 SELECT jsonb_build_object('request_sha256',request_sha256,'result',result) INTO r FROM agentstudio.original_schedule_operations WHERE owner_user_id=actor AND request_id=p_request AND result IS NOT NULL;RETURN r;
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_get(p_schedule uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();
BEGIN RETURN agentstudio.original_schedule_public_row(p_schedule,actor);END $fn$;
CREATE FUNCTION agentstudio.original_schedule_list(p_filter text,p_after_at timestamptz,p_after_id uuid,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();items jsonb;more boolean;last_at timestamptz;last_id uuid;
BEGIN
 IF p_filter NOT IN('all','active','disabled') OR p_limit NOT BETWEEN 1 AND 50 OR (p_after_at IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'invalid_original_schedule_page';END IF;
 WITH page AS(SELECT id,created_at FROM agentstudio.schedules WHERE owner_user_id=actor AND deleted_at IS NULL AND (p_filter='all' OR enabled=(p_filter='active')) AND
  (p_after_at IS NULL OR created_at<p_after_at OR created_at=p_after_at AND id>p_after_id) ORDER BY created_at DESC,id LIMIT p_limit+1),visible AS(SELECT * FROM page ORDER BY created_at DESC,id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(agentstudio.original_schedule_public_row(id,actor) ORDER BY created_at DESC,id) FROM visible),'[]'::jsonb),(SELECT count(*)>p_limit FROM page),(SELECT created_at FROM visible ORDER BY created_at,id DESC LIMIT 1),(SELECT id FROM visible ORDER BY created_at,id DESC LIMIT 1) INTO items,more,last_at,last_id;
 RETURN jsonb_build_object('items',items,'has_more',more,'next_after',CASE WHEN more THEN jsonb_build_object('at',last_at,'id',last_id) END,'order','created_desc_id_asc','live_partial_pages',true);
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_history(p_schedule uuid,p_after_at timestamptz,p_after_id uuid,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();items jsonb;more boolean;last_at timestamptz;last_id uuid;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 50 OR (p_after_at IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'invalid_original_schedule_page';END IF;
 WITH page AS(SELECT id,scheduled_for FROM agentstudio.schedule_occurrences WHERE owner_user_id=actor AND (p_schedule IS NULL OR schedule_id=p_schedule) AND
  (p_after_at IS NULL OR scheduled_for<p_after_at OR scheduled_for=p_after_at AND id>p_after_id) ORDER BY scheduled_for DESC,id LIMIT p_limit+1),visible AS(SELECT * FROM page ORDER BY scheduled_for DESC,id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'owner_user_id',o.owner_user_id,'schedule_id',o.schedule_id,'schedule_name',s.name,'schedule_deleted',s.deleted_at IS NOT NULL,'scheduled_for',o.scheduled_for,'status',o.status,'attempts',o.attempts,'error_code',o.error_code,
   'run_id',CASE WHEN r.id IS NOT NULL THEN o.run_id END,'run_status',r.status,'run_kind',CASE WHEN r.kind='agent' AND r.checkpoint->>'execution_mode'='agent_native_v2' THEN 'agent_autonomous' WHEN r.kind='workflow' AND r.checkpoint->>'execution_mode'='workflow_native_v2' THEN 'workflow_v2' WHEN r.kind='workflow' AND r.checkpoint->>'execution_mode'='start_end_only' THEN 'workflow_safe' END,
  'schedule_revision',o.schedule_revision,'source_sha256',agentstudio.original_schedule_occurrence_sha(o.id,actor)) ORDER BY o.scheduled_for DESC,o.id)
  FROM visible v JOIN agentstudio.schedule_occurrences o ON o.id=v.id AND o.owner_user_id=actor JOIN agentstudio.schedules s ON s.id=o.schedule_id AND s.owner_user_id=actor LEFT JOIN agentstudio.runs r ON r.id=o.run_id AND r.owner_user_id=actor),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page),(SELECT scheduled_for FROM visible ORDER BY scheduled_for,id DESC LIMIT 1),(SELECT id FROM visible ORDER BY scheduled_for,id DESC LIMIT 1) INTO items,more,last_at,last_id;
 RETURN jsonb_build_object('items',items,'has_more',more,'next_after',CASE WHEN more THEN jsonb_build_object('at',last_at,'id',last_id) END,'order','scheduled_desc_id_asc','live_partial_pages',true);
END $fn$;
CREATE FUNCTION agentstudio.original_schedule_workflow_target(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();r jsonb;
BEGIN SELECT jsonb_build_object('id',id,'owner_user_id',actor,'name',name,'revision',revision) INTO r FROM agentstudio.workflows WHERE id=p_id AND owner_user_id=actor;RETURN r;END $fn$;
CREATE FUNCTION agentstudio.original_schedule_workflow_targets(p_after uuid,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid=agentstudio.original_schedule_actor();items jsonb;more boolean;last_id uuid;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_original_schedule_page';END IF;
 WITH page AS(SELECT id,name,revision FROM agentstudio.workflows WHERE owner_user_id=actor AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit+1),visible AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'owner_user_id',actor,'name',name,'revision',revision) ORDER BY id) FROM visible),'[]'::jsonb),(SELECT count(*)>p_limit FROM page),(SELECT id FROM visible ORDER BY id DESC LIMIT 1) INTO items,more,last_id;
 RETURN jsonb_build_object('items',items,'has_more',more,'next_after',CASE WHEN more THEN to_jsonb(last_id) END,'order','id_asc','live_partial_pages',true);
END $fn$;
DO $functions$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'original_schedule_form_valid(jsonb)','original_schedule_actor()','original_schedule_rule(jsonb)','original_schedule_binding(jsonb)',
  'original_schedule_material_sha(uuid,uuid)','original_schedule_occurrence_sha(uuid,uuid)','original_schedule_legacy_form(uuid,uuid)','original_schedule_public_row(uuid,uuid)',
  'original_schedule_begin(uuid,text,jsonb)','original_schedule_put(uuid,jsonb)','original_schedule_tombstone(uuid)','original_schedule_finish(uuid,uuid,uuid)','original_schedule_operation_immutable()','original_schedule_operation_complete()',
  'original_schedule_receipt(uuid)','original_schedule_get(uuid)','original_schedule_list(text,timestamptz,uuid,integer)','original_schedule_history(uuid,timestamptz,uuid,integer)','original_schedule_workflow_target(uuid)','original_schedule_workflow_targets(uuid,integer)'] LOOP
  EXECUTE 'ALTER FUNCTION agentstudio.'||signature||' OWNER TO agentstudio_original_schedules';
  EXECUTE 'REVOKE ALL ON FUNCTION agentstudio.'||signature||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_scheduler,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
 END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.original_schedule_begin(uuid,text,jsonb),agentstudio.original_schedule_put(uuid,jsonb),agentstudio.original_schedule_tombstone(uuid),agentstudio.original_schedule_finish(uuid,uuid,uuid),
 agentstudio.original_schedule_receipt(uuid),agentstudio.original_schedule_get(uuid),agentstudio.original_schedule_list(text,timestamptz,uuid,integer),agentstudio.original_schedule_history(uuid,timestamptz,uuid,integer),agentstudio.original_schedule_workflow_target(uuid),agentstudio.original_schedule_workflow_targets(uuid,integer) TO agentstudio_api;
CREATE INDEX ix_original_schedule_owner_created ON agentstudio.schedules(owner_user_id,created_at DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX ix_original_schedule_history_owner_due ON agentstudio.schedule_occurrences(owner_user_id,scheduled_for DESC,id);
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_078','Original employee schedule full forms,atomic exact receipts and paged retained history; existing044 execution authority reused');
COMMIT;
