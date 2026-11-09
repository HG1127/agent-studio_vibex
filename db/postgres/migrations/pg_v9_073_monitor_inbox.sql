-- OPTIONAL073: quarantined historical monitor metadata + employee read receipts.
-- No collector/domain/review source adapter is installed here. Every entry stays
-- source_unavailable until that separate real backend exists. Never a full monitor
-- production profile, and never an import/cutover authorization. No role created.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR session_user<>current_user OR pg_catalog.pg_is_in_recovery()
 OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_catalog.pg_has_role(r.oid,current_user::regrole,'MEMBER'))
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_052')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_073')
 OR to_regclass('agentstudio_auth.accounts') IS NULL OR to_regprocedure('agentstudio.actor_id()') IS NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (starts_with(t.typname,'native_monitor_') OR starts_with(t.typname,'_native_monitor_')))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND starts_with(c.conname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE starts_with(polname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND starts_with(tgname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'native_monitor_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN RAISE EXCEPTION 'native_monitor_preflight_refused'; END IF;
END $preflight$;
CREATE FUNCTION agentstudio.native_monitor_import_valid(text,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 ~ '^[a-f0-9]{64}$' AND $2 BETWEEN 1 AND 9007199254740991
$fn$;
CREATE FUNCTION agentstudio.native_monitor_meta_valid(bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 BETWEEN 1 AND 9007199254740990 AND $2 BETWEEN 1 AND 9007199254740991
$fn$;
CREATE FUNCTION agentstudio.native_monitor_status_valid(text) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 IN('collecting','freezing','analyzing','needs_review','incomplete','complete','cancelled')
$fn$;
CREATE FUNCTION agentstudio.native_monitor_event_valid(text,text,boolean,bigint,bigint) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT $1 ~ '^[a-f0-9]{64}$' AND $2 IN('additional_role','role_started','role_ended','conflict','source_invalidated','fact_corrected','control_changed','schedule_changed') AND (NOT $3 OR $2 IN('additional_role','role_started','role_ended','conflict','source_invalidated','fact_corrected')) AND $4 BETWEEN 0 AND 9007199254740991 AND $5 BETWEEN 1 AND 9007199254740991 AND ($4=0 OR $4 >= $5)
$fn$;
CREATE TABLE agentstudio.native_monitor_imports(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 source_snapshot_sha256 text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT native_monitor_imports_pkey PRIMARY KEY(id),
 CONSTRAINT native_monitor_imports_owner_uq UNIQUE(id,owner_user_id),
 CONSTRAINT native_monitor_imports_user_fk FOREIGN KEY(owner_user_id) REFERENCES agentstudio.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT native_monitor_imports_valid_ck CHECK(agentstudio.native_monitor_import_valid(source_snapshot_sha256,created_ms))
);
CREATE TABLE agentstudio.native_monitor_cases(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 import_id uuid NOT NULL,
 CONSTRAINT native_monitor_cases_pkey PRIMARY KEY(id),
 CONSTRAINT native_monitor_cases_owner_uq UNIQUE(id,owner_user_id),
 CONSTRAINT native_monitor_cases_import_fk FOREIGN KEY(import_id,owner_user_id) REFERENCES agentstudio.native_monitor_imports(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE TABLE agentstudio.native_monitor_monitors(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 case_id uuid NOT NULL,
 revision bigint NOT NULL,
 enabled boolean NOT NULL,
 current_check_id uuid,
 created_ms bigint NOT NULL,
 CONSTRAINT native_monitor_monitors_pkey PRIMARY KEY(id),
 CONSTRAINT native_monitor_monitors_owner_case_uq UNIQUE(id,owner_user_id,case_id),
 CONSTRAINT native_monitor_monitors_case_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.native_monitor_cases(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT native_monitor_monitors_valid_ck CHECK(agentstudio.native_monitor_meta_valid(revision,created_ms))
);
CREATE TABLE agentstudio.native_monitor_checks(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 monitor_id uuid NOT NULL,
 case_id uuid NOT NULL,
 monitor_revision bigint NOT NULL,
 status text NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT native_monitor_checks_pkey PRIMARY KEY(id),
 CONSTRAINT native_monitor_checks_owner_monitor_uq UNIQUE(id,owner_user_id,monitor_id),
 CONSTRAINT native_monitor_checks_monitor_fk FOREIGN KEY(monitor_id,owner_user_id,case_id) REFERENCES agentstudio.native_monitor_monitors(id,owner_user_id,case_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT native_monitor_checks_valid_ck CHECK(agentstudio.native_monitor_meta_valid(monitor_revision,created_ms)),
 CONSTRAINT native_monitor_checks_status_ck CHECK(agentstudio.native_monitor_status_valid(status))
);
CREATE TABLE agentstudio.native_monitor_events(
 id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 monitor_id uuid NOT NULL,
 check_id uuid NOT NULL,
 dedup_hash text NOT NULL,
 kind text NOT NULL,
 notify boolean NOT NULL,
 read_ms bigint NOT NULL,
 created_ms bigint NOT NULL,
 CONSTRAINT native_monitor_events_pkey PRIMARY KEY(id),
 CONSTRAINT native_monitor_events_owner_uq UNIQUE(id,owner_user_id),
 CONSTRAINT native_monitor_events_dedup_uq UNIQUE(monitor_id,dedup_hash),
 CONSTRAINT native_monitor_events_check_fk FOREIGN KEY(check_id,owner_user_id,monitor_id) REFERENCES agentstudio.native_monitor_checks(id,owner_user_id,monitor_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT native_monitor_events_valid_ck CHECK(agentstudio.native_monitor_event_valid(dedup_hash,kind,notify,read_ms,created_ms))
);
CREATE TABLE agentstudio.native_monitor_reads(
 event_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 read_ms bigint NOT NULL,
 governance_revision bigint NOT NULL,
 CONSTRAINT native_monitor_reads_pkey PRIMARY KEY(event_id),
 CONSTRAINT native_monitor_reads_event_fk FOREIGN KEY(event_id,owner_user_id) REFERENCES agentstudio.native_monitor_events(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT native_monitor_reads_valid_ck CHECK(agentstudio.native_monitor_meta_valid(governance_revision,read_ms))
);
ALTER TABLE agentstudio.native_monitor_monitors ADD CONSTRAINT native_monitor_monitors_current_fk FOREIGN KEY(current_check_id,owner_user_id,id) REFERENCES agentstudio.native_monitor_checks(id,owner_user_id,monitor_id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION agentstudio.native_monitor_immutable() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'native_monitor_immutable'; END
$fn$;
CREATE FUNCTION agentstudio.native_monitor_read_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF to_jsonb(NEW)-'read_ms' IS DISTINCT FROM to_jsonb(OLD)-'read_ms' OR OLD.read_ms<>0 OR NEW.read_ms<1 OR NOT EXISTS(SELECT 1 FROM agentstudio.native_monitor_reads r WHERE r.event_id=OLD.id AND r.owner_user_id=OLD.owner_user_id AND r.read_ms=NEW.read_ms) THEN RAISE EXCEPTION 'native_monitor_read_audit_required'; END IF;
 RETURN NEW;
END
$fn$;
CREATE FUNCTION agentstudio.native_monitor_ack(uuid,uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid; epoch bigint; event_row agentstudio.native_monitor_events; stamp bigint;
BEGIN
 owner_id=agentstudio.actor_id();
 SELECT a.governance_revision INTO epoch FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=owner_id AND a.enabled AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1' FOR SHARE OF a,u;
 IF epoch IS NULL THEN RAISE EXCEPTION 'native_monitor_session_required'; END IF;
 IF owner_id IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'native_monitor_employee_changed'; END IF;
 SELECT * INTO event_row FROM agentstudio.native_monitor_events e WHERE e.id=$1 AND e.owner_user_id=owner_id AND e.notify FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'native_monitor_event_not_found'; END IF;
 IF event_row.read_ms>0 THEN RETURN true; END IF;
 stamp=greatest(event_row.created_ms,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO agentstudio.native_monitor_reads(event_id,owner_user_id,read_ms,governance_revision) VALUES(event_row.id,owner_id,stamp,epoch);
 UPDATE agentstudio.native_monitor_events SET read_ms=stamp WHERE id=event_row.id AND owner_user_id=owner_id AND read_ms=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'native_monitor_read_changed'; END IF;
 RETURN true;
END
$fn$;
REVOKE ALL ON agentstudio.native_monitor_imports FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_imports_owner ON agentstudio.native_monitor_imports FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_imports TO agentstudio_api;
CREATE TRIGGER native_monitor_imports_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_monitor_imports FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
REVOKE ALL ON agentstudio.native_monitor_cases FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_cases_owner ON agentstudio.native_monitor_cases FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_cases TO agentstudio_api;
CREATE TRIGGER native_monitor_cases_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_monitor_cases FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
REVOKE ALL ON agentstudio.native_monitor_monitors FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_monitors FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_monitors_owner ON agentstudio.native_monitor_monitors FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_monitors TO agentstudio_api;
CREATE TRIGGER native_monitor_monitors_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_monitor_monitors FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
REVOKE ALL ON agentstudio.native_monitor_checks FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_checks_owner ON agentstudio.native_monitor_checks FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_checks TO agentstudio_api;
CREATE TRIGGER native_monitor_checks_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_monitor_checks FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
REVOKE ALL ON agentstudio.native_monitor_events FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_events FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_events_owner ON agentstudio.native_monitor_events FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_events TO agentstudio_api;
CREATE TRIGGER native_monitor_events_immutable BEFORE DELETE OR TRUNCATE ON agentstudio.native_monitor_events FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
CREATE TRIGGER native_monitor_events_read_guard BEFORE UPDATE ON agentstudio.native_monitor_events FOR EACH ROW EXECUTE FUNCTION agentstudio.native_monitor_read_guard();
REVOKE ALL ON agentstudio.native_monitor_reads FROM PUBLIC;
ALTER TABLE agentstudio.native_monitor_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.native_monitor_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY native_monitor_reads_owner ON agentstudio.native_monitor_reads FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.native_monitor_reads TO agentstudio_api;
CREATE TRIGGER native_monitor_reads_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON agentstudio.native_monitor_reads FOR EACH STATEMENT EXECUTE FUNCTION agentstudio.native_monitor_immutable();
REVOKE ALL ON FUNCTION agentstudio.native_monitor_import_valid(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_meta_valid(bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_status_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_event_valid(text,text,boolean,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_read_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION agentstudio.native_monitor_ack(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.native_monitor_ack(uuid,uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_073','Quarantined historical monitor metadata and Native employee read receipts; no monitor producer');
COMMIT;
