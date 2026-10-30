-- OPTIONAL071: owner-only original employee Agent catalog bookmarks.
-- Separate explicit profile after070. No execution/spec revision/role change.
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
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_069')
 OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_070')
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_071')
 OR pg_catalog.to_regclass('agentstudio.agent_spec_authoring') IS NULL
 OR pg_catalog.to_regclass('agentstudio.agent_specs') IS NULL
 OR pg_catalog.to_regprocedure('agentstudio.actor_id()') IS NULL
 OR pg_catalog.to_regclass('agentstudio.agent_spec_favorites') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'agent_spec_favorites'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND t.typname IN('agent_spec_favorites','_agent_spec_favorites'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND (starts_with(p.proname,'agent_catalog_') OR starts_with(p.proname,'agent_spec_favorites_')))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND starts_with(c.conname,'agent_spec_favorites_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(p.polname,'agent_spec_favorites_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND NOT t.tgisinternal AND starts_with(t.tgname,'agent_spec_favorites_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'agent_catalog_') OR starts_with(evtname,'agent_spec_favorites_'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace IN(0,'agentstudio'::regnamespace)) THEN
  RAISE EXCEPTION 'original_agent_catalog_preflight_refused';
 END IF;
END $preflight$;
CREATE TABLE agentstudio.agent_spec_favorites(
 agent_spec_id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL,
 favorite boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT agent_spec_favorites_owner_fk FOREIGN KEY(agent_spec_id,owner_user_id)
  REFERENCES agentstudio.agent_specs(id,owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
REVOKE ALL ON agentstudio.agent_spec_favorites FROM PUBLIC;
ALTER TABLE agentstudio.agent_spec_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.agent_spec_favorites FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_spec_favorites_owner ON agentstudio.agent_spec_favorites TO agentstudio_api
 USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
GRANT SELECT ON agentstudio.agent_spec_favorites TO agentstudio_api;
GRANT INSERT(agent_spec_id,owner_user_id,favorite) ON agentstudio.agent_spec_favorites TO agentstudio_api;
GRANT UPDATE(favorite,updated_at) ON agentstudio.agent_spec_favorites TO agentstudio_api;
-- No DELETE/TRUNCATE, Worker/Broker/PUBLIC grant, role or helper function.
INSERT INTO agentstudio.schema_migrations(version,description)
 VALUES('pg_v9_071','Original employee owner-scoped Agent catalog favorites');
COMMIT;
