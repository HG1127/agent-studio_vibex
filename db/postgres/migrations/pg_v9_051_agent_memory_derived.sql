-- PROPOSED source/receipt foundation only. Default fresh sources remain050.
-- No automatic outcome writeback, memory prompt injection or paid extraction.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_050')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_051')
    OR to_regclass('agentstudio.agent_memory_derived_receipts') IS NOT NULL
    OR to_regclass('agentstudio.agent_memory_derived_entries') IS NOT NULL
    OR to_regprocedure('agentstudio.agent_memory_run_source_sha256(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'agent_memory_derived_requires_reviewed_050'; END IF;
END $preflight$;
CREATE FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'format','agent_memory_terminal_source_v1','run_id',r.id,'owner_user_id',r.owner_user_id,
    'spec_id',r.agent_spec_id,'status',r.status,'instruction',r.instruction,
    'result_text',r.result_text,'last_error_code',r.last_error_code,
    'step_count',r.step_count,'checkpoint',r.checkpoint,
    'finished_at',to_char(r.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text,'UTF8')),'hex')
  FROM agentstudio.runs r WHERE r.id=$1 AND r.owner_user_id=agentstudio.actor_id()
    AND r.kind='agent' AND r.checkpoint->>'execution_mode'='agent_native_v2'
    AND r.status IN('succeeded','failed') AND r.finished_at IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) TO agentstudio_api;
CREATE TABLE agentstudio.agent_memory_derived_receipts(
  owner_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  source_run_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('save_success','save_failure','forget')),
  kind text NOT NULL CHECK(kind IN('fact','lesson')),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  tools_sha256 text NOT NULL CHECK(tools_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),
  UNIQUE(owner_user_id,memory_id,action),
  FOREIGN KEY(owner_user_id,memory_id) REFERENCES agentstudio.agent_memory_derived_receipts(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  CHECK((action='save_success' AND kind='fact' AND request_id=memory_id)
    OR (action='save_failure' AND kind='lesson' AND request_id=memory_id)
    OR (action='forget' AND request_id<>memory_id))
);
CREATE TABLE agentstudio.agent_memory_derived_entries(
  owner_user_id uuid NOT NULL,
  id uuid NOT NULL,
  fact text NOT NULL CHECK(length(btrim(fact)) BETWEEN 1 AND 500 AND octet_length(fact)<=2000),
  tools_used text NOT NULL CHECK(length(tools_used)<=300 AND octet_length(tools_used)<=1200 AND tools_used !~ '[[:cntrl:]]'),
  content_sha256 text NOT NULL CHECK(content_sha256=encode(sha256(convert_to(fact,'UTF8')),'hex')),
  tools_sha256 text NOT NULL CHECK(tools_sha256=encode(sha256(convert_to(tools_used,'UTF8')),'hex')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,id),
  FOREIGN KEY(owner_user_id,id) REFERENCES agentstudio.agent_memory_derived_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE INDEX agent_memory_derived_latest ON agentstudio.agent_memory_derived_entries(owner_user_id,created_at DESC,id DESC);
CREATE FUNCTION agentstudio.agent_memory_derived_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE r record;
BEGIN
  IF NEW.action='forget' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_derived_receipts c
      WHERE c.owner_user_id=NEW.owner_user_id AND c.request_id=NEW.memory_id AND c.memory_id=c.request_id
        AND c.action IN('save_success','save_failure') AND c.spec_id=NEW.spec_id
        AND c.source_run_id=NEW.source_run_id AND c.kind=NEW.kind AND c.source_sha256=NEW.source_sha256
        AND c.content_sha256=NEW.content_sha256 AND c.tools_sha256=NEW.tools_sha256)
    THEN RAISE EXCEPTION 'agent_memory_derived_creation_required'; END IF;
    RETURN NEW;
  END IF;
  SELECT agent_spec_id,status INTO r FROM agentstudio.runs
    WHERE id=NEW.source_run_id AND owner_user_id=NEW.owner_user_id AND kind='agent' FOR SHARE;
  IF NOT FOUND OR r.agent_spec_id IS DISTINCT FROM NEW.spec_id
    OR (NEW.action='save_success' AND r.status<>'succeeded')
    OR (NEW.action='save_failure' AND r.status<>'failed')
    OR agentstudio.agent_memory_run_source_sha256(NEW.source_run_id) IS DISTINCT FROM NEW.source_sha256
  THEN RAISE EXCEPTION 'agent_memory_derived_source_changed'; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_derived_receipt_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE TRIGGER agent_memory_derived_source BEFORE INSERT ON agentstudio.agent_memory_derived_receipts
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_derived_receipt_guard();
CREATE FUNCTION agentstudio.agent_memory_derived_entry_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE fact_units integer; tool_units integer;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO fact_units
      FROM regexp_split_to_table(NEW.fact,'') c WHERE c<>'';
    SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO tool_units
      FROM regexp_split_to_table(NEW.tools_used,'') c WHERE c<>'';
    IF fact_units>500 OR tool_units>300 OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_derived_receipts c
      WHERE c.owner_user_id=NEW.owner_user_id AND c.request_id=NEW.id AND c.memory_id=NEW.id
        AND c.action IN('save_success','save_failure') AND c.content_sha256=NEW.content_sha256 AND c.tools_sha256=NEW.tools_sha256)
      OR EXISTS(SELECT 1 FROM agentstudio.agent_memory_derived_receipts d
        WHERE d.owner_user_id=NEW.owner_user_id AND d.memory_id=NEW.id AND d.action='forget')
    THEN RAISE EXCEPTION 'agent_memory_derived_entry_receipt_required'; END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_derived_receipts d
    WHERE d.owner_user_id=OLD.owner_user_id AND d.memory_id=OLD.id AND d.action='forget'
      AND d.content_sha256=OLD.content_sha256 AND d.tools_sha256=OLD.tools_sha256)
  THEN RAISE EXCEPTION 'agent_memory_derived_forget_receipt_required'; END IF;
  RETURN OLD;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_derived_entry_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE TRIGGER agent_memory_derived_entry_receipt BEFORE INSERT OR DELETE ON agentstudio.agent_memory_derived_entries
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_derived_entry_guard();
ALTER TABLE agentstudio.agent_memory_derived_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_derived_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_derived_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_derived_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_memory_derived_receipts,agentstudio.agent_memory_derived_entries FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT SELECT ON agentstudio.agent_memory_derived_receipts TO agentstudio_api;
GRANT INSERT(owner_user_id,request_id,memory_id,spec_id,source_run_id,action,kind,source_sha256,content_sha256,tools_sha256,request_sha256) ON agentstudio.agent_memory_derived_receipts TO agentstudio_api;
GRANT SELECT,DELETE ON agentstudio.agent_memory_derived_entries TO agentstudio_api;
GRANT INSERT(owner_user_id,id,fact,tools_used,content_sha256,tools_sha256) ON agentstudio.agent_memory_derived_entries TO agentstudio_api;
CREATE POLICY agent_memory_derived_receipts_owner_read ON agentstudio.agent_memory_derived_receipts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_derived_receipts_owner_insert ON agentstudio.agent_memory_derived_receipts FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_derived_entries_owner_read ON agentstudio.agent_memory_derived_entries FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_derived_entries_owner_insert ON agentstudio.agent_memory_derived_entries FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_derived_entries_owner_delete ON agentstudio.agent_memory_derived_entries FOR DELETE TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_051',
  'Proposed owned terminal-source memory receipts and erased text; no automatic writeback, context injection or paid extraction');
COMMIT;
