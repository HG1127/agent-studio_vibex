-- UNNUMBERED, UNMOUNTED OPTIONAL PROPOSAL. SOURCE ONLY; NOT SQL ACCEPTANCE.
-- Root must assign a migration number and add complete catalog/profile auditing
-- and a lease-scoped Worker reader before any runtime may select this profile.
-- No dependency on 080/081, Staff auth pool, provider, or quality089.
BEGIN;
DO $guard$
BEGIN
 IF current_setting('agentstudio.original_role_profile',true) IS DISTINCT FROM 'original-role-kernel-v1'
 OR current_setting('agentstudio.original_role_approval',true) IS DISTINCT FROM 'APPROVE_DISPOSABLE_ORIGINAL_ROLE_KERNEL_SCHEMA_ONLY'
 OR current_database()<>'agent_studio' OR inet_server_port() IS DISTINCT FROM 5333
 OR current_user<>'postgres' OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 THEN RAISE EXCEPTION 'original_role_schema_not_approved'; END IF;
END $guard$;
CREATE TABLE agentstudio.original_skills(
 owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
 id text NOT NULL CHECK(id ~ '^[A-Za-z0-9]{15}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 64 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 active boolean NOT NULL DEFAULT true,
 latest_version integer NOT NULL CHECK(latest_version BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_user_id,id),UNIQUE(owner_user_id,name)
);
CREATE TABLE agentstudio.original_skill_versions(
 owner_user_id uuid NOT NULL,skill_id text NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 100),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 64),description text NOT NULL CHECK(length(description) BETWEEN 1 AND 1024),
 content text NOT NULL CHECK(length(content) BETWEEN 15 AND 16000),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$' AND content_sha256=encode(sha256(convert_to(content,'UTF8')),'hex')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_user_id,skill_id,version),UNIQUE(owner_user_id,skill_id,version,content_sha256),
 FOREIGN KEY(owner_user_id,skill_id) REFERENCES agentstudio.original_skills(owner_user_id,id)
);
CREATE TABLE agentstudio.original_skill_reviews(
 owner_user_id uuid NOT NULL,skill_id text NOT NULL,version integer NOT NULL,
 content_sha256 text NOT NULL,reviewed_by uuid NOT NULL CHECK(reviewed_by=owner_user_id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_user_id,skill_id,version),
 FOREIGN KEY(owner_user_id,skill_id,version,content_sha256) REFERENCES agentstudio.original_skill_versions(owner_user_id,skill_id,version,content_sha256)
);
CREATE TABLE agentstudio.original_role_extensions(
 owner_user_id uuid NOT NULL,spec_id uuid NOT NULL,spec_revision bigint NOT NULL CHECK(spec_revision>0),
 base_spec_sha256 text NOT NULL CHECK(base_spec_sha256 ~ '^[a-f0-9]{64}$'),
 extension jsonb NOT NULL CHECK(jsonb_typeof(extension)='object' AND extension->>'protocol'='original_roles_pinned_v1'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,spec_id,spec_revision),
 FOREIGN KEY(spec_id,owner_user_id) REFERENCES agentstudio.agent_specs(id,owner_user_id)
);
CREATE TABLE agentstudio.original_role_run_pins(
 owner_user_id uuid NOT NULL,run_id uuid NOT NULL,spec_id uuid NOT NULL,spec_revision bigint NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'protocol'='original_roles_pinned_v1'
  AND payload->>'owner_user_id'=owner_user_id::text AND payload->>'run_id'=run_id::text
  AND payload->>'spec_id'=spec_id::text AND (payload->>'spec_revision')::bigint=spec_revision),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_user_id,run_id),
 FOREIGN KEY(run_id,owner_user_id) REFERENCES agentstudio.runs(id,owner_user_id),
 FOREIGN KEY(owner_user_id,spec_id,spec_revision) REFERENCES agentstudio.original_role_extensions(owner_user_id,spec_id,spec_revision)
);
CREATE FUNCTION agentstudio.original_role_immutable() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
 BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='original_role_record_immutable'; END $body$;
REVOKE ALL ON FUNCTION agentstudio.original_role_immutable() FROM PUBLIC;
CREATE TRIGGER original_skill_versions_immutable BEFORE UPDATE OR DELETE ON agentstudio.original_skill_versions FOR EACH ROW EXECUTE FUNCTION agentstudio.original_role_immutable();
CREATE TRIGGER original_skill_reviews_immutable BEFORE UPDATE OR DELETE ON agentstudio.original_skill_reviews FOR EACH ROW EXECUTE FUNCTION agentstudio.original_role_immutable();
CREATE TRIGGER original_role_extensions_immutable BEFORE UPDATE OR DELETE ON agentstudio.original_role_extensions FOR EACH ROW EXECUTE FUNCTION agentstudio.original_role_immutable();
CREATE TRIGGER original_role_run_pins_immutable BEFORE UPDATE OR DELETE ON agentstudio.original_role_run_pins FOR EACH ROW EXECUTE FUNCTION agentstudio.original_role_immutable();
ALTER TABLE agentstudio.original_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_skills FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_skill_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_skill_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_skill_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_role_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_role_extensions FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_role_run_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.original_role_run_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY original_skills_owner ON agentstudio.original_skills TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY original_skill_versions_owner ON agentstudio.original_skill_versions TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY original_skill_reviews_owner ON agentstudio.original_skill_reviews TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY original_role_extensions_owner ON agentstudio.original_role_extensions TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY original_role_run_pins_owner ON agentstudio.original_role_run_pins TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
REVOKE ALL ON agentstudio.original_skills,agentstudio.original_skill_versions,agentstudio.original_skill_reviews,agentstudio.original_role_extensions,agentstudio.original_role_run_pins FROM PUBLIC;
GRANT SELECT,INSERT ON agentstudio.original_skills,agentstudio.original_skill_versions,agentstudio.original_skill_reviews,agentstudio.original_role_extensions,agentstudio.original_role_run_pins TO agentstudio_api;
GRANT UPDATE(active,latest_version,updated_at) ON agentstudio.original_skills TO agentstudio_api;
-- Worker and NativeAuth receive NO direct library/version/review access here.
-- COMMIT intentionally omitted: proposal has no approved runtime/catalog profile.
ROLLBACK;
