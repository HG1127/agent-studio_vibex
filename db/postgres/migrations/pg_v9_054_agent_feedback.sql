-- Optional Native employee statements and separately consented feedback lessons.
-- No provider call, prompt context, automatic role update or default050 change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper)
    OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_053')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_054')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='agentstudio' AND left(c.relname,15)='agent_feedback_')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='agentstudio' AND left(p.proname,15)='agent_feedback_')
  THEN RAISE EXCEPTION 'agent_feedback_requires_reviewed_053'; END IF;
END $preflight$;
CREATE FUNCTION agentstudio.agent_feedback_digest(text[]) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(string_agg(octet_length(value)::text||':'||value,'' ORDER BY position),'UTF8')),'hex')
  FROM unnest($1) WITH ORDINALITY p(value,position);
$fn$;
CREATE FUNCTION agentstudio.agent_feedback_statement_sha256(uuid,uuid,text,text,jsonb,text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT agentstudio.agent_feedback_digest(ARRAY['agent_feedback_statement_v1',$1::text,$2::text,$3,$4,jsonb_array_length($5)::text]
    ||ARRAY(SELECT jsonb_array_elements_text($5))||ARRAY[$6]);
$fn$;
CREATE FUNCTION agentstudio.agent_feedback_run_source_sha256(uuid) RETURNS text
LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'format','agent_feedback_task_source_v1','run_id',r.id,'owner_user_id',r.owner_user_id,
    'spec_id',r.agent_spec_id,'status',r.status,'instruction',r.instruction,
    'result_text',r.result_text,'last_error_code',r.last_error_code,
    'step_count',r.step_count,'checkpoint',r.checkpoint,
    'finished_at',to_char(r.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text,'UTF8')),'hex')
  FROM agentstudio.runs r WHERE r.id=$1 AND r.owner_user_id=agentstudio.actor_id()
    AND r.kind='agent' AND r.agent_spec_id IS NOT NULL AND r.checkpoint->>'execution_mode'='agent_native_v2'
    AND r.status IN('succeeded','failed','cancelled') AND r.finished_at IS NOT NULL;
$fn$;
CREATE TABLE agentstudio.agent_feedback_receipts(
  owner_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  run_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  action text NOT NULL,
  revision bigint NOT NULL,
  feedback_id uuid NOT NULL,
  source_sha256 text NOT NULL,
  statement_sha256 text NOT NULL,
  feedback_sha256 text NOT NULL,
  request_sha256 text NOT NULL,
  owner_epoch bigint NOT NULL,
  remember_lesson boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT,
  FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX agent_feedback_revision ON agentstudio.agent_feedback_receipts(owner_user_id,run_id,revision)
  WHERE action<>'forget_lesson';
CREATE TABLE agentstudio.agent_feedback_bodies(
  owner_user_id uuid NOT NULL,
  feedback_id uuid NOT NULL,
  rating text NOT NULL,
  tags jsonb NOT NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,feedback_id),
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_feedback_lesson_results(
  owner_user_id uuid NOT NULL,
  feedback_id uuid NOT NULL,
  decision text NOT NULL,
  content_sha256 text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,feedback_id),
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
CREATE TABLE agentstudio.agent_feedback_lessons(
  owner_user_id uuid NOT NULL,
  feedback_id uuid NOT NULL,
  fact text NOT NULL,
  content_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_user_id,feedback_id),
  FOREIGN KEY(owner_user_id,feedback_id) REFERENCES agentstudio.agent_feedback_receipts(owner_user_id,request_id) ON DELETE RESTRICT
);
-- Guards enforce the complete insertion/deletion shape. Their exact source,
-- enabled triggers and absence of other constraints are audited by the runtime.
CREATE FUNCTION agentstudio.agent_feedback_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE current_feedback record; original record; epoch bigint; current_revision bigint:=0;
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM agentstudio.actor_id()
    OR NEW.action NOT IN('submit','erase_feedback','forget_lesson')
    OR NEW.revision NOT BETWEEN 1 AND 9007199254740990
    OR NEW.source_sha256 !~ '^[a-f0-9]{64}$' OR NEW.statement_sha256 !~ '^[a-f0-9]{64}$'
    OR NEW.request_sha256 !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'agent_feedback_invalid_receipt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||NEW.run_id::text,540));
  SELECT * INTO current_feedback FROM agentstudio.agent_feedback_receipts
    WHERE owner_user_id=NEW.owner_user_id AND run_id=NEW.run_id AND action<>'forget_lesson'
    ORDER BY revision DESC LIMIT 1;
  IF FOUND THEN current_revision:=current_feedback.revision; END IF;
  epoch:=agentstudio.agent_memory_outcome_epoch();
  IF epoch IS NULL OR epoch NOT BETWEEN 1 AND 9007199254740990
  THEN RAISE EXCEPTION 'agent_feedback_native_employee_required'; END IF;
  NEW.owner_epoch:=epoch;
  IF NEW.action='submit' THEN
    IF NEW.revision<>current_revision+1 OR NEW.feedback_id<>NEW.request_id
      OR NOT EXISTS(SELECT 1 FROM agentstudio.runs r WHERE r.id=NEW.run_id AND r.owner_user_id=NEW.owner_user_id
        AND r.agent_spec_id=NEW.spec_id AND r.kind='agent')
      OR agentstudio.agent_feedback_run_source_sha256(NEW.run_id) IS DISTINCT FROM NEW.source_sha256
    THEN RAISE EXCEPTION 'agent_feedback_source_or_revision_changed'; END IF;
    NEW.feedback_sha256:=agentstudio.agent_feedback_digest(ARRAY['agent_feedback_record_v1',NEW.owner_user_id::text,
      NEW.request_id::text,NEW.run_id::text,NEW.spec_id::text,NEW.revision::text,NEW.source_sha256,
      NEW.statement_sha256,NEW.owner_epoch::text,NEW.remember_lesson::text]);
    RETURN NEW;
  END IF;
  SELECT * INTO original FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND request_id=NEW.feedback_id AND action='submit';
  IF NOT FOUND OR NEW.feedback_id=NEW.request_id OR NEW.remember_lesson
    OR original.run_id<>NEW.run_id OR original.spec_id<>NEW.spec_id
    OR original.source_sha256<>NEW.source_sha256 OR original.statement_sha256<>NEW.statement_sha256
  THEN RAISE EXCEPTION 'agent_feedback_original_required'; END IF;
  IF NEW.action='erase_feedback' THEN
    IF current_feedback.action IS DISTINCT FROM 'submit' OR current_feedback.feedback_id IS DISTINCT FROM NEW.feedback_id
      OR NEW.revision<>current_revision+1
    THEN RAISE EXCEPTION 'agent_feedback_revision_changed'; END IF;
  ELSE
    IF NEW.revision<>current_revision OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_lessons l
      WHERE l.owner_user_id=NEW.owner_user_id AND l.feedback_id=NEW.feedback_id)
    THEN RAISE EXCEPTION 'agent_feedback_lesson_required'; END IF;
  END IF;
  NEW.feedback_sha256:=original.feedback_sha256;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_feedback_body_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE original record; latest record; units integer; tag jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts original JOIN agentstudio.agent_feedback_receipts later
      ON later.owner_user_id=original.owner_user_id AND later.run_id=original.run_id AND later.revision>original.revision
      AND later.action IN('submit','erase_feedback') WHERE original.owner_user_id=OLD.owner_user_id
      AND original.request_id=OLD.feedback_id AND original.action='submit')
    THEN RAISE EXCEPTION 'agent_feedback_erase_receipt_required'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO original FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND request_id=NEW.feedback_id AND action='submit';
  -- Receipts are immutable. Serialize mutable bodies with receipt admission
  -- without acquiring row locks that require forbidden UPDATE privileges.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||original.run_id::text,540));
  SELECT * INTO latest FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND run_id=original.run_id AND action<>'forget_lesson' ORDER BY revision DESC LIMIT 1;
  IF original.request_id IS NULL OR latest.request_id IS DISTINCT FROM NEW.feedback_id OR NEW.rating NOT IN('up','down')
    OR original.remember_lesson AND NEW.rating<>'down' OR jsonb_typeof(NEW.tags)<>'array' OR jsonb_array_length(NEW.tags)>8
    OR length(NEW.comment)>500 OR octet_length(NEW.comment)>2000
    OR translate(NEW.comment,E'\n\r\t','') ~ '[[:cntrl:]]'
    OR agentstudio.agent_feedback_statement_sha256(original.spec_id,original.run_id,original.source_sha256,NEW.rating,NEW.tags,NEW.comment)
      IS DISTINCT FROM original.statement_sha256
  THEN RAISE EXCEPTION 'agent_feedback_body_receipt_required'; END IF;
  SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO units
    FROM regexp_split_to_table(NEW.comment,'') c WHERE c<>'';
  IF units>500 THEN RAISE EXCEPTION 'agent_feedback_body_too_long'; END IF;
  FOR tag IN SELECT value FROM jsonb_array_elements(NEW.tags) LOOP
    IF jsonb_typeof(tag)<>'string' OR length(btrim(tag#>>'{}'))=0 OR (tag#>>'{}') ~ '[[:cntrl:]]'
      OR octet_length(tag#>>'{}')>80 THEN RAISE EXCEPTION 'agent_feedback_invalid_tag'; END IF;
    SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO units
      FROM regexp_split_to_table(tag#>>'{}','') c WHERE c<>'';
    IF units>20 THEN RAISE EXCEPTION 'agent_feedback_invalid_tag'; END IF;
  END LOOP;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_feedback_lesson_result_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE original record; latest record; rating text;
BEGIN
  SELECT * INTO original FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND request_id=NEW.feedback_id AND action='submit';
  -- Receipts are immutable. Serialize mutable bodies with receipt admission
  -- without acquiring row locks that require forbidden UPDATE privileges.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||original.run_id::text,540));
  SELECT * INTO latest FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND run_id=original.run_id AND action<>'forget_lesson' ORDER BY revision DESC LIMIT 1;
  SELECT b.rating INTO rating FROM agentstudio.agent_feedback_bodies b
    WHERE b.owner_user_id=NEW.owner_user_id AND b.feedback_id=NEW.feedback_id;
  IF original.request_id IS NULL OR latest.request_id IS DISTINCT FROM NEW.feedback_id OR rating IS NULL
    OR agentstudio.agent_memory_outcome_epoch() IS DISTINCT FROM original.owner_epoch
    OR NEW.decision NOT IN('not_requested','stored','source_unavailable','writes_disabled','write_failed')
    OR (NEW.decision='not_requested') IS DISTINCT FROM (NOT original.remember_lesson)
    OR original.remember_lesson AND rating<>'down'
    OR NEW.decision='stored' AND (NEW.content_sha256 IS NULL OR NEW.content_sha256 !~ '^[a-f0-9]{64}$')
    OR NEW.decision<>'stored' AND NEW.content_sha256 IS NOT NULL
    OR NEW.decision='stored' AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_lessons l
      WHERE l.owner_user_id=NEW.owner_user_id AND l.feedback_id=NEW.feedback_id AND l.content_sha256=NEW.content_sha256)
    OR NEW.decision<>'stored' AND EXISTS(SELECT 1 FROM agentstudio.agent_feedback_lessons l
      WHERE l.owner_user_id=NEW.owner_user_id AND l.feedback_id=NEW.feedback_id)
  THEN RAISE EXCEPTION 'agent_feedback_lesson_result_receipt_required'; END IF;
  RETURN NEW;
END $fn$;
CREATE FUNCTION agentstudio.agent_feedback_lesson_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE original record; latest record; units integer;
BEGIN
  IF TG_OP='DELETE' THEN
    IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts r WHERE r.owner_user_id=OLD.owner_user_id
      AND r.feedback_id=OLD.feedback_id AND r.action='forget_lesson')
      AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts original JOIN agentstudio.agent_feedback_receipts later
        ON later.owner_user_id=original.owner_user_id AND later.run_id=original.run_id AND later.revision>original.revision
        AND later.action='erase_feedback' WHERE original.owner_user_id=OLD.owner_user_id
        AND original.request_id=OLD.feedback_id AND original.action='submit')
    THEN RAISE EXCEPTION 'agent_feedback_lesson_erase_required'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO original FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND request_id=NEW.feedback_id AND action='submit';
  -- Receipts are immutable. Serialize mutable bodies with receipt admission
  -- without acquiring row locks that require forbidden UPDATE privileges.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_user_id::text||':'||original.run_id::text,540));
  SELECT * INTO latest FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=NEW.owner_user_id
    AND run_id=original.run_id AND action<>'forget_lesson' ORDER BY revision DESC LIMIT 1;
  IF original.request_id IS NULL OR latest.request_id IS DISTINCT FROM NEW.feedback_id OR NOT original.remember_lesson
    OR agentstudio.agent_memory_outcome_epoch() IS DISTINCT FROM original.owner_epoch
    OR agentstudio.agent_feedback_run_source_sha256(original.run_id) IS DISTINCT FROM original.source_sha256
    OR length(btrim(NEW.fact)) NOT BETWEEN 1 AND 500 OR octet_length(NEW.fact)>2000
    OR NEW.content_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.fact,'UTF8')),'hex')
    OR NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_bodies b WHERE b.owner_user_id=NEW.owner_user_id
      AND b.feedback_id=NEW.feedback_id AND b.rating='down')
    OR EXISTS(SELECT 1 FROM agentstudio.agent_feedback_lesson_results r WHERE r.owner_user_id=NEW.owner_user_id
      AND r.feedback_id=NEW.feedback_id)
    OR EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts r WHERE r.owner_user_id=NEW.owner_user_id
      AND r.feedback_id=NEW.feedback_id AND r.action='forget_lesson')
  THEN RAISE EXCEPTION 'agent_feedback_lesson_receipt_required'; END IF;
  SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer INTO units
    FROM regexp_split_to_table(NEW.fact,'') c WHERE c<>'';
  IF units>500 THEN RAISE EXCEPTION 'agent_feedback_lesson_too_long'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER agent_feedback_receipt BEFORE INSERT ON agentstudio.agent_feedback_receipts
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_feedback_receipt_guard();
CREATE TRIGGER agent_feedback_body BEFORE INSERT OR DELETE ON agentstudio.agent_feedback_bodies
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_feedback_body_guard();
CREATE TRIGGER agent_feedback_lesson_result BEFORE INSERT ON agentstudio.agent_feedback_lesson_results
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_feedback_lesson_result_guard();
CREATE TRIGGER agent_feedback_lesson BEFORE INSERT OR DELETE ON agentstudio.agent_feedback_lessons
  FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_feedback_lesson_guard();
REVOKE ALL ON FUNCTION agentstudio.agent_feedback_digest(text[]),agentstudio.agent_feedback_statement_sha256(uuid,uuid,text,text,jsonb,text),
  agentstudio.agent_feedback_run_source_sha256(uuid),agentstudio.agent_feedback_receipt_guard(),agentstudio.agent_feedback_body_guard(),
  agentstudio.agent_feedback_lesson_result_guard(),agentstudio.agent_feedback_lesson_guard()
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT EXECUTE ON FUNCTION agentstudio.agent_feedback_digest(text[]),agentstudio.agent_feedback_statement_sha256(uuid,uuid,text,text,jsonb,text),
  agentstudio.agent_feedback_run_source_sha256(uuid) TO agentstudio_api;
ALTER TABLE agentstudio.agent_feedback_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_bodies FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_lesson_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_lesson_results FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_feedback_lessons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_feedback_receipts,agentstudio.agent_feedback_bodies,
  agentstudio.agent_feedback_lesson_results,agentstudio.agent_feedback_lessons
  FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth,agentstudio_model_broker,agentstudio_bound_dispatch;
GRANT SELECT ON agentstudio.agent_feedback_receipts,agentstudio.agent_feedback_lesson_results TO agentstudio_api;
GRANT SELECT,DELETE ON agentstudio.agent_feedback_bodies,agentstudio.agent_feedback_lessons TO agentstudio_api;
GRANT INSERT(owner_user_id,request_id,run_id,spec_id,action,revision,feedback_id,source_sha256,statement_sha256,request_sha256,remember_lesson)
  ON agentstudio.agent_feedback_receipts TO agentstudio_api;
GRANT INSERT(owner_user_id,feedback_id,rating,tags,comment) ON agentstudio.agent_feedback_bodies TO agentstudio_api;
GRANT INSERT(owner_user_id,feedback_id,decision,content_sha256) ON agentstudio.agent_feedback_lesson_results TO agentstudio_api;
GRANT INSERT(owner_user_id,feedback_id,fact,content_sha256) ON agentstudio.agent_feedback_lessons TO agentstudio_api;
CREATE POLICY agent_feedback_receipts_read ON agentstudio.agent_feedback_receipts FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_receipts_insert ON agentstudio.agent_feedback_receipts FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_bodies_read ON agentstudio.agent_feedback_bodies FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_bodies_insert ON agentstudio.agent_feedback_bodies FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_bodies_delete ON agentstudio.agent_feedback_bodies FOR DELETE TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_lesson_results_read ON agentstudio.agent_feedback_lesson_results FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_lesson_results_insert ON agentstudio.agent_feedback_lesson_results FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_lessons_read ON agentstudio.agent_feedback_lessons FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_lessons_insert ON agentstudio.agent_feedback_lessons FOR INSERT TO agentstudio_api WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY agent_feedback_lessons_delete ON agentstudio.agent_feedback_lessons FOR DELETE TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_054',
  'Optional Native employee feedback statements and separately consented erasable lessons; no prompt, model fee or optimization activation');
COMMIT;
