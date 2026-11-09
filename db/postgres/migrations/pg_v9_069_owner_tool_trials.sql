-- Independent isolated PG18 experiment. Explicit installation only.
-- F16–19 share one owner request/receipt map. Original runs/jobs/effects remain
-- the only execution ledgers. No Worker, Broker or public principal gets a grant.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery()
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_catalog.pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_065')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069')
 OR pg_catalog.to_regclass('agentstudio.runs') IS NULL
 OR pg_catalog.to_regclass('agentstudio.workflows') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.actor_id()') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.agent_memory_outcome_epoch()') IS NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,'toolhub_') OR starts_with(relname,'ix_toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE starts_with(proname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,'toolhub_') OR starts_with(typname,'_toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE starts_with(conname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE starts_with(tgname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE starts_with(nspname,'toolhub_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN
  RAISE EXCEPTION 'owner_tool_trials_preflight_refused';
 END IF;
END
$preflight$;

CREATE TABLE agentstudio.toolhub_trials (
 owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
 request_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN('tool','registry_translation')),
 source_kind text NOT NULL CHECK(source_kind IN('builtin','http','mcp','registry_translation')),
 target jsonb NOT NULL CHECK(jsonb_typeof(target)='object' AND octet_length(target::text)<=32768),
 target_identity_sha256 text NOT NULL CHECK(target_identity_sha256 ~ '^[a-f0-9]{64}$'),
 arguments_sha256 text NOT NULL CHECK(arguments_sha256 ~ '^[a-f0-9]{64}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 graph_sha256 text NOT NULL CHECK(graph_sha256 ~ '^[a-f0-9]{64}$'),
 workflow_id uuid NOT NULL,
 run_id uuid NOT NULL,
 effect_consent boolean NOT NULL CHECK(effect_consent),
 fee_consent boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_user_id,request_id),
 UNIQUE(workflow_id),UNIQUE(run_id),
 FOREIGN KEY(workflow_id,owner_user_id) REFERENCES agentstudio.workflows(id,owner_user_id),
 FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
 CHECK((purpose='registry_translation')=(source_kind='registry_translation')),
 CHECK((target->>'kind'=source_kind) IS TRUE),
 CHECK((fee_consent OR source_kind='builtin' AND target->>'tool'='calculate') IS TRUE)
);
CREATE INDEX ix_toolhub_trials_owner_created ON agentstudio.toolhub_trials(owner_user_id,created_at,request_id);
CREATE INDEX ix_toolhub_trials_unresolved ON agentstudio.toolhub_trials(owner_user_id,target_identity_sha256,arguments_sha256);
ALTER TABLE agentstudio.toolhub_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.toolhub_trials FORCE ROW LEVEL SECURITY;
CREATE POLICY toolhub_trial_owner_read ON agentstudio.toolhub_trials FOR SELECT TO agentstudio_api
 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY toolhub_trial_owner_insert ON agentstudio.toolhub_trials FOR INSERT TO agentstudio_api
 WITH CHECK(owner_user_id=agentstudio.actor_id());
REVOKE ALL ON agentstudio.toolhub_trials FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.toolhub_trials TO agentstudio_api;

-- A trial's private saved source is an immutable snapshot. Ordinary workflows
-- keep their existing behavior. No URL, command, credential or client callback
-- is accepted by either trigger.
CREATE FUNCTION agentstudio.toolhub_trial_source_immutable() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $source$
BEGIN
 IF EXISTS(SELECT 1 FROM agentstudio.toolhub_trials t WHERE t.workflow_id=OLD.id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='tool_trial_source_is_immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$source$;
REVOKE ALL ON FUNCTION agentstudio.toolhub_trial_source_immutable() FROM PUBLIC;
CREATE TRIGGER toolhub_trial_source_immutable BEFORE UPDATE OR DELETE ON agentstudio.workflows
 FOR EACH ROW EXECUTE FUNCTION agentstudio.toolhub_trial_source_immutable();

CREATE FUNCTION agentstudio.toolhub_trial_link_valid() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $link$
DECLARE w record;r record;
BEGIN
 SELECT * INTO w FROM agentstudio.workflows WHERE id=NEW.workflow_id AND owner_user_id=NEW.owner_user_id FOR KEY SHARE;
 SELECT * INTO r FROM agentstudio.runs WHERE id=NEW.run_id AND owner_user_id=NEW.owner_user_id FOR KEY SHARE;
 IF w.id IS NULL OR r.id IS NULL OR w.visibility<>'private' OR w.team_id IS NOT NULL OR w.revision<>1
 OR r.kind<>'workflow' OR r.workflow_id<>w.id OR r.agent_spec_id IS NOT NULL OR r.status<>'queued'
 OR r.checkpoint->>'execution_mode' IS DISTINCT FROM 'workflow_native_v2' OR r.checkpoint->>'workflow_revision' IS DISTINCT FROM '1'
 OR r.checkpoint->'graph' IS DISTINCT FROM w.graph OR r.checkpoint->'machine'->>'graph_sha256' IS DISTINCT FROM NEW.graph_sha256 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='tool_trial_link_refused';
 END IF;
 RETURN NEW;
END
$link$;
REVOKE ALL ON FUNCTION agentstudio.toolhub_trial_link_valid() FROM PUBLIC;
CREATE TRIGGER toolhub_trial_link_valid BEFORE INSERT ON agentstudio.toolhub_trials
 FOR EACH ROW EXECUTE FUNCTION agentstudio.toolhub_trial_link_valid();
-- Reusing a trial source through the ordinary run/schedule API cannot allocate
-- a second run. The original run is inserted before its atomic receipt. AFTER
-- INSERT also follows the existing FK wait, then reads the current committed
-- owner receipt; it does not turn process timing into authority to replay.
CREATE FUNCTION agentstudio.toolhub_trial_one_run() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $one_run$
BEGIN
 IF NEW.workflow_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM agentstudio.toolhub_trials t WHERE t.workflow_id=NEW.workflow_id AND t.run_id IS DISTINCT FROM NEW.id
 ) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='tool_trial_source_has_original_run';
 END IF;
 RETURN NEW;
END
$one_run$;
REVOKE ALL ON FUNCTION agentstudio.toolhub_trial_one_run() FROM PUBLIC;
CREATE TRIGGER toolhub_trial_one_run AFTER INSERT ON agentstudio.runs
 FOR EACH ROW EXECUTE FUNCTION agentstudio.toolhub_trial_one_run();
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_069','Optional Native-owner tool trial request/receipt mapping and private immutable execution source; original Worker/Broker/approval/effect ledgers retained, no production activation');
COMMIT;
