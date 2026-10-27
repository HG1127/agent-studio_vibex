-- Optional outcome-storage protocol. Not in default fresh050. No provider,
-- prompt injection, fee authority, schedule inheritance or automatic activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_051')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_052')
    OR to_regclass('agentstudio.agent_memory_outcome_consents') IS NOT NULL
    OR to_regclass('agentstudio.agent_memory_outcome_stops') IS NOT NULL
    OR to_regclass('agentstudio.agent_memory_outcome_results') IS NOT NULL
    OR to_regprocedure('agentstudio.agent_memory_outcome_epoch()') IS NOT NULL
  THEN RAISE EXCEPTION 'agent_memory_outcome_requires_reviewed_051'; END IF;
END $preflight$;
-- Only the current actor's active Native governance epoch is exposed. Lock
-- both rows so a disable/re-enable or governance edit orders with admission/use.
CREATE FUNCTION agentstudio.agent_memory_outcome_epoch() RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE epoch bigint;
BEGIN
  SELECT a.governance_revision INTO epoch FROM agentstudio_auth.accounts a
    WHERE a.user_id=agentstudio.actor_id() AND a.enabled FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM agentstudio.users u WHERE u.id=agentstudio.actor_id()
    AND u.external_issuer='urn:agentstudio:local:v1' AND u.status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN epoch;
END
$fn$;
CREATE FUNCTION agentstudio.agent_memory_outcome_id(uuid,uuid,text) RETURNS uuid
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT CASE WHEN $1 IS NOT NULL AND $2 IS NOT NULL AND $3 ~ '^[a-f0-9]{64}$'
    THEN (substr(h,1,8)||'-'||substr(h,9,4)||'-8'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid END
  FROM (SELECT encode(sha256(convert_to(concat_ws('|','agent_memory_outcome_slot_v1',$1::text,$2::text,$3),'UTF8')),'hex') AS h)s;
$fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_outcome_epoch(),agentstudio.agent_memory_outcome_id(uuid,uuid,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch(),agentstudio.agent_memory_outcome_id(uuid,uuid,text) TO agentstudio_api;
CREATE TABLE agentstudio.agent_memory_outcome_consents(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  spec_revision bigint NOT NULL,
  owner_epoch bigint NOT NULL,
  protocol text NOT NULL,
  instruction_sha256 text NOT NULL,
  graph_sha256 text NOT NULL,
  intent_sha256 text NOT NULL,
  memory_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,run_id),
  UNIQUE(owner_user_id,memory_id),
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_memory_outcome_stops(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  request_id uuid NOT NULL,
  intent_sha256 text NOT NULL,
  request_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,run_id),
  UNIQUE(owner_user_id,request_id),
  FOREIGN KEY(owner_user_id,run_id) REFERENCES agentstudio.agent_memory_outcome_consents(owner_user_id,run_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_memory_outcome_results(
  owner_user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  memory_id uuid NOT NULL,
  intent_sha256 text NOT NULL,
  decision text NOT NULL,
  reason_code text NOT NULL,
  source_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,run_id),
  FOREIGN KEY(owner_user_id,run_id) REFERENCES agentstudio.agent_memory_outcome_consents(owner_user_id,run_id) ON DELETE RESTRICT
);
-- All cross-field invariants are in these immutable, audited trigger bodies.
-- There are no separately formatted CHECK expressions or mutable text here.
CREATE FUNCTION agentstudio.agent_memory_outcome_consent_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE r record; expected text;
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM agentstudio.actor_id()
    OR NEW.protocol<>'agent_memory_outcome_v1'
    OR NEW.spec_revision NOT BETWEEN 1 AND 9007199254740990
    OR NEW.owner_epoch NOT BETWEEN 1 AND 9007199254740990
    OR NEW.instruction_sha256 !~ '^[a-f0-9]{64}$' OR NEW.graph_sha256 !~ '^[a-f0-9]{64}$'
    OR agentstudio.agent_memory_outcome_epoch() IS DISTINCT FROM NEW.owner_epoch
  THEN RAISE EXCEPTION 'agent_memory_outcome_invalid_consent'; END IF;
  SELECT agent_spec_id,instruction,checkpoint,status,finished_at INTO r FROM agentstudio.runs
    WHERE id=NEW.run_id AND owner_user_id=NEW.owner_user_id AND kind='agent' FOR SHARE;
  expected:=encode(sha256(convert_to(concat_ws('|',NEW.protocol,NEW.owner_user_id::text,NEW.run_id::text,NEW.spec_id::text,
    NEW.spec_revision::text,NEW.owner_epoch::text,NEW.instruction_sha256,NEW.graph_sha256),'UTF8')),'hex');
  IF NOT FOUND OR r.status<>'queued' OR r.finished_at IS NOT NULL OR r.agent_spec_id IS DISTINCT FROM NEW.spec_id
    OR r.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2'
    OR r.checkpoint->>'spec_revision' IS DISTINCT FROM NEW.spec_revision::text
    OR r.checkpoint->'machine'->>'graph_sha256' IS DISTINCT FROM NEW.graph_sha256
    OR encode(sha256(convert_to(r.instruction,'UTF8')),'hex') IS DISTINCT FROM NEW.instruction_sha256
    OR NEW.intent_sha256 IS DISTINCT FROM expected
    OR NEW.memory_id IS DISTINCT FROM agentstudio.agent_memory_outcome_id(NEW.owner_user_id,NEW.run_id,expected)
  THEN RAISE EXCEPTION 'agent_memory_outcome_source_changed'; END IF;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_memory_outcome_stop_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE c record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||NEW.run_id::text,520));
  SELECT * INTO c FROM agentstudio.agent_memory_outcome_consents
    WHERE owner_user_id=NEW.owner_user_id AND run_id=NEW.run_id;
  IF NOT FOUND OR NEW.owner_user_id IS DISTINCT FROM agentstudio.actor_id()
    OR NEW.intent_sha256 IS DISTINCT FROM c.intent_sha256
    OR NEW.request_sha256 IS DISTINCT FROM encode(sha256(convert_to(concat_ws('|','agent_memory_outcome_stop_v1',
      NEW.owner_user_id::text,NEW.run_id::text,NEW.request_id::text,NEW.intent_sha256),'UTF8')),'hex')
  THEN RAISE EXCEPTION 'agent_memory_outcome_invalid_stop'; END IF;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_memory_outcome_result_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE c record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||NEW.run_id::text,520));
  SELECT * INTO c FROM agentstudio.agent_memory_outcome_consents
    WHERE owner_user_id=NEW.owner_user_id AND run_id=NEW.run_id;
  IF NOT FOUND OR NEW.owner_user_id IS DISTINCT FROM agentstudio.actor_id()
    OR NEW.intent_sha256 IS DISTINCT FROM c.intent_sha256 OR NEW.memory_id IS DISTINCT FROM c.memory_id
    OR NEW.decision NOT IN('stored','revoked','source_unavailable','writes_disabled','write_failed')
    OR NEW.reason_code !~ '^[a-z0-9_]{1,80}$'
    OR (NEW.decision='stored' AND (NEW.source_sha256 IS NULL OR NEW.source_sha256 !~ '^[a-f0-9]{64}$'))
    OR (NEW.decision<>'stored' AND NEW.source_sha256 IS NOT NULL)
  THEN RAISE EXCEPTION 'agent_memory_outcome_invalid_result'; END IF;
  IF NEW.decision='revoked' AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_outcome_stops s
    WHERE s.owner_user_id=NEW.owner_user_id AND s.run_id=NEW.run_id AND s.intent_sha256=c.intent_sha256)
  THEN RAISE EXCEPTION 'agent_memory_outcome_stop_required'; END IF;
  IF NEW.decision='stored' AND (
    agentstudio.agent_memory_outcome_epoch() IS DISTINCT FROM c.owner_epoch
    OR EXISTS(SELECT 1 FROM agentstudio.agent_memory_outcome_stops s WHERE s.owner_user_id=NEW.owner_user_id AND s.run_id=NEW.run_id)
    OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_memory_derived_receipts r
      JOIN agentstudio.agent_memory_derived_entries e ON e.owner_user_id=r.owner_user_id AND e.id=r.request_id
      WHERE r.owner_user_id=NEW.owner_user_id AND r.request_id=c.memory_id AND r.memory_id=c.memory_id
        AND r.spec_id=c.spec_id AND r.source_run_id=c.run_id AND r.action IN('save_success','save_failure')
        AND r.source_sha256=NEW.source_sha256 AND e.content_sha256=r.content_sha256 AND e.tools_sha256=r.tools_sha256))
  THEN RAISE EXCEPTION 'agent_memory_outcome_stored_receipt_required'; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION agentstudio.agent_memory_outcome_consent_guard(),agentstudio.agent_memory_outcome_stop_guard(),agentstudio.agent_memory_outcome_result_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
CREATE TRIGGER agent_memory_outcome_consent BEFORE INSERT ON agentstudio.agent_memory_outcome_consents FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_outcome_consent_guard();
CREATE TRIGGER agent_memory_outcome_stop BEFORE INSERT ON agentstudio.agent_memory_outcome_stops FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_outcome_stop_guard();
CREATE TRIGGER agent_memory_outcome_result BEFORE INSERT ON agentstudio.agent_memory_outcome_results FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_memory_outcome_result_guard();
ALTER TABLE agentstudio.agent_memory_outcome_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_outcome_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_outcome_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_outcome_stops FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_outcome_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_memory_outcome_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_memory_outcome_consents,agentstudio.agent_memory_outcome_stops,agentstudio.agent_memory_outcome_results FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT SELECT ON agentstudio.agent_memory_outcome_consents,agentstudio.agent_memory_outcome_stops,agentstudio.agent_memory_outcome_results TO agentstudio_api;
GRANT INSERT(owner_user_id,run_id,spec_id,spec_revision,owner_epoch,protocol,instruction_sha256,graph_sha256,intent_sha256,memory_id) ON agentstudio.agent_memory_outcome_consents TO agentstudio_api;
GRANT INSERT(owner_user_id,run_id,request_id,intent_sha256,request_sha256) ON agentstudio.agent_memory_outcome_stops TO agentstudio_api;
GRANT INSERT(owner_user_id,run_id,memory_id,intent_sha256,decision,reason_code,source_sha256) ON agentstudio.agent_memory_outcome_results TO agentstudio_api;
CREATE POLICY agent_memory_outcome_consents_owner_read ON agentstudio.agent_memory_outcome_consents FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_outcome_consents_owner_insert ON agentstudio.agent_memory_outcome_consents FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_outcome_stops_owner_read ON agentstudio.agent_memory_outcome_stops FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_outcome_stops_owner_insert ON agentstudio.agent_memory_outcome_stops FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_outcome_results_owner_read ON agentstudio.agent_memory_outcome_results FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_memory_outcome_results_owner_insert ON agentstudio.agent_memory_outcome_results FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_052',
  'Optional Native owner outcome storage consent/stop/result metadata; no automatic activation, paid refinement or derived prompt use');
COMMIT;
