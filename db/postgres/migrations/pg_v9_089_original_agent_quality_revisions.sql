-- Optional original-quality089. Fresh isolated source profile only. No cutover.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
SET LOCAL search_path=pg_catalog;
LOCK TABLE agentstudio.agent_specs IN ACCESS EXCLUSIVE MODE;
DO $preflight$ BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_046') OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_070') OR EXISTS(SELECT 1 FROM agentstudio.agent_specs) OR EXISTS(SELECT 1 FROM agentstudio.agent_release_versions) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_quality089') THEN RAISE EXCEPTION 'quality089_requires_fresh_reviewed_046_070'; END IF;
END $preflight$;
CREATE ROLE agentstudio_quality089 NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio,agentstudio_auth TO agentstudio_quality089;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_quality089;
CREATE TABLE agentstudio.agent_quality089_revisions(
 spec_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 spec_revision bigint NOT NULL CONSTRAINT q089_revisions_spec_revision_ck CHECK(spec_revision BETWEEN 1 AND 9007199254740990),
 state text NOT NULL CONSTRAINT q089_revisions_state_ck CHECK(state IN('missing','configured')),
 checks jsonb,
 checks_sha256 text,
 source_sha256 text NOT NULL CONSTRAINT q089_revisions_source_sha256_ck CHECK(source_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT q089_revisions_pk PRIMARY KEY(spec_id,owner_user_id,spec_revision),
 CONSTRAINT q089_revisions_fk1 FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id),
 CONSTRAINT q089_revisions_ck1 CHECK((state='missing' AND checks IS NULL AND checks_sha256 IS NULL) OR (state='configured' AND checks IS NOT NULL AND checks_sha256 IS NOT NULL AND checks_sha256~'^[a-f0-9]{64}$'))
);
CREATE TABLE agentstudio.agent_quality089_receipts(
 owner_user_id uuid NOT NULL,
 request_id uuid NOT NULL,
 spec_id uuid NOT NULL,
 request_sha256 text NOT NULL CONSTRAINT q089_receipts_request_sha256_ck CHECK(request_sha256~'^[a-f0-9]{64}$'),
 before_revision bigint NOT NULL CONSTRAINT q089_receipts_before_revision_ck CHECK(before_revision BETWEEN 1 AND 9007199254740989),
 after_revision bigint NOT NULL CONSTRAINT q089_receipts_after_revision_ck CHECK(after_revision=before_revision+1),
 audit_event_id uuid NOT NULL CONSTRAINT q089_receipts_audit_event_id_fk REFERENCES agentstudio.audit_events(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT q089_receipts_pk PRIMARY KEY(owner_user_id,request_id),
 CONSTRAINT q089_receipts_fk1 FOREIGN KEY(spec_id,owner_user_id,after_revision) REFERENCES agentstudio.agent_quality089_revisions(spec_id,owner_user_id,spec_revision)
);
CREATE TABLE agentstudio.agent_quality089_versions(
 version_id uuid CONSTRAINT q089_versions_pk PRIMARY KEY,
 owner_user_id uuid NOT NULL,
 spec_id uuid NOT NULL,
 spec_revision bigint NOT NULL,
 CONSTRAINT q089_versions_fk1 FOREIGN KEY(version_id,spec_id,owner_user_id) REFERENCES agentstudio.agent_release_versions(id,spec_id,owner_user_id),
 CONSTRAINT q089_versions_fk2 FOREIGN KEY(spec_id,owner_user_id,spec_revision) REFERENCES agentstudio.agent_quality089_revisions(spec_id,owner_user_id,spec_revision)
);
-- Private transaction state, never a caller GUC or a client-minted proof.
CREATE TABLE agentstudio.agent_quality089_intents(
 backend_pid integer NOT NULL,
 transaction_id bigint NOT NULL,
 spec_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 kind text NOT NULL CONSTRAINT q089_intents_kind_ck CHECK(kind IN('save','restore')),
 request_id uuid NOT NULL,
 request_sha256 text NOT NULL CONSTRAINT q089_intents_request_sha256_ck CHECK(request_sha256~'^[a-f0-9]{64}$'),
 before_revision bigint NOT NULL CONSTRAINT q089_intents_before_revision_ck CHECK(before_revision BETWEEN 1 AND 9007199254740989),
 before_source text NOT NULL CONSTRAINT q089_intents_before_source_ck CHECK(before_source~'^[a-f0-9]{64}$'),
 checks jsonb NOT NULL,
 checks_sha256 text NOT NULL CONSTRAINT q089_intents_checks_sha256_ck CHECK(checks_sha256~'^[a-f0-9]{64}$'),
 expected_new_source text,
 version_id uuid,
 consumed_revision bigint,
 CONSTRAINT q089_intents_pk PRIMARY KEY(backend_pid,transaction_id,spec_id),
 CONSTRAINT q089_intents_fk1 FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id),
 CONSTRAINT q089_intents_ck1 CHECK((kind='save' AND version_id IS NULL AND expected_new_source IS NULL) OR (kind='restore' AND version_id IS NOT NULL AND expected_new_source IS NOT NULL AND expected_new_source~'^[a-f0-9]{64}$')),
 CONSTRAINT q089_intents_ck2 CHECK(consumed_revision IS NULL OR consumed_revision=before_revision+1)
);
CREATE FUNCTION agentstudio.quality089_utf16_length(p_text text) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(p_text,'')c WHERE c<>''
$fn$;
ALTER FUNCTION agentstudio.quality089_utf16_length(text) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_utf16_length(text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_native_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
  SELECT EXISTS(SELECT 1 FROM agentstudio.users u JOIN agentstudio_auth.accounts a ON a.user_id=u.id
    WHERE u.id=p_user AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' AND a.enabled)
$fn$;
ALTER FUNCTION agentstudio.quality089_native_active(uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_native_active(uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_source_seal(p_id uuid,p_owner uuid,p_name text,p_revision bigint,p_spec jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',p_id,'owner',p_owner,'name',p_name,'revision',p_revision,'spec',p_spec)::text,'UTF8')),'hex')
$fn$;
ALTER FUNCTION agentstudio.quality089_source_seal(uuid,uuid,text,bigint,jsonb) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_source_seal(uuid,uuid,text,bigint,jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_version_sha(p_version uuid) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',id,'owner',owner_user_id,'spec_id',spec_id,'version_no',version_no,'spec_revision',spec_revision,
    'source_sha256',source_sha256,'name',name_snapshot,'spec',spec_snapshot,'note',note,'test_run_id',test_run_id,'test_passed',test_passed,'test_model_binding',test_model_binding,
    'created_epoch',extract(epoch FROM created_at))::text,'UTF8')),'hex') FROM agentstudio.agent_release_versions WHERE id=p_version
$fn$;
ALTER FUNCTION agentstudio.quality089_version_sha(uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_version_sha(uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_has_text(p_text text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ SELECT p_text IS NOT NULL AND btrim(p_text,' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))<>''
$fn$;
ALTER FUNCTION agentstudio.quality089_has_text(text) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_has_text(text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_rules_json(p_checks jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE item jsonb; result text='['; n integer=0; kind text; expected text;
BEGIN
 IF p_checks IS NULL OR jsonb_typeof(p_checks)<>'array' OR jsonb_array_length(p_checks)>12 THEN RAISE EXCEPTION 'invalid_original_quality_rules'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_checks) LOOP
  IF jsonb_typeof(item)<>'object' OR item-ARRAY['type','expected']<>'{}'::jsonb OR NOT(item?'type' AND item?'expected') OR jsonb_typeof(item->'type')<>'string' OR jsonb_typeof(item->'expected')<>'string' THEN RAISE EXCEPTION 'invalid_original_quality_rules'; END IF;
  kind=item->>'type';expected=item->>'expected';
  IF kind NOT IN('contains','not_contains','json_object') OR agentstudio.quality089_utf16_length(expected)>200 OR expected~('['||chr(1)||'-'||chr(31)||chr(127)||']') OR (kind='json_object' AND expected<>'') OR (kind<>'json_object' AND NOT agentstudio.quality089_has_text(expected)) THEN RAISE EXCEPTION 'invalid_original_quality_rules'; END IF;
  -- to_json(text) uses JSON escaping; no trim, slicing, filtering or coercion.
  result=result||CASE WHEN n=0 THEN '' ELSE ',' END||'{"type":'||to_json(kind)::text||',"expected":'||to_json(expected)::text||'}';n=n+1;
 END LOOP;
 RETURN result||']';
END
$fn$;
ALTER FUNCTION agentstudio.quality089_rules_json(jsonb) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_rules_json(jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_rules_sha(p_checks jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ SELECT encode(sha256(convert_to('{"protocol":"native_original_agent_quality_v1","checks":'||agentstudio.quality089_rules_json(p_checks)||'}','UTF8')),'hex')
$fn$;
ALTER FUNCTION agentstudio.quality089_rules_sha(jsonb) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_rules_sha(jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_request_sha(p_owner uuid,p_spec uuid,p_request uuid,p_revision bigint,p_source text,p_checks_sha text,p_checks jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ SELECT encode(sha256(convert_to('{"protocol":"native_original_agent_quality_v1","employee_id":'||to_json(p_owner::text)::text||',"spec_id":'||to_json(p_spec::text)::text||',"request_id":'||to_json(p_request::text)::text||',"expected_spec_revision":'||p_revision::text||',"expected_source_sha256":'||to_json(p_source)::text||',"expected_checks_sha256":'||coalesce(to_json(p_checks_sha)::text,'null')||',"checks":'||agentstudio.quality089_rules_json(p_checks)||'}','UTF8')),'hex')
$fn$;
ALTER FUNCTION agentstudio.quality089_request_sha(uuid,uuid,uuid,bigint,text,text,jsonb) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_request_sha(uuid,uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_revision_json(p_spec uuid,p_owner uuid,p_revision bigint) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ SELECT jsonb_build_object('protocol','native_original_agent_quality_v1','employee_id',owner_user_id,'spec_id',spec_id,'spec_revision',spec_revision,'source_sha256',source_sha256,'state',state,'checks_sha256',checks_sha256,'checks',checks) FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=p_owner AND spec_revision=p_revision
$fn$;
ALTER FUNCTION agentstudio.quality089_revision_json(uuid,uuid,bigint) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_revision_json(uuid,uuid,bigint) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_read(p_spec uuid,p_expected_employee uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();s record;q record;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed'; END IF;
 SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor;
 IF s.id IS NULL THEN RAISE EXCEPTION 'original_quality_spec_not_found'; END IF;
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=actor AND spec_revision=s.revision;
 IF q.spec_id IS NULL OR q.source_sha256 IS DISTINCT FROM agentstudio.quality089_source_seal(s.id,actor,s.name,s.revision,s.spec) OR q.state='configured' AND q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(q.checks) THEN RAISE EXCEPTION 'original_quality_revision_unavailable'; END IF;
 RETURN agentstudio.quality089_revision_json(p_spec,actor,s.revision);
END
$fn$;
ALTER FUNCTION agentstudio.quality089_read(uuid,uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_read(uuid,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_read(uuid,uuid) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_receipt(p_spec uuid,p_request uuid,p_expected_employee uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();r record;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor) THEN RAISE EXCEPTION 'original_quality_spec_not_found'; END IF;
 SELECT * INTO r FROM agentstudio.agent_quality089_receipts WHERE owner_user_id=actor AND spec_id=p_spec AND request_id=p_request;
 IF r.request_id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.audit_events WHERE id=r.audit_event_id AND owner_user_id=actor AND actor_user_id=actor AND action='agent.quality.save' AND target_kind='agent_spec' AND target_id=p_spec::text AND result='succeeded') THEN RAISE EXCEPTION 'original_quality_receipt_unavailable'; END IF;
 RETURN jsonb_build_object('protocol','native_original_agent_quality_v1','employee_id',actor,'spec_id',p_spec,'request_id',p_request,'request_sha256',r.request_sha256,'before_revision',r.before_revision,'audit_event_id',r.audit_event_id,'after',agentstudio.quality089_revision_json(p_spec,actor,r.after_revision));
END
$fn$;
ALTER FUNCTION agentstudio.quality089_receipt(uuid,uuid,uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_receipt(uuid,uuid,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_receipt(uuid,uuid,uuid) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_spec_snapshot() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE prior agentstudio.agent_quality089_revisions%ROWTYPE; intent agentstudio.agent_quality089_intents%ROWTYPE;next_state text;next_checks jsonb;next_hash text;seal text;
BEGIN
 seal=agentstudio.quality089_source_seal(NEW.id,NEW.owner_user_id,NEW.name,NEW.revision,NEW.spec);
 IF TG_OP='INSERT' THEN next_state='missing';
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN RAISE EXCEPTION 'original_quality_owner_immutable'; END IF;
  IF NEW.revision=OLD.revision AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.spec IS NOT DISTINCT FROM OLD.spec THEN RETURN NEW; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'original_quality_revision_sequence'; END IF;
  SELECT * INTO prior FROM agentstudio.agent_quality089_revisions WHERE spec_id=OLD.id AND owner_user_id=OLD.owner_user_id AND spec_revision=OLD.revision;
  IF prior.spec_id IS NULL OR prior.source_sha256 IS DISTINCT FROM agentstudio.quality089_source_seal(OLD.id,OLD.owner_user_id,OLD.name,OLD.revision,OLD.spec) THEN RAISE EXCEPTION 'original_quality_revision_unavailable'; END IF;
  SELECT * INTO intent FROM agentstudio.agent_quality089_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND spec_id=OLD.id;
  IF intent.spec_id IS NOT NULL THEN
   IF intent.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR intent.before_revision<>OLD.revision OR intent.before_source IS DISTINCT FROM prior.source_sha256 OR intent.consumed_revision IS NOT NULL OR intent.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(intent.checks) OR (intent.kind='save' AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.spec IS DISTINCT FROM OLD.spec)) OR (intent.kind='restore' AND intent.expected_new_source IS DISTINCT FROM seal) THEN RAISE EXCEPTION 'original_quality_intent_changed'; END IF;
   next_state='configured';next_checks=intent.checks;next_hash=intent.checks_sha256;
   UPDATE agentstudio.agent_quality089_intents SET consumed_revision=NEW.revision WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND spec_id=OLD.id;
  ELSE next_state=prior.state;next_checks=prior.checks;next_hash=prior.checks_sha256;
  END IF;
 END IF;
 INSERT INTO agentstudio.agent_quality089_revisions(spec_id,owner_user_id,spec_revision,state,checks,checks_sha256,source_sha256) VALUES(NEW.id,NEW.owner_user_id,NEW.revision,next_state,next_checks,next_hash,seal);
 RETURN NEW;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_spec_snapshot() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_spec_snapshot() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ BEGIN RAISE EXCEPTION 'original_quality_history_immutable'; END
$fn$;
ALTER FUNCTION agentstudio.quality089_immutable() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_immutable() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_intent_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$ BEGIN IF EXISTS(SELECT 1 FROM agentstudio.agent_quality089_intents WHERE backend_pid=NEW.backend_pid AND transaction_id=NEW.transaction_id AND spec_id=NEW.spec_id) THEN RAISE EXCEPTION 'original_quality_intent_not_finished'; END IF;RETURN NULL;END
$fn$;
ALTER FUNCTION agentstudio.quality089_intent_complete() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_intent_complete() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_save(p_spec uuid,p_expected_employee uuid,p_request uuid,p_revision bigint,p_source text,p_checks_sha text,p_checks jsonb,p_request_sha text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();s record;q record;prior record;canonical text;after_seal text;aid uuid;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed'; END IF;
 IF p_spec IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_revision<1 OR p_revision>=9007199254740990 OR p_source IS NULL OR p_source!~'^[a-f0-9]{64}$' OR p_checks_sha IS NOT NULL AND p_checks_sha!~'^[a-f0-9]{64}$' OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_original_quality_write'; END IF;
 canonical=agentstudio.quality089_request_sha(actor,p_spec,p_request,p_revision,p_source,p_checks_sha,p_checks);
 IF canonical IS DISTINCT FROM p_request_sha THEN RAISE EXCEPTION 'original_quality_request_conflict'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,89));
 SELECT * INTO prior FROM agentstudio.agent_quality089_receipts WHERE owner_user_id=actor AND request_id=p_request;
 IF prior.request_id IS NOT NULL THEN IF prior.spec_id<>p_spec OR prior.request_sha256<>canonical THEN RAISE EXCEPTION 'original_quality_request_conflict'; END IF;RETURN agentstudio.quality089_receipt(p_spec,p_request,actor);END IF;
 SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'original_quality_spec_not_found'; END IF;
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=actor AND spec_revision=s.revision;
 IF q.spec_id IS NULL OR q.spec_revision<>p_revision OR q.source_sha256 IS DISTINCT FROM p_source OR q.checks_sha256 IS DISTINCT FROM p_checks_sha OR q.source_sha256 IS DISTINCT FROM agentstudio.quality089_source_seal(s.id,actor,s.name,s.revision,s.spec) THEN RAISE EXCEPTION 'original_quality_revision_conflict'; END IF;
 INSERT INTO agentstudio.agent_quality089_intents(backend_pid,transaction_id,spec_id,owner_user_id,kind,request_id,request_sha256,before_revision,before_source,checks,checks_sha256) VALUES(pg_backend_pid(),txid_current(),p_spec,actor,'save',p_request,canonical,p_revision,p_source,p_checks,agentstudio.quality089_rules_sha(p_checks));
 UPDATE agentstudio.agent_specs SET revision=revision+1,updated_at=clock_timestamp() WHERE id=p_spec AND owner_user_id=actor AND revision=p_revision;
 SELECT source_sha256 INTO after_seal FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=actor AND spec_revision=p_revision+1 AND state='configured' AND checks=p_checks AND checks_sha256=agentstudio.quality089_rules_sha(p_checks);
 IF after_seal IS NULL THEN RAISE EXCEPTION 'original_quality_save_unconfirmed'; END IF;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(actor,actor,'agent.quality.save','agent_spec',p_spec::text,'succeeded',jsonb_build_object('before_revision',p_revision,'after_revision',p_revision+1,'request_id',p_request,'request_sha256',canonical,'checks_sha256',agentstudio.quality089_rules_sha(p_checks),'source_sha256',after_seal)) RETURNING id INTO aid;
 INSERT INTO agentstudio.agent_quality089_receipts(owner_user_id,request_id,spec_id,request_sha256,before_revision,after_revision,audit_event_id) VALUES(actor,p_request,p_spec,canonical,p_revision,p_revision+1,aid);
 DELETE FROM agentstudio.agent_quality089_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND spec_id=p_spec;
 RETURN agentstudio.quality089_receipt(p_spec,p_request,actor);
END
$fn$;
ALTER FUNCTION agentstudio.quality089_save(uuid,uuid,uuid,bigint,text,text,jsonb,text) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_save(uuid,uuid,uuid,bigint,text,text,jsonb,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_save(uuid,uuid,uuid,bigint,text,text,jsonb,text) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_rules_pass(p_checks jsonb,p_output text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE item jsonb; parsed jsonb;kind text;expected text;
BEGIN
 PERFORM agentstudio.quality089_rules_json(p_checks);
 IF jsonb_array_length(p_checks)=0 OR p_output IS NULL OR agentstudio.quality089_utf16_length(p_output)>1000000 OR NOT agentstudio.quality089_has_text(p_output) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_checks) LOOP
  kind=item->>'type';expected=item->>'expected';
  IF kind='contains' AND position(expected IN p_output)=0 OR kind='not_contains' AND position(expected IN p_output)>0 THEN RETURN false;END IF;
  IF kind='json_object' THEN BEGIN parsed=p_output::jsonb;IF jsonb_typeof(parsed)<>'object' THEN RETURN false;END IF;EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;END;END IF;
 END LOOP;
 RETURN true;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_rules_pass(jsonb,text) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_rules_pass(jsonb,text) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_run_passes(p_spec uuid,p_run uuid,p_source text,p_expected_employee uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();a record;r record;q record;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed';END IF;
 SELECT * INTO a FROM agentstudio.agent_release_acceptance_runs WHERE spec_id=p_spec AND owner_user_id=actor AND run_id=p_run;
 IF a.run_id IS NULL OR a.source_sha256 IS DISTINCT FROM p_source THEN RETURN false;END IF;
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=actor AND spec_revision=a.spec_revision;
 IF q.state IS DISTINCT FROM 'configured' OR q.source_sha256 IS DISTINCT FROM p_source OR q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(q.checks) THEN RETURN false;END IF;
 SELECT id,kind,workflow_id,agent_spec_id,status,checkpoint,result_text INTO r FROM agentstudio.runs WHERE id=p_run AND owner_user_id=actor;
 IF r.id IS NULL OR r.kind<>'agent' OR r.workflow_id IS NOT NULL OR r.agent_spec_id IS DISTINCT FROM p_spec OR r.status<>'succeeded' OR r.checkpoint->>'execution_mode' IS DISTINCT FROM 'agent_native_v2' OR r.checkpoint->>'spec_revision' IS DISTINCT FROM a.spec_revision::text THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM agentstudio.run_steps WHERE run_id=p_run AND owner_user_id=actor AND step_key='wf2_00002_agent' AND status='succeeded') OR NOT EXISTS(SELECT 1 FROM agentstudio.run_steps WHERE run_id=p_run AND owner_user_id=actor AND status='succeeded' AND metadata->>'agent_phase'='model') THEN RETURN false;END IF;
 -- Empty explicitly configured rules add no quality approval. Existing Native
 -- completion/ACL checks and old untested acknowledgement remain independent.
 IF jsonb_array_length(q.checks)=0 THEN RETURN true;END IF;
 RETURN agentstudio.quality089_rules_pass(q.checks,r.result_text);
END
$fn$;
ALTER FUNCTION agentstudio.quality089_run_passes(uuid,uuid,text,uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_run_passes(uuid,uuid,text,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_run_passes(uuid,uuid,text,uuid) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_publication_requirements(p_spec uuid,p_version uuid,p_expected_employee uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();s record;v record;current_q record;version_q record;needs_test boolean;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed';END IF;
 SELECT id,owner_user_id,name,spec,revision INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'original_quality_spec_not_found';END IF;
 SELECT * INTO current_q FROM agentstudio.agent_quality089_revisions WHERE spec_id=p_spec AND owner_user_id=actor AND spec_revision=s.revision;
 SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor AND status<>'deleted';
 SELECT q.* INTO version_q FROM agentstudio.agent_quality089_versions m JOIN agentstudio.agent_quality089_revisions q ON (q.spec_id,q.owner_user_id,q.spec_revision)=(m.spec_id,m.owner_user_id,m.spec_revision) WHERE m.version_id=p_version AND m.spec_id=p_spec AND m.owner_user_id=actor;
 IF current_q.state IS DISTINCT FROM 'configured' OR version_q.state IS DISTINCT FROM 'configured' OR current_q.source_sha256 IS DISTINCT FROM agentstudio.quality089_source_seal(s.id,actor,s.name,s.revision,s.spec) OR v.id IS NULL OR version_q.source_sha256 IS DISTINCT FROM v.source_sha256 OR current_q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(current_q.checks) OR version_q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(version_q.checks) THEN RAISE EXCEPTION 'original_quality_revision_missing';END IF;
 needs_test=jsonb_array_length(current_q.checks)>0 OR jsonb_array_length(version_q.checks)>0;
 IF needs_test AND (v.spec_revision<>s.revision OR v.source_sha256 IS DISTINCT FROM current_q.source_sha256 OR version_q.checks_sha256 IS DISTINCT FROM current_q.checks_sha256) THEN RAISE EXCEPTION 'original_quality_run_not_current';END IF;
 RETURN jsonb_build_object('requires_native_test',needs_test,'rule_count',jsonb_array_length(version_q.checks),'spec_revision',v.spec_revision,'source_sha256',v.source_sha256,'checks_sha256',version_q.checks_sha256);
END
$fn$;
ALTER FUNCTION agentstudio.quality089_publication_requirements(uuid,uuid,uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_publication_requirements(uuid,uuid,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_publication_requirements(uuid,uuid,uuid) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_release_capture() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE q record;
BEGIN
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=NEW.spec_id AND owner_user_id=NEW.owner_user_id AND spec_revision=NEW.spec_revision;
 IF q.state IS DISTINCT FROM 'configured' OR q.source_sha256 IS DISTINCT FROM NEW.source_sha256 OR q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(q.checks) THEN RAISE EXCEPTION 'original_quality_revision_missing';END IF;
 INSERT INTO agentstudio.agent_quality089_versions(version_id,owner_user_id,spec_id,spec_revision) VALUES(NEW.id,NEW.owner_user_id,NEW.spec_id,NEW.spec_revision);RETURN NEW;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_release_capture() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_release_capture() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_acceptance_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();q record;s record;
BEGIN
 IF actor IS DISTINCT FROM NEW.owner_user_id OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed';END IF;
 SELECT id,revision,name,spec INTO s FROM agentstudio.agent_specs WHERE id=NEW.spec_id AND owner_user_id=actor FOR SHARE;
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=NEW.spec_id AND owner_user_id=actor AND spec_revision=NEW.spec_revision;
 IF s.id IS NULL OR s.revision<>NEW.spec_revision OR q.state IS DISTINCT FROM 'configured' OR q.source_sha256 IS DISTINCT FROM NEW.source_sha256 OR q.source_sha256 IS DISTINCT FROM agentstudio.quality089_source_seal(s.id,actor,s.name,s.revision,s.spec) OR q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(q.checks) THEN RAISE EXCEPTION 'original_quality_revision_missing';END IF;RETURN NEW;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_acceptance_guard() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_acceptance_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_publish_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE required jsonb;
BEGIN
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' THEN
  required=agentstudio.quality089_publication_requirements(NEW.spec_id,NEW.id,NEW.owner_user_id);
  IF (required->>'requires_native_test')::boolean AND (NOT NEW.test_passed OR NEW.test_run_id IS NULL OR NOT agentstudio.quality089_run_passes(NEW.spec_id,NEW.test_run_id,NEW.source_sha256,NEW.owner_user_id)) THEN RAISE EXCEPTION 'original_quality_assertions_failed';END IF;
 END IF;RETURN NEW;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_publish_guard() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_publish_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE FUNCTION agentstudio.quality089_restore_stage(p_spec uuid,p_version uuid,p_revision bigint,p_source text,p_version_sha text,p_version_revision bigint,p_request uuid,p_request_sha text,p_expected_employee uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE actor uuid=agentstudio.actor_id();s record;v record;q record;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_expected_employee OR NOT agentstudio.quality089_native_active(actor) THEN RAISE EXCEPTION 'original_quality_employee_changed';END IF;
 IF p_request IS NULL OR p_request_sha IS NULL OR p_request_sha!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_original_quality_write';END IF;
 SELECT id,revision,name,spec INTO s FROM agentstudio.agent_specs WHERE id=p_spec AND owner_user_id=actor FOR UPDATE;
 SELECT * INTO v FROM agentstudio.agent_release_versions WHERE id=p_version AND spec_id=p_spec AND owner_user_id=actor AND status<>'deleted';
 SELECT qr.* INTO q FROM agentstudio.agent_quality089_versions m JOIN agentstudio.agent_quality089_revisions qr ON (qr.spec_id,qr.owner_user_id,qr.spec_revision)=(m.spec_id,m.owner_user_id,m.spec_revision) WHERE m.version_id=p_version AND m.spec_id=p_spec AND m.owner_user_id=actor;
 IF s.id IS NULL OR s.revision IS DISTINCT FROM p_revision OR p_revision>=9007199254740990 OR agentstudio.quality089_source_seal(s.id,actor,s.name,s.revision,s.spec) IS DISTINCT FROM p_source OR v.id IS NULL OR v.revision IS DISTINCT FROM p_version_revision OR agentstudio.quality089_version_sha(v.id) IS DISTINCT FROM p_version_sha OR q.state IS DISTINCT FROM 'configured' OR q.source_sha256 IS DISTINCT FROM v.source_sha256 OR q.checks_sha256 IS DISTINCT FROM agentstudio.quality089_rules_sha(q.checks) THEN RAISE EXCEPTION 'original_quality_restore_unavailable';END IF;
 INSERT INTO agentstudio.agent_quality089_intents(backend_pid,transaction_id,spec_id,owner_user_id,kind,request_id,request_sha256,before_revision,before_source,checks,checks_sha256,expected_new_source,version_id) VALUES(pg_backend_pid(),txid_current(),p_spec,actor,'restore',p_request,p_request_sha,p_revision,p_source,q.checks,q.checks_sha256,agentstudio.quality089_source_seal(s.id,actor,v.name_snapshot,p_revision+1,v.spec_snapshot),p_version);
END
$fn$;
ALTER FUNCTION agentstudio.quality089_restore_stage(uuid,uuid,bigint,text,text,bigint,uuid,text,uuid) OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_restore_stage(uuid,uuid,bigint,text,text,bigint,uuid,text,uuid) FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT EXECUTE ON FUNCTION agentstudio.quality089_restore_stage(uuid,uuid,bigint,text,text,bigint,uuid,text,uuid) TO agentstudio_api;
CREATE FUNCTION agentstudio.quality089_restore_receipt_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS $fn$
DECLARE intent agentstudio.agent_quality089_intents%ROWTYPE;q record;actor uuid=agentstudio.actor_id();
BEGIN
 IF NEW.action<>'restore' THEN RETURN NEW;END IF;
 SELECT * INTO intent FROM agentstudio.agent_quality089_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND spec_id=NEW.spec_id;
 SELECT * INTO q FROM agentstudio.agent_quality089_revisions WHERE spec_id=NEW.spec_id AND owner_user_id=NEW.actor_user_id AND spec_revision=intent.consumed_revision;
 IF actor IS DISTINCT FROM NEW.actor_user_id OR intent.kind IS DISTINCT FROM 'restore' OR intent.owner_user_id IS DISTINCT FROM actor OR intent.request_id IS DISTINCT FROM NEW.request_id OR intent.request_sha256 IS DISTINCT FROM NEW.request_sha256 OR intent.consumed_revision IS NULL OR q.state IS DISTINCT FROM 'configured' OR q.checks IS DISTINCT FROM intent.checks OR q.checks_sha256 IS DISTINCT FROM intent.checks_sha256 OR q.source_sha256 IS DISTINCT FROM intent.expected_new_source OR NEW.result->>'version_id' IS DISTINCT FROM intent.version_id::text OR NEW.result->>'spec_revision' IS DISTINCT FROM intent.consumed_revision::text OR NEW.result->>'source_sha256' IS DISTINCT FROM intent.expected_new_source THEN RAISE EXCEPTION 'original_quality_restore_unavailable';END IF;
 INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES(actor,actor,'agent.quality.restore','agent_spec',NEW.spec_id::text,'succeeded',jsonb_build_object('request_id',NEW.request_id,'request_sha256',NEW.request_sha256,'version_id',intent.version_id,'before_revision',intent.before_revision,'after_revision',intent.consumed_revision,'checks_sha256',intent.checks_sha256,'source_sha256',intent.expected_new_source));
 DELETE FROM agentstudio.agent_quality089_intents WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND spec_id=NEW.spec_id;RETURN NEW;
END
$fn$;
ALTER FUNCTION agentstudio.quality089_restore_receipt_guard() OWNER TO agentstudio_quality089;
REVOKE ALL ON FUNCTION agentstudio.quality089_restore_receipt_guard() FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;

GRANT SELECT(id,owner_user_id,name,spec,revision,updated_at) ON agentstudio.agent_specs TO agentstudio_quality089;
GRANT UPDATE(revision,updated_at) ON agentstudio.agent_specs TO agentstudio_quality089;
GRANT SELECT ON agentstudio.agent_release_versions,agentstudio.agent_release_acceptance_runs TO agentstudio_quality089;
GRANT SELECT(id,owner_user_id,workflow_id,agent_spec_id,kind,status,checkpoint,result_text) ON agentstudio.runs TO agentstudio_quality089;
GRANT SELECT(run_id,owner_user_id,step_key,status,metadata) ON agentstudio.run_steps TO agentstudio_quality089;
GRANT SELECT(id,status,external_issuer) ON agentstudio.users TO agentstudio_quality089;
GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_quality089;
GRANT SELECT(id,owner_user_id,actor_user_id,action,target_kind,target_id,result) ON agentstudio.audit_events TO agentstudio_quality089;
GRANT INSERT(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) ON agentstudio.audit_events TO agentstudio_quality089;
CREATE POLICY quality089_specs_read ON agentstudio.agent_specs FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_specs_write ON agentstudio.agent_specs FOR UPDATE TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_versions_read ON agentstudio.agent_release_versions FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_acceptances_read ON agentstudio.agent_release_acceptance_runs FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_runs_read ON agentstudio.runs FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_steps_read ON agentstudio.run_steps FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_users_read ON agentstudio.users FOR SELECT TO agentstudio_quality089 USING(id=agentstudio.actor_id());
CREATE POLICY quality089_accounts_read ON agentstudio_auth.accounts FOR SELECT TO agentstudio_quality089 USING(user_id=agentstudio.actor_id());
CREATE POLICY quality089_audit_read ON agentstudio.audit_events FOR SELECT TO agentstudio_quality089 USING(owner_user_id=agentstudio.actor_id());
CREATE POLICY quality089_audit_write ON agentstudio.audit_events FOR INSERT TO agentstudio_quality089 WITH CHECK(owner_user_id=agentstudio.actor_id() AND actor_user_id=agentstudio.actor_id());
ALTER TABLE agentstudio.agent_quality089_revisions OWNER TO agentstudio_quality089;
ALTER TABLE agentstudio.agent_quality089_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_quality089_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_quality089_revisions FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE POLICY quality089_private ON agentstudio.agent_quality089_revisions TO agentstudio_quality089 USING(true) WITH CHECK(true);
ALTER TABLE agentstudio.agent_quality089_receipts OWNER TO agentstudio_quality089;
ALTER TABLE agentstudio.agent_quality089_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_quality089_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_quality089_receipts FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE POLICY quality089_private ON agentstudio.agent_quality089_receipts TO agentstudio_quality089 USING(true) WITH CHECK(true);
ALTER TABLE agentstudio.agent_quality089_versions OWNER TO agentstudio_quality089;
ALTER TABLE agentstudio.agent_quality089_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_quality089_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_quality089_versions FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE POLICY quality089_private ON agentstudio.agent_quality089_versions TO agentstudio_quality089 USING(true) WITH CHECK(true);
ALTER TABLE agentstudio.agent_quality089_intents OWNER TO agentstudio_quality089;
ALTER TABLE agentstudio.agent_quality089_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_quality089_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.agent_quality089_intents FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
CREATE POLICY quality089_private ON agentstudio.agent_quality089_intents TO agentstudio_quality089 USING(true) WITH CHECK(true);
ALTER TABLE agentstudio.agent_quality089_revisions ADD CONSTRAINT quality089_revision_rules CHECK(state='missing' OR checks_sha256=agentstudio.quality089_rules_sha(checks));
ALTER TABLE agentstudio.agent_quality089_intents ADD CONSTRAINT quality089_intent_rules CHECK(checks_sha256=agentstudio.quality089_rules_sha(checks));
CREATE TRIGGER quality089_specs_snapshot AFTER INSERT OR UPDATE ON agentstudio.agent_specs FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_spec_snapshot();
CREATE TRIGGER quality089_revision_immutable BEFORE UPDATE OR DELETE ON agentstudio.agent_quality089_revisions FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_immutable();
CREATE TRIGGER quality089_receipt_immutable BEFORE UPDATE OR DELETE ON agentstudio.agent_quality089_receipts FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_immutable();
CREATE TRIGGER quality089_version_immutable BEFORE UPDATE OR DELETE ON agentstudio.agent_quality089_versions FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_immutable();
CREATE CONSTRAINT TRIGGER quality089_intent_complete AFTER INSERT OR UPDATE ON agentstudio.agent_quality089_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_intent_complete();
CREATE TRIGGER quality089_release_capture AFTER INSERT ON agentstudio.agent_release_versions FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_release_capture();
CREATE TRIGGER quality089_publish_guard BEFORE UPDATE ON agentstudio.agent_release_versions FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_publish_guard();
CREATE TRIGGER quality089_acceptance_guard BEFORE INSERT ON agentstudio.agent_release_acceptance_runs FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_acceptance_guard();
CREATE TRIGGER quality089_restore_receipt_guard BEFORE INSERT ON agentstudio.agent_release_receipts FOR EACH ROW EXECUTE FUNCTION agentstudio.quality089_restore_receipt_guard();
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_089','original employee quality revision v1; fresh isolated only');
COMMIT;
