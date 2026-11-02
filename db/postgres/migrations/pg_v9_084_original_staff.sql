-- Independent OPTIONAL auth-only StaffPage profile. No service activation,
-- employee data migration, legacy CHECK replacement or ordinary API/Worker grant.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
SET LOCAL search_path=pg_catalog;
SELECT pg_advisory_xact_lock(61824,20261048);
DO $preflight$
BEGIN
 IF current_database()<>'agent_studio' OR inet_server_port() IS DISTINCT FROM 5333 OR pg_is_in_recovery()
 OR current_setting('agentstudio.original_staff_profile',true) IS DISTINCT FROM 'native047-original-staff084'
 OR current_setting('agentstudio.original_staff_approval',true) IS DISTINCT FROM 'APPROVE_DISPOSABLE_ORIGINAL_STAFF_084_SCHEMA_ONLY'
 OR session_user<>'postgres' OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user)
 OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
 OR (SELECT count(*) FROM agentstudio.schema_migrations WHERE version IN('pg18_native_auth_001','pg_v9_047'))<>2
 OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_084')
 OR to_regclass('agentstudio_auth.original_staff_receipts') IS NOT NULL
 OR to_regclass('agentstudio_auth.original_staff_password_requests') IS NOT NULL
 OR to_regprocedure('agentstudio_auth.original_staff_revision_guard()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='agentstudio_auth.accounts'::regclass AND attname='staff_revision' AND NOT attisdropped)
 OR (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='agentstudio_auth') IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_native_auth' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN('agentstudio_native_auth','agentstudio_native_login') AND pg_catalog.pg_has_role(r.oid,'agentstudio_native_auth','MEMBER'))
 OR pg_catalog.has_column_privilege('agentstudio_native_auth','agentstudio.users','display_name','UPDATE')
 OR NOT pg_catalog.has_column_privilege('agentstudio_native_auth','agentstudio.users','status','UPDATE')
 THEN RAISE EXCEPTION 'original_staff084_requires_reviewed_native047' USING ERRCODE='P0001'; END IF;
END
$preflight$;

-- The old010/047 SQL and auditors retain their exact status-only boundary.
-- Only this independently selected profile audits the extra display-name grant.
GRANT UPDATE(display_name) ON agentstudio.users TO agentstudio_native_auth;
-- Non-secret migration stamps are checked inside each real auth transaction.
GRANT SELECT ON agentstudio.schema_migrations TO agentstudio_native_auth;

-- Independent form CAS clock. Every old/new account UPDATE advances it, while
-- governance_revision retains its original job-authorization meaning.
ALTER TABLE agentstudio_auth.accounts ADD COLUMN staff_revision bigint NOT NULL DEFAULT 1
 CONSTRAINT accounts_staff_revision_ck CHECK(staff_revision BETWEEN 1 AND 9007199254740990);
CREATE FUNCTION agentstudio_auth.original_staff_revision_guard() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
BEGIN
 IF OLD.staff_revision>=9007199254740990 THEN
  RAISE EXCEPTION 'original_staff_revision_exhausted' USING ERRCODE='P0001';
 END IF;
 NEW.staff_revision:=OLD.staff_revision+1;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION agentstudio_auth.original_staff_revision_guard() FROM PUBLIC,agentstudio_native_auth,agentstudio_api,agentstudio_worker;
GRANT EXECUTE ON FUNCTION agentstudio_auth.original_staff_revision_guard() TO agentstudio_native_auth;
CREATE TRIGGER original_staff_accounts_revision BEFORE UPDATE ON agentstudio_auth.accounts
 FOR EACH ROW EXECUTE FUNCTION agentstudio_auth.original_staff_revision_guard();

CREATE TABLE agentstudio_auth.original_staff_receipts (
 actor_user_id uuid NOT NULL,
 request_id uuid NOT NULL,
 action text NOT NULL,
 target_user_id uuid NOT NULL,
 request_sha256 text NOT NULL,
 email text NOT NULL,
 display_name text NOT NULL,
 is_admin boolean NOT NULL,
 enabled boolean NOT NULL,
 status text NOT NULL,
 share_enabled boolean NOT NULL,
 revision bigint NOT NULL,
 governance_revision bigint NOT NULL,
 profile_created_at timestamptz NOT NULL,
 profile_updated_at timestamptz NOT NULL,
 revoked_sessions boolean NOT NULL,
 before_profile jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT original_staff_receipts_pkey PRIMARY KEY(actor_user_id,request_id),
 CONSTRAINT original_staff_receipts_actor_fk FOREIGN KEY(actor_user_id) REFERENCES agentstudio.users(id) ON DELETE RESTRICT,
 CONSTRAINT original_staff_receipts_target_fk FOREIGN KEY(target_user_id) REFERENCES agentstudio.users(id) ON DELETE RESTRICT,
 CONSTRAINT original_staff_receipts_action_ck CHECK(action IN('create','update','reset')),
 CONSTRAINT original_staff_receipts_hash_ck CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 CONSTRAINT original_staff_receipts_email_ck CHECK(char_length(email) BETWEEN 5 AND 254 AND email=lower(email) AND email !~ '[[:space:]]'),
 CONSTRAINT original_staff_receipts_name_ck CHECK(char_length(display_name) BETWEEN 1 AND 80),
 CONSTRAINT original_staff_receipts_status_ck CHECK(status IN('active','disabled') AND enabled=(status='active')),
 CONSTRAINT original_staff_receipts_revision_ck CHECK(revision BETWEEN 1 AND 9007199254740990),
 CONSTRAINT original_staff_receipts_governance_ck CHECK(governance_revision BETWEEN 1 AND 9007199254740990),
 CONSTRAINT original_staff_receipts_before_ck CHECK(jsonb_typeof(before_profile)='object' AND (before_profile-ARRAY['id','display_name','email','role','active','share_enabled','revision','governance_revision','created','updated']::text[])='{}'::jsonb)
);
CREATE TABLE agentstudio_auth.original_staff_password_requests (
 actor_user_id uuid NOT NULL,
 request_id uuid NOT NULL,
 password_record text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT original_staff_password_requests_pkey PRIMARY KEY(actor_user_id,request_id),
 CONSTRAINT original_staff_password_requests_receipt_fk FOREIGN KEY(actor_user_id,request_id) REFERENCES agentstudio_auth.original_staff_receipts(actor_user_id,request_id) ON DELETE RESTRICT,
 CONSTRAINT original_staff_password_requests_record_ck CHECK(length(password_record) BETWEEN 100 AND 320 AND left(password_record,20)='scrypt$v1$32768$8$1$')
);
ALTER TABLE agentstudio_auth.original_staff_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.original_staff_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.original_staff_password_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.original_staff_password_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio_auth.original_staff_receipts,agentstudio_auth.original_staff_password_requests FROM PUBLIC,agentstudio_native_auth,agentstudio_api,agentstudio_worker;
GRANT SELECT,INSERT ON agentstudio_auth.original_staff_receipts,agentstudio_auth.original_staff_password_requests TO agentstudio_native_auth;
CREATE POLICY native_auth_original_staff_receipts ON agentstudio_auth.original_staff_receipts TO agentstudio_native_auth USING(true) WITH CHECK(true);
CREATE POLICY native_auth_original_staff_password_requests ON agentstudio_auth.original_staff_password_requests TO agentstudio_native_auth USING(true) WITH CHECK(true);
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_084','Optional original StaffPage auth-only complete CAS, admin password reset, private salted request proof and public exact GET receipts; no activation');
COMMIT;
