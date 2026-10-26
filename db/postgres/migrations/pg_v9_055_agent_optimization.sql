-- Optional owner-confirmed feedback/role acceptance. No provider, publication,
-- prompt input or fee authority. Existing default fresh050 remains unchanged.
BEGIN;
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery() OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_054')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_055')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,19)='agent_optimization_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND left(p.proname,19)='agent_optimization_')
  THEN RAISE EXCEPTION 'agent_optimization_installation_refused'; END IF;
END $check$;

CREATE FUNCTION agentstudio.agent_optimization_compact(jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
  CASE jsonb_typeof($1)
    WHEN 'object' THEN RETURN (SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||agentstudio.agent_optimization_compact(value),',' ORDER BY key COLLATE "C"),'')||'}' FROM jsonb_each($1));
    WHEN 'array' THEN RETURN (SELECT '['||coalesce(string_agg(agentstudio.agent_optimization_compact(value),',' ORDER BY ordinal),'')||']' FROM jsonb_array_elements($1) WITH ORDINALITY a(value,ordinal));
    ELSE RETURN $1::text;
  END CASE;
END $fn$;
CREATE FUNCTION agentstudio.agent_optimization_candidate_sha(text,jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(agentstudio.agent_optimization_compact(jsonb_build_object('protocol','agent_feedback_role_candidate_v1','name',$1,'spec',$2)),'UTF8')),'hex')
$fn$;
-- Exactly045's full-role protocol, including the actual server revision.
CREATE FUNCTION agentstudio.agent_optimization_role_sha(uuid,uuid,text,bigint,jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',$1,'owner',$2,'name',$3,'revision',$4,'spec',$5)::text,'UTF8')),'hex')
$fn$;
CREATE TABLE agentstudio.agent_optimization_intents(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,spec_id uuid NOT NULL,run_id uuid NOT NULL,feedback_id uuid NOT NULL,
  feedback_sha256 text NOT NULL,before_spec_revision bigint NOT NULL,before_spec_sha256 text NOT NULL,
  candidate_sha256 text NOT NULL,request_sha256 text NOT NULL,
  feedback_revision bigint NOT NULL,feedback_source_sha256 text NOT NULL,owner_epoch bigint NOT NULL,transaction_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),UNIQUE(owner_user_id,spec_id,transaction_id),
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_optimization_links(
  owner_user_id uuid NOT NULL,request_id uuid NOT NULL,spec_id uuid NOT NULL,run_id uuid NOT NULL,feedback_id uuid NOT NULL,
  feedback_sha256 text NOT NULL,feedback_revision bigint NOT NULL,feedback_source_sha256 text NOT NULL,
  before_spec_revision bigint NOT NULL,after_spec_revision bigint NOT NULL,before_spec_sha256 text NOT NULL,after_spec_sha256 text NOT NULL,
  before_revision_id uuid NOT NULL,after_revision_id uuid NOT NULL,changed_keys jsonb NOT NULL,
  candidate_sha256 text NOT NULL,request_sha256 text NOT NULL,owner_epoch bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_optimization_intents(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(before_revision_id) REFERENCES agentstudio.agent_collaboration_revisions(id) ON DELETE RESTRICT,
  FOREIGN KEY(after_revision_id) REFERENCES agentstudio.agent_collaboration_revisions(id) ON DELETE RESTRICT
);
CREATE FUNCTION agentstudio.agent_optimization_intent_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE epoch bigint; original record; role_row record;
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM agentstudio.actor_id() OR NEW.request_id=NEW.feedback_id
    OR NEW.feedback_sha256 !~ '^[a-f0-9]{64}$' OR NEW.before_spec_sha256 !~ '^[a-f0-9]{64}$'
    OR NEW.candidate_sha256 !~ '^[a-f0-9]{64}$' OR NEW.request_sha256 !~ '^[a-f0-9]{64}$'
    OR NEW.before_spec_revision NOT BETWEEN 1 AND 9007199254740989
  THEN RAISE EXCEPTION 'agent_optimization_invalid_intent'; END IF;
  epoch:=agentstudio.agent_memory_outcome_epoch();
  IF epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740990 THEN RAISE EXCEPTION 'agent_optimization_native_employee_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||NEW.request_id::text,551));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||NEW.run_id::text,540));
  SELECT r.* INTO original FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b
    ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id
    WHERE r.owner_user_id=NEW.owner_user_id AND r.request_id=NEW.feedback_id AND r.action='submit'
      AND r.run_id=NEW.run_id AND r.spec_id=NEW.spec_id AND r.feedback_sha256=NEW.feedback_sha256
      AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision);
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_optimization_feedback_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=NEW.run_id AND r.owner_user_id=NEW.owner_user_id
    AND r.agent_spec_id=NEW.spec_id AND r.kind='agent' AND r.status IN('succeeded','failed','cancelled') AND r.finished_at IS NOT NULL)
  THEN RAISE EXCEPTION 'agent_optimization_feedback_changed'; END IF;
  -- Lock before validating the version, avoiding two share-to-update upgrades.
  SELECT s.* INTO role_row FROM agentstudio.agent_specs s WHERE s.id=NEW.spec_id AND s.owner_user_id=NEW.owner_user_id FOR UPDATE;
  IF NOT FOUND OR role_row.revision<>NEW.before_spec_revision OR
    agentstudio.agent_optimization_role_sha(role_row.id,role_row.owner_user_id,role_row.name,role_row.revision,role_row.spec) IS DISTINCT FROM NEW.before_spec_sha256
  THEN RAISE EXCEPTION 'agent_optimization_role_changed'; END IF;
  NEW.feedback_revision:=original.revision;NEW.feedback_source_sha256:=original.source_sha256;NEW.owner_epoch:=epoch;
  NEW.transaction_id:=pg_current_xact_id()::text;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_optimization_role_history() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=agentstudio.actor_id(); intent record; before_sha text; after_sha text; keys text[]:=ARRAY[]::text[];
  field_name text; before_ids uuid[]; after_ids uuid[];
BEGIN
  -- No pending intent means an ordinary existing edit, restore or proposal.
  -- An old committed intent cannot attach itself to a future transaction.
  SELECT i.* INTO intent FROM agentstudio.agent_optimization_intents i
    WHERE i.owner_user_id=actor AND i.spec_id=OLD.id AND i.transaction_id=pg_current_xact_id()::text
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_optimization_links l WHERE l.owner_user_id=i.owner_user_id AND l.request_id=i.request_id);
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF OLD.owner_user_id<>actor OR NEW.owner_user_id<>actor OR NEW.id<>OLD.id OR NEW.revision<>OLD.revision+1
    OR NEW.requires_approval IS DISTINCT FROM true OR NEW.spec->'require_approval' IS DISTINCT FROM 'true'::jsonb
    OR agentstudio.agent_memory_outcome_epoch() IS DISTINCT FROM intent.owner_epoch
  THEN RAISE EXCEPTION 'agent_optimization_unsafe_role_transition'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||intent.run_id::text,540));
  IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b
    ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id
    WHERE r.owner_user_id=actor AND r.request_id=intent.feedback_id AND r.action='submit'
      AND r.spec_id=OLD.id AND r.run_id=intent.run_id AND r.revision=intent.feedback_revision AND r.feedback_sha256=intent.feedback_sha256
      AND r.source_sha256=intent.feedback_source_sha256
      AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=actor AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision))
  THEN RAISE EXCEPTION 'agent_optimization_feedback_changed'; END IF;
  before_sha:=agentstudio.agent_optimization_role_sha(OLD.id,OLD.owner_user_id,OLD.name,OLD.revision,OLD.spec);
  after_sha:=agentstudio.agent_optimization_role_sha(NEW.id,NEW.owner_user_id,NEW.name,NEW.revision,NEW.spec);
  IF OLD.revision<>intent.before_spec_revision OR before_sha<>intent.before_spec_sha256 OR
    agentstudio.agent_optimization_candidate_sha(NEW.name,NEW.spec)<>intent.candidate_sha256
  THEN RAISE EXCEPTION 'agent_optimization_candidate_changed'; END IF;
  FOREACH field_name IN ARRAY ARRAY['goal','task_scope','deliverables','task_plan','done_criteria','tools','knowledge_base_ids','require_plan_review','model_binding','http_tools','mcp_tools','knowledge_retrieval'] LOOP
    IF coalesce(OLD.spec->field_name,'null'::jsonb) IS DISTINCT FROM coalesce(NEW.spec->field_name,'null'::jsonb) THEN keys:=array_append(keys,field_name); END IF;
  END LOOP;
  IF cardinality(keys)=0 THEN RAISE EXCEPTION 'agent_optimization_change_required'; END IF;
  IF OLD.name<>NEW.name THEN keys:=array_prepend('name',keys); END IF;
  -- The045 AFTER trigger runs first by name, producing the real history IDs.
  SELECT array_agg(id) INTO before_ids FROM agentstudio.agent_collaboration_revisions
    WHERE owner_user_id=actor AND spec_id=OLD.id AND actor_user_id=actor AND kind='before_edit' AND spec_revision=OLD.revision AND source_sha256=before_sha;
  SELECT array_agg(id) INTO after_ids FROM agentstudio.agent_collaboration_revisions
    WHERE owner_user_id=actor AND spec_id=OLD.id AND actor_user_id=actor AND kind='edited' AND spec_revision=NEW.revision AND source_sha256=after_sha;
  IF cardinality(before_ids) IS DISTINCT FROM 1 OR cardinality(after_ids) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'agent_optimization_history_required'; END IF;
  INSERT INTO agentstudio.agent_optimization_links(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,feedback_revision,feedback_source_sha256,
    before_spec_revision,after_spec_revision,before_spec_sha256,after_spec_sha256,before_revision_id,after_revision_id,changed_keys,candidate_sha256,request_sha256,owner_epoch)
    VALUES(actor,intent.request_id,OLD.id,intent.run_id,intent.feedback_id,intent.feedback_sha256,intent.feedback_revision,intent.feedback_source_sha256,
      OLD.revision,NEW.revision,before_sha,after_sha,before_ids[1],after_ids[1],to_jsonb(keys),intent.candidate_sha256,intent.request_sha256,intent.owner_epoch);
  INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata)
    VALUES(actor,actor,intent.run_id,'agent.optimization_accept','agent_spec',OLD.id::text,'succeeded',
      jsonb_build_object('request_id',intent.request_id,'feedback_id',intent.feedback_id,'feedback_sha256',intent.feedback_sha256,
        'before_spec_sha256',before_sha,'after_spec_sha256',after_sha,'before_revision_id',before_ids[1],'after_revision_id',after_ids[1],'changed_keys',to_jsonb(keys)));
  RETURN NEW;
END $fn$;
CREATE TRIGGER agent_optimization_intent BEFORE INSERT ON agentstudio.agent_optimization_intents
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_optimization_intent_guard();
CREATE TRIGGER native_agent_optimization_history AFTER UPDATE OF name,spec ON agentstudio.agent_specs
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_optimization_role_history();
REVOKE ALL ON FUNCTION agentstudio.agent_optimization_compact(jsonb),agentstudio.agent_optimization_candidate_sha(text,jsonb),
  agentstudio.agent_optimization_role_sha(uuid,uuid,text,bigint,jsonb),agentstudio.agent_optimization_intent_guard(),agentstudio.agent_optimization_role_history()
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_optimization_compact(jsonb),agentstudio.agent_optimization_candidate_sha(text,jsonb),
  agentstudio.agent_optimization_role_sha(uuid,uuid,text,bigint,jsonb) TO agentstudio_api;
ALTER TABLE agentstudio.agent_optimization_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_optimization_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_optimization_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_optimization_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_optimization_intents,agentstudio.agent_optimization_links
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT SELECT ON agentstudio.agent_optimization_intents,agentstudio.agent_optimization_links TO agentstudio_api;
GRANT INSERT(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,before_spec_revision,before_spec_sha256,candidate_sha256,request_sha256)
  ON agentstudio.agent_optimization_intents TO agentstudio_api;
CREATE POLICY agent_optimization_intents_read ON agentstudio.agent_optimization_intents FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_optimization_intents_insert ON agentstudio.agent_optimization_intents FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_optimization_links_read ON agentstudio.agent_optimization_links FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_055','Optional explicit Native owner feedback-to-role acceptance provenance; no provider or fee authority');
COMMIT;
