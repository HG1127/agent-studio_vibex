-- Owner-only human response journal. No service, login or execution is enabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_047')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_048')
    OR to_regclass('agentstudio.agent_human_input_responses') IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.runs'::regclass AND conname='runs_status_check' AND contype='c')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_release_versions'::regclass AND conname='agent_release_versions_spec_snapshot_check1' AND contype='c' AND convalidated)
  THEN RAISE EXCEPTION 'agent_human_input_requires_reviewed_047'; END IF;
END $preflight$;
ALTER TABLE agentstudio.runs DROP CONSTRAINT runs_status_check;
ALTER TABLE agentstudio.runs ADD CONSTRAINT runs_status_check CHECK(status IN
  ('queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled'));
-- Retain the046 closed snapshot shape and add only an optional strict boolean.
-- Validate the replacement before removing the original combined constraint.
ALTER TABLE agentstudio.agent_release_versions ADD CONSTRAINT agent_release_human_spec_required CHECK(coalesce(
  jsonb_typeof(spec_snapshot)='object' AND spec_snapshot->'require_approval'='true'::jsonb AND jsonb_typeof(spec_snapshot->'goal')='string',false));
ALTER TABLE agentstudio.agent_release_versions ADD CONSTRAINT agent_release_human_spec_fields CHECK(
  spec_snapshot-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria','tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval','require_plan_review']='{}'::jsonb);
ALTER TABLE agentstudio.agent_release_versions ADD CONSTRAINT agent_release_plan_review_boolean CHECK(
  NOT(spec_snapshot?'require_plan_review') OR jsonb_typeof(spec_snapshot->'require_plan_review')='boolean');
ALTER TABLE agentstudio.agent_release_versions DROP CONSTRAINT agent_release_versions_spec_snapshot_check1;
CREATE TABLE agentstudio.agent_human_input_responses(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  request_id uuid NOT NULL,
  parent_step_key text NOT NULL CHECK(length(parent_step_key) BETWEEN 1 AND 160),
  step_key text NOT NULL CHECK(length(step_key) BETWEEN 1 AND 160 AND step_key ~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]+_input$'),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  pending_sha256 text NOT NULL CHECK(pending_sha256 ~ '^[a-f0-9]{64}$'),
  input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN('clarification','plan_review')),
  decision text NOT NULL CHECK(decision IN('reply','approve','revise')),
  answer_sha256 text NOT NULL CHECK(answer_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),
  UNIQUE(run_id,step_key),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  CHECK((kind='clarification')=(decision='reply'))
);
ALTER TABLE agentstudio.agent_human_input_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_human_input_responses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_human_input_responses FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT SELECT ON agentstudio.agent_human_input_responses TO agentstudio_api;
GRANT INSERT(owner_user_id,run_id,request_id,parent_step_key,step_key,source_sha256,pending_sha256,input_sha256,kind,decision,answer_sha256,request_sha256)
  ON agentstudio.agent_human_input_responses TO agentstudio_api;
CREATE POLICY agent_human_input_owner_read ON agentstudio.agent_human_input_responses FOR SELECT TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_human_input_owner_insert ON agentstudio.agent_human_input_responses FOR INSERT TO agentstudio_api
  WITH CHECK(owner_user_id=agentstudio.actor_id());
-- Human waiting retains the existing schedule overlap slot. No new grant.
CREATE OR REPLACE FUNCTION agentstudio.schedule_reserve(p_schedule uuid,p_revision bigint,p_due timestamptz,p_next timestamptz,p_worker text) RETURNS jsonb
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
  -- Paused, approval-pending or human-input work retains its slot until terminal.
  IF EXISTS(SELECT 1 FROM agentstudio.schedule_occurrences prior
    LEFT JOIN agentstudio.runs r ON r.id=prior.run_id AND r.owner_user_id=prior.owner_user_id
    WHERE prior.schedule_id=s.id AND prior.id<>o.id AND prior.status IN('launching','started') AND
      (prior.status='launching' AND prior.lease_until>clock_timestamp() OR r.status IN('queued','running','awaiting_approval','awaiting_input','paused'))) THEN
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
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_048',
  'Owner clarification and explicit plan-review response receipts; no human response is execution or payment authority');
COMMIT;
