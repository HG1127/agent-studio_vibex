-- V8 EXPLICITLY-APPROVED, ISOLATED staging-only RLS rehearsal.
-- This creates synthetic fixtures inside a transaction and ALWAYS ROLLS BACK.
-- Never run against any company database, live or copied from production.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO agentstudio.users(external_issuer,external_subject,display_name)
VALUES ('stage-smoke','synthetic-a','Synthetic Employee A')
RETURNING id AS actor_a \gset

INSERT INTO agentstudio.users(external_issuer,external_subject,display_name)
VALUES ('stage-smoke','synthetic-b','Synthetic Employee B')
RETURNING id AS actor_b \gset

INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec)
VALUES (:'actor_a'::uuid,'Synthetic A','{"goal":"staging validation A"}'::jsonb)
RETURNING id AS spec_a \gset

INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec)
VALUES (:'actor_b'::uuid,'Synthetic B','{"goal":"staging validation B"}'::jsonb)
RETURNING id AS spec_b \gset

-- Use an INVITE whose source is deliberately deleted. Reviewed snapshot
-- remains valid because the actual V7 sharing flow does not rely on source FK.
INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec)
VALUES (:'actor_a'::uuid,'Synthetic removable','{"goal":"reviewed"}'::jsonb)
RETURNING id AS removable_spec \gset

INSERT INTO agentstudio.template_invites(
  owner_user_id,source_spec_id,safe_snapshot,token_hash,expires_at
) VALUES (
  :'actor_a'::uuid,:'removable_spec'::uuid,
  '{"goal":"safe-copy","tools":[],"knowledge_base_ids":[],"require_approval":true}'::jsonb,
  repeat('a',64),now()+INTERVAL '7 days'
) RETURNING id AS invite_a \gset

DELETE FROM agentstudio.agent_specs WHERE id=:'removable_spec'::uuid;
SELECT 1 / (CASE WHEN count(*)=1 THEN 1 ELSE 0 END)
  AS invite_survives_source_delete
FROM agentstudio.template_invites WHERE id=:'invite_a'::uuid;

-- RLS cannot be bypassed by a valid employee ID alone. The only DB role
-- intended to access private records is NOLOGIN agentstudio_api, activated
-- by a trusted backend after JWT verification.
SET LOCAL ROLE agentstudio_api;
SELECT set_config('agentstudio.actor_id', :'actor_a', true);

SELECT 1 / (CASE WHEN count(*)=1 THEN 1 ELSE 0 END)
  AS employee_a_sees_only_own_spec
FROM agentstudio.agent_specs;

SELECT 1 / (CASE WHEN count(*)=0 THEN 1 ELSE 0 END)
  AS employee_a_cannot_read_b
FROM agentstudio.agent_specs WHERE id=:'spec_b'::uuid;

WITH blocked AS (
  UPDATE agentstudio.agent_specs SET name='UNAUTHORIZED CHANGE'
  WHERE id=:'spec_b'::uuid RETURNING id
)
SELECT 1 / (CASE WHEN count(*)=0 THEN 1 ELSE 0 END)
  AS cross_employee_update_denied
FROM blocked;

SELECT set_config('agentstudio.actor_id', :'actor_b', true);
SELECT 1 / (CASE WHEN count(*)=1 THEN 1 ELSE 0 END)
  AS employee_b_sees_only_own_spec
FROM agentstudio.agent_specs;

SELECT 1 / (CASE WHEN count(*)=0 THEN 1 ELSE 0 END)
  AS employee_b_cannot_read_a_invite
FROM agentstudio.template_invites WHERE id=:'invite_a'::uuid;

SET LOCAL ROLE NONE;
ROLLBACK;

-- The transaction was rolled back; no synthetic users or content persists.
SELECT 'V8_STAGING_SMOKE_COMPLETED_ROLLED_BACK' AS verification;
