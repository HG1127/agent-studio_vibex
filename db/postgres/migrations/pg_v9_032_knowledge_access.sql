-- Proposed isolated knowledge-sharing foundation. No activation or connection.
-- This exposes bounded shared metadata only. Documents/vectors remain private.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_031')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentstudio_knowledge_acl')
  THEN RAISE EXCEPTION 'knowledge_access_requires_reviewed_pg_v9_031_and_new_acl_role'; END IF;
END
$preflight$;
CREATE ROLE agentstudio_knowledge_acl NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
  NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA agentstudio TO agentstudio_knowledge_acl;
GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_knowledge_acl;

CREATE TABLE agentstudio.knowledge_access (
  base_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  recipient_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  access_role text NOT NULL CHECK(access_role IN ('viewer','editor')),
  semantic_allowed boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(base_id,recipient_user_id),
  FOREIGN KEY(base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id) ON DELETE CASCADE,
  CHECK(owner_user_id<>recipient_user_id)
);
CREATE INDEX ix_knowledge_access_recipient ON agentstudio.knowledge_access(recipient_user_id,updated_at DESC) WHERE NOT revoked;
CREATE TABLE agentstudio.knowledge_access_receipts (
  owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),
  request_id uuid NOT NULL,
  base_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=2048),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_user_id,request_id),
  FOREIGN KEY(base_id,owner_user_id) REFERENCES agentstudio.knowledge_bases(id,owner_user_id) ON DELETE CASCADE
);
ALTER TABLE agentstudio.knowledge_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_access FORCE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_access_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentstudio.knowledge_access_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON agentstudio.knowledge_access,agentstudio.knowledge_access_receipts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON agentstudio.knowledge_access TO agentstudio_api;
GRANT SELECT,INSERT ON agentstudio.knowledge_access_receipts TO agentstudio_api;
CREATE POLICY knowledge_access_owner ON agentstudio.knowledge_access TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());
CREATE POLICY knowledge_access_receipt_owner ON agentstudio.knowledge_access_receipts TO agentstudio_api
  USING(owner_user_id=agentstudio.actor_id()) WITH CHECK(owner_user_id=agentstudio.actor_id());

-- The no-login function owner has no model/auth/Worker credentials and no
-- document/chunk/vector privileges. These policies avoid recursive owner RLS.
GRANT SELECT(id,status,display_name,external_issuer) ON agentstudio.users TO agentstudio_knowledge_acl;
GRANT SELECT(id,owner_user_id,name,description,visibility,revision,created_at,updated_at)
  ON agentstudio.knowledge_bases TO agentstudio_knowledge_acl;
GRANT SELECT ON agentstudio.knowledge_access TO agentstudio_knowledge_acl;
CREATE POLICY knowledge_acl_active_users ON agentstudio.users FOR SELECT TO agentstudio_knowledge_acl USING(true);
CREATE POLICY knowledge_acl_base_metadata ON agentstudio.knowledge_bases FOR SELECT TO agentstudio_knowledge_acl USING(true);
CREATE POLICY knowledge_acl_grants ON agentstudio.knowledge_access FOR SELECT TO agentstudio_knowledge_acl USING(true);

-- Native auth separates employee status from account enablement. The helper
-- gets only the two predicate columns, never email/password/session material.
DO $native_predicate$
BEGIN
  IF to_regclass('agentstudio_auth.accounts') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE ON SCHEMA agentstudio_auth TO agentstudio_knowledge_acl';
    EXECUTE 'GRANT SELECT(user_id,enabled) ON agentstudio_auth.accounts TO agentstudio_knowledge_acl';
    EXECUTE 'CREATE POLICY knowledge_acl_account_enablement ON agentstudio_auth.accounts FOR SELECT TO agentstudio_knowledge_acl USING(true)';
  END IF;
END
$native_predicate$;
CREATE FUNCTION agentstudio.knowledge_employee_active(p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE employee_issuer text; employee_active boolean; account_active boolean;
BEGIN
  SELECT u.external_issuer,u.status='active' INTO employee_issuer,employee_active
    FROM agentstudio.users u WHERE u.id=p_user;
  IF employee_active IS DISTINCT FROM true THEN RETURN false; END IF;
  IF employee_issuer<>'urn:agentstudio:local:v1' THEN RETURN true; END IF;
  IF to_regclass('agentstudio_auth.accounts') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT enabled FROM agentstudio_auth.accounts WHERE user_id=$1'
    INTO account_active USING p_user;
  RETURN account_active IS TRUE;
END
$function$;
ALTER FUNCTION agentstudio.knowledge_employee_active(uuid) OWNER TO agentstudio_knowledge_acl;
REVOKE ALL ON FUNCTION agentstudio.knowledge_employee_active(uuid) FROM PUBLIC;

CREATE FUNCTION agentstudio.knowledge_access_mode(p_base uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT CASE WHEN b.owner_user_id=agentstudio.actor_id() THEN 'owner'
              ELSE a.access_role END
  FROM agentstudio.knowledge_bases b
  JOIN agentstudio.users o ON o.id=b.owner_user_id AND agentstudio.knowledge_employee_active(o.id)
  JOIN agentstudio.users r ON r.id=agentstudio.actor_id() AND agentstudio.knowledge_employee_active(r.id)
  LEFT JOIN agentstudio.knowledge_access a ON a.base_id=b.id AND a.owner_user_id=b.owner_user_id
    AND a.recipient_user_id=r.id AND NOT a.revoked
  WHERE b.id=p_base AND b.visibility='private'
    AND (b.owner_user_id=r.id OR a.access_role IN ('viewer','editor'))
$function$;
CREATE FUNCTION agentstudio.knowledge_share_recipient_active(p_base uuid,p_recipient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT EXISTS(SELECT 1 FROM agentstudio.knowledge_bases b
    JOIN agentstudio.users o ON o.id=b.owner_user_id AND agentstudio.knowledge_employee_active(o.id)
    JOIN agentstudio.users r ON r.id=p_recipient AND agentstudio.knowledge_employee_active(r.id)
    WHERE b.id=p_base AND b.owner_user_id=agentstudio.actor_id()
      AND b.visibility='private' AND r.id<>o.id)
$function$;
CREATE FUNCTION agentstudio.knowledge_shared_bases() RETURNS TABLE(
  id uuid,owner_user_id uuid,owner_name text,name text,description text,
  access_role text,semantic_allowed boolean,access_revision bigint,base_revision bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT b.id,b.owner_user_id,o.display_name,b.name,b.description,
    a.access_role,a.semantic_allowed,a.revision,b.revision
  FROM agentstudio.knowledge_access a
  JOIN agentstudio.knowledge_bases b ON b.id=a.base_id AND b.owner_user_id=a.owner_user_id AND b.visibility='private'
  JOIN agentstudio.users o ON o.id=b.owner_user_id AND agentstudio.knowledge_employee_active(o.id)
  JOIN agentstudio.users r ON r.id=a.recipient_user_id AND agentstudio.knowledge_employee_active(r.id)
  WHERE a.recipient_user_id=agentstudio.actor_id() AND NOT a.revoked
  ORDER BY a.updated_at DESC,b.id LIMIT 100
$function$;
CREATE FUNCTION agentstudio.knowledge_owner_grants(p_base uuid) RETURNS TABLE(
  recipient_user_id uuid,recipient_name text,recipient_active boolean,
  access_role text,semantic_allowed boolean,revoked boolean,revision bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT a.recipient_user_id,r.display_name,agentstudio.knowledge_employee_active(r.id),
    a.access_role,a.semantic_allowed,a.revoked,a.revision
  FROM agentstudio.knowledge_access a
  JOIN agentstudio.knowledge_bases b ON b.id=a.base_id AND b.owner_user_id=a.owner_user_id
  JOIN agentstudio.users r ON r.id=a.recipient_user_id
  JOIN agentstudio.users o ON o.id=b.owner_user_id AND agentstudio.knowledge_employee_active(o.id)
  WHERE b.id=p_base AND b.owner_user_id=agentstudio.actor_id()
  ORDER BY a.revoked ASC,a.updated_at DESC,a.recipient_user_id LIMIT 100
$function$;
ALTER FUNCTION agentstudio.knowledge_access_mode(uuid) OWNER TO agentstudio_knowledge_acl;
ALTER FUNCTION agentstudio.knowledge_share_recipient_active(uuid,uuid) OWNER TO agentstudio_knowledge_acl;
ALTER FUNCTION agentstudio.knowledge_shared_bases() OWNER TO agentstudio_knowledge_acl;
ALTER FUNCTION agentstudio.knowledge_owner_grants(uuid) OWNER TO agentstudio_knowledge_acl;
REVOKE ALL ON FUNCTION agentstudio.knowledge_access_mode(uuid),
  agentstudio.knowledge_share_recipient_active(uuid,uuid),agentstudio.knowledge_shared_bases(),
  agentstudio.knowledge_owner_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.knowledge_access_mode(uuid),
  agentstudio.knowledge_share_recipient_active(uuid,uuid),agentstudio.knowledge_shared_bases(),
  agentstudio.knowledge_owner_grants(uuid) TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description)
VALUES('pg_v9_032','Proposed owner knowledge grants, active-employee metadata functions and retry receipts; content remains private');
COMMIT;
