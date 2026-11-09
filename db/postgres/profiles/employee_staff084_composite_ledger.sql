
-- Metadata only; independently named composite profile. No business/auth rows.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION agentstudio.staff084_composite_ledger()
RETURNS TABLE(system_identifier text,database_oid text,version text,description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $staff_ledger$
 SELECT (pg_catalog.pg_control_system()).system_identifier::text,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),m.version,m.description
 FROM agentstudio.schema_migrations m ORDER BY m.version COLLATE "C"
$staff_ledger$;
ALTER FUNCTION agentstudio.staff084_composite_ledger() OWNER TO postgres;
REVOKE ALL ON FUNCTION agentstudio.staff084_composite_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.staff084_composite_ledger() TO agentstudio_api,agentstudio_native_auth;
INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg18_staff084_composite_catalog_001','Metadata-only exact physical target and complete ledger for independently named Staff084 combinations');
COMMIT;
