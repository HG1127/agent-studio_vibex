-- BaoTa PG18 one-time employee administrator POST-CHECK, read only.
-- Does not reveal email, password hash, or session details.
\set ON_ERROR_STOP on
\pset pager off
BEGIN READ ONLY;

SELECT current_database() AS target_db,session_user AS inspected_by,
       current_setting('server_version_num')::integer AS postgres_version,
       current_setting('port')::integer AS pg_port;

SELECT count(*)::integer AS local_users
FROM agentstudio.users
WHERE external_issuer='urn:agentstudio:local:v1';

SELECT count(*)::integer AS accounts
FROM agentstudio_auth.accounts;

SELECT count(*)::integer AS enabled_admins
FROM agentstudio_auth.accounts a
JOIN agentstudio.users u ON u.id=a.user_id
WHERE a.enabled=true AND a.is_admin=true
  AND u.status='active'
  AND u.external_issuer='urn:agentstudio:local:v1';

SELECT count(*)::integer AS sessions
FROM agentstudio_auth.sessions;

SELECT CASE WHEN
  current_database()='agent_studio'
  AND session_user='postgres'
  AND current_setting('server_version_num')::integer >=180000
  AND current_setting('server_version_num')::integer <190000
  AND current_setting('port')::integer=5333
  AND NOT pg_is_in_recovery()
  AND (SELECT count(*) FROM agentstudio.users)=1
  AND (SELECT count(*) FROM agentstudio.users
       WHERE external_issuer='urn:agentstudio:local:v1'
         AND status='active')=1
  AND (SELECT count(*) FROM agentstudio_auth.accounts)=1
  AND (SELECT count(*) FROM agentstudio_auth.accounts
       WHERE enabled=true AND is_admin=true
       AND failed_attempts=0 AND locked_until IS NULL)=1
  AND (SELECT count(*) FROM agentstudio_auth.sessions)=0
  AND (SELECT count(*) FROM agentstudio.schema_migrations)=4
  AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio')=23
  AND (SELECT count(*) FROM pg_tables WHERE schemaname='agentstudio_auth')=2
  AND (SELECT count(*) FROM agentstudio.jobs)=0
THEN 'FIRST_ADMIN_BOOTSTRAP_OK'
ELSE 'NO_GO_FIRST_ADMIN_BOOTSTRAP' END AS first_admin_postcheck;

ROLLBACK;
