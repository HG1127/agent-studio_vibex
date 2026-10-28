-- telemetry_v1: source-only, separate already-created empty PG18 database.
-- NOT part of pg_v9_*; does not create a database or activate any LOGIN.
-- SchemaFull is dormant. Trusted generation/LOGIN activation is a later boundary.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $install$
DECLARE kinds text[] := ARRAY['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']; k text; s integer;
BEGIN
  IF current_database() <> 'agent_studio_telemetry'
     OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
     OR current_setting('server_encoding') <> 'UTF8'
     OR pg_catalog.pg_my_temp_schema() <> 0
     OR current_user <> session_user
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba
       WHERE d.datname=current_database() AND r.rolname=session_user AND r.rolsuper AND d.datallowconn AND NOT d.datistemplate AND d.datconnlimit=-1
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND pg_has_role(member.oid,r.oid,'MEMBER')))
  THEN RAISE EXCEPTION 'worker_heartbeat_install_target_refused'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN ('public','information_schema'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting WHERE setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE starts_with(rolname,'studio_telemetry_'))
  THEN RAISE EXCEPTION 'worker_heartbeat_install_requires_empty_database'; END IF;
  CREATE ROLE studio_telemetry_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  CREATE ROLE studio_telemetry_reader NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2;
  FOREACH k IN ARRAY kinds LOOP
    FOR s IN 1..2 LOOP
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 1','studio_telemetry_tx_'||k||'_'||s);
    END LOOP;
  END LOOP;
END
$install$;
REVOKE ALL ON DATABASE agent_studio_telemetry FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA studio_telemetry;
COMMENT ON SCHEMA studio_telemetry IS 'agent_studio_telemetry/telemetry_v1/schema_full_dormant';
REVOKE ALL ON SCHEMA studio_telemetry FROM PUBLIC;
GRANT USAGE ON SCHEMA studio_telemetry TO studio_telemetry_owner,studio_telemetry_reader;
GRANT CONNECT ON DATABASE agent_studio_telemetry TO studio_telemetry_reader;

CREATE TABLE studio_telemetry.kind_config (
  ordinal smallint NOT NULL,
  kind text COLLATE "C" NOT NULL,
  instrumented boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  CONSTRAINT telemetry_kind_pk PRIMARY KEY (ordinal),
  CONSTRAINT telemetry_kind_unique UNIQUE (kind),
  CONSTRAINT telemetry_kind_range CHECK (ordinal>=1 AND ordinal<=8),
  CONSTRAINT telemetry_kind_enabled CHECK (NOT enabled OR instrumented)
);
CREATE TABLE studio_telemetry.slot_state (
  kind text COLLATE "C" NOT NULL,
  slot_no smallint NOT NULL,
  login_oid oid NOT NULL,
  login_name text COLLATE "C" NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  generation uuid,
  last_sequence bigint NOT NULL DEFAULT '0'::bigint,
  state text COLLATE "C",
  reason text COLLATE "C",
  observed_at timestamp with time zone,
  draining boolean NOT NULL DEFAULT false,
  CONSTRAINT telemetry_slot_pk PRIMARY KEY (kind,slot_no),
  CONSTRAINT telemetry_slot_login_oid UNIQUE (login_oid),
  CONSTRAINT telemetry_slot_login_name UNIQUE (login_name),
  CONSTRAINT telemetry_slot_kind_fk FOREIGN KEY (kind) REFERENCES studio_telemetry.kind_config(kind),
  CONSTRAINT telemetry_slot_range CHECK (slot_no>=1 AND slot_no<=2),
  CONSTRAINT telemetry_slot_sequence CHECK (last_sequence>=0 AND last_sequence<=9007199254740991),
  CONSTRAINT telemetry_slot_enabled CHECK (NOT enabled OR generation IS NOT NULL),
  CONSTRAINT telemetry_slot_observation CHECK (
    (last_sequence=0 AND state IS NULL AND reason IS NULL AND observed_at IS NULL AND NOT draining)
    OR (last_sequence>0 AND generation IS NOT NULL AND state IS NOT NULL AND reason IS NOT NULL AND observed_at IS NOT NULL
      AND ((state='unknown' AND reason IN ('startup_checks_pending','loop_unavailable'))
        OR (state='ready' AND reason='startup_checks_complete') OR (state='draining' AND reason='new_claims_closed'))
      AND draining=(state='draining')))
);
INSERT INTO studio_telemetry.kind_config(ordinal,kind)
SELECT ordinal::smallint,kind FROM unnest(ARRAY['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']) WITH ORDINALITY AS t(kind,ordinal);
INSERT INTO studio_telemetry.slot_state(kind,slot_no,login_oid,login_name)
SELECT k.kind,s::smallint,r.oid,r.rolname::text FROM studio_telemetry.kind_config k CROSS JOIN generate_series(1,2) s
JOIN pg_catalog.pg_roles r ON r.rolname='studio_telemetry_tx_'||k.kind||'_'||s;
ALTER TABLE studio_telemetry.kind_config OWNER TO studio_telemetry_owner;
ALTER TABLE studio_telemetry.slot_state OWNER TO studio_telemetry_owner;
REVOKE ALL ON TABLE studio_telemetry.kind_config,studio_telemetry.slot_state FROM PUBLIC;
ALTER TABLE studio_telemetry.kind_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_telemetry.kind_config FORCE ROW LEVEL SECURITY;
ALTER TABLE studio_telemetry.slot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_telemetry.slot_state FORCE ROW LEVEL SECURITY;
CREATE POLICY telemetry_owner_policy ON studio_telemetry.kind_config TO studio_telemetry_owner USING (true) WITH CHECK (true);
CREATE POLICY telemetry_owner_policy ON studio_telemetry.slot_state TO studio_telemetry_owner USING (true) WITH CHECK (true);

-- Five protocol primitives. No caller identity/kind/slot/clock/register/reset.
CREATE FUNCTION studio_telemetry.record(text,text,bigint,text,text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=pg_catalog AS $record$
DECLARE slot studio_telemetry.slot_state%ROWTYPE; admitted boolean; at timestamp with time zone;
BEGIN
  IF current_database()<>'agent_studio_telemetry' OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
     OR $1 COLLATE "C" IS DISTINCT FROM 'native_worker_heartbeat_report_v1' OR $2 IS NULL
     OR $2 COLLATE "C" !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
     OR $3 IS NULL OR $3<1 OR $3>9007199254740991 OR $4 IS NULL OR $5 IS NULL
     OR NOT (($4 COLLATE "C"='unknown' AND $5 COLLATE "C" IN ('startup_checks_pending','loop_unavailable'))
       OR ($4 COLLATE "C"='ready' AND $5 COLLATE "C"='startup_checks_complete') OR ($4 COLLATE "C"='draining' AND $5 COLLATE "C"='new_claims_closed'))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin
       AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
       AND r.rolconnlimit=1 AND r.rolconfig IS NULL
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid))
  THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
  -- Lock order: kind first, then slot. Trusted future activation must use it too.
  SELECT k.enabled AND k.instrumented INTO admitted FROM studio_telemetry.kind_config k
    JOIN studio_telemetry.slot_state s ON s.kind=k.kind JOIN pg_catalog.pg_roles r ON r.oid=s.login_oid AND r.rolname=s.login_name
    WHERE s.login_name=session_user FOR SHARE OF k;
  IF admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
  SELECT s.* INTO slot FROM studio_telemetry.slot_state s JOIN pg_catalog.pg_roles r ON r.oid=s.login_oid AND r.rolname=s.login_name
    WHERE s.login_name=session_user FOR UPDATE OF s;
  IF NOT FOUND OR NOT slot.enabled OR slot.login_name<>'studio_telemetry_tx_'||slot.kind||'_'||slot.slot_no
     OR slot.generation IS NULL OR slot.generation::text<>$2 COLLATE "C" OR $3<slot.last_sequence
  THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
  IF $3=slot.last_sequence THEN
    IF slot.state IS DISTINCT FROM $4 OR slot.reason IS DISTINCT FROM $5 OR slot.observed_at IS NULL
    THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
    -- Exact most-recent replay: no UPDATE and no new clock sample.
    RETURN jsonb_build_object('accepted',true,'sequence',$3,'observed_at',to_char(slot.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  IF slot.draining AND $4 COLLATE "C"<>'draining' THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
  at:=date_trunc('milliseconds',clock_timestamp());
  IF NOT isfinite(at) OR extract(year FROM at AT TIME ZONE 'UTC') NOT BETWEEN 1 AND 9999
     OR (slot.observed_at IS NOT NULL AND at<slot.observed_at)
  THEN RAISE EXCEPTION 'worker_heartbeat_report_refused'; END IF;
  UPDATE studio_telemetry.slot_state SET last_sequence=$3,state=$4,reason=$5,observed_at=at,draining=($4 COLLATE "C"='draining')
    WHERE kind=slot.kind AND slot_no=slot.slot_no;
  RETURN jsonb_build_object('accepted',true,'sequence',$3,'observed_at',to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='worker_heartbeat_report_refused';
END
$record$;
ALTER FUNCTION studio_telemetry.record(text,text,bigint,text,text) OWNER TO studio_telemetry_owner;
REVOKE ALL ON FUNCTION studio_telemetry.record(text,text,bigint,text,text) FROM PUBLIC;

CREATE FUNCTION studio_telemetry.snapshot() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path=pg_catalog AS $snapshot$
DECLARE result jsonb; valid boolean;
BEGIN
  IF current_database()<>'agent_studio_telemetry' OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
     OR current_setting('transaction_read_only')<>'on'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolname='studio_telemetry_reader' AND r.rolcanlogin
       AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
       AND r.rolconnlimit=2 AND r.rolconfig IS NULL
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid))
  THEN RAISE EXCEPTION 'worker_heartbeat_snapshot_refused'; END IF;
  -- Exactly one data statement/snapshot, one materialized DB clock sample.
  WITH clock AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) AS at),
  kinds AS MATERIALIZED (SELECT * FROM studio_telemetry.kind_config),
  slots AS MATERIALIZED (SELECT * FROM studio_telemetry.slot_state),
  integrity AS (
    SELECT (SELECT count(*)=8 AND bool_and(kind=(ARRAY['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment'])[ordinal]) FROM kinds)
      AND (SELECT count(*)=16 FROM slots)
      AND NOT EXISTS (SELECT 1 FROM kinds k CROSS JOIN generate_series(1,2) s WHERE NOT EXISTS (SELECT 1 FROM slots x WHERE x.kind=k.kind AND x.slot_no=s))
      AND NOT EXISTS (SELECT 1 FROM slots s LEFT JOIN pg_catalog.pg_roles r ON r.oid=s.login_oid AND r.rolname=s.login_name
        WHERE r.oid IS NULL OR s.login_name<>'studio_telemetry_tx_'||s.kind||'_'||s.slot_no
          OR (s.observed_at IS NOT NULL AND (NOT isfinite(s.observed_at) OR s.observed_at>clock.at OR extract(year FROM s.observed_at AT TIME ZONE 'UTC') NOT BETWEEN 1 AND 9999)))
      AND isfinite(clock.at) AND extract(year FROM clock.at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999 AS ok FROM clock
  ), observed_rows AS (
    SELECT k.ordinal,k.kind,
      CASE WHEN NOT k.instrumented OR NOT k.enabled OR x.observed_at IS NULL THEN 'unknown'
        WHEN clock.at-x.observed_at>=interval '90 seconds' THEN 'stale' ELSE x.state END AS state,
      CASE WHEN NOT k.instrumented THEN 'not_instrumented' WHEN NOT k.enabled THEN 'component_disabled'
        WHEN x.observed_at IS NULL THEN 'not_observed' WHEN clock.at-x.observed_at>=interval '90 seconds' THEN 'heartbeat_expired'
        WHEN x.state='ready' THEN 'fresh_ready_report' WHEN x.state='draining' THEN 'fresh_draining_report' ELSE 'loop_unavailable' END AS reason,
      CASE WHEN NOT k.instrumented OR NOT k.enabled OR x.observed_at IS NULL OR (x.state='unknown' AND clock.at-x.observed_at<interval '90 seconds') THEN NULL
        ELSE to_char(x.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS last_seen_at
    FROM kinds k CROSS JOIN clock LEFT JOIN LATERAL (
      SELECT s.state,s.observed_at FROM slots s WHERE s.kind=k.kind AND s.enabled AND s.generation IS NOT NULL AND s.observed_at IS NOT NULL
      ORDER BY CASE WHEN clock.at-s.observed_at<interval '90 seconds' AND s.state='ready' THEN 0
        WHEN clock.at-s.observed_at<interval '90 seconds' AND s.state='draining' THEN 1
        WHEN clock.at-s.observed_at<interval '90 seconds' THEN 2 ELSE 3 END,s.observed_at DESC,s.slot_no LIMIT 1
    ) x ON true
  )
  SELECT integrity.ok,jsonb_build_object('protocol','native_company_worker_heartbeats_v1','scope','company_worker_metadata_only',
    'as_of',to_char(clock.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'stale_after_ms',90000,
    'workers',(SELECT jsonb_agg(jsonb_build_object('kind',kind,'state',state,'last_seen_at',last_seen_at,'reason',reason) ORDER BY ordinal) FROM observed_rows))
    INTO valid,result FROM clock CROSS JOIN integrity;
  IF valid IS DISTINCT FROM true OR result IS NULL THEN RAISE EXCEPTION 'worker_heartbeat_snapshot_refused'; END IF;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='worker_heartbeat_snapshot_refused';
END
$snapshot$;
ALTER FUNCTION studio_telemetry.snapshot() OWNER TO studio_telemetry_owner;
REVOKE ALL ON FUNCTION studio_telemetry.snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION studio_telemetry.snapshot() TO studio_telemetry_reader;
DO $grants$
DECLARE r record;
BEGIN
  FOR r IN SELECT login_name FROM studio_telemetry.slot_state LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA studio_telemetry TO %I',r.login_name);
    EXECUTE format('GRANT CONNECT ON DATABASE agent_studio_telemetry TO %I',r.login_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION studio_telemetry.record(text,text,bigint,text,text) TO %I',r.login_name);
  END LOOP;
END
$grants$;
-- No LOGIN, password, generation activation, registration/reset function,
-- old-role GRANT, old migration stamp or production switch is supplied here.
COMMIT;
