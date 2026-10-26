-- Isolated PG18 proposal. Applying this source never enables a service login.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
SELECT pg_advisory_xact_lock(61824,20261047);
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolsuper) OR pg_is_in_recovery()
    OR NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_046')
    OR EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_047')
    OR to_regclass('agentstudio_auth.employee_governance_events') IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_native_auth' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit)
  THEN RAISE EXCEPTION 'employee_governance_requires_reviewed_046' USING ERRCODE='P0001'; END IF;
END
$preflight$;

ALTER TABLE agentstudio_auth.accounts
  ADD COLUMN share_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN governance_revision bigint NOT NULL DEFAULT 1 CHECK(governance_revision BETWEEN 1 AND 9007199254740990);

-- This flag governs internal Agent template sharing. It does not disable the
-- employee's private knowledge, own runs or description collaboration.
-- General API/Worker and existing helpers receive no new auth-column grants.
DROP POLICY native_auth_verified_local_users ON agentstudio.users;
CREATE POLICY native_auth_verified_local_users ON agentstudio.users
  FOR SELECT TO agentstudio_native_auth USING(external_issuer='urn:agentstudio:local:v1');
GRANT UPDATE(status) ON agentstudio.users TO agentstudio_native_auth;
CREATE POLICY native_auth_update_local_users ON agentstudio.users
  FOR UPDATE TO agentstudio_native_auth
  USING(external_issuer='urn:agentstudio:local:v1')
  WITH CHECK(external_issuer='urn:agentstudio:local:v1');

CREATE TABLE agentstudio_auth.employee_governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES agentstudio.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES agentstudio.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN('employee.create','employee.change','employee.password')),
  request_id uuid,
  request_sha256 text CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  before_state jsonb NOT NULL CHECK(jsonb_typeof(before_state)='object'),
  after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_user_id,request_id),
  CHECK((action='employee.change')=(request_id IS NOT NULL AND request_sha256 IS NOT NULL))
);
ALTER TABLE agentstudio_auth.employee_governance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio_auth.employee_governance_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio_auth.employee_governance_events FROM PUBLIC,agentstudio_api,agentstudio_worker,agentstudio_native_auth;
GRANT SELECT,INSERT ON agentstudio_auth.employee_governance_events TO agentstudio_native_auth;
CREATE POLICY native_auth_employee_governance ON agentstudio_auth.employee_governance_events
  TO agentstudio_native_auth USING(true) WITH CHECK(true);

INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_047',
  'Native employee role/status/template-sharing governance, private audit receipts and password session revocation; no deployment');
COMMIT;
