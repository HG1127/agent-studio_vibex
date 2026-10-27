import type {SqlClient} from "./contracts.ts"
// Effective privileges alone do not reveal permission to delegate them. Audit
// the underlying relation/column ACL too, including newly added PG privileges.
export async function verifyMemoryRelationAcl(db:SqlClient,id:number,erase:boolean):Promise<boolean>{
  return (await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a "+
    "WHERE a.grantee<>c.relowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_api') OR a.is_grantable OR "+
    "NOT(a.privilege_type='SELECT' OR $2::boolean AND a.privilege_type='DELETE'))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute f CROSS JOIN LATERAL pg_catalog.aclexplode(f.attacl) a "+
    "WHERE f.attrelid=c.oid AND f.attnum>0 AND NOT f.attisdropped AND a.grantee<>c.relowner AND "+
    "(a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_api') OR a.is_grantable OR a.privilege_type<>'INSERT' OR f.attname='created_at')) AS ok "+
    "FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,erase])).rows[0]?.ok===true
}
