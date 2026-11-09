-- Independent optional role profile. No 080/081 or auth-schema grants.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $guard$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_database()<>'agent_studio'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5333
 OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 OR pg_is_in_recovery()
 OR current_setting('agentstudio.original_role_profile',true) IS DISTINCT FROM 'original-roles-v2'
 OR current_setting('agentstudio.original_role_approval',true) IS DISTINCT FROM 'APPROVE_DISPOSABLE_ORIGINAL_ROLES_V2_SCHEMA_ONLY'
 OR to_regnamespace('agentstudio_roles') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclnamespace=0) OR EXISTS(SELECT 1 FROM pg_event_trigger) THEN RAISE EXCEPTION 'original_role_schema_not_approved'; END IF;
 IF EXISTS(SELECT 1 FROM agentstudio.users) OR EXISTS(SELECT 1 FROM agentstudio.runs) OR EXISTS(SELECT 1 FROM agentstudio.agent_specs) THEN RAISE EXCEPTION 'original_role_fresh_target_required'; END IF;
 IF NOT pg_try_advisory_xact_lock(61824,20261103) THEN RAISE EXCEPTION 'original_role_schema_busy'; END IF;
END $guard$;
CREATE SCHEMA agentstudio_roles AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA agentstudio_roles FROM PUBLIC;
GRANT USAGE ON SCHEMA agentstudio_roles TO agentstudio_api,agentstudio_worker;
CREATE TABLE agentstudio_roles.runtime_profile(
protocol text CONSTRAINT runtime_profile_protocol_nn NOT NULL,
source_sha256 text CONSTRAINT runtime_profile_source_sha256_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT runtime_profile_created_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT runtime_profile_pkey PRIMARY KEY (protocol),
CONSTRAINT runtime_profile_ck0 CHECK (protocol='original-roles-v2'),
CONSTRAINT runtime_profile_ck1 CHECK (source_sha256 ~ '^[a-f0-9]{64}$'));
ALTER TABLE agentstudio_roles.runtime_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.runtime_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY runtime_profile_owner ON agentstudio_roles.runtime_profile TO agentstudio_api USING(true) WITH CHECK(false);
REVOKE ALL ON agentstudio_roles.runtime_profile FROM PUBLIC;
GRANT SELECT ON agentstudio_roles.runtime_profile TO agentstudio_api;

CREATE TABLE agentstudio_roles.original_skills(
owner_user_id uuid CONSTRAINT original_skills_owner_user_id_nn NOT NULL,
id text CONSTRAINT original_skills_id_nn NOT NULL,
name text CONSTRAINT original_skills_name_nn NOT NULL,
active boolean CONSTRAINT original_skills_active_nn NOT NULL DEFAULT true,
latest_version integer CONSTRAINT original_skills_latest_version_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT original_skills_created_at_nn NOT NULL DEFAULT clock_timestamp(),
updated_at timestamp with time zone CONSTRAINT original_skills_updated_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_skills_pkey PRIMARY KEY (owner_user_id,id),
CONSTRAINT original_skills_u1 UNIQUE (owner_user_id,name),
CONSTRAINT original_skills_ck0 CHECK (id ~ '^[A-Za-z0-9]{15}$'),
CONSTRAINT original_skills_ck1 CHECK (length(name) BETWEEN 1 AND 64 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
CONSTRAINT original_skills_ck2 CHECK (latest_version BETWEEN 1 AND 100),
CONSTRAINT original_skills_fk0 FOREIGN KEY (owner_user_id) REFERENCES agentstudio.users(id) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_skills FORCE ROW LEVEL SECURITY;
CREATE POLICY original_skills_owner ON agentstudio_roles.original_skills TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_skills FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_skills TO agentstudio_api;
GRANT UPDATE(active,latest_version,updated_at) ON agentstudio_roles.original_skills TO agentstudio_api;
CREATE TABLE agentstudio_roles.original_skill_versions(
owner_user_id uuid CONSTRAINT original_skill_versions_owner_user_id_nn NOT NULL,
skill_id text CONSTRAINT original_skill_versions_skill_id_nn NOT NULL,
version integer CONSTRAINT original_skill_versions_version_nn NOT NULL,
name text CONSTRAINT original_skill_versions_name_nn NOT NULL,
description text CONSTRAINT original_skill_versions_description_nn NOT NULL,
content text CONSTRAINT original_skill_versions_content_nn NOT NULL,
content_sha256 text CONSTRAINT original_skill_versions_content_sha256_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT original_skill_versions_created_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_skill_versions_pkey PRIMARY KEY (owner_user_id,skill_id,version),
CONSTRAINT original_skill_versions_u1 UNIQUE (owner_user_id,skill_id,version,content_sha256),
CONSTRAINT original_skill_versions_ck0 CHECK (version BETWEEN 1 AND 100),
CONSTRAINT original_skill_versions_ck1 CHECK (length(name) BETWEEN 1 AND 64),
CONSTRAINT original_skill_versions_ck2 CHECK (length(description) BETWEEN 1 AND 1024),
CONSTRAINT original_skill_versions_ck3 CHECK (length(content) BETWEEN 15 AND 16000),
CONSTRAINT original_skill_versions_ck4 CHECK (content_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256=encode(sha256(convert_to(content,'UTF8')),'hex')),
CONSTRAINT original_skill_versions_fk0 FOREIGN KEY (owner_user_id,skill_id) REFERENCES agentstudio_roles.original_skills(owner_user_id,id) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_skill_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY original_skill_versions_owner ON agentstudio_roles.original_skill_versions TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_skill_versions FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_skill_versions TO agentstudio_api;

CREATE TABLE agentstudio_roles.original_skill_reviews(
owner_user_id uuid CONSTRAINT original_skill_reviews_owner_user_id_nn NOT NULL,
skill_id text CONSTRAINT original_skill_reviews_skill_id_nn NOT NULL,
version integer CONSTRAINT original_skill_reviews_version_nn NOT NULL,
content_sha256 text CONSTRAINT original_skill_reviews_content_sha256_nn NOT NULL,
reviewed_by uuid CONSTRAINT original_skill_reviews_reviewed_by_nn NOT NULL,
reviewed_at timestamp with time zone CONSTRAINT original_skill_reviews_reviewed_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_skill_reviews_pkey PRIMARY KEY (owner_user_id,skill_id,version),
CONSTRAINT original_skill_reviews_ck0 CHECK (reviewed_by=owner_user_id),
CONSTRAINT original_skill_reviews_fk0 FOREIGN KEY (owner_user_id,skill_id,version,content_sha256) REFERENCES agentstudio_roles.original_skill_versions(owner_user_id,skill_id,version,content_sha256) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_skill_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_skill_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY original_skill_reviews_owner ON agentstudio_roles.original_skill_reviews TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_skill_reviews FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_skill_reviews TO agentstudio_api;

CREATE TABLE agentstudio_roles.original_role_specs(
owner_user_id uuid CONSTRAINT original_role_specs_owner_user_id_nn NOT NULL,
spec_id uuid CONSTRAINT original_role_specs_spec_id_nn NOT NULL,
spec_revision bigint CONSTRAINT original_role_specs_spec_revision_nn NOT NULL,
spec jsonb CONSTRAINT original_role_specs_spec_nn NOT NULL,
spec_sha256 text CONSTRAINT original_role_specs_spec_sha256_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT original_role_specs_created_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_role_specs_pkey PRIMARY KEY (owner_user_id,spec_id,spec_revision),
CONSTRAINT original_role_specs_ck0 CHECK (spec_revision>0),
CONSTRAINT original_role_specs_ck1 CHECK (jsonb_typeof(spec)='object'),
CONSTRAINT original_role_specs_ck2 CHECK (spec_sha256 ~ '^[a-f0-9]{64}$'),
CONSTRAINT original_role_specs_fk0 FOREIGN KEY (spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_role_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_role_specs FORCE ROW LEVEL SECURITY;
CREATE POLICY original_role_specs_owner ON agentstudio_roles.original_role_specs TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_role_specs FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_role_specs TO agentstudio_api;

CREATE TABLE agentstudio_roles.original_role_extensions(
owner_user_id uuid CONSTRAINT original_role_extensions_owner_user_id_nn NOT NULL,
spec_id uuid CONSTRAINT original_role_extensions_spec_id_nn NOT NULL,
spec_revision bigint CONSTRAINT original_role_extensions_spec_revision_nn NOT NULL,
base_spec_sha256 text CONSTRAINT original_role_extensions_base_spec_sha256_nn NOT NULL,
extension jsonb CONSTRAINT original_role_extensions_extension_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT original_role_extensions_created_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_role_extensions_pkey PRIMARY KEY (owner_user_id,spec_id,spec_revision),
CONSTRAINT original_role_extensions_ck0 CHECK (base_spec_sha256 ~ '^[a-f0-9]{64}$'),
CONSTRAINT original_role_extensions_ck1 CHECK (jsonb_typeof(extension)='object'),
CONSTRAINT original_role_extensions_fk0 FOREIGN KEY (owner_user_id,spec_id,spec_revision) REFERENCES agentstudio_roles.original_role_specs(owner_user_id,spec_id,spec_revision) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_role_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_role_extensions FORCE ROW LEVEL SECURITY;
CREATE POLICY original_role_extensions_owner ON agentstudio_roles.original_role_extensions TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_role_extensions FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_role_extensions TO agentstudio_api;

CREATE TABLE agentstudio_roles.original_role_run_pins(
owner_user_id uuid CONSTRAINT original_role_run_pins_owner_user_id_nn NOT NULL,
run_id uuid CONSTRAINT original_role_run_pins_run_id_nn NOT NULL,
spec_id uuid CONSTRAINT original_role_run_pins_spec_id_nn NOT NULL,
spec_revision bigint CONSTRAINT original_role_run_pins_spec_revision_nn NOT NULL,
payload jsonb CONSTRAINT original_role_run_pins_payload_nn NOT NULL,
payload_sha256 text CONSTRAINT original_role_run_pins_payload_sha256_nn NOT NULL,
created_at timestamp with time zone CONSTRAINT original_role_run_pins_created_at_nn NOT NULL DEFAULT clock_timestamp(),
CONSTRAINT original_role_run_pins_pkey PRIMARY KEY (owner_user_id,run_id),
CONSTRAINT original_role_run_pins_ck0 CHECK (jsonb_typeof(payload)='object'),
CONSTRAINT original_role_run_pins_ck1 CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
CONSTRAINT original_role_run_pins_fk0 FOREIGN KEY (run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id) ON UPDATE NO ACTION ON DELETE NO ACTION,
CONSTRAINT original_role_run_pins_fk1 FOREIGN KEY (owner_user_id,spec_id,spec_revision) REFERENCES agentstudio_roles.original_role_specs(owner_user_id,spec_id,spec_revision) ON UPDATE NO ACTION ON DELETE NO ACTION,
CONSTRAINT original_role_run_pins_fk2 FOREIGN KEY (owner_user_id,spec_id,spec_revision) REFERENCES agentstudio_roles.original_role_extensions(owner_user_id,spec_id,spec_revision) ON UPDATE NO ACTION ON DELETE NO ACTION);
ALTER TABLE agentstudio_roles.original_role_run_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_roles.original_role_run_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY original_role_run_pins_owner ON agentstudio_roles.original_role_run_pins TO agentstudio_api USING(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login') WITH CHECK(owner_user_id=agentstudio.actor_id() AND session_user::text='agentstudio_stage_login');
REVOKE ALL ON agentstudio_roles.original_role_run_pins FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio_roles.original_role_run_pins TO agentstudio_api;

CREATE FUNCTION agentstudio_roles.immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='original_role_record_immutable'; END
$body$;
REVOKE ALL ON FUNCTION agentstudio_roles.immutable() FROM PUBLIC;

CREATE FUNCTION agentstudio_roles.worker_pin(uuid,uuid,uuid,bigint,text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE result jsonb; admitted boolean; owner_id uuid;
BEGIN
 IF session_user <> 'agentstudio_stage_worker' THEN RAISE EXCEPTION 'original_role_worker_login_required'; END IF;
 SELECT j.owner_user_id INTO owner_id FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id JOIN agentstudio.users u ON u.id=j.owner_user_id
 WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5 AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp() AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active' AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256' FOR SHARE OF j,r,u;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;
 SELECT EXISTS(SELECT 1 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=owner_id AND run_id=$1) INTO admitted;
 IF NOT admitted THEN
  IF EXISTS(SELECT 1 FROM agentstudio.runs WHERE id=$1 AND checkpoint->'role_run' IS NOT NULL) THEN RAISE EXCEPTION 'original_role_worker_pin_missing'; END IF;
  RETURN NULL;
 END IF;
 SELECT jsonb_build_object('payload',p.payload,'payload_sha256',p.payload_sha256,'spec',h.spec,'spec_sha256',h.spec_sha256) INTO result
 FROM agentstudio.jobs j JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id
 JOIN agentstudio_roles.original_role_run_pins p ON p.run_id=r.id AND p.owner_user_id=r.owner_user_id
 JOIN agentstudio_roles.original_role_specs h ON h.owner_user_id=p.owner_user_id AND h.spec_id=p.spec_id AND h.spec_revision=p.spec_revision
 JOIN agentstudio.users u ON u.id=j.owner_user_id
 WHERE j.run_id=$1 AND j.id=$2 AND j.lease_token=$3 AND j.lease_version=$4 AND j.lease_owner=$5
 AND j.status='leased' AND j.kind='run_tick' AND j.lease_until>clock_timestamp()
 AND j.payload->>'phase'='agent_native_v2' AND r.kind='agent' AND r.status IN('queued','running','paused') AND u.status='active'
 AND r.agent_spec_id=p.spec_id AND j.payload->>'agent_spec_id'=p.spec_id::text
 AND (j.payload->>'spec_revision')::bigint=p.spec_revision
 AND j.payload->>'graph_sha256'=r.checkpoint->'machine'->>'graph_sha256'
 AND r.checkpoint->'role_run'->>'profile'='original-roles-v2'
 AND r.checkpoint->'role_run'->>'run_id'=r.id::text
 AND r.checkpoint->'role_run'->>'payload_sha256'=p.payload_sha256
 FOR SHARE OF j,r,p,h,u;
 IF result IS NULL THEN RAISE EXCEPTION 'original_role_worker_lease_denied'; END IF;
 RETURN result;
END
$body$;
REVOKE ALL ON FUNCTION agentstudio_roles.worker_pin(uuid,uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio_roles.worker_pin(uuid,uuid,uuid,bigint,text) TO agentstudio_worker;
CREATE TRIGGER runtime_profile_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.runtime_profile FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
CREATE TRIGGER original_skill_versions_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.original_skill_versions FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
CREATE TRIGGER original_skill_reviews_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.original_skill_reviews FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
CREATE TRIGGER original_role_specs_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.original_role_specs FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
CREATE TRIGGER original_role_extensions_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.original_role_extensions FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
CREATE TRIGGER original_role_run_pins_immutable BEFORE UPDATE OR DELETE ON agentstudio_roles.original_role_run_pins FOR EACH ROW EXECUTE FUNCTION agentstudio_roles.immutable();
INSERT INTO agentstudio_roles.runtime_profile(protocol,source_sha256) VALUES('original-roles-v2','44318220de1d8a4f3f5de9566d83c2380740c9e933b62e00402b341a77aa176c');
COMMIT;
