-- Optional internal paid-review admission/privacy foundation. No provider,
-- Worker lease, output publication, HTTP route or production activation.
BEGIN;
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery() OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_055')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_056')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,13)='agent_review_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND left(p.proname,13)='agent_review_')
  THEN RAISE EXCEPTION 'agent_review_installation_refused'; END IF;
END $check$;

CREATE TABLE agentstudio.agent_review_requests(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,spec_id uuid NOT NULL,run_id uuid NOT NULL,purpose text NOT NULL,
  request_sha256 text NOT NULL,input_sha256 text NOT NULL,content_sha256 text NOT NULL,owner_epoch bigint NOT NULL,source_protocol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT
);
-- Only the closed prepared choice/messages are private. API/old Workers have
-- no SELECT or write privileges on this body table; hashes survive erasure.
CREATE TABLE agentstudio.agent_review_inputs(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_review_feedback_sources(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,feedback_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id,feedback_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_review_jobs(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,state text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_review_controls(
  owner_user_id uuid NOT NULL,control_id uuid NOT NULL,request_id uuid NOT NULL,action text NOT NULL,request_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,control_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_review_tombstones(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_review_requests(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE FUNCTION agentstudio.agent_review_digest(jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(agentstudio.agent_optimization_compact($1),'UTF8')),'hex')
$fn$;
CREATE FUNCTION agentstudio.agent_review_record(jsonb,jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; rid uuid; sid uuid; runid uuid; epoch bigint; intent jsonb; prepared jsonb; choice jsonb; source jsonb;
  request_hash text; content_hash text; input_hash text; source_hash text; source_protocol text; original record; role_row record; task record; model record; binding jsonb; locked_run uuid;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'agent_review_native_employee_required'; END IF;
  owner:=agentstudio.actor_id();intent:=$1;prepared:=$2;
  IF (jsonb_typeof(intent)='object' AND intent-ARRAY['action','purpose','spec_id','run_id','expected_source_sha256','expected_spec_revision','expected_spec_sha256','model_binding','output_token_limit','feedback_sources','evaluation_sources','request_id','expected_input_sha256','confirm','fee_acknowledgement']='{}'::jsonb
    AND (SELECT count(*) FROM jsonb_object_keys(intent))=15 AND intent->>'action'='submit' AND intent->'confirm'='true'::jsonb
    AND intent->>'purpose' IN('evaluate','optimize') AND intent->>'fee_acknowledgement'=CASE intent->>'purpose' WHEN 'evaluate' THEN 'APPROVE_ONE_PAID_AGENT_EVALUATION_V1' ELSE 'APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1' END
    AND intent->>'expected_source_sha256' ~ '^[a-f0-9]{64}$' AND intent->>'expected_spec_sha256' ~ '^[a-f0-9]{64}$' AND intent->>'expected_input_sha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(intent->'expected_spec_revision')='number' AND intent->>'expected_spec_revision' ~ '^[1-9][0-9]*$' AND (intent->>'expected_spec_revision')::numeric BETWEEN 1 AND 9007199254740989
    AND intent->'output_token_limit' IN('2048'::jsonb,'4096'::jsonb,'8192'::jsonb,'16384'::jsonb)) IS NOT TRUE
  THEN RAISE EXCEPTION 'agent_review_invalid_intent'; END IF;
  rid:=(intent->>'request_id')::uuid;sid:=(intent->>'spec_id')::uuid;runid:=(intent->>'run_id')::uuid;
  IF owner IS NULL OR intent->>'request_id'<>rid::text OR intent->>'spec_id'<>sid::text OR intent->>'run_id'<>runid::text THEN RAISE EXCEPTION 'agent_review_invalid_intent'; END IF;
  request_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_intent_v1')||intent);
  epoch:=agentstudio.agent_memory_outcome_epoch();
  IF epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740989 THEN RAISE EXCEPTION 'agent_review_native_employee_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||rid::text,561));
  SELECT * INTO original FROM agentstudio.agent_review_requests WHERE owner_user_id=owner AND request_id=rid;
  IF FOUND THEN
    IF original.request_sha256<>request_hash THEN RAISE EXCEPTION 'agent_review_request_conflict'; END IF;
    RETURN rid; -- readonly original confirmation, including erased bodies
  END IF;
  choice:=(intent-ARRAY['request_id','expected_input_sha256','confirm','fee_acknowledgement'])||jsonb_build_object('action','preview');
  IF (jsonb_typeof(choice->'feedback_sources')='array' AND jsonb_array_length(choice->'feedback_sources')<=8
    AND jsonb_typeof(choice->'evaluation_sources')='array' AND jsonb_array_length(choice->'evaluation_sources')=0
    AND (choice->>'purpose'='evaluate' AND jsonb_array_length(choice->'feedback_sources')=0 OR choice->>'purpose'='optimize' AND jsonb_array_length(choice->'feedback_sources')>0)) IS NOT TRUE
  THEN RAISE EXCEPTION 'agent_review_evaluation_source_unavailable'; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(choice->'feedback_sources') LOOP
    IF (jsonb_typeof(source)='object' AND source-ARRAY['run_id','feedback_id','feedback_sha256']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(source))=3
      AND source->>'feedback_sha256' ~ '^[a-f0-9]{64}$' AND source->>'feedback_id'=(source->>'feedback_id')::uuid::text AND source->>'run_id'=(source->>'run_id')::uuid::text AND source->>'feedback_id'<>rid::text) IS NOT TRUE
    THEN RAISE EXCEPTION 'agent_review_invalid_intent'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'feedback_id') FROM jsonb_array_elements(choice->'feedback_sources'))<>jsonb_array_length(choice->'feedback_sources')
    OR (SELECT count(DISTINCT value->>'run_id') FROM jsonb_array_elements(choice->'feedback_sources'))<>jsonb_array_length(choice->'feedback_sources') THEN RAISE EXCEPTION 'agent_review_invalid_intent'; END IF;
  FOR locked_run IN SELECT DISTINCT id FROM (SELECT runid AS id UNION ALL SELECT (value->>'run_id')::uuid FROM jsonb_array_elements(choice->'feedback_sources')) s ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||locked_run::text,540));
  END LOOP;
  SELECT * INTO task FROM agentstudio.runs WHERE id=runid AND owner_user_id=owner AND agent_spec_id=sid AND kind='agent' AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_review_source_unavailable'; END IF;
  SELECT * INTO role_row FROM agentstudio.agent_specs WHERE id=sid AND owner_user_id=owner FOR SHARE;
  IF NOT FOUND OR role_row.revision<>(intent->>'expected_spec_revision')::bigint OR role_row.spec->'require_approval' IS DISTINCT FROM 'true'::jsonb OR
    agentstudio.agent_optimization_role_sha(role_row.id,owner,role_row.name,role_row.revision,role_row.spec) IS DISTINCT FROM intent->>'expected_spec_sha256' THEN RAISE EXCEPTION 'agent_review_source_unavailable'; END IF;
  binding:=choice->'model_binding';
  IF (jsonb_typeof(binding)='object' AND binding-ARRAY['connection_id','connection_revision','model_id']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(binding))=3
    AND binding->>'connection_id'=(binding->>'connection_id')::uuid::text AND jsonb_typeof(binding->'connection_revision')='number' AND binding->>'connection_revision' ~ '^[1-9][0-9]*$'
    AND (binding->>'connection_revision')::numeric BETWEEN 1 AND 9007199254740989 AND jsonb_typeof(binding->'model_id')='string') IS NOT TRUE THEN RAISE EXCEPTION 'agent_review_invalid_intent'; END IF;
  SELECT revision,enabled,status,models INTO model FROM agentstudio.model_connections WHERE id=(binding->>'connection_id')::uuid AND owner_user_id=owner FOR SHARE;
  IF NOT FOUND OR NOT model.enabled OR model.status<>'ok' OR model.revision<>(binding->>'connection_revision')::bigint OR NOT model.models ? (binding->>'model_id') THEN RAISE EXCEPTION 'agent_review_model_unavailable'; END IF;
  IF intent->>'purpose'='evaluate' THEN
    source_protocol:='current_task_delivery_v1';source_hash:=agentstudio.agent_feedback_run_source_sha256(runid);
    IF EXISTS(SELECT 1 FROM agentstudio.external_effects WHERE owner_user_id=owner AND run_id=runid AND status IN('started','unknown')) THEN RAISE EXCEPTION 'agent_review_source_unavailable'; END IF;
  ELSE
    source_protocol:='employee_statement_anchor_v1';
    source_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_review_statement_anchor_v1','owner',owner,'spec_id',sid,'run_id',runid,'status',task.status,'finished_at',to_char(task.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  END IF;
  IF source_hash IS DISTINCT FROM intent->>'expected_source_sha256' THEN RAISE EXCEPTION 'agent_review_source_unavailable'; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(choice->'feedback_sources') LOOP
    IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id
      JOIN agentstudio.runs t ON t.id=r.run_id AND t.owner_user_id=r.owner_user_id AND t.agent_spec_id=r.spec_id
      WHERE r.owner_user_id=owner AND r.request_id=(source->>'feedback_id')::uuid AND r.spec_id=sid AND r.run_id=(source->>'run_id')::uuid AND r.action='submit' AND r.feedback_sha256=source->>'feedback_sha256'
      AND t.kind='agent' AND t.status IN('succeeded','failed','cancelled') AND t.finished_at IS NOT NULL
      AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=owner AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision))
    THEN RAISE EXCEPTION 'agent_review_feedback_changed'; END IF;
  END LOOP;
  IF (jsonb_typeof(prepared)='object' AND prepared-ARRAY['protocol','choice','messages','owner_epoch','source_protocol','content_sha256','input_sha256','byte_length','output_token_limit','recorded']='{}'::jsonb
    AND (SELECT count(*) FROM jsonb_object_keys(prepared))=10 AND prepared->>'protocol'='agent_paid_review_prepared_input_v1' AND prepared->'choice'=choice
    AND prepared->'owner_epoch'=to_jsonb(epoch) AND prepared->>'source_protocol'=source_protocol AND prepared->'recorded'='false'::jsonb
    AND prepared->'output_token_limit'=intent->'output_token_limit' AND jsonb_typeof(prepared->'messages')='array' AND jsonb_array_length(prepared->'messages')=2
    AND prepared->'messages'->0->>'role'='system' AND prepared->'messages'->1->>'role'='user' AND jsonb_typeof(prepared->'messages'->0->'content')='string' AND jsonb_typeof(prepared->'messages'->1->'content')='string'
    AND (prepared->'messages'->0)-ARRAY['role','content']='{}'::jsonb AND (prepared->'messages'->1)-ARRAY['role','content']='{}'::jsonb) IS NOT TRUE THEN RAISE EXCEPTION 'agent_review_input_changed'; END IF;
  content_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_input_v1','choice',choice,'messages',prepared->'messages'));
  input_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_prepared_input_v1','owner',owner,'owner_epoch',epoch,'source_protocol',source_protocol,'content_sha256',content_hash));
  IF content_hash IS DISTINCT FROM prepared->>'content_sha256' OR input_hash IS DISTINCT FROM prepared->>'input_sha256' OR input_hash IS DISTINCT FROM intent->>'expected_input_sha256'
    OR octet_length(agentstudio.agent_optimization_compact(jsonb_build_object('protocol','agent_paid_review_input_v1','choice',choice,'messages',prepared->'messages')))>262144
    OR prepared->'byte_length' IS DISTINCT FROM to_jsonb(octet_length(agentstudio.agent_optimization_compact(jsonb_build_object('protocol','agent_paid_review_input_v1','choice',choice,'messages',prepared->'messages')))) THEN RAISE EXCEPTION 'agent_review_input_changed'; END IF;
  INSERT INTO agentstudio.agent_review_requests(owner_user_id,request_id,spec_id,run_id,purpose,request_sha256,input_sha256,content_sha256,owner_epoch,source_protocol) VALUES(owner,rid,sid,runid,intent->>'purpose',request_hash,input_hash,content_hash,epoch,source_protocol);
  INSERT INTO agentstudio.agent_review_inputs(owner_user_id,request_id,body) VALUES(owner,rid,jsonb_build_object('choice',choice,'messages',prepared->'messages'));
  INSERT INTO agentstudio.agent_review_feedback_sources(owner_user_id,request_id,feedback_id) SELECT owner,rid,(value->>'feedback_id')::uuid FROM jsonb_array_elements(choice->'feedback_sources');
  INSERT INTO agentstudio.agent_review_jobs(owner_user_id,request_id,state) VALUES(owner,rid,'pending');
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,runid,'agent_review.submitted','agent_review',rid::text,'succeeded',jsonb_build_object('request_sha256',request_hash,'input_sha256',input_hash,'purpose',intent->>'purpose','provider_effect_reserved',false));
  RETURN rid;
END $fn$;

CREATE FUNCTION agentstudio.agent_review_control(jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner uuid; cid uuid; rid uuid; request_hash text; original record; review record; epoch bigint;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'agent_review_native_employee_required'; END IF;
  owner:=agentstudio.actor_id();epoch:=agentstudio.agent_memory_outcome_epoch();
  IF owner IS NULL OR epoch IS NULL THEN RAISE EXCEPTION 'agent_review_native_employee_required'; END IF;
  IF (jsonb_typeof($1)='object' AND $1-ARRAY['action','request_id','review_id','expected_request_sha256','confirm']='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys($1))=5
    AND $1->>'action' IN('cancel','erase') AND $1->'confirm'='true'::jsonb AND $1->>'expected_request_sha256' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'agent_review_invalid_control'; END IF;
  cid:=($1->>'request_id')::uuid;rid:=($1->>'review_id')::uuid;
  IF cid IS NULL OR rid IS NULL OR cid=rid OR $1->>'request_id'<>cid::text OR $1->>'review_id'<>rid::text THEN RAISE EXCEPTION 'agent_review_invalid_control'; END IF;
  request_hash:=agentstudio.agent_review_digest(jsonb_build_object('protocol','agent_paid_review_control_v1')||$1);
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||cid::text,562));
  SELECT * INTO original FROM agentstudio.agent_review_controls WHERE owner_user_id=owner AND control_id=cid;
  IF FOUND THEN
    IF original.request_sha256<>request_hash THEN RAISE EXCEPTION 'agent_review_request_conflict'; END IF;RETURN cid;
  END IF;
  SELECT * INTO review FROM agentstudio.agent_review_requests WHERE owner_user_id=owner AND request_id=rid FOR UPDATE;
  IF NOT FOUND OR review.request_sha256 IS DISTINCT FROM $1->>'expected_request_sha256' THEN RAISE EXCEPTION 'agent_review_receipt_not_found'; END IF;
  IF $1->>'action'='erase' THEN
    INSERT INTO agentstudio.agent_review_tombstones(owner_user_id,request_id,reason) VALUES(owner,rid,'employee_erasure') ON CONFLICT DO NOTHING;
    DELETE FROM agentstudio.agent_review_inputs WHERE owner_user_id=owner AND request_id=rid;
    UPDATE agentstudio.agent_review_jobs SET state='erased' WHERE owner_user_id=owner AND request_id=rid;
  ELSE
    UPDATE agentstudio.agent_review_jobs SET state='cancelled' WHERE owner_user_id=owner AND request_id=rid AND state='pending';
  END IF;
  INSERT INTO agentstudio.agent_review_controls(owner_user_id,control_id,request_id,action,request_sha256) VALUES(owner,cid,rid,$1->>'action',request_hash);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(owner,owner,review.run_id,'agent_review.'||($1->>'action'),'agent_review',rid::text,'succeeded',jsonb_build_object('control_id',cid,'request_sha256',request_hash));
  RETURN cid;
END $fn$;

CREATE FUNCTION agentstudio.agent_review_feedback_erasure() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE review record;
BEGIN
  -- The existing054 BEFORE DELETE guard retains its original exact hash.
  -- Stable review locking never waits for an additional run mutex.
  FOR review IN SELECT r.* FROM agentstudio.agent_review_requests r JOIN agentstudio.agent_review_feedback_sources s
    ON s.owner_user_id=r.owner_user_id AND s.request_id=r.request_id WHERE s.owner_user_id=OLD.owner_user_id AND s.feedback_id=OLD.feedback_id ORDER BY r.request_id FOR UPDATE OF r LOOP
    INSERT INTO agentstudio.agent_review_tombstones(owner_user_id,request_id,reason) VALUES(review.owner_user_id,review.request_id,'feedback_erasure') ON CONFLICT DO NOTHING;
    DELETE FROM agentstudio.agent_review_inputs WHERE owner_user_id=review.owner_user_id AND request_id=review.request_id;
    UPDATE agentstudio.agent_review_jobs SET state='erased' WHERE owner_user_id=review.owner_user_id AND request_id=review.request_id;
    INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
      VALUES(review.owner_user_id,review.owner_user_id,review.run_id,'agent_review.source_erased','agent_review',review.request_id::text,'succeeded',jsonb_build_object('feedback_id',OLD.feedback_id));
  END LOOP;
  RETURN OLD;
END $fn$;
CREATE TRIGGER agent_review_feedback_privacy AFTER DELETE ON agentstudio.agent_feedback_bodies FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_review_feedback_erasure();

REVOKE ALL ON FUNCTION agentstudio.agent_review_digest(jsonb),agentstudio.agent_review_record(jsonb,jsonb),agentstudio.agent_review_control(jsonb),agentstudio.agent_review_feedback_erasure()
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_review_record(jsonb,jsonb),agentstudio.agent_review_control(jsonb) TO agentstudio_api;
DO $acl$ DECLARE item text;BEGIN
  FOREACH item IN ARRAY ARRAY['agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones'] LOOP
    EXECUTE format('ALTER TABLE agentstudio.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('ALTER TABLE agentstudio.%I FORCE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON agentstudio.%I FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch',item);
    IF item<>'agent_review_inputs' THEN
      EXECUTE format('GRANT SELECT ON agentstudio.%I TO agentstudio_api',item);
      EXECUTE format('CREATE POLICY %I ON agentstudio.%I FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id())',item||'_read',item);
    END IF;
  END LOOP;
END $acl$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_056','Optional internal review request/private input/queue and atomic source erasure; no provider, lease or output activation');
COMMIT;

