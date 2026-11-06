-- Independent employee-ui078 profile metadata interface, never default050/069.
-- No business-row access and no new column grant on the original ledger.
BEGIN;
CREATE FUNCTION agentstudio.employee_ui078_catalog_ledger()
RETURNS TABLE(system_identifier text,database_oid text,version text,description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $ledger$
 SELECT c.system_identifier::text,d.oid::text,m.version,m.description
 FROM pg_catalog.pg_control_system() AS c
 JOIN pg_catalog.pg_database AS d ON d.datname=pg_catalog.current_database()
 CROSS JOIN agentstudio.schema_migrations AS m
 ORDER BY m.version COLLATE "C"
$ledger$;
ALTER FUNCTION agentstudio.employee_ui078_catalog_ledger() OWNER TO postgres;
REVOKE ALL ON FUNCTION agentstudio.employee_ui078_catalog_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agentstudio.employee_ui078_catalog_ledger() TO agentstudio_api;
INSERT INTO agentstudio.schema_migrations(version,description)
 VALUES('pg18_employee_ui078_catalog_001','Independent employee-ui078 read-only full-ledger catalog interface');
COMMIT;
