// Complete non-system catalog DATA; caller retains identity, RR/RO and original semantic auditors.
import {createHash} from 'node:crypto';
import {employeeUi078Canonical} from './pg18-employee-ui078-catalog.mjs';
export const unifiedEmployeeCatalogSQL=`WITH app_objects(classid,objid) AS (
 SELECT 'pg_catalog.pg_namespace'::regclass::oid,n.oid FROM pg_catalog.pg_namespace n WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_class'::regclass::oid,c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_proc'::regclass::oid,p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_type'::regclass::oid,t.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_constraint'::regclass::oid,c.oid FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_policy'::regclass::oid,p.oid FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_trigger'::regclass::oid,t.oid FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
 UNION ALL SELECT 'pg_catalog.pg_rewrite'::regclass::oid,r.oid FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')
) SELECT jsonb_build_object(
 'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_catalog.pg_depend d WHERE EXISTS(SELECT 1 FROM app_objects a WHERE a.classid=d.classid AND a.objid=d.objid OR a.classid=d.refclassid AND a.objid=d.refobjid)),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_extension e),
 'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.nspname COLLATE "C") FROM pg_catalog.pg_namespace n WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'classes',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'namespace',c.relnamespace,'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,'owner',c.relowner,'am',c.relam,'type',c.reltype,'of_type',c.reloftype,'natts',c.relnatts,'checks',c.relchecks,'has_rules',c.relhasrules,'has_triggers',c.relhastriggers,'has_subclass',c.relhassubclass,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'replica_identity',c.relreplident,'partition',c.relispartition,'part_bound',c.relpartbound,'acl',c.relacl,'options',c.reloptions) ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C") FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AND a.attnum>0),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_class c ON c.oid=d.adrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'rewrites',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE (NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema')),
 'default_acls',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.oid) FROM pg_catalog.pg_default_acl a WHERE a.defaclnamespace=0 OR a.defaclnamespace IN(SELECT oid FROM pg_catalog.pg_namespace WHERE (NOT pg_catalog.starts_with(nspname,'pg_') AND nspname<>'information_schema'))),
 'event_triggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_event_trigger e),
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,'bypass_rls',r.rolbypassrls,'connection_limit',r.rolconnlimit,'config',r.rolconfig,'valid_until',r.rolvaliduntil) ORDER BY r.rolname COLLATE "C") FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'agentstudio_')),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_catalog.pg_auth_members m WHERE m.member IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')) OR m.roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_'))),
 'role_settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole) FROM pg_catalog.pg_db_role_setting s WHERE s.setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) OR s.setrole IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_'))),
 'database_acl',(SELECT jsonb_build_object('oid',d.oid,'owner',d.datdba,'acl',d.datacl) FROM pg_catalog.pg_database d WHERE d.datname=current_database())
) AS catalog`

const sectionKeys=Object.freeze(["dependencies","extensions","schemas","classes","columns","defaults","functions","types","constraints","policies","triggers","indexes","rewrites","default_acls","event_triggers","roles","memberships","role_settings","database_acl"]);
const fail=()=>{throw Error('original_ui_unified_catalog_refused')};
function canonicalCatalog(value){
 const canonical=employeeUi078Canonical(value);
 if(Buffer.byteLength(canonical)>24*1024*1024||!value||Array.isArray(value)||Object.keys(value).sort().join('\0')!==[...sectionKeys].sort().join('\0'))fail();
 return canonical;
}
export async function readUnifiedEmployeeCatalog(db){
 const result=await db.query(unifiedEmployeeCatalogSQL);
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1||!result.rows[0]||Object.keys(result.rows[0]).join(',')!=='catalog')fail();
 const canonical=canonicalCatalog(result.rows[0].catalog);
 // Return a detached DATA image. No observed digest is made an authority token.
 return JSON.parse(canonical);
}
export function assertUnifiedEmployeeCatalogStable(before,after){
 const first=canonicalCatalog(before),second=canonicalCatalog(after);
 if(first!==second)fail();
 return Object.freeze({catalog_sha256:createHash('sha256').update(second).digest('hex'),compared_whole_non_system_catalog:true,profile_component_only:true,whole_final_profile_verified:false,authorizes_install:false,production_GO:false});
}
