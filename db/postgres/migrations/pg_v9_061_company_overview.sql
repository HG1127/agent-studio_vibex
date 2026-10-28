-- Optional CT03 company metadata only. No runtime/default-fresh activation.
-- Existing001..060 routines, owner policies and raw API privileges are unchanged.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $check$
DECLARE d record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=current_user::regrole AND rolsuper)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,current_user::regrole,'MEMBER'))
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_060')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_061')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_company_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE starts_with(proname,'company_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,'company_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,'company_') OR starts_with(typname,'_company_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'company_'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace))
  THEN RAISE EXCEPTION 'company_projection_installation_refused'; END IF;
  FOR d IN SELECT * FROM (VALUES
    ('agentstudio.users','id','uuid',true),('agentstudio.users','external_issuer','text',true),
    ('agentstudio.users','display_name','text',true),('agentstudio.users','status','text',true),
    ('agentstudio_auth.accounts','user_id','uuid',true),('agentstudio_auth.accounts','enabled','boolean',true),('agentstudio_auth.accounts','is_admin','boolean',true),
    ('agentstudio.runs','owner_user_id','uuid',true),('agentstudio.runs','kind','text',true),('agentstudio.runs','status','text',true),('agentstudio.runs','created_at','timestamp with time zone',true),
    ('agentstudio.schedules','owner_user_id','uuid',true),('agentstudio.schedules','enabled','boolean',true),('agentstudio.schedules','deleted_at','timestamp with time zone',false),('agentstudio.schedules','next_at','timestamp with time zone',false),
    ('agentstudio.knowledge_bases','owner_user_id','uuid',true)
  ) AS v(relation,column_name,type_name,required) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      WHERE c.oid=to_regclass(d.relation) AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
        AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner)
        AND a.attname=d.column_name AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=d.type_name AND a.attnotnull=d.required)
    THEN RAISE EXCEPTION 'company_projection_dependencies_unavailable'; END IF;
  END LOOP;
END $check$;

CREATE ROLE agentstudio_company_metadata_reader NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_company_metadata_reader;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_company_metadata_reader;
GRANT SELECT(id,external_issuer,display_name,status) ON agentstudio.users TO agentstudio_company_metadata_reader;
GRANT SELECT(user_id,enabled,is_admin) ON agentstudio_auth.accounts TO agentstudio_company_metadata_reader;
GRANT SELECT(owner_user_id,kind,status,created_at) ON agentstudio.runs TO agentstudio_company_metadata_reader;
GRANT SELECT(owner_user_id,enabled,deleted_at,next_at) ON agentstudio.schedules TO agentstudio_company_metadata_reader;
GRANT SELECT(owner_user_id) ON agentstudio.knowledge_bases TO agentstudio_company_metadata_reader;
-- Only the unreachable private definer receives these SELECT policies. Its
-- fixed queries join the complete Native staff denominator. No active-only
-- subject policy may discard disabled employees or their persisted counts.
CREATE POLICY company_users_select ON agentstudio.users FOR SELECT TO agentstudio_company_metadata_reader USING(external_issuer='urn:agentstudio:local:v1');
CREATE POLICY company_accounts_select ON agentstudio_auth.accounts FOR SELECT TO agentstudio_company_metadata_reader USING(true);
CREATE POLICY company_runs_select ON agentstudio.runs FOR SELECT TO agentstudio_company_metadata_reader USING(true);
CREATE POLICY company_schedules_select ON agentstudio.schedules FOR SELECT TO agentstudio_company_metadata_reader USING(true);
CREATE POLICY company_knowledge_select ON agentstudio.knowledge_bases FOR SELECT TO agentstudio_company_metadata_reader USING(true);

CREATE FUNCTION agentstudio.company_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid; caller record; answer jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  BEGIN actor:=agentstudio.actor_id(); EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'company_native_session_required'; END;
  IF actor IS NULL THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  SELECT u.external_issuer,u.status,a.enabled,a.is_admin INTO caller
    FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.id=actor;
  IF NOT FOUND OR caller.external_issuer IS DISTINCT FROM 'urn:agentstudio:local:v1' OR caller.status IS DISTINCT FROM 'active' OR caller.enabled IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  IF caller.is_admin IS DISTINCT FROM true THEN RAISE EXCEPTION 'company_admin_required'; END IF;
  WITH at AS MATERIALIZED(SELECT date_trunc('milliseconds',statement_timestamp()) AS as_of),
  staff AS MATERIALIZED(SELECT u.id,a.enabled,u.status FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.external_issuer='urn:agentstudio:local:v1'),
  runs AS(SELECT r.owner_user_id,
    count(*) FILTER(WHERE r.kind='agent' AND r.status='running') AS agent_running,
    count(*) FILTER(WHERE r.kind='workflow' AND r.status='running') AS workflow_running,
    count(*) FILTER(WHERE r.status='awaiting_approval') AS pending_approvals,
    count(*) FILTER(WHERE r.status='awaiting_input') AS human_input,
    count(*) FILTER(WHERE r.status='failed' AND r.created_at>=at.as_of-interval '7 days') AS failed_7d
    FROM agentstudio.runs r JOIN staff s ON s.id=r.owner_user_id CROSS JOIN at WHERE r.kind IN('agent','workflow') GROUP BY r.owner_user_id),
  schedules AS(SELECT x.owner_user_id,count(*) AS overdue_schedules FROM agentstudio.schedules x JOIN staff s ON s.id=x.owner_user_id CROSS JOIN at
    WHERE x.enabled AND x.deleted_at IS NULL AND x.next_at IS NOT NULL AND x.next_at<at.as_of-interval '60 seconds' GROUP BY x.owner_user_id),
  knowledge AS(SELECT k.owner_user_id,count(*) AS knowledge_bases FROM agentstudio.knowledge_bases k JOIN staff s ON s.id=k.owner_user_id GROUP BY k.owner_user_id)
  SELECT jsonb_build_object('protocol','native_company_overview_v1','scope','company_metadata_only',
    'as_of',to_char(at.as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'window_days',7,
    'totals',jsonb_build_object('employees',(SELECT count(*)::text FROM staff),'active',(SELECT count(*) FILTER(WHERE enabled AND status='active') FROM staff)::text,
      'agent_running',(SELECT coalesce(sum(agent_running),0)::text FROM runs),'workflow_running',(SELECT coalesce(sum(workflow_running),0)::text FROM runs),
      'pending_approvals',(SELECT coalesce(sum(pending_approvals),0)::text FROM runs),'human_input',(SELECT coalesce(sum(human_input),0)::text FROM runs),
      'failed_7d',(SELECT coalesce(sum(failed_7d),0)::text FROM runs),'overdue_schedules',(SELECT coalesce(sum(overdue_schedules),0)::text FROM schedules),
      'knowledge_bases',(SELECT coalesce(sum(knowledge_bases),0)::text FROM knowledge)),
    'worker',jsonb_build_object('availability','unavailable','reason','telemetry_not_installed')) INTO answer FROM at;
  RETURN answer;
END $fn$;

CREATE FUNCTION agentstudio.company_employee_stats(integer,uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid; caller record; answer jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'agentstudio_api' THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  BEGIN actor:=agentstudio.actor_id(); EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'company_native_session_required'; END;
  IF actor IS NULL THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  SELECT u.external_issuer,u.status,a.enabled,a.is_admin INTO caller
    FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.id=actor;
  IF NOT FOUND OR caller.external_issuer IS DISTINCT FROM 'urn:agentstudio:local:v1' OR caller.status IS DISTINCT FROM 'active' OR caller.enabled IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'company_native_session_required'; END IF;
  IF caller.is_admin IS DISTINCT FROM true THEN RAISE EXCEPTION 'company_admin_required'; END IF;
  IF $1 IS NULL OR $1 NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_company_employee_query'; END IF;
  WITH at AS MATERIALIZED(SELECT date_trunc('milliseconds',statement_timestamp()) AS as_of),
  selected AS MATERIALIZED(SELECT u.id,left(u.display_name,200) AS display_name,a.is_admin,a.enabled,u.status
    FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id WHERE u.external_issuer='urn:agentstudio:local:v1' AND ($2 IS NULL OR u.id>$2) ORDER BY u.id LIMIT $1+1),
  staff AS MATERIALIZED(SELECT id,display_name,is_admin,enabled,status FROM selected ORDER BY id LIMIT $1),
  runs AS(SELECT r.owner_user_id,
    count(*) FILTER(WHERE r.kind='agent' AND r.status='running') AS agent_running,
    count(*) FILTER(WHERE r.kind='workflow' AND r.status='running') AS workflow_running,
    count(*) FILTER(WHERE r.status='awaiting_approval') AS pending_approvals,
    count(*) FILTER(WHERE r.status='awaiting_input') AS human_input,
    count(*) FILTER(WHERE r.status='failed' AND r.created_at>=at.as_of-interval '7 days') AS failed_7d
    FROM agentstudio.runs r JOIN staff s ON s.id=r.owner_user_id CROSS JOIN at WHERE r.kind IN('agent','workflow') GROUP BY r.owner_user_id),
  schedules AS(SELECT x.owner_user_id,count(*) AS overdue_schedules FROM agentstudio.schedules x JOIN staff s ON s.id=x.owner_user_id CROSS JOIN at
    WHERE x.enabled AND x.deleted_at IS NULL AND x.next_at IS NOT NULL AND x.next_at<at.as_of-interval '60 seconds' GROUP BY x.owner_user_id),
  knowledge AS(SELECT k.owner_user_id,count(*) AS knowledge_bases FROM agentstudio.knowledge_bases k JOIN staff s ON s.id=k.owner_user_id GROUP BY k.owner_user_id)
  SELECT jsonb_build_object('protocol','native_company_employee_stats_v1','scope','company_metadata_only',
    'as_of',to_char(at.as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'limit',$1,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id',s.id,'display_name',s.display_name,'is_admin',s.is_admin,'enabled',s.enabled,'status',s.status,
      'agent_running',coalesce(r.agent_running,0)::text,'workflow_running',coalesce(r.workflow_running,0)::text,
      'pending_approvals',coalesce(r.pending_approvals,0)::text,'human_input',coalesce(r.human_input,0)::text,'failed_7d',coalesce(r.failed_7d,0)::text,
      'overdue_schedules',coalesce(x.overdue_schedules,0)::text,'knowledge_bases',coalesce(k.knowledge_bases,0)::text) ORDER BY s.id)
      FROM staff s LEFT JOIN runs r ON r.owner_user_id=s.id LEFT JOIN schedules x ON x.owner_user_id=s.id LEFT JOIN knowledge k ON k.owner_user_id=s.id),'[]'::jsonb),
    'has_more',(SELECT count(*)>$1 FROM selected),
    'next_after',CASE WHEN (SELECT count(*)>$1 FROM selected) THEN (SELECT id::text FROM staff ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO answer FROM at;
  RETURN answer;
END $fn$;

ALTER FUNCTION agentstudio.company_overview() OWNER TO agentstudio_company_metadata_reader;
ALTER FUNCTION agentstudio.company_employee_stats(integer,uuid) OWNER TO agentstudio_company_metadata_reader;
REVOKE ALL ON FUNCTION agentstudio.company_overview(),agentstudio.company_employee_stats(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.company_overview(),agentstudio.company_employee_stats(integer,uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_061','Optional current Native admin metadata counts; no queue, raw API grants, Worker telemetry or activation');
COMMIT;
