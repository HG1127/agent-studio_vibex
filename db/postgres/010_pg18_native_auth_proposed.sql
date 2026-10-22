-- PG18 native employee login PROPOSAL for the separate Agent Studio test database.
-- Only apply after a fresh reviewed backup and explicit administrator approval.
-- Schema migration does NOT enable login, start a broker, or switch the old site.
-- Legacy PocketBase login and runtime remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

-- Serialize overlapping auth schema attempts (not the one-time admin setup).
SELECT pg_advisory_xact_lock(61824,20261018);

DO $preflight$
BEGIN
  IF current_database() <> 'agent_studio'
     OR current_setting('port')::integer <> 5333
     OR pg_is_in_recovery()
     OR session_user <> 'postgres'
     OR current_setting('server_version_num')::int < 180000
     OR current_setting('server_version_num')::int >= 190000
     OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname = session_user)
     OR (SELECT extversion FROM pg_extension WHERE extname='vector') IS DISTINCT FROM '0.8.7'
     OR (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio') <> 23
     OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='agentstudio' AND c.relkind='r'
       AND c.relrowsecurity AND c.relforcerowsecurity) <> 22
     OR (SELECT count(*) FROM agentstudio.schema_migrations) <> 3
     OR (SELECT count(*) FROM agentstudio.schema_migrations WHERE version IN
         ('pg_v8_001','pg_v8_004','pg_v8_005')) <> 3
     OR EXISTS (SELECT 1 FROM agentstudio.users)
     OR EXISTS (SELECT 1 FROM agentstudio.jobs)
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='agentstudio_auth')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
       ('agentstudio_native_auth','agentstudio_native_login'))
     OR EXISTS (SELECT 1 FROM agentstudio.schema_migrations
         WHERE version='pg18_native_auth_001')
     OR NOT pg_has_role('agentstudio_stage_login','agentstudio_api','member')
     OR NOT pg_has_role('agentstudio_stage_worker','agentstudio_worker','member')
     OR NOT pg_has_role('agentstudio_stage_worker','agentstudio_api','member')
  THEN
    RAISE EXCEPTION 'native_auth_requires_reviewed_pg18_baseline'
      USING ERRCODE='P0001';
  END IF;
END
$preflight$;

-- Auth-only group role must never be granted to the regular API/Worker.
CREATE ROLE agentstudio_native_auth NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
-- A separate login is provisioned with a 0600 password file by a reviewed
-- one-time bootstrap. It remains NOLOGIN until then.
CREATE ROLE agentstudio_native_login NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
GRANT agentstudio_native_auth TO agentstudio_native_login;
GRANT CONNECT ON DATABASE agent_studio TO agentstudio_native_login;

CREATE SCHEMA agentstudio_auth;
REVOKE ALL ON SCHEMA agentstudio_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA agentstudio_auth TO agentstudio_native_auth;

CREATE TABLE agentstudio_auth.accounts (
  user_id uuid PRIMARY KEY REFERENCES agentstudio.users(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE CHECK(
    char_length(email) BETWEEN 5 AND 254 AND
    email = lower(email) AND
    email !~ '[[:space:]]'
  ),
  password_record text NOT NULL CHECK(
    length(password_record) BETWEEN 100 AND 320 AND
    left(password_record,20) = 'scrypt$v1$32768$8$1$'
  ),
  enabled boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  failed_attempts integer NOT NULL DEFAULT 0
    CHECK(failed_attempts BETWEEN 0 AND 2147483647),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agentstudio_auth.sessions (
  token_digest bytea PRIMARY KEY CHECK(octet_length(token_digest)=32),
  user_id uuid NOT NULL REFERENCES agentstudio.users(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + interval '24 hours')
);
CREATE INDEX ix_auth_sessions_user_expiry
  ON agentstudio_auth.sessions(user_id,expires_at);

-- Even owners of these tables cannot silently bypass policy without superuser
-- administration. Only the separate native auth broker has row access.
ALTER TABLE agentstudio_auth.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY native_auth_accounts_service ON agentstudio_auth.accounts
  TO agentstudio_native_auth USING(true) WITH CHECK(true);
CREATE POLICY native_auth_sessions_service ON agentstudio_auth.sessions
  TO agentstudio_native_auth USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON
  agentstudio_auth.accounts,agentstudio_auth.sessions
  TO agentstudio_native_auth;

-- The auth broker may verify active local users; it cannot edit business
-- profiles or access an employee's private Agents/Workflows/knowledge.
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_native_auth;
GRANT SELECT (id,external_issuer,external_subject,status,display_name,created_at)
  ON agentstudio.users TO agentstudio_native_auth;
-- Only the dedicated authentication group can provision new local employees.
-- It has no permission to edit imported/other-issuer users or see private
-- Agents/Workflows. Never grant native_auth to ordinary API/Worker logins.
GRANT INSERT (id,external_issuer,external_subject,display_name,status)
  ON agentstudio.users TO agentstudio_native_auth;
CREATE POLICY native_auth_insert_local_users ON agentstudio.users
  FOR INSERT TO agentstudio_native_auth
  WITH CHECK (external_issuer='urn:agentstudio:local:v1' AND status='active');
CREATE POLICY native_auth_verified_local_users ON agentstudio.users
  FOR SELECT TO agentstudio_native_auth
  USING (external_issuer='urn:agentstudio:local:v1' AND status='active');

INSERT INTO agentstudio.schema_migrations(version,description)
  VALUES('pg18_native_auth_001',
    'Proposed standalone native employee auth tables; not enabled by default');

COMMIT;
