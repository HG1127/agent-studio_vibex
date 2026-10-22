-- Experimental migration only: verified model Worker lease -> active owner identity.
-- NOT a public API/HTTP route, production activation, or employee provisioning.
-- Requires separate reviewed bound-dispatch login and mutual transport authentication.
-- NEVER run on BaoTa/production without backup, operator approval and GO/NO-GO.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

DO $preflight$
BEGIN
  IF to_regclass('agentstudio.jobs') IS NULL OR
     to_regclass('agentstudio.users') IS NULL OR
     to_regclass('agentstudio.runs') IS NULL OR
     to_regclass('agentstudio.agent_specs') IS NULL OR
     to_regclass('agentstudio.external_effects') IS NULL OR
     to_regclass('agentstudio.approvals') IS NULL OR
     NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations
       WHERE version='pg_v9_023') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_api') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_worker') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_model_broker')
  THEN
    RAISE EXCEPTION 'bound_dispatch_requires_reviewed_pg_v9_023_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;

DO $role$
DECLARE member_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles
      WHERE rolname='agentstudio_bound_dispatch') THEN
    CREATE ROLE agentstudio_bound_dispatch NOLOGIN NOINHERIT
      NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles
      WHERE rolname='agentstudio_bound_dispatch' AND
        (rolcanlogin OR rolsuper OR rolbypassrls OR rolinherit OR
         rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'unsafe_existing_bound_dispatch_group_role'
      USING ERRCODE='P0001';
  END IF;
  -- pg_has_role() throws when a named role does not exist. Iterate only
  -- over observed roles instead of relying on SQL boolean short-circuiting.
  FOR member_role IN SELECT rolname FROM pg_roles WHERE rolname IN
    ('agentstudio_stage_worker','agentstudio_stage_login',
     'agentstudio_model_broker_login','agentstudio_api',
     'agentstudio_worker','agentstudio_model_broker') LOOP
    IF pg_has_role(member_role,'agentstudio_bound_dispatch','member') THEN
      RAISE EXCEPTION 'bound_dispatch_group_membership_not_isolated'
        USING ERRCODE='P0001';
    END IF;
  END LOOP;
END
$role$;

-- Return only the active verified issuer/subject pair associated with an
-- EXACT active leased model job. NO owner IDs or credentials are supplied by
-- the caller. This is for an independently authenticated, non-public gateway
-- which must use a distinct database login permitted to SET this role.
CREATE OR REPLACE FUNCTION agentstudio.bound_model_lease_identity(
  in_run_id uuid, in_job_id uuid, in_lease_token uuid,
  in_lease_version bigint, in_lease_owner text
) RETURNS TABLE(issuer text, subject text)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,agentstudio
AS $lease_identity$
  SELECT u.external_issuer,u.external_subject
  FROM agentstudio.jobs AS j
  JOIN agentstudio.runs AS r
    ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
  JOIN agentstudio.agent_specs AS spec
    ON spec.id=r.agent_spec_id AND spec.owner_user_id=j.owner_user_id
  JOIN agentstudio.users AS u ON u.id=j.owner_user_id
  JOIN agentstudio.approvals AS a
    ON a.run_id=j.run_id AND a.owner_user_id=j.owner_user_id
    AND a.step_key='model'
  JOIN agentstudio.external_effects AS effect
    ON effect.run_id=j.run_id AND effect.owner_user_id=j.owner_user_id
    AND effect.step_key='model'
  WHERE j.id=in_job_id AND j.run_id=in_run_id
    AND j.kind='run_tick' AND j.payload->>'phase'='model'
    AND j.status='leased' AND j.lease_token=in_lease_token
    AND j.lease_version=in_lease_version
    AND j.lease_owner=in_lease_owner
    AND in_lease_version>0
    AND in_lease_owner ~ '^[A-Za-z0-9_-]{1,120}$'
    AND j.lease_until>clock_timestamp()
    AND r.kind='agent' AND r.status='running'
    AND r.checkpoint->>'stage'='model_running'
    AND (r.checkpoint->>'spec_revision')=(j.payload->>'spec_revision')
    AND spec.revision::text=(j.payload->>'spec_revision')
    AND jsonb_typeof(spec.spec->'model_binding')='object'
    AND effect.status='started'
    AND a.status='approved'
    AND u.status='active'
  LIMIT 1
$lease_identity$;

-- Strip default PUBLIC EXECUTE and never let API, Worker or credential
-- broker call this reverse-identity function. No table grants are added.
REVOKE ALL ON FUNCTION agentstudio.bound_model_lease_identity(
  uuid,uuid,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.bound_model_lease_identity(
  uuid,uuid,uuid,bigint,text)
  FROM agentstudio_api,agentstudio_worker,agentstudio_model_broker;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.bound_model_lease_identity(
  uuid,uuid,uuid,bigint,text) TO agentstudio_bound_dispatch;

DO $verify$
DECLARE fn text :=
  'agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)';
BEGIN
  IF has_function_privilege('agentstudio_api',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_worker',fn,'EXECUTE') OR
     has_function_privilege('agentstudio_model_broker',fn,'EXECUTE') OR
     NOT has_function_privilege('agentstudio_bound_dispatch',fn,'EXECUTE') OR
     has_table_privilege('agentstudio_bound_dispatch','agentstudio.users','SELECT') OR
     has_column_privilege('agentstudio_bound_dispatch',
       'agentstudio.model_connections','api_key_ciphertext','SELECT') THEN
    RAISE EXCEPTION 'bound_dispatch_identity_privilege_invariant_failed'
      USING ERRCODE='P0001';
  END IF;
END
$verify$;

INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_024','Isolated model Worker lease-to-owner identity resolver role')
ON CONFLICT(version) DO NOTHING;
COMMIT;
