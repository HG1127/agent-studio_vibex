-- Proposed isolated upgrade. Preserve reviewed owner/lease/approval/ledger checks.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_029') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_bound_dispatch' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) THEN
    RAISE EXCEPTION 'mcp_tool_identity_requires_reviewed_pg_v9_029';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION agentstudio.workflow_tool_lease_identity(
  in_run_id uuid,in_job_id uuid,in_lease_token uuid,in_lease_version bigint,
  in_lease_owner text,in_step_key text,in_input_sha256 text
) RETURNS TABLE(issuer text,subject text)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,agentstudio
AS $identity$
  SELECT u.external_issuer,u.external_subject
  FROM agentstudio.jobs j
  JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
  JOIN agentstudio.workflows w ON w.id=r.workflow_id AND w.owner_user_id=j.owner_user_id
  JOIN agentstudio.users u ON u.id=j.owner_user_id
  JOIN agentstudio.approvals a ON a.run_id=j.run_id AND a.owner_user_id=j.owner_user_id AND a.step_key=in_step_key
  JOIN agentstudio.external_effects e ON e.run_id=j.run_id AND e.owner_user_id=j.owner_user_id AND e.step_key=in_step_key
  WHERE j.id=in_job_id AND j.run_id=in_run_id AND j.kind='workflow_tick'
    AND j.payload->>'phase'='workflow_native_v2' AND j.status='leased'
    AND j.lease_token=in_lease_token AND j.lease_version=in_lease_version AND in_lease_version>0
    AND j.lease_owner=in_lease_owner AND in_lease_owner ~ '^[A-Za-z0-9_-]{1,120}$'
    AND j.lease_until>clock_timestamp() AND u.status='active'
    AND r.kind='workflow' AND r.status='running'
    AND r.checkpoint->>'execution_mode'='workflow_native_v2'
    AND r.checkpoint->>'stage'='workflow_v2_effect_started'
    AND r.checkpoint->>'workflow_revision'=j.payload->>'workflow_revision'
    AND w.revision::text=j.payload->>'workflow_revision'
    AND r.workflow_id::text=j.payload->>'workflow_id'
    AND r.checkpoint->'machine'->>'format'='workflow_native_v2'
    AND r.checkpoint->'machine'->>'graph_sha256'=j.payload->>'graph_sha256'
    AND r.checkpoint->'machine'->>'instruction'=r.instruction
    AND in_step_key ~ '^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,80}$'
    AND in_input_sha256 ~ '^[a-f0-9]{64}$'
    AND a.status='approved' AND a.reason_code='wf2:'||in_input_sha256
    AND e.status='started' AND e.arguments_sha256=in_input_sha256 AND e.tool_name='workflow:tool'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.checkpoint->'graph'->'nodes') node
      WHERE node->>'id'=substring(in_step_key FROM 11) AND node->>'type'='tool'
        AND (jsonb_typeof(node->'data'->'tool_binding')='object' OR
          jsonb_typeof(node->'data'->'mcp_binding')='object' OR
          node->'data'->>'tool' IN ('calculate','summarize','knowledge_search','web_fetch','web_search')))
  LIMIT 1
$identity$;
REVOKE ALL ON FUNCTION agentstudio.workflow_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text)
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT EXECUTE ON FUNCTION agentstudio.workflow_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text)
  TO agentstudio_bound_dispatch;
DO $verify$
DECLARE fn text:='agentstudio.workflow_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text)';
BEGIN
  IF has_function_privilege('agentstudio_api',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_worker',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_model_broker',fn,'EXECUTE') OR
     NOT has_function_privilege('agentstudio_bound_dispatch',fn,'EXECUTE') OR
     has_table_privilege('agentstudio_bound_dispatch','agentstudio.runs','SELECT') OR
     has_column_privilege('agentstudio_bound_dispatch','agentstudio.model_connections','api_key_ciphertext','SELECT') THEN
    RAISE EXCEPTION 'workflow_tool_identity_privilege_invariant_failed';
  END IF;
END
$verify$;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_030','Admit catalog-pinned MCP Tool nodes through the existing fenced identity');
COMMIT;
