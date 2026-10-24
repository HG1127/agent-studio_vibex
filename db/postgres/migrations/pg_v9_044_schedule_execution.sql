-- Owner-authorized native scheduling. No service is enabled by this migration.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_043') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_scheduler') THEN
    RAISE EXCEPTION 'native_schedule_requires_reviewed_043_and_new_role'; END IF;
END $preflight$;
CREATE ROLE agentstudio_scheduler NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_scheduler;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_scheduler;
ALTER TABLE agentstudio.schedules ADD COLUMN execution jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agentstudio.schedules ADD COLUMN deleted_at timestamptz;
ALTER TABLE agentstudio.schedule_occurrences DROP CONSTRAINT schedule_occurrences_status_check;
ALTER TABLE agentstudio.schedule_occurrences ADD CONSTRAINT ck_schedule_occurrence_state CHECK(status IN
  ('pending','launching','retryable','failed_start','started','succeeded','failed','skipped','skipped_overlap','cancelled_run','cancelled_schedule','invalid_schedule'));
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN schedule_revision bigint;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN planned_run_id uuid;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN manual boolean NOT NULL DEFAULT false;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=4);
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN lease_owner text;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN lease_token uuid;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN lease_version bigint NOT NULL DEFAULT 0 CHECK(lease_version>=0);
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN lease_until timestamptz;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN next_retry_at timestamptz;
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN error_code text NOT NULL DEFAULT '' CHECK(length(error_code)<=80);
ALTER TABLE agentstudio.schedule_occurrences ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE UNIQUE INDEX ux_native_schedule_planned_run ON agentstudio.schedule_occurrences(planned_run_id) WHERE planned_run_id IS NOT NULL;
CREATE INDEX ix_native_schedule_incomplete ON agentstudio.schedule_occurrences(schedule_id,status) WHERE status IN('launching','started');
REVOKE ALL ON agentstudio.schedule_occurrences FROM agentstudio_api;
GRANT SELECT(id,owner_user_id,schedule_id,scheduled_for,run_id,status,created_at,schedule_revision,planned_run_id,manual,attempts,next_retry_at,error_code,updated_at)
  ON agentstudio.schedule_occurrences TO agentstudio_api;
CREATE TABLE agentstudio.schedule_execution_authorities(
  id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,schedule_id uuid NOT NULL,schedule_revision bigint NOT NULL,
  request_id uuid NOT NULL,source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  max_occurrences integer CHECK(max_occurrences BETWEEN 1 AND 1000000),used_occurrences integer NOT NULL DEFAULT 0 CHECK(used_occurrences>=0),
  max_auto_effects integer NOT NULL CHECK(max_auto_effects BETWEEN 1 AND 10000),expires_at timestamptz,
  allow_paid_knowledge boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(owner_user_id,request_id),UNIQUE(schedule_id,schedule_revision),UNIQUE(id,owner_user_id),
  FOREIGN KEY(schedule_id,owner_user_id) REFERENCES agentstudio.schedules(id,owner_user_id)
);
CREATE TABLE agentstudio.schedule_execution_origins(
  run_id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,authority_id uuid NOT NULL,occurrence_id uuid NOT NULL UNIQUE,
  run_sha256 text NOT NULL CHECK(run_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
  FOREIGN KEY(authority_id,owner_user_id) REFERENCES agentstudio.schedule_execution_authorities(id,owner_user_id),
  FOREIGN KEY(occurrence_id) REFERENCES agentstudio.schedule_occurrences(id)
);
CREATE TABLE agentstudio.schedule_execution_effect_receipts(
  run_id uuid NOT NULL,step_key text NOT NULL CHECK(length(step_key) BETWEEN 1 AND 200),owner_user_id uuid NOT NULL,
  input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),effect_kind text NOT NULL CHECK(effect_kind IN('model','tool','agent')),
  knowledge_charge boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(run_id,step_key),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id)
);
DO $tables$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_execution_authorities','schedule_execution_origins','schedule_execution_effect_receipts'] LOOP
    EXECUTE 'REVOKE ALL ON agentstudio.'||t||' FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker,agentstudio_bound_dispatch,agentstudio_native_auth';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE agentstudio.'||t||' FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT,INSERT ON agentstudio.'||t||' TO agentstudio_scheduler';
    EXECUTE 'CREATE POLICY scheduler_private ON agentstudio.'||t||' TO agentstudio_scheduler USING(true) WITH CHECK(true)';
  END LOOP;
END $tables$;
GRANT UPDATE(used_occurrences) ON agentstudio.schedule_execution_authorities TO agentstudio_scheduler;
GRANT SELECT,UPDATE ON agentstudio.schedules,agentstudio.schedule_occurrences TO agentstudio_scheduler;
GRANT INSERT ON agentstudio.schedule_occurrences TO agentstudio_scheduler;
GRANT SELECT(id,external_issuer,external_subject,status) ON agentstudio.users TO agentstudio_scheduler;
GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,revision,spec) ON agentstudio.agent_specs TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,revision,graph) ON agentstudio.workflows TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,revision,enabled,status,provider,base_url,models) ON agentstudio.model_connections TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,revision,enabled,status,url,method,body_template,timeout_s) ON agentstudio.tool_connections TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,revision,enabled,status,url,catalog) ON agentstudio.mcp_connections TO agentstudio_scheduler;
GRANT SELECT(id,owner_user_id,kind,workflow_id,agent_spec_id,status,instruction,checkpoint) ON agentstudio.runs TO agentstudio_scheduler;
GRANT INSERT(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_scheduler;
DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['schedules','schedule_occurrences','users','agent_specs','workflows','model_connections','tool_connections','mcp_connections','runs','audit_events'] LOOP
    EXECUTE 'CREATE POLICY scheduler_scope ON agentstudio.'||t||' TO agentstudio_scheduler USING(true) WITH CHECK(true)';
  END LOOP;
END $policies$;
CREATE POLICY scheduler_native_active ON agentstudio_auth.accounts TO agentstudio_scheduler USING(true);

CREATE FUNCTION agentstudio.schedule_native_active(p_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT EXISTS(SELECT 1 FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id
    WHERE u.id=p_owner AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled)
$fn$;
CREATE FUNCTION agentstudio.schedule_resource_material(p_schedule uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; target jsonb; children jsonb; material jsonb; refs jsonb;
BEGIN
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule;
  IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  IF s.kind='agent' THEN SELECT jsonb_build_object('id',id,'revision',revision,'spec',spec) INTO target FROM agentstudio.agent_specs WHERE id=s.agent_spec_id AND owner_user_id=s.owner_user_id;
  ELSE SELECT jsonb_build_object('id',id,'revision',revision,'graph',graph) INTO target FROM agentstudio.workflows WHERE id=s.workflow_id AND owner_user_id=s.owner_user_id; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'spec',spec) ORDER BY id),'[]'::jsonb) INTO children
    FROM agentstudio.agent_specs WHERE owner_user_id=s.owner_user_id AND id::text IN
    (SELECT jsonb_array_elements_text(jsonb_path_query_array(target,'$.**.agent_binding.spec_id')));
  material=jsonb_build_object('target',target,'agents',children);
  refs=jsonb_path_query_array(material,'$.**.connection_id');
  RETURN material||jsonb_build_object(
    'models',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,revision,enabled,status,provider,base_url,models) ORDER BY id),'[]'::jsonb) FROM agentstudio.model_connections WHERE owner_user_id=s.owner_user_id AND id::text IN(SELECT jsonb_array_elements_text(refs))),
    'tools',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,revision,enabled,status,url,method,body_template,timeout_s) ORDER BY id),'[]'::jsonb) FROM agentstudio.tool_connections WHERE owner_user_id=s.owner_user_id AND id::text IN(SELECT jsonb_array_elements_text(refs))),
    'mcp',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,revision,enabled,status,url,catalog) ORDER BY id),'[]'::jsonb) FROM agentstudio.mcp_connections WHERE owner_user_id=s.owner_user_id AND id::text IN(SELECT jsonb_array_elements_text(refs))));
END $fn$;
CREATE FUNCTION agentstudio.schedule_resource_sha(p_schedule uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT CASE WHEN agentstudio.schedule_resource_material(p_schedule) IS NOT NULL THEN encode(sha256(convert_to(agentstudio.schedule_resource_material(p_schedule)::text,'UTF8')),'hex') END
$fn$;
CREATE FUNCTION agentstudio.schedule_material_sha(p_schedule uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('owner',s.owner_user_id,'kind',s.kind,'agent',s.agent_spec_id,'workflow',s.workflow_id,
    'revision',s.revision,'zone',s.time_zone,'recurrence',s.recurrence,'execution',s.execution,'resources',agentstudio.schedule_resource_material(s.id))::text,'UTF8')),'hex')
  FROM agentstudio.schedules s WHERE s.id=p_schedule AND s.deleted_at IS NULL
$fn$;
CREATE FUNCTION agentstudio.schedule_authority_current(p_authority uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT coalesce((SELECT a.schedule_revision=s.revision AND s.deleted_at IS NULL AND s.recurrence->>'config_format'='pg_schedule_execution_v2'
    AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()) AND agentstudio.schedule_native_active(a.owner_user_id)
    AND a.source_sha256=agentstudio.schedule_material_sha(s.id) FROM agentstudio.schedule_execution_authorities a JOIN agentstudio.schedules s ON s.id=a.schedule_id AND s.owner_user_id=a.owner_user_id WHERE a.id=p_authority),false)
$fn$;
CREATE FUNCTION agentstudio.schedule_run_sha(p_run uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('owner',owner_user_id,'kind',kind,'workflow',workflow_id,'agent',agent_spec_id,'instruction',instruction,
    'mode',checkpoint->'execution_mode','workflow_revision',checkpoint->'workflow_revision','spec_revision',checkpoint->'spec_revision','graph',checkpoint->'graph')::text,'UTF8')),'hex') FROM agentstudio.runs WHERE id=p_run
$fn$;
CREATE FUNCTION agentstudio.schedule_run_current(p_owner uuid,p_run uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o agentstudio.schedule_execution_origins%ROWTYPE; terminal boolean;
BEGIN
  SELECT * INTO o FROM agentstudio.schedule_execution_origins WHERE run_id=p_run;
  IF o.run_id IS NULL THEN RETURN true; END IF;
  IF o.owner_user_id<>p_owner OR o.run_sha256 IS DISTINCT FROM agentstudio.schedule_run_sha(p_run) OR NOT agentstudio.schedule_native_active(p_owner) THEN RETURN false; END IF;
  SELECT status IN('succeeded','failed','cancelled') INTO terminal FROM agentstudio.runs WHERE id=p_run AND owner_user_id=p_owner;
  RETURN coalesce(terminal,false) OR agentstudio.schedule_authority_current(o.authority_id);
END $fn$;
CREATE FUNCTION agentstudio.schedule_validate_run(p_run uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.schedule_run_current(agentstudio.actor_id(),p_run)
$fn$;
CREATE FUNCTION agentstudio.schedule_automatic_candidate(p_run uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT EXISTS(SELECT 1 FROM agentstudio.schedule_execution_origins WHERE run_id=p_run AND owner_user_id=agentstudio.actor_id())
    AND agentstudio.schedule_run_current(agentstudio.actor_id(),p_run)
$fn$;
CREATE FUNCTION agentstudio.schedule_resource_fingerprint(p_schedule uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.schedule_resource_sha(id) FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=agentstudio.actor_id() AND deleted_at IS NULL
$fn$;
CREATE FUNCTION agentstudio.schedule_activate(p_schedule uuid,p_revision bigint,p_execution jsonb,p_next timestamptz,p_resource_sha text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; owner uuid=agentstudio.actor_id(); a agentstudio.schedule_execution_authorities%ROWTYPE; aid uuid=gen_random_uuid(); exp timestamptz; cap integer;
BEGIN
  IF NOT agentstudio.schedule_native_active(owner) THEN RAISE EXCEPTION 'schedule_owner_unavailable'; END IF;
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=owner AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'schedule_not_found'; END IF;
  IF jsonb_typeof(s.recurrence) IS DISTINCT FROM 'object' OR NOT s.recurrence ?& ARRAY['config_format','execution_supported','rule'] OR
    (SELECT count(*) FROM jsonb_object_keys(s.recurrence))<>3 OR jsonb_typeof(s.recurrence->'rule') IS DISTINCT FROM 'object' OR
    NOT coalesce((s.recurrence->>'config_format'='pg_schedule_draft_v1' AND s.recurrence->'execution_supported'='false'::jsonb) OR
      (s.recurrence->>'config_format'='pg_schedule_execution_v2' AND s.recurrence->'execution_supported'='true'::jsonb),false) THEN RAISE EXCEPTION 'schedule_requires_native_draft'; END IF;
  IF jsonb_typeof(p_execution) IS DISTINCT FROM 'object' OR NOT p_execution ?& ARRAY['instruction','target_revision','max_steps','anchor_at','expires_at','max_occurrences','max_auto_effects','allow_paid_knowledge','background_ack','knowledge_charge_ack'] OR
    (SELECT count(*) FROM jsonb_object_keys(p_execution))<>10 OR jsonb_typeof(p_execution->'instruction') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_execution->'allow_paid_knowledge') IS DISTINCT FROM 'boolean' OR coalesce(p_execution->>'background_ack','')<>'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1' OR
    coalesce(p_execution->>'target_revision','')!~'^[1-9][0-9]{0,15}$' OR coalesce(p_execution->>'max_steps','')!~'^([1-9]|[12][0-9]|30)$' OR
    coalesce(p_execution->>'max_auto_effects','')!~'^[1-9][0-9]{0,4}$' OR jsonb_typeof(p_execution->'anchor_at') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_execution->'target_revision') IS DISTINCT FROM 'number' OR jsonb_typeof(p_execution->'max_steps') IS DISTINCT FROM 'number' OR
    jsonb_typeof(p_execution->'max_auto_effects') IS DISTINCT FROM 'number' OR jsonb_typeof(p_execution->'expires_at') NOT IN('null','string') OR
    jsonb_typeof(p_execution->'max_occurrences') NOT IN('null','number') OR p_request IS NULL OR
    (s.kind='workflow' AND p_execution->>'max_steps'<>'1') OR
    (p_execution->>'allow_paid_knowledge'='true' AND p_execution->>'knowledge_charge_ack' IS DISTINCT FROM 'AUTHORIZE_SCHEDULED_KNOWLEDGE_CHARGES_V1') OR
    (p_execution->>'allow_paid_knowledge'='false' AND p_execution->'knowledge_charge_ack'<>'null'::jsonb) THEN RAISE EXCEPTION 'invalid_schedule_execution'; END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE owner_user_id=owner AND request_id=p_request;
  IF a.id IS NOT NULL THEN
    IF a.schedule_id<>p_schedule OR p_revision<>a.schedule_revision-1 OR s.revision<>a.schedule_revision OR s.execution<>p_execution THEN RAISE EXCEPTION 'schedule_activation_conflict'; END IF;
    RETURN jsonb_build_object('id',s.id,'revision',s.revision,'authority_id',a.id,'replayed',true);
  END IF;
  IF s.revision<>p_revision OR p_next IS NULL OR p_next<clock_timestamp()-interval '90 seconds' OR p_next>clock_timestamp()+interval '367 days' OR
    jsonb_typeof(p_execution)<>'object' OR p_execution->>'background_ack'<>'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1' OR
    length(p_execution->>'instruction') NOT BETWEEN 1 AND 1200 OR (p_execution->>'max_auto_effects')::integer NOT BETWEEN 1 AND 10000 OR
    (p_execution->>'max_steps')::integer NOT BETWEEN 1 AND 30 OR (p_execution->>'target_revision')::bigint<1 OR
    p_execution->>'allow_paid_knowledge' NOT IN('true','false') OR
    (p_execution->>'allow_paid_knowledge'='true' AND p_execution->>'knowledge_charge_ack' IS DISTINCT FROM 'AUTHORIZE_SCHEDULED_KNOWLEDGE_CHARGES_V1') OR
    p_resource_sha IS DISTINCT FROM agentstudio.schedule_resource_sha(s.id) OR
    (agentstudio.schedule_resource_material(s.id)->'target'->>'revision')::bigint<>(p_execution->>'target_revision')::bigint THEN RAISE EXCEPTION 'schedule_activation_changed_or_invalid'; END IF;
  exp=(p_execution->>'expires_at')::timestamptz; cap=(p_execution->>'max_occurrences')::integer;
  IF exp IS NOT NULL AND (exp<=p_next OR exp>clock_timestamp()+interval '366 days') OR cap IS NOT NULL AND cap NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'invalid_schedule_authority_limits'; END IF;
  UPDATE agentstudio.schedules SET execution=p_execution,recurrence=jsonb_set(jsonb_set(recurrence,'{config_format}','"pg_schedule_execution_v2"'),'{execution_supported}','true'),enabled=true,next_at=p_next,
    revision=revision+1,updated_at=clock_timestamp() WHERE id=s.id RETURNING * INTO s;
  UPDATE agentstudio.schedule_occurrences SET status='cancelled_schedule',lease_token=NULL,lease_until=NULL,lease_owner=NULL,updated_at=clock_timestamp() WHERE schedule_id=s.id AND status IN('pending','retryable','launching');
  INSERT INTO agentstudio.schedule_execution_authorities(id,owner_user_id,schedule_id,schedule_revision,request_id,source_sha256,max_occurrences,max_auto_effects,expires_at,allow_paid_knowledge)
    VALUES(aid,owner,s.id,s.revision,p_request,agentstudio.schedule_material_sha(s.id),cap,(p_execution->>'max_auto_effects')::integer,exp,(p_execution->>'allow_paid_knowledge')::boolean);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,'schedule.activate','schedule',s.id::text,'succeeded',jsonb_build_object('revision',s.revision,'authority_id',aid,'max_occurrences',cap,'expires_at',exp));
  RETURN jsonb_build_object('id',s.id,'revision',s.revision,'authority_id',aid,'replayed',false);
END $fn$;

CREATE FUNCTION agentstudio.schedule_make_occurrence(p_schedule uuid,p_due timestamptz,p_manual boolean) RETURNS agentstudio.schedule_occurrences
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; a agentstudio.schedule_execution_authorities%ROWTYPE; o agentstudio.schedule_occurrences%ROWTYPE; rid uuid;
BEGIN
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule FOR UPDATE;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE schedule_id=s.id AND scheduled_for=p_due;
  IF o.id IS NOT NULL THEN RETURN o; END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE schedule_id=s.id AND schedule_revision=s.revision FOR UPDATE;
  IF NOT s.enabled OR NOT agentstudio.schedule_authority_current(a.id) OR a.max_occurrences IS NOT NULL AND a.used_occurrences>=a.max_occurrences THEN RAISE EXCEPTION 'schedule_authority_unavailable'; END IF;
  rid=substr(encode(sha256(convert_to('native_schedule_run:'||s.id::text||':'||(extract(epoch FROM p_due)*1000)::bigint::text,'UTF8')),'hex'),1,32)::uuid;
  INSERT INTO agentstudio.schedule_occurrences(owner_user_id,schedule_id,scheduled_for,status,schedule_revision,planned_run_id,manual)
    VALUES(s.owner_user_id,s.id,p_due,'pending',s.revision,rid,p_manual) RETURNING * INTO o;
  UPDATE agentstudio.schedule_execution_authorities SET used_occurrences=used_occurrences+1 WHERE id=a.id;
  IF a.max_occurrences IS NOT NULL AND a.used_occurrences+1>=a.max_occurrences THEN
    UPDATE agentstudio.schedules SET enabled=false,next_at=NULL,updated_at=clock_timestamp() WHERE id=s.id;
  END IF;
  RETURN o;
END $fn$;
CREATE FUNCTION agentstudio.schedule_run_now(p_schedule uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; o agentstudio.schedule_occurrences%ROWTYPE; due timestamptz=date_trunc('minute',clock_timestamp());
BEGIN
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=agentstudio.actor_id() AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL OR s.revision<>p_revision OR NOT s.enabled THEN RAISE EXCEPTION 'schedule_disabled_or_changed'; END IF;
  IF EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences WHERE schedule_id=s.id AND scheduled_for=due) THEN RAISE EXCEPTION 'schedule_already_queued'; END IF;
  o=agentstudio.schedule_make_occurrence(s.id,due,true);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(s.owner_user_id,s.owner_user_id,'schedule.run_now','schedule',s.id::text,'succeeded',jsonb_build_object('occurrence_id',o.id,'planned_run_id',o.planned_run_id));
  RETURN jsonb_build_object('occurrence_id',o.id,'run_id',o.planned_run_id,'queued',true);
END $fn$;
CREATE FUNCTION agentstudio.schedule_retry_start(p_schedule uuid,p_revision bigint,p_occurrence uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; o agentstudio.schedule_occurrences%ROWTYPE;
BEGIN
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=agentstudio.actor_id() AND revision=p_revision AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE id=p_occurrence AND schedule_id=s.id AND owner_user_id=s.owner_user_id AND status='failed_start' AND schedule_revision=s.revision FOR UPDATE;
  IF o.id IS NULL OR EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=o.planned_run_id) OR
    NOT EXISTS(SELECT 1 FROM agentstudio.schedule_execution_authorities a WHERE a.schedule_id=s.id AND a.schedule_revision=s.revision AND agentstudio.schedule_authority_current(a.id)) THEN RAISE EXCEPTION 'schedule_failed_start_not_retryable'; END IF;
  UPDATE agentstudio.schedule_occurrences SET status='pending',attempts=0,next_retry_at=NULL,lease_owner=NULL,lease_token=NULL,lease_until=NULL,error_code='',updated_at=clock_timestamp() WHERE id=o.id;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(s.owner_user_id,s.owner_user_id,'schedule.retry_start','schedule',s.id::text,'succeeded',jsonb_build_object('occurrence_id',o.id,'planned_run_id',o.planned_run_id));
  RETURN jsonb_build_object('occurrence_id',o.id,'run_id',o.planned_run_id,'queued',true);
END $fn$;
CREATE FUNCTION agentstudio.schedule_peek() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; o agentstudio.schedule_occurrences%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'schedule_worker_required'; END IF;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE
    (attempts<4 AND status IN('pending','retryable') AND coalesce(next_retry_at,'-infinity')<=clock_timestamp() OR status='launching' AND lease_until<clock_timestamp()) ORDER BY created_at,id LIMIT 1;
  IF o.id IS NOT NULL THEN SELECT * INTO s FROM agentstudio.schedules WHERE id=o.schedule_id;
  ELSE SELECT * INTO s FROM agentstudio.schedules WHERE enabled AND deleted_at IS NULL AND recurrence->>'config_format'='pg_schedule_execution_v2'
    AND next_at<=clock_timestamp() ORDER BY next_at,id LIMIT 1; END IF;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',s.id,'revision',s.revision,'rule',s.recurrence->'rule','time_zone',s.time_zone,'anchor_at',s.execution->'anchor_at',
    'due',coalesce(o.scheduled_for,s.next_at),'occurrence_id',o.id,'now',clock_timestamp());
END $fn$;
CREATE FUNCTION agentstudio.schedule_reserve(p_schedule uuid,p_revision bigint,p_due timestamptz,p_next timestamptz,p_worker text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; o agentstudio.schedule_occurrences%ROWTYPE; is_new boolean; a agentstudio.schedule_execution_authorities%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') OR p_worker!~'^[A-Za-z0-9_-]{1,120}$' THEN RAISE EXCEPTION 'schedule_worker_required'; END IF;
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule FOR UPDATE;
  IF s.id IS NULL OR s.revision<>p_revision OR s.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE schedule_id=s.id AND scheduled_for=p_due FOR UPDATE;
  is_new=o.id IS NULL;
  IF o.status='launching' AND o.lease_until<clock_timestamp() AND o.attempts>=4 THEN
    UPDATE agentstudio.schedule_occurrences SET status='failed_start',error_code='schedule_start_lease_exhausted',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=o.id;
    INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
      VALUES(s.owner_user_id,s.owner_user_id,'schedule.start_lease_exhausted','schedule',s.id::text,'failed',jsonb_build_object('occurrence_id',o.id,'attempts',o.attempts));
    RETURN NULL;
  END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE schedule_id=s.id AND schedule_revision=s.revision;
  IF NOT agentstudio.schedule_authority_current(a.id) THEN
    UPDATE agentstudio.schedules SET enabled=false,revision=revision+1,updated_at=clock_timestamp() WHERE id=s.id;
    UPDATE agentstudio.schedule_occurrences SET status='cancelled_schedule',error_code='schedule_source_unavailable',lease_token=NULL,lease_until=NULL,lease_owner=NULL,updated_at=clock_timestamp() WHERE schedule_id=s.id AND status IN('pending','retryable','launching');
    INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
      VALUES(s.owner_user_id,s.owner_user_id,'schedule.source_revoked','schedule',s.id::text,'failed',jsonb_build_object('schedule_revision',s.revision));
    RETURN NULL;
  END IF;
  IF is_new THEN
    IF NOT s.enabled OR s.next_at IS DISTINCT FROM p_due OR p_due>clock_timestamp() THEN RETURN NULL; END IF;
    IF a.max_occurrences IS NOT NULL AND a.used_occurrences>=a.max_occurrences THEN UPDATE agentstudio.schedules SET enabled=false,next_at=NULL,updated_at=clock_timestamp() WHERE id=s.id; RETURN NULL; END IF;
    IF (s.recurrence->'rule'->>'kind'='once' AND p_next IS NOT NULL) OR (s.recurrence->'rule'->>'kind'<>'once' AND
      (p_next IS NULL OR p_next<=clock_timestamp() OR p_next<=p_due OR p_next>clock_timestamp()+interval '9 days')) THEN RAISE EXCEPTION 'invalid_schedule_next_occurrence'; END IF;
    o=agentstudio.schedule_make_occurrence(s.id,p_due,false);
    UPDATE agentstudio.schedules SET next_at=CASE WHEN a.max_occurrences IS NOT NULL AND a.used_occurrences+1>=a.max_occurrences THEN NULL ELSE p_next END,
      enabled=p_next IS NOT NULL AND (a.max_occurrences IS NULL OR a.used_occurrences+1<a.max_occurrences),updated_at=clock_timestamp() WHERE id=s.id;
  ELSIF s.enabled AND s.next_at=p_due AND p_due<=clock_timestamp() THEN
    -- A manual trigger or an older revision may already own this exact due
    -- bucket. Advance the automatic cursor without reserving a second run.
    IF (s.recurrence->'rule'->>'kind'='once' AND p_next IS NOT NULL) OR (s.recurrence->'rule'->>'kind'<>'once' AND
      (p_next IS NULL OR p_next<=clock_timestamp() OR p_next<=p_due OR p_next>clock_timestamp()+interval '9 days')) THEN RAISE EXCEPTION 'invalid_schedule_next_occurrence'; END IF;
    UPDATE agentstudio.schedules SET next_at=p_next,enabled=p_next IS NOT NULL,updated_at=clock_timestamp() WHERE id=s.id;
  END IF;
  IF o.schedule_revision<>s.revision OR o.attempts>=4 OR NOT(o.status IN('pending','retryable') AND coalesce(o.next_retry_at,'-infinity')<=clock_timestamp() OR o.status='launching' AND o.lease_until<clock_timestamp()) THEN RETURN NULL; END IF;
  -- The schedule row lock also serializes reservations before any run exists.
  -- Paused or approval-pending work retains its slot until it is terminal.
  IF EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences prior
    LEFT JOIN agentstudio.runs r ON r.id=prior.run_id AND r.owner_user_id=prior.owner_user_id
    WHERE prior.schedule_id=s.id AND prior.id<>o.id AND prior.status IN('launching','started') AND
      (prior.status='launching' AND prior.lease_until>clock_timestamp() OR r.status IN('queued','running','awaiting_approval','paused'))) THEN
    UPDATE agentstudio.schedule_occurrences SET status='skipped_overlap',error_code='previous_run_incomplete',
      lease_owner=NULL,lease_token=NULL,lease_until=NULL,next_retry_at=NULL,updated_at=clock_timestamp() WHERE id=o.id;
    INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
      VALUES(s.owner_user_id,s.owner_user_id,'schedule.skipped_overlap','schedule',s.id::text,'denied',jsonb_build_object('occurrence_id',o.id,'reason','previous_run_incomplete'));
    RETURN jsonb_build_object('skipped',true,'occurrence_id',o.id,'reason','previous_run_incomplete');
  END IF;
  UPDATE agentstudio.schedule_occurrences SET status='launching',attempts=attempts+1,lease_owner=p_worker,lease_token=gen_random_uuid(),lease_version=lease_version+1,
    lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
  RETURN jsonb_build_object('occurrence_id',o.id,'lease_token',o.lease_token,'lease_version',o.lease_version,'worker_id',p_worker);
END $fn$;
CREATE FUNCTION agentstudio.schedule_launch_context(p_occurrence uuid,p_token uuid,p_version bigint,p_worker text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o agentstudio.schedule_occurrences%ROWTYPE; s agentstudio.schedules%ROWTYPE; a agentstudio.schedule_execution_authorities%ROWTYPE; u jsonb; sid uuid;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') THEN RAISE EXCEPTION 'schedule_worker_required'; END IF;
  SELECT schedule_id INTO sid FROM agentstudio.schedule_occurrences WHERE id=p_occurrence;
  SELECT * INTO s FROM agentstudio.schedules WHERE id=sid FOR SHARE;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE id=p_occurrence AND schedule_id=s.id AND lease_token=p_token AND lease_version=p_version AND lease_owner=p_worker AND status='launching' AND lease_until>clock_timestamp() FOR UPDATE;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE schedule_id=s.id AND schedule_revision=o.schedule_revision;
  IF NOT agentstudio.schedule_authority_current(a.id) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('issuer',external_issuer,'subject',external_subject) INTO u FROM agentstudio.users WHERE id=o.owner_user_id;
  RETURN jsonb_build_object('occurrence_id',o.id,'owner_user_id',o.owner_user_id,'identity',u,'kind',s.kind,'target_id',coalesce(s.agent_spec_id,s.workflow_id),
    'execution',s.execution,'planned_run_id',o.planned_run_id,'authority_id',a.id);
END $fn$;
CREATE FUNCTION agentstudio.schedule_register_origin(p_occurrence uuid,p_token uuid,p_version bigint,p_worker text,p_run uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE ctx jsonb; o agentstudio.schedule_occurrences%ROWTYPE; r agentstudio.runs%ROWTYPE;
BEGIN
  ctx=agentstudio.schedule_launch_context(p_occurrence,p_token,p_version,p_worker);
  IF ctx IS NULL OR (ctx->>'planned_run_id')::uuid<>p_run THEN RETURN false; END IF;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE id=p_occurrence;
  SELECT id,owner_user_id,kind,workflow_id,agent_spec_id,status,instruction,checkpoint INTO r.id,r.owner_user_id,r.kind,r.workflow_id,r.agent_spec_id,r.status,r.instruction,r.checkpoint FROM agentstudio.runs WHERE id=p_run;
  IF r.id IS NULL OR r.owner_user_id<>o.owner_user_id OR r.kind<>ctx->>'kind' OR coalesce(r.workflow_id,r.agent_spec_id)<>(ctx->>'target_id')::uuid OR
    r.instruction<>ctx->'execution'->>'instruction' OR r.checkpoint->>'execution_mode'<>(CASE WHEN r.kind='agent' THEN 'agent_native_v2' ELSE 'workflow_native_v2' END) OR
    (r.checkpoint->>(CASE WHEN r.kind='agent' THEN 'spec_revision' ELSE 'workflow_revision' END))::bigint<>(ctx->'execution'->>'target_revision')::bigint THEN RETURN false; END IF;
  INSERT INTO agentstudio.schedule_execution_origins(run_id,owner_user_id,authority_id,occurrence_id,run_sha256)
    VALUES(r.id,r.owner_user_id,(ctx->>'authority_id')::uuid,o.id,agentstudio.schedule_run_sha(r.id));
  UPDATE agentstudio.schedule_occurrences SET run_id=r.id,status='started',lease_token=NULL,lease_until=NULL,lease_owner=NULL,error_code='',updated_at=clock_timestamp() WHERE id=o.id;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(r.owner_user_id,r.owner_user_id,r.id,'schedule.dispatched','schedule',o.schedule_id::text,'succeeded',jsonb_build_object('occurrence_id',o.id,'schedule_revision',o.schedule_revision));
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.schedule_sync_run_status() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('succeeded','failed','cancelled') THEN
    UPDATE agentstudio.schedule_occurrences o SET
      status=CASE WHEN NEW.status='cancelled' THEN 'cancelled_run' ELSE NEW.status END,updated_at=clock_timestamp()
      FROM agentstudio.schedule_execution_origins x WHERE x.run_id=NEW.id AND x.owner_user_id=NEW.owner_user_id
        AND o.id=x.occurrence_id AND o.run_id=NEW.id AND o.owner_user_id=NEW.owner_user_id AND o.status='started';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER native_schedule_run_status AFTER UPDATE OF status ON agentstudio.runs
  FOR EACH ROW EXECUTE FUNCTION agentstudio.schedule_sync_run_status();
CREATE FUNCTION agentstudio.schedule_launch_failed(p_occurrence uuid,p_token uuid,p_version bigint,p_worker text,p_error text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o agentstudio.schedule_occurrences%ROWTYPE; result text;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') OR p_error!~'^[a-z0-9_]{1,80}$' THEN RAISE EXCEPTION 'invalid_schedule_failure'; END IF;
  SELECT * INTO o FROM agentstudio.schedule_occurrences WHERE id=p_occurrence FOR UPDATE;
  IF o.run_id IS NOT NULL OR EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=o.planned_run_id) THEN RETURN 'already_started'; END IF;
  IF o.lease_token IS DISTINCT FROM p_token OR o.lease_version<>p_version OR o.lease_owner<>p_worker OR o.status<>'launching' THEN RETURN 'stale'; END IF;
  result=CASE WHEN o.attempts>=4 THEN 'failed_start' ELSE 'retryable' END;
  UPDATE agentstudio.schedule_occurrences SET status=result,lease_token=NULL,lease_owner=NULL,lease_until=NULL,error_code=p_error,
    next_retry_at=CASE WHEN result='retryable' THEN clock_timestamp()+make_interval(secs=>least(240,15*power(2,o.attempts-1))::integer) END,updated_at=clock_timestamp() WHERE id=o.id;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(o.owner_user_id,o.owner_user_id,'schedule.start_'||result,'schedule',o.schedule_id::text,'failed',jsonb_build_object('occurrence_id',o.id,'attempts',o.attempts,'error_code',p_error));
  RETURN result;
END $fn$;
CREATE FUNCTION agentstudio.schedule_quarantine(p_schedule uuid,p_revision bigint,p_due timestamptz,p_reason text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') OR p_reason!~'^[a-z0-9_]{1,80}$' THEN RAISE EXCEPTION 'invalid_schedule_quarantine'; END IF;
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule AND revision=p_revision AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL THEN RETURN false; END IF;
  UPDATE agentstudio.schedules SET enabled=false,revision=revision+1,updated_at=clock_timestamp() WHERE id=s.id;
  UPDATE agentstudio.schedule_occurrences SET status='invalid_schedule',error_code=p_reason,lease_token=NULL,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
    WHERE schedule_id=s.id AND status IN('pending','retryable','launching');
  INSERT INTO agentstudio.schedule_occurrences(owner_user_id,schedule_id,scheduled_for,status,schedule_revision,error_code)
    VALUES(s.owner_user_id,s.id,p_due,'invalid_schedule',s.revision,p_reason) ON CONFLICT(schedule_id,scheduled_for) DO NOTHING;
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata)
    VALUES(s.owner_user_id,s.owner_user_id,'schedule.quarantined','schedule',s.id::text,'failed',jsonb_build_object('schedule_revision',s.revision,'error_code',p_reason));
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.schedule_effect_authorize(p_run uuid,p_step text,p_sha text,p_kind text,p_paid boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o agentstudio.schedule_execution_origins%ROWTYPE; a agentstudio.schedule_execution_authorities%ROWTYPE; prior agentstudio.schedule_execution_effect_receipts%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') OR p_sha!~'^[a-f0-9]{64}$' OR length(p_step) NOT BETWEEN 1 AND 200 OR p_kind NOT IN('model','tool','agent') THEN RAISE EXCEPTION 'invalid_schedule_effect_authority'; END IF;
  SELECT * INTO o FROM agentstudio.schedule_execution_origins WHERE run_id=p_run;
  IF o.run_id IS NULL OR NOT agentstudio.schedule_run_current(o.owner_user_id,o.run_id) THEN RETURN false; END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE id=o.authority_id FOR UPDATE;
  IF NOT agentstudio.schedule_authority_current(a.id) OR p_paid AND NOT a.allow_paid_knowledge THEN RETURN false; END IF;
  SELECT * INTO prior FROM agentstudio.schedule_execution_effect_receipts WHERE run_id=p_run AND step_key=p_step;
  IF prior.run_id IS NOT NULL THEN RETURN prior.input_sha256=p_sha AND prior.effect_kind=p_kind AND prior.knowledge_charge=p_paid; END IF;
  IF (SELECT count(*) FROM agentstudio.schedule_execution_effect_receipts WHERE run_id=p_run)>=a.max_auto_effects THEN RETURN false; END IF;
  INSERT INTO agentstudio.schedule_execution_effect_receipts(run_id,step_key,owner_user_id,input_sha256,effect_kind,knowledge_charge) VALUES(p_run,p_step,o.owner_user_id,p_sha,p_kind,p_paid);
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.schedule_control(p_schedule uuid,p_revision bigint,p_action text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid=agentstudio.actor_id(); sid uuid; current_schedule agentstudio.schedules%ROWTYPE;
BEGIN
  IF p_action NOT IN('pause','delete') OR NOT agentstudio.schedule_native_active(owner) THEN RAISE EXCEPTION 'invalid_schedule_control'; END IF;
  SELECT * INTO current_schedule FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=owner AND revision=p_revision AND deleted_at IS NULL FOR UPDATE;
  IF current_schedule.id IS NULL THEN RETURN false; END IF;
  IF p_action='delete' AND NOT coalesce((current_schedule.recurrence->>'config_format'='pg_schedule_draft_v1' AND current_schedule.recurrence->'execution_supported'='false'::jsonb) OR
    (current_schedule.recurrence->>'config_format'='pg_schedule_execution_v2' AND current_schedule.recurrence->'execution_supported'='true'::jsonb),false) THEN RAISE EXCEPTION 'schedule_requires_native_draft'; END IF;
  UPDATE agentstudio.schedules SET enabled=false,revision=revision+1,deleted_at=CASE WHEN p_action='delete' THEN clock_timestamp() ELSE deleted_at END,updated_at=clock_timestamp()
    WHERE id=p_schedule AND owner_user_id=owner AND revision=p_revision AND deleted_at IS NULL RETURNING id INTO sid;
  IF sid IS NULL THEN RETURN false; END IF;
  UPDATE agentstudio.schedule_occurrences SET status='cancelled_schedule',lease_until=NULL,lease_token=NULL,lease_owner=NULL,updated_at=clock_timestamp()
    WHERE schedule_id=sid AND status IN('pending','retryable','launching');
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(owner,owner,'schedule.'||p_action,'schedule',sid::text,'succeeded',jsonb_build_object('revision',p_revision+1));
  RETURN true;
END $fn$;
CREATE FUNCTION agentstudio.schedule_execution_status(p_schedule uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE s agentstudio.schedules%ROWTYPE; a agentstudio.schedule_execution_authorities%ROWTYPE;
BEGIN
  SELECT * INTO s FROM agentstudio.schedules WHERE id=p_schedule AND owner_user_id=agentstudio.actor_id() AND deleted_at IS NULL;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM agentstudio.schedule_execution_authorities WHERE schedule_id=s.id AND schedule_revision=s.revision;
  RETURN jsonb_build_object('schedule_id',s.id,'revision',s.revision,'enabled',s.enabled,'next_at',s.next_at,'authority_id',a.id,'source_current',coalesce(agentstudio.schedule_authority_current(a.id),false),
    'used_occurrences',coalesce(a.used_occurrences,0),'max_occurrences',a.max_occurrences,'expires_at',a.expires_at,'max_auto_effects',a.max_auto_effects,'allow_paid_knowledge',a.allow_paid_knowledge,'execution',s.execution);
END $fn$;

-- Keep originals and their audit contracts intact; add the schedule source fence.
CREATE OR REPLACE FUNCTION agentstudio.knowledge_query_execution_observations_current(p_reader uuid,p_run uuid,p_current_step text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.knowledge_query_execution_observations_before_lineage(p_reader,p_run,p_current_step)
    AND agentstudio.knowledge_lineage_current(p_reader,p_run) AND agentstudio.schedule_run_current(p_reader,p_run)
$fn$;
DO $functions$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'agentstudio.schedule_native_active(uuid)',
    'agentstudio.schedule_resource_material(uuid)',
    'agentstudio.schedule_resource_sha(uuid)',
    'agentstudio.schedule_material_sha(uuid)',
    'agentstudio.schedule_authority_current(uuid)',
    'agentstudio.schedule_run_sha(uuid)',
    'agentstudio.schedule_run_current(uuid,uuid)',
    'agentstudio.schedule_validate_run(uuid)',
    'agentstudio.schedule_automatic_candidate(uuid)',
    'agentstudio.schedule_resource_fingerprint(uuid)',
    'agentstudio.schedule_activate(uuid,bigint,jsonb,timestamptz,text,uuid)',
    'agentstudio.schedule_make_occurrence(uuid,timestamptz,boolean)',
    'agentstudio.schedule_run_now(uuid,bigint)',
    'agentstudio.schedule_retry_start(uuid,bigint,uuid)',
    'agentstudio.schedule_peek()',
    'agentstudio.schedule_reserve(uuid,bigint,timestamptz,timestamptz,text)',
    'agentstudio.schedule_launch_context(uuid,uuid,bigint,text)',
    'agentstudio.schedule_register_origin(uuid,uuid,bigint,text,uuid)',
    'agentstudio.schedule_launch_failed(uuid,uuid,bigint,text,text)',
    'agentstudio.schedule_quarantine(uuid,bigint,timestamptz,text)',
    'agentstudio.schedule_effect_authorize(uuid,text,text,text,boolean)',
    'agentstudio.schedule_control(uuid,bigint,text)',
    'agentstudio.schedule_execution_status(uuid)',
    'agentstudio.schedule_sync_run_status()'
  ] LOOP
    EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO agentstudio_scheduler';
    EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
  END LOOP;
END $functions$;
GRANT EXECUTE ON FUNCTION agentstudio.schedule_run_current(uuid,uuid) TO agentstudio_knowledge_query;
GRANT EXECUTE ON FUNCTION agentstudio.schedule_validate_run(uuid),agentstudio.schedule_automatic_candidate(uuid),agentstudio.schedule_resource_fingerprint(uuid),
  agentstudio.schedule_activate(uuid,bigint,jsonb,timestamptz,text,uuid),agentstudio.schedule_control(uuid,bigint,text) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.schedule_execution_status(uuid),agentstudio.schedule_run_now(uuid,bigint),agentstudio.schedule_retry_start(uuid,bigint,uuid) TO agentstudio_api;
GRANT EXECUTE ON FUNCTION agentstudio.schedule_peek(),agentstudio.schedule_reserve(uuid,bigint,timestamptz,timestamptz,text),
  agentstudio.schedule_launch_context(uuid,uuid,bigint,text),agentstudio.schedule_register_origin(uuid,uuid,bigint,text,uuid),
  agentstudio.schedule_launch_failed(uuid,uuid,bigint,text,text),agentstudio.schedule_quarantine(uuid,bigint,timestamptz,text),
  agentstudio.schedule_effect_authorize(uuid,text,text,text,boolean) TO agentstudio_worker;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_044','Explicit native schedule authority,atomic occurrences and original run-source fencing');
COMMIT;
