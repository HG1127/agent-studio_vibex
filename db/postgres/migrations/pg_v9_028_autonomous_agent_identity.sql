-- Isolated proposal only: standalone autonomous Agent child identity. No activation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_027') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_bound_dispatch' AND NOT rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) THEN
    RAISE EXCEPTION 'autonomous_agent_identity_requires_reviewed_pg_v9_027';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION agentstudio.autonomous_agent_model_lease_identity(
  in_run_id uuid,in_job_id uuid,in_lease_token uuid,in_lease_version bigint,in_lease_owner text,
  in_step_key text,in_input_sha256 text,in_parent_key text
) RETURNS TABLE(issuer text,subject text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,agentstudio
AS $identity$
  SELECT u.external_issuer,u.external_subject
  FROM agentstudio.jobs j
  JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
  JOIN agentstudio.agent_specs w ON w.id=r.agent_spec_id AND w.owner_user_id=j.owner_user_id
  JOIN agentstudio.users u ON u.id=j.owner_user_id
  JOIN agentstudio.agent_specs s ON s.id=(r.checkpoint->'agent_state'->>'spec_id')::uuid AND s.owner_user_id=j.owner_user_id
  JOIN agentstudio.approvals a ON a.run_id=r.id AND a.owner_user_id=j.owner_user_id AND a.step_key=in_step_key
  JOIN agentstudio.approvals parent ON parent.run_id=r.id AND parent.owner_user_id=j.owner_user_id AND parent.step_key=in_parent_key
  JOIN agentstudio.external_effects e ON e.run_id=r.id AND e.owner_user_id=j.owner_user_id AND e.step_key=in_step_key
  WHERE j.id=in_job_id AND j.run_id=in_run_id AND j.kind='run_tick' AND j.payload->>'phase'='agent_native_v2'
    AND j.status='leased' AND j.lease_token=in_lease_token AND j.lease_version=in_lease_version AND in_lease_version>0
    AND j.lease_owner=in_lease_owner AND in_lease_owner ~ '^[A-Za-z0-9_-]{1,120}$' AND j.lease_until>clock_timestamp()
    AND u.status='active' AND r.kind='agent' AND r.workflow_id IS NULL AND r.agent_spec_id=s.id AND r.status='running' AND r.checkpoint->>'execution_mode'='agent_native_v2'
    AND r.checkpoint->>'stage'='agent_v2_effect_started' AND r.checkpoint->>'spec_revision'=j.payload->>'spec_revision'
    AND w.revision::text=j.payload->>'spec_revision' AND r.agent_spec_id::text=j.payload->>'agent_spec_id'
    AND r.checkpoint->'machine'->>'graph_sha256'=j.payload->>'graph_sha256'
    AND r.checkpoint->'machine'->>'instruction'=r.instruction AND r.checkpoint->'machine'->>'format'='workflow_native_v2'
    AND r.checkpoint->'agent_state'->>'format'='workflow_agent_v2'
    AND s.revision::text=r.checkpoint->'agent_state'->>'spec_revision'
    AND r.checkpoint->'agent_state'->>'parent_step_key'=in_parent_key
    AND r.checkpoint->'agent_state'->>'snapshot_sha256' ~ '^[a-f0-9]{64}$'
    AND in_parent_key='wf2_00002_agent'
    AND in_step_key ~ ('^'||in_parent_key||'_a(0[1-9]|[12][0-9]|30)m$') AND in_input_sha256 ~ '^[a-f0-9]{64}$'
    AND r.checkpoint->'agent_dispatch'->>'step_key'=in_step_key AND r.checkpoint->'agent_dispatch'->>'kind'='model'
    AND r.checkpoint->'agent_dispatch'->>'input_sha256'=in_input_sha256
    AND r.checkpoint->'agent_dispatch'->>'parent_step_key'=in_parent_key
    AND parent.status='approved' AND parent.reason_code='wf2:'||(r.checkpoint->'agent_state'->>'parent_input_sha256')
    AND a.status='approved' AND a.reason_code='wf2:'||in_input_sha256
    AND e.status='started' AND e.arguments_sha256=in_input_sha256 AND e.tool_name='workflow:model'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') node
      WHERE node->>'id'=substring(in_parent_key FROM 11) AND node->>'type'='agent'
        AND node->'data'->'agent_binding'->>'spec_id'=s.id::text AND node->'data'->'agent_binding'->>'spec_revision'=s.revision::text)
  LIMIT 1
$identity$;
REVOKE ALL ON FUNCTION agentstudio.autonomous_agent_model_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.autonomous_agent_model_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text) TO agentstudio_bound_dispatch;
DO $verify$
DECLARE fn text:='agentstudio.autonomous_agent_model_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)';
BEGIN
  IF has_function_privilege('agentstudio_api',fn,'EXECUTE') OR has_function_privilege('agentstudio_worker',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_model_broker',fn,'EXECUTE') OR NOT has_function_privilege('agentstudio_bound_dispatch',fn,'EXECUTE') OR
     has_table_privilege('agentstudio_bound_dispatch','agentstudio.runs','SELECT') THEN
    RAISE EXCEPTION 'autonomous_agent_identity_privilege_invariant_failed';
  END IF;
END
$verify$;


CREATE OR REPLACE FUNCTION agentstudio.autonomous_agent_tool_lease_identity(
  in_run_id uuid,in_job_id uuid,in_lease_token uuid,in_lease_version bigint,in_lease_owner text,
  in_step_key text,in_input_sha256 text,in_parent_key text
) RETURNS TABLE(issuer text,subject text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,agentstudio
AS $identity$
  SELECT u.external_issuer,u.external_subject
  FROM agentstudio.jobs j
  JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
  JOIN agentstudio.agent_specs w ON w.id=r.agent_spec_id AND w.owner_user_id=j.owner_user_id
  JOIN agentstudio.users u ON u.id=j.owner_user_id
  JOIN agentstudio.agent_specs s ON s.id=(r.checkpoint->'agent_state'->>'spec_id')::uuid AND s.owner_user_id=j.owner_user_id
  JOIN agentstudio.approvals a ON a.run_id=r.id AND a.owner_user_id=j.owner_user_id AND a.step_key=in_step_key
  JOIN agentstudio.approvals parent ON parent.run_id=r.id AND parent.owner_user_id=j.owner_user_id AND parent.step_key=in_parent_key
  JOIN agentstudio.external_effects e ON e.run_id=r.id AND e.owner_user_id=j.owner_user_id AND e.step_key=in_step_key
  WHERE j.id=in_job_id AND j.run_id=in_run_id AND j.kind='run_tick' AND j.payload->>'phase'='agent_native_v2'
    AND j.status='leased' AND j.lease_token=in_lease_token AND j.lease_version=in_lease_version AND in_lease_version>0
    AND j.lease_owner=in_lease_owner AND in_lease_owner ~ '^[A-Za-z0-9_-]{1,120}$' AND j.lease_until>clock_timestamp()
    AND u.status='active' AND r.kind='agent' AND r.workflow_id IS NULL AND r.agent_spec_id=s.id AND r.status='running' AND r.checkpoint->>'execution_mode'='agent_native_v2'
    AND r.checkpoint->>'stage'='agent_v2_effect_started' AND r.checkpoint->>'spec_revision'=j.payload->>'spec_revision'
    AND w.revision::text=j.payload->>'spec_revision' AND r.agent_spec_id::text=j.payload->>'agent_spec_id'
    AND r.checkpoint->'machine'->>'graph_sha256'=j.payload->>'graph_sha256'
    AND r.checkpoint->'machine'->>'instruction'=r.instruction AND r.checkpoint->'machine'->>'format'='workflow_native_v2'
    AND r.checkpoint->'agent_state'->>'format'='workflow_agent_v2'
    AND s.revision::text=r.checkpoint->'agent_state'->>'spec_revision'
    AND r.checkpoint->'agent_state'->>'parent_step_key'=in_parent_key
    AND r.checkpoint->'agent_state'->>'snapshot_sha256' ~ '^[a-f0-9]{64}$'
    AND in_parent_key='wf2_00002_agent'
    AND in_step_key ~ ('^'||in_parent_key||'_a(0[1-9]|[12][0-9]|30)t$') AND in_input_sha256 ~ '^[a-f0-9]{64}$'
    AND r.checkpoint->'agent_dispatch'->>'step_key'=in_step_key AND r.checkpoint->'agent_dispatch'->>'kind'='tool'
    AND r.checkpoint->'agent_dispatch'->>'input_sha256'=in_input_sha256
    AND r.checkpoint->'agent_dispatch'->>'parent_step_key'=in_parent_key
    AND parent.status='approved' AND parent.reason_code='wf2:'||(r.checkpoint->'agent_state'->>'parent_input_sha256')
    AND a.status='approved' AND a.reason_code='wf2:'||in_input_sha256
    AND e.status='started' AND e.arguments_sha256=in_input_sha256 AND e.tool_name='workflow:tool'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') node
      WHERE node->>'id'=substring(in_parent_key FROM 11) AND node->>'type'='agent'
        AND node->'data'->'agent_binding'->>'spec_id'=s.id::text AND node->'data'->'agent_binding'->>'spec_revision'=s.revision::text)
  LIMIT 1
$identity$;
REVOKE ALL ON FUNCTION agentstudio.autonomous_agent_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.autonomous_agent_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text) TO agentstudio_bound_dispatch;
DO $verify$
DECLARE fn text:='agentstudio.autonomous_agent_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text,text)';
BEGIN
  IF has_function_privilege('agentstudio_api',fn,'EXECUTE') OR has_function_privilege('agentstudio_worker',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_model_broker',fn,'EXECUTE') OR NOT has_function_privilege('agentstudio_bound_dispatch',fn,'EXECUTE') OR
     has_table_privilege('agentstudio_bound_dispatch','agentstudio.runs','SELECT') THEN
    RAISE EXCEPTION 'autonomous_agent_identity_privilege_invariant_failed';
  END IF;
END
$verify$;

INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_028','Private autonomous Agent child identity; no activation') ON CONFLICT(version) DO NOTHING;
COMMIT;
