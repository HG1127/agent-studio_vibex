import {createHash} from 'node:crypto'
import type {SqlClient,SqlPool} from './contracts.ts'

const api='agentstudio_api',table='agentstudio.agent_spec_authoring'
const pins=[
 {signature:'home_authoring_utf16_length(text)',language:'sql',returns:'integer',sha256:'9a3cc6d7150d0cd345d6399fc7a538c9bb9d38746489f96be69055f8fb91e979'},
 {signature:'home_authoring_valid(jsonb)',language:'plpgsql',returns:'boolean',sha256:'cf17a1b08bbf24932c8185de66e408c51d1ab5afb53f236726e8c09d6580bd2b'},
] as const
const fail=():never=>{throw Error('unsafe_original_home_authoring_schema')}
const canonical=(raw:string)=>raw.replace(/\s+/g,'')
const columnNames=['agent_spec_id','owner_user_id','authoring','created_at','updated_at']
const notNullNames=columnNames.map(name=>'agent_spec_authoring_'+name+'_not_null')
/** Optional070 only. No source files, schema SQL or supplied attestation input. */
export async function verifyNativeHomeAuthoringSchema(db:SqlClient):Promise<void>{
 const state=(await db.query<{ok:boolean;api_oid:number;no_grant_option:boolean}>(
  "SELECT c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND c.relforcerowsecurity AND owner.rolsuper AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AND "+
  "NOT has_table_privilege($2,c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
  "(has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee=0) AS ok,"+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner AND a.is_grantable) AS no_grant_option,"+
  "(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS api_oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner WHERE c.oid=to_regclass($1)",[table,api])).rows[0]
 if(!state)return fail()
 if(state.ok!==true||state.no_grant_option!==true||!Number.isSafeInteger(Number(state.api_oid)))fail()
  // aclexplode is strict: NULL attacl has no explicit column grants. Keep the
  // effective table/column checks; a SQL '{}' ACL has the wrong array dimension.
  const columns=(await db.query<{name:string;type:string;notnull:boolean;default_expr:string|null;read:boolean;insert:boolean;update:boolean;reference:boolean;no_grant_option:boolean}>(
  "SELECT a.attname AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS notnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr,"+
  "has_column_privilege($2,a.attrelid,a.attnum,'SELECT') AS read,has_column_privilege($2,a.attrelid,a.attnum,'INSERT') AS insert,"+
  "has_column_privilege($2,a.attrelid,a.attnum,'UPDATE') AS update,has_column_privilege($2,a.attrelid,a.attnum,'REFERENCES') AS reference,"+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(a.attacl) acl JOIN pg_catalog.pg_class c ON c.oid=a.attrelid WHERE acl.grantee<>c.relowner AND acl.is_grantable) AS no_grant_option "+
  "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[table,api])).rows
 if(columns.length!==5)fail()
 for(let i=0;i<columns.length;i++){
  const c=columns[i]!,name=columnNames[i]!,time=i>=3
  if(c.name!==name||c.type!==(time?'timestamp with time zone':i===2?'jsonb':'uuid')||c.notnull!==true||c.read!==true||c.insert!==(i<=2)||c.update!==['authoring','updated_at'].includes(name)||c.reference!==false||c.no_grant_option!==true||c.default_expr!==(time?'clock_timestamp()':null))fail()
 }
 const policies=(await db.query<{name:string;command:string;permissive:boolean;roles:number[];using_expr:string;check_expr:string}>(
  'SELECT polname AS name,polcmd AS command,polpermissive AS permissive,polroles AS roles,pg_get_expr(polqual,polrelid) AS using_expr,pg_get_expr(polwithcheck,polrelid) AS check_expr FROM pg_catalog.pg_policy WHERE polrelid=to_regclass($1)',[table])).rows
 if(policies.length!==1)fail()
 const policy=policies[0]!,expression='(owner_user_id=agentstudio.actor_id())'
 if(policy.name!=='agent_spec_authoring_owner'||policy.command!=='*'||policy.permissive!==true||policy.roles.length!==1||Number(policy.roles[0])!==Number(state.api_oid)||canonical(policy.using_expr)!==expression||canonical(policy.check_expr)!==expression)fail()
 const constraints=(await db.query<{name:string;type:string;valid:boolean;enforced:boolean;deferrable:boolean;deferred:boolean;is_local:boolean;inherited:number;root:boolean;no_inherit:boolean;ordinary:boolean;keys:number[];definition:string}>(
  'SELECT conname AS name,contype AS type,convalidated AS valid,conenforced AS enforced,condeferrable AS deferrable,condeferred AS deferred,'+
  'conislocal AS is_local,coninhcount::integer AS inherited,conparentid=0 AS root,connoinherit AS no_inherit,contypid=0 AND NOT conperiod AS ordinary,conkey AS keys,'+
  'pg_get_constraintdef(oid,true) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass($1)',[table])).rows
 const expected:Record<string,{type:string;definition:string;keys:number[];no_inherit:boolean}>={
  agent_spec_authoring_pkey:{type:'p',definition:'PRIMARYKEY(agent_spec_id)',keys:[1],no_inherit:true},
  agent_spec_authoring_owner_fk:{type:'f',definition:'FOREIGNKEY(agent_spec_id,owner_user_id)REFERENCESagentstudio.agent_specs(id,owner_user_id)ONUPDATERESTRICTONDELETERESTRICT',keys:[1,2],no_inherit:true},
  agent_spec_authoring_valid_ck:{type:'c',definition:'CHECK(agentstudio.home_authoring_valid(authoring))',keys:[3],no_inherit:false},
 }
 // PG18 catalogs both explicit and PRIMARY KEY-implied NOT NULL constraints.
 // Keep their exact five-column inventory alongside the original PK/FK/CHECK.
 for(let i=0;i<columnNames.length;i++)expected[notNullNames[i]!]={type:'n',definition:'NOTNULL'+columnNames[i],keys:[i+1],no_inherit:false}
 if(constraints.length!==8||new Set(constraints.map(c=>c.name)).size!==8)fail()
 for(const c of constraints){
  const e=expected[c.name]
  if(!Object.hasOwn(expected,c.name)||!e||c.type!==e.type||c.valid!==true||c.enforced!==true||c.deferrable!==false||c.deferred!==false||
    c.is_local!==true||c.inherited!==0||c.root!==true||c.no_inherit!==e.no_inherit||c.ordinary!==true||
    JSON.stringify(c.keys)!==JSON.stringify(e.keys)||typeof c.definition!=='string'||canonical(c.definition)!==e.definition)fail()
 }
 for(const fn of pins){
  const value=(await db.query<{ok:boolean;no_grant_option:boolean;language:string;returns:string;source:string}>(
   "SELECT NOT p.prosecdef AND p.proisstrict AND p.provolatile='i' AND owner.rolsuper AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
   "has_function_privilege($2,p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AS ok,"+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND a.is_grantable) AS no_grant_option,"+
   "l.lanname AS language,pg_catalog.format_type(p.prorettype,NULL) AS returns,p.prosrc AS source FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1)",['agentstudio.'+fn.signature,api])).rows[0]
  if(value?.ok!==true||value.no_grant_option!==true||value.language!==fn.language||value.returns!==fn.returns||typeof value.source!=='string'||createHash('sha256').update(value.source).digest('hex')!==fn.sha256)fail()
 }
 const surface=(await db.query<{ok:boolean}>("SELECT count(*)=2 AS ok FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'home_authoring_')")).rows[0]?.ok
 if(surface!==true)fail()
}
const optional070Objects=[
 'migration:pg_v9_070','relation:agent_spec_authoring','related_relation:agent_spec_authoring_pkey',
 'type:agent_spec_authoring','type:_agent_spec_authoring',
 'function:home_authoring_utf16_length','function:home_authoring_valid',
 'constraint:agent_spec_authoring_pkey','constraint:agent_spec_authoring_owner_fk','constraint:agent_spec_authoring_valid_ck',
 ...notNullNames.map(name=>'constraint:'+name),
 'policy:agent_spec_authoring_owner',
].sort()
// The ledger's version-only API read was granted by original035. No employee
// data is read, and a DTO/feature flag cannot attest to installation state.
export const originalHome070PresenceSql="SELECT 'migration' AS kind,version AS name FROM agentstudio.schema_migrations WHERE version='pg_v9_070' UNION ALL "+
 "SELECT CASE WHEN c.relname='agent_spec_authoring' THEN 'relation' ELSE 'related_relation' END AS kind,c.relname::text AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND (c.relname='agent_spec_authoring' OR starts_with(c.relname,'agent_spec_authoring_') OR c.oid IN(SELECT indexrelid FROM pg_catalog.pg_index WHERE indrelid=to_regclass('agentstudio.agent_spec_authoring'))) UNION ALL "+
 "SELECT 'type',t.typname::text FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND t.typname IN('agent_spec_authoring','_agent_spec_authoring') UNION ALL "+
 "SELECT 'function',p.proname::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'home_authoring_') UNION ALL "+
 "SELECT 'constraint',c.conname::text FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND (starts_with(c.conname,'agent_spec_authoring_') OR c.conrelid=to_regclass('agentstudio.agent_spec_authoring') OR c.confrelid=to_regclass('agentstudio.agent_spec_authoring')) UNION ALL "+
 "SELECT 'policy',p.polname::text FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND (starts_with(p.polname,'agent_spec_authoring_') OR c.oid=to_regclass('agentstudio.agent_spec_authoring')) UNION ALL "+
 "SELECT 'trigger',t.tgname::text FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='agentstudio' AND (starts_with(t.tgname,'agent_spec_authoring_') OR c.oid=to_regclass('agentstudio.agent_spec_authoring')) UNION ALL "+
 "SELECT 'event_trigger',evtname::text FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'home_authoring_') OR starts_with(evtname,'agent_spec_authoring_')"
export async function inspectOptionalNativeHomeAuthoringSchema(pool:SqlPool):Promise<'absent'|'installed'>{
 const db=await pool.connect();let primary:unknown
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api')
  // Catalog deparsing must not vary with the login's configured search path.
  await db.query('SET LOCAL search_path=pg_catalog')
  const rows=(await db.query<{kind:string;name:string}>(originalHome070PresenceSql)).rows
  if(!Array.isArray(rows))fail()
  if(rows.length===0)return'absent'
  if(rows.some(r=>typeof r.kind!=='string'||typeof r.name!=='string')||JSON.stringify(rows.map(r=>r.kind+':'+r.name).sort())!==JSON.stringify(optional070Objects))fail()
  await verifyNativeHomeAuthoringSchema(db)
  return'installed'
 }catch(error){primary=error;throw error}
 finally{
  try{await db.query('ROLLBACK')}catch{if(primary===undefined)throw Error('original_home_schema_rollback_required')}
  finally{db.release()}
 }
}
export async function inspectNativeHomeAuthoringSchema(pool:SqlPool):Promise<void>{
 if(await inspectOptionalNativeHomeAuthoringSchema(pool)!=='installed')throw Error('original_home_authoring_schema_required')
}
