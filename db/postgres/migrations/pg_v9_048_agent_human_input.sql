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
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_048',
  'Owner clarification and explicit plan-review response receipts; no human response is execution or payment authority');
COMMIT;
