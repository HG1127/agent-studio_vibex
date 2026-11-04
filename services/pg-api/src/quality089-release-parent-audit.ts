// Isolated named Quality089 predecessor audit; frozen default files stay byte-identical.
import {isProxy} from 'node:util/types'
import {createHash} from 'node:crypto'
import {employeeUi078LedgerRpcAuditSql} from './pg18-employee-ui078-catalog.mjs'
const quality089ParentLedgerRpcBodySha256='ec9b8350a95564a7400db3a8923f4d3cfebebc5f7fbb07eabaf46f7c3f5d421d'
const quality089ReleaseParentToken=Symbol('named_quality089_release_parent')
import type {SqlClient} from "./contracts.ts"
const role="agentstudio_releases",api="agentstudio_api"
const privateColumns:Record<string,string[]>={
  agent_release_heads:["spec_id","owner_user_id","next_version_no","revision","active_version_id","updated_at"],
  agent_release_versions:["id","owner_user_id","spec_id","version_no","spec_revision","source_sha256","name_snapshot","spec_snapshot","note","test_run_id","test_passed","test_model_binding","status","revision","created_at","updated_at","published_at","deleted_at"],
  agent_release_acceptance_runs:["run_id","owner_user_id","spec_id","request_id","spec_revision","source_sha256","instruction_sha256","max_steps","selected_model_binding","created_at"],
  agent_release_receipts:["actor_user_id","request_id","spec_id","action","request_sha256","input_sha256","result","created_at"],
}
const reads={...privateColumns,agent_specs:["id","owner_user_id","name","spec","revision"],runs:["id","owner_user_id","kind","agent_spec_id","status","instruction","checkpoint"],users:["id","status","external_issuer","external_subject"],"auth.accounts":["user_id","enabled"]}
const inserts:Record<string,string[]>={agent_release_heads:["spec_id","owner_user_id"],
  agent_release_versions:["id","owner_user_id","spec_id","version_no","spec_revision","source_sha256","name_snapshot","spec_snapshot","note","test_run_id","test_passed","test_model_binding"],
  agent_release_acceptance_runs:["run_id","owner_user_id","spec_id","request_id","spec_revision","source_sha256","instruction_sha256","max_steps","selected_model_binding"],
  agent_release_receipts:["actor_user_id","request_id","spec_id","action","request_sha256","input_sha256","result"],
  audit_events:["owner_user_id","actor_user_id","action","target_kind","target_id","result","metadata"]}
const updates:Record<string,string[]>={agent_release_heads:["next_version_no","updated_at","active_version_id","revision"],agent_release_versions:["status","revision","updated_at","published_at","deleted_at"]}
const agentReleaseFunctions:Array<[string,string[]]>=[
  ["release_utf16_length(text)",[]],["release_native_active(uuid)",[]],["release_source_seal(uuid,uuid,text,bigint,jsonb)",[]],["release_source_sha(uuid)",[]],["release_version_sha(uuid)",[]],["release_version_immutable()",[]],
  ["agent_release_workspace(uuid)",[api]],["agent_release_detail(uuid,uuid)",[api]],["agent_release_receipt(uuid,uuid)",[api]],
  ["agent_release_snapshot(uuid,bigint,text,text,uuid,uuid,text)",[api]],
  ["agent_release_publish(uuid,uuid,bigint,text,text,bigint,bigint,boolean,boolean,uuid,text)",[api]],
  ["agent_release_delete_draft(uuid,uuid,text,bigint,boolean,uuid,text)",[api]],
  ["agent_release_restore_prepare(uuid,uuid,bigint,text,text,bigint,boolean,text,uuid,text)",[api]],
  ["agent_release_restore_finish(uuid,uuid,text)",[api]],
  ["release_test_checked(uuid,uuid,text,text)",[]],
  ["agent_release_acceptance(uuid,uuid,bigint,text,uuid,text)",[api]],
  ["agent_release_acceptance_status(uuid,uuid)",[api]],
]
function refuse():never{throw Error("unsafe_agent_release_privileges")}
async function agentReleasesInstalled(db:SqlClient):Promise<boolean>{
  const installed=(await db.query<{installed:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'agent_release_')) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR n.nspname='agentstudio' AND starts_with(p.proname,'agent_release_')) AS installed",[role])).rows[0]?.installed
  if(typeof installed!=="boolean")refuse()
  return installed
}
async function verifyAgentReleaseCredentials(db:SqlClient,profileToken?:symbol):Promise<boolean>{
  const qualityMode=profileToken!==undefined&&profileToken===quality089ReleaseParentToken;if(profileToken!==undefined&&!qualityMode)refuse()
  if(!await agentReleasesInstalled(db)){if(qualityMode)refuse();return false}
  const qualityContext=qualityMode?await inspectQuality089ReleaseParentCatalog(db):undefined
  const safe=(await db.query<{ok:boolean}>("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid OR roleid=r.oid) AND "+
    "NOT has_schema_privilege(r.oid,'agentstudio','CREATE') AND NOT has_schema_privilege(r.oid,'agentstudio_auth','CREATE') AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]?.ok
  if(!safe)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>(
    "SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
    "has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  for(const column of columns){const key=column.schema==="agentstudio_auth"?"auth."+column.table:column.table
    if(column.read!==((reads as Record<string,string[]>)[key]?.includes(column.column)??false)||column.insert!==(inserts[key]?.includes(column.column)??false)||column.update!==(updates[key]?.includes(column.column)??false)||column.reference)refuse()}
  for(const map of [reads,inserts,updates])for(const [key,names] of Object.entries(map))for(const name of names)
    if(!columns.some(c=>(c.schema==="agentstudio_auth"?"auth."+c.table:c.table)===key&&c.column===name))refuse()
  const noWrites=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') "+
    "AND c.relkind IN('r','p','v','m','f') AND (has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER') OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a "+
    "WHERE a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) AND (a.privilege_type<>'SELECT' OR a.is_grantable)))) AS ok",[role])).rows[0]?.ok
  if(!noWrites)refuse()
  for(const table of Object.keys(privateColumns)){
    const state=(await db.query<{ok:boolean}>((qualityContext&&["agent_release_versions","agent_release_acceptance_runs"].includes(table)?quality089ReleasePrivateStateSQL:"SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive AND "+
      "pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal AND NOT(c.relname='agent_release_versions' AND tgname='native_agent_release_immutable')) AS ok "+
      "FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)"),(qualityContext&&["agent_release_versions","agent_release_acceptance_runs"].includes(table)?["agentstudio."+table,role,qualityContext.qualityRoleOid,table==="agent_release_versions"?"quality089_versions_read":"quality089_acceptances_read"]:["agentstudio."+table,role]))).rows[0]?.ok
    if(!state)refuse()
  }
  for(const [signature,grantees] of agentReleaseFunctions){
    const fn=(await db.query<{ok:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
      "NOT EXISTS(SELECT 1 FROM unnest($3::text[])g WHERE NOT has_function_privilege(g,p.oid,'EXECUTE')) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND "+
      "a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,role,grantees,[role,...grantees]])).rows[0]?.ok
    if(!fn)refuse()
  }
  const surface=(await db.query<{ok:boolean}>("SELECT (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR n.nspname='agentstudio' AND starts_with(p.proname,'agent_release_'))=$2::integer AND "+
    "(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relkind IN('r','p','v','m','f') AND starts_with(c.relname,'agent_release_'))=4 AS ok",[role,agentReleaseFunctions.length])).rows[0]?.ok
  if(!surface)refuse()
  const trigger=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(t.tgrelid='agentstudio.agent_release_versions'::regclass AND t.tgname='native_agent_release_immutable' AND "+
    "t.tgfoid='agentstudio.release_version_immutable()'::regprocedure AND t.tgtype=27 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND "+
    "t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr::text='') AS ok FROM pg_catalog.pg_trigger t WHERE t.tgname='native_agent_release_immutable' OR t.tgfoid='agentstudio.release_version_immutable()'::regprocedure")).rows[0]?.ok
  if(!trigger)refuse()
  const index=(await db.query<{ok:boolean}>("SELECT i.indrelid='agentstudio.agent_release_versions'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indexprs IS NULL AND "+
    "i.indkey::text=(SELECT attnum::text FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='spec_id') AND "+
    "regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')=$1 AS ok FROM pg_catalog.pg_index i WHERE i.indexrelid=to_regclass('agentstudio.ux_agent_release_published')",["status='published'::text"])).rows[0]?.ok
  if(!index)refuse()
  return true
}
export async function verifyQuality089AgentReleaseCredentials(db:SqlClient):Promise<boolean>{return await verifyAgentReleaseCredentials(db,quality089ReleaseParentToken)}
type Quality089Role={oid:string;name:string;super:boolean;login:boolean;inherit:boolean;bypass:boolean;createdb:boolean;createrole:boolean;replication:boolean;config:unknown;limit:number;valid_until:string|null}
type Quality089Relation={oid:string;name:string;namespace:string;namespace_owner:string;owner:string;kind:string;rls:boolean;force:boolean;safe:boolean}
type Quality089Column={rel:string;number:number;name:string;safe:boolean}
type Quality089Policy={oid:string;rel:string;name:string;command:string;permissive:boolean;roles:number[];using:string;check:string|null}
type Quality089Acl={rel:string;grantor:string;grantee:string;privilege:string;grantable:boolean;name?:string}
type Quality089Effective={rel:string;role:string;name?:string;[key:string]:string|boolean|undefined}
type Quality089ReleaseCatalog={schema:string;context:{actor:string;read_only:boolean;search_path:string};migrations:Array<{version:string;description:string}>;roles:Quality089Role[];relations:Quality089Relation[];columns:Quality089Column[];policies:Quality089Policy[];acl:Quality089Acl[];column_acl:Quality089Acl[];effective_tables:Quality089Effective[];effective_columns:Quality089Effective[];members:unknown[]}
export const quality089ReleaseParentCatalogSQL="/* quality089 named release-parent catalog; read only */\nWITH rs AS(SELECT c.*,n.nspname,n.nspowner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname IN('agent_release_versions','agent_release_acceptance_runs'))\nSELECT jsonb_build_object(\n 'schema','quality089-release-parent.v1',\n 'context',jsonb_build_object('actor',current_user::text,'read_only',current_setting('transaction_read_only')='on','search_path',current_setting('search_path')),\n 'migrations',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'description',description)),'[]') FROM agentstudio.employee_ui078_catalog_ledger()),\n 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',oid::text,'name',rolname,'super',rolsuper,'login',rolcanlogin,'inherit',rolinherit,'bypass',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole,'replication',rolreplication,'config',rolconfig,'limit',rolconnlimit,'valid_until',rolvaliduntil::text)),'[]') FROM pg_catalog.pg_roles),\n 'relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',c.oid::text,'name',c.relname,'namespace',c.relnamespace::text,'namespace_owner',c.nspowner::text,'owner',c.relowner::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'safe',c.relpersistence='p' AND NOT c.relispartition AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid))),'[]') FROM rs c),\n 'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('rel',a.attrelid::text,'number',a.attnum,'name',a.attname,'safe',NOT a.attisdropped AND a.attidentity='' AND a.attgenerated='')),'[]') FROM pg_catalog.pg_attribute a JOIN rs c ON c.oid=a.attrelid WHERE a.attnum>0),\n 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid::text,'rel',p.polrelid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::bigint[],'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid))),'[]') FROM pg_catalog.pg_policy p WHERE p.polrelid IN(SELECT oid FROM rs)),\n 'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('rel',c.oid::text,'grantor',x.grantor::text,'grantee',x.grantee::text,'privilege',x.privilege_type,'grantable',x.is_grantable)),'[]') FROM rs c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) x),\n 'column_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('rel',a.attrelid::text,'name',a.attname,'grantor',x.grantor::text,'grantee',x.grantee::text,'privilege',x.privilege_type,'grantable',x.is_grantable)),'[]') FROM pg_catalog.pg_attribute a JOIN rs c ON c.oid=a.attrelid CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x WHERE a.attnum>0),\n 'effective_tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('rel',c.oid::text,'role',r.oid::text,'select',has_table_privilege(r.oid,c.oid,'SELECT'),'select_grantable',has_table_privilege(r.oid,c.oid,'SELECT WITH GRANT OPTION'),'insert',has_table_privilege(r.oid,c.oid,'INSERT'),'insert_grantable',has_table_privilege(r.oid,c.oid,'INSERT WITH GRANT OPTION'),'update',has_table_privilege(r.oid,c.oid,'UPDATE'),'update_grantable',has_table_privilege(r.oid,c.oid,'UPDATE WITH GRANT OPTION'),'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'delete_grantable',has_table_privilege(r.oid,c.oid,'DELETE WITH GRANT OPTION'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),'truncate_grantable',has_table_privilege(r.oid,c.oid,'TRUNCATE WITH GRANT OPTION'),'references',has_table_privilege(r.oid,c.oid,'REFERENCES'),'references_grantable',has_table_privilege(r.oid,c.oid,'REFERENCES WITH GRANT OPTION'),'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),'trigger_grantable',has_table_privilege(r.oid,c.oid,'TRIGGER WITH GRANT OPTION'),'maintain',has_table_privilege(r.oid,c.oid,'MAINTAIN'),'maintain_grantable',has_table_privilege(r.oid,c.oid,'MAINTAIN WITH GRANT OPTION'))),'[]') FROM rs c CROSS JOIN pg_catalog.pg_roles r),\n 'effective_columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('rel',c.oid::text,'name',a.attname,'role',r.oid::text,'select',has_column_privilege(r.oid,c.oid,a.attnum,'SELECT'),'select_grantable',has_column_privilege(r.oid,c.oid,a.attnum,'SELECT WITH GRANT OPTION'),'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),'insert_grantable',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT WITH GRANT OPTION'),'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE'),'update_grantable',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE WITH GRANT OPTION'),'references',has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES'),'references_grantable',has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES WITH GRANT OPTION'))),'[]') FROM rs c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid CROSS JOIN pg_catalog.pg_roles r WHERE a.attnum>0 AND NOT a.attisdropped),\n 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',m.roleid::text,'member',m.member::text,'grantor',m.grantor::text,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)),'[]') FROM pg_catalog.pg_auth_members m WHERE m.roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_releases','agentstudio_quality089')) OR m.member IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN('agentstudio_releases','agentstudio_quality089')))\n) AS value"
const tables=Object.freeze([
  {
    "name": "agent_release_versions",
    "columns": [
      "id",
      "owner_user_id",
      "spec_id",
      "version_no",
      "spec_revision",
      "source_sha256",
      "name_snapshot",
      "spec_snapshot",
      "note",
      "test_run_id",
      "test_passed",
      "test_model_binding",
      "status",
      "revision",
      "created_at",
      "updated_at",
      "published_at",
      "deleted_at"
    ],
    "inserts": [
      "id",
      "owner_user_id",
      "spec_id",
      "version_no",
      "spec_revision",
      "source_sha256",
      "name_snapshot",
      "spec_snapshot",
      "note",
      "test_run_id",
      "test_passed",
      "test_model_binding"
    ],
    "updates": [
      "status",
      "revision",
      "updated_at",
      "published_at",
      "deleted_at"
    ],
    "qualityPolicy": "quality089_versions_read"
  },
  {
    "name": "agent_release_acceptance_runs",
    "columns": [
      "run_id",
      "owner_user_id",
      "spec_id",
      "request_id",
      "spec_revision",
      "source_sha256",
      "instruction_sha256",
      "max_steps",
      "selected_model_binding",
      "created_at"
    ],
    "inserts": [
      "run_id",
      "owner_user_id",
      "spec_id",
      "request_id",
      "spec_revision",
      "source_sha256",
      "instruction_sha256",
      "max_steps",
      "selected_model_binding"
    ],
    "updates": [],
    "qualityPolicy": "quality089_acceptances_read"
  }
].map(t=>Object.freeze({...t,columns:Object.freeze(t.columns),inserts:Object.freeze(t.inserts),updates:Object.freeze(t.updates)})))
const migrations=Object.freeze([["pg_v9_046","Native owner-only full configuration versions, current-source acceptance and atomic restoration; no service activation"],["pg_v9_089","original employee quality revision v1; fresh isolated only"]])
const releaseRole="agentstudio_releases",qualityRole='agentstudio_quality089',apiRole="agentstudio_api"
const tableRights=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'],columnRights=['SELECT','INSERT','UPDATE','REFERENCES']
function canonical(v:unknown):string{const value=v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical((v as Record<string,unknown>)[k]))])):v;const text=JSON.stringify(value);if(typeof text!=='string')quality089ParentRefuse('data');return text}
function quality089ParentRefuse(field:string):never{throw Error('quality089_release_parent_'+field+'_unconfirmed')}
function exact(v:unknown,keys:readonly string[],field:string):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))quality089ParentRefuse(field)}
function eq(a:unknown,b:unknown,field:string):void{if(canonical(a)!==canonical(b))quality089ParentRefuse(field)}
function oid(v:unknown):string{if(typeof v!=='string'||! /^[1-9][0-9]{0,9}$/.test(v)||BigInt(v)>4294967295n)quality089ParentRefuse('oid');return v}
function one<T>(rows:readonly T[],predicate:(value:T)=>boolean,field:string):T{const found=rows.filter(predicate);if(found.length!==1)quality089ParentRefuse(field);return found[0]!}
function closed(raw:unknown):unknown{let nodes=0;function copy(v:unknown,depth:number):unknown{if(++nodes>250000||depth>25)quality089ParentRefuse('bound');if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;if(!v||typeof v!=='object'||isProxy(v))quality089ParentRefuse('data');const a=Array.isArray(v),d=Object.getOwnPropertyDescriptors(v);if(Object.getPrototypeOf(v)!==(a?Array.prototype:Object.prototype))quality089ParentRefuse('prototype');const keys=Reflect.ownKeys(d);if(a){if(keys.length!==(v as unknown[]).length+1)quality089ParentRefuse('array');return Array.from({length:(v as unknown[]).length},(_,i)=>{const descriptor=d[i];if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))quality089ParentRefuse('descriptor');return copy(descriptor.value,depth+1)})}const out:Record<string,unknown>={};for(const k of keys){if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))quality089ParentRefuse('descriptor');const descriptor=d[k];if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))quality089ParentRefuse('descriptor');out[k]=copy(descriptor.value,depth+1)}return out}return copy(raw,0)}
export function assertQuality089ReleaseParentCatalog(raw:unknown):Readonly<{qualityRoleOid:string}>{
 const v=closed(raw) as Quality089ReleaseCatalog;exact(v,['schema','context','migrations','roles','relations','columns','policies','acl','column_acl','effective_tables','effective_columns','members'],'shape')
 if(v.schema!=='quality089-release-parent.v1')quality089ParentRefuse('schema')
 exact(v.context,['actor','read_only','search_path'],'context');eq(v.context,{actor:apiRole,read_only:true,search_path:'pg_catalog'},'context')
 for(const key of ['migrations','roles','relations','columns','policies','acl','column_acl','effective_tables','effective_columns','members'] as const)if(!Array.isArray(v[key]))quality089ParentRefuse('array')
 if(!v.roles.length||v.roles.length>256||new Set(v.roles.map(r=>oid(r.oid))).size!==v.roles.length||new Set(v.roles.map(r=>r.name)).size!==v.roles.length)quality089ParentRefuse('roles')
 if(new Set(v.migrations.map(m=>m.version)).size!==v.migrations.length)quality089ParentRefuse('ledger')
 for(const m of v.migrations){exact(m,['version','description'],'ledger');if(typeof m.version!=='string'||typeof m.description!=='string')quality089ParentRefuse('ledger')}
 for(const [version,description]of migrations)eq(one(v.migrations,m=>m.version===version,'ledger').description,description,'ledger')
 for(const r of v.roles){exact(r,['oid','name','super','login','inherit','bypass','createdb','createrole','replication','config','limit','valid_until'],'role_shape');if(typeof r.name!=='string'||!r.name.length||(['super','login','inherit','bypass','createdb','createrole','replication'] as const).some(k=>typeof r[k]!=='boolean'))quality089ParentRefuse('role_shape');if(r.super===true&&r.name!=='postgres')quality089ParentRefuse('super_role')}
 const service=one(v.roles,r=>r.name===releaseRole,'service_role'),quality=one(v.roles,r=>r.name===qualityRole,'quality_role')
 for(const r of [service,quality]){exact(r,['oid','name','super','login','inherit','bypass','createdb','createrole','replication','config','limit','valid_until'],'role');if(r.super!==false||r.login!==false||r.inherit!==false||r.bypass!==false||r.createdb!==false||r.createrole!==false||r.replication!==false||r.config!==null||r.limit!==-1||r.valid_until!==null)quality089ParentRefuse('role')}
 if(v.members.length!==0)quality089ParentRefuse('membership')
 if(v.relations.length!==2||new Set(v.relations.map(r=>oid(r.oid))).size!==2||new Set(v.relations.map(r=>r.name)).size!==2||new Set(v.relations.map(r=>oid(r.namespace))).size!==1)quality089ParentRefuse('relations')
 if(v.columns.length!==28||v.policies.length!==4||new Set(v.policies.map(p=>oid(p.oid))).size!==4)quality089ParentRefuse('inventory')
 const expectedAcl:Quality089Acl[]=[],expectedColumnAcl:Quality089Acl[]=[]
 for(const t of tables){
  const rel=one(v.relations,r=>r.name===t.name,'relation');exact(rel,['oid','name','namespace','namespace_owner','owner','kind','rls','force','safe'],'relation');oid(rel.namespace);oid(rel.owner);const owner=one(v.roles,r=>r.oid===rel.owner,'owner');if(owner.name!=='postgres'||owner.super!==true||rel.owner!==rel.namespace_owner||rel.kind!=='r'||rel.rls!==true||rel.force!==true||rel.safe!==true)quality089ParentRefuse('owner_rls')
  const columns=v.columns.filter(c=>c.rel===rel.oid).sort((a,b)=>a.number-b.number);if(columns.length!==t.columns.length)quality089ParentRefuse('columns');for(const [i,c]of columns.entries()){exact(c,['rel','number','name','safe'],'column');eq([c.number,c.name,c.safe],[i+1,t.columns[i],true],'column')}
  const policies=v.policies.filter(p=>p.rel===rel.oid);if(policies.length!==2)quality089ParentRefuse('policies')
  for(const [name,role,command,using,check]of [['release_private',service,'*','true','true'],[t.qualityPolicy,quality,'r','(owner_user_id = agentstudio.actor_id())',null]] as const){const p=one(policies,p=>p.name===name,'policy_name');exact(p,['oid','rel','name','command','permissive','roles','using','check'],'policy');eq([p.command,p.permissive,p.roles],[command,true,[Number(role.oid)]],'policy_role_command');eq(p.using,using,'policy_using');eq(p.check,check,'policy_check')}
  for(const privilege of tableRights)expectedAcl.push({rel:rel.oid,grantor:rel.owner,grantee:rel.owner,privilege,grantable:false})
  for(const grantee of [service.oid,quality.oid])expectedAcl.push({rel:rel.oid,grantor:rel.owner,grantee,privilege:'SELECT',grantable:false})
  for(const [privilege,names]of [['INSERT',t.inserts],['UPDATE',t.updates]] as const)for(const name of names)expectedColumnAcl.push({rel:rel.oid,name,grantor:rel.owner,grantee:service.oid,privilege,grantable:false})
  for(const r of v.roles){
   const e=one(v.effective_tables,e=>e.rel===rel.oid&&e.role===r.oid,'effective_table');exact(e,['rel','role',...tableRights.map(x=>x.toLowerCase()),...tableRights.map(x=>x.toLowerCase()+'_grantable')],'effective_table')
   for(const right of tableRights){let allowed=r.super===true||[service.oid,quality.oid].includes(r.oid)&&right==='SELECT';if(r.name==='pg_read_all_data'&&right==='SELECT'||r.name==='pg_write_all_data'&&['INSERT','UPDATE','DELETE'].includes(right)||r.name==='pg_maintain'&&right==='MAINTAIN')allowed=true;if(e[right.toLowerCase()]!==allowed||e[right.toLowerCase()+'_grantable']!==(r.super===true))quality089ParentRefuse('effective_table')}
   for(const name of t.columns){const c=one(v.effective_columns,c=>c.rel===rel.oid&&c.name===name&&c.role===r.oid,'effective_column');exact(c,['rel','name','role',...columnRights.map(x=>x.toLowerCase()),...columnRights.map(x=>x.toLowerCase()+'_grantable')],'effective_column');for(const right of columnRights){let allowed=r.super===true||r.oid===quality.oid&&right==='SELECT'||r.oid===service.oid&&(right==='SELECT'||right==='INSERT'&&t.inserts.includes(name)||right==='UPDATE'&&t.updates.includes(name));if(r.name==='pg_read_all_data'&&right==='SELECT'||r.name==='pg_write_all_data'&&['INSERT','UPDATE'].includes(right))allowed=true;if(c[right.toLowerCase()]!==allowed||c[right.toLowerCase()+'_grantable']!==(r.super===true))quality089ParentRefuse('effective_column')}}
  }
 }
 for(const e of v.acl)exact(e,['rel','grantor','grantee','privilege','grantable'],'acl');eq(v.acl.map(canonical).sort(),expectedAcl.map(canonical).sort(),'acl')
 for(const e of v.column_acl)exact(e,['rel','name','grantor','grantee','privilege','grantable'],'column_acl');eq(v.column_acl.map(canonical).sort(),expectedColumnAcl.map(canonical).sort(),'column_acl')
 if(v.effective_tables.length!==v.roles.length*2||new Set(v.effective_tables.map(e=>e.rel+':'+e.role)).size!==v.effective_tables.length||v.effective_columns.length!==v.roles.length*28||new Set(v.effective_columns.map(e=>e.rel+':'+e.name+':'+e.role)).size!==v.effective_columns.length)quality089ParentRefuse('effective_inventory')
 return Object.freeze({qualityRoleOid:quality.oid})
}
export async function inspectQuality089ReleaseParentCatalog(db:SqlClient):Promise<Readonly<{qualityRoleOid:string}>>{
 const rpc=(await db.query<{ok:boolean;source:string}>(employeeUi078LedgerRpcAuditSql)).rows
 if(!Array.isArray(rpc)||rpc.length!==1)quality089ParentRefuse('ledger_rpc')
 const marker=rpc[0]
 if(!marker||marker.ok!==true||typeof marker.source!=='string'||marker.source.length!==269||createHash('sha256').update(marker.source).digest('hex')!==quality089ParentLedgerRpcBodySha256)quality089ParentRefuse('ledger_rpc')
 const rows=(await db.query<{value:unknown}>(quality089ReleaseParentCatalogSQL)).rows;if(!Array.isArray(rows)||rows.length!==1)quality089ParentRefuse('query_shape');return assertQuality089ReleaseParentCatalog(rows[0]?.value)
}
const quality089ReleasePrivateStateSQL="SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND (has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR r.oid<>$3::oid AND has_any_column_privilege(r.oid,c.oid,'SELECT'))) AND (SELECT count(*)=2 AND bool_and((polname='release_private' AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') OR (polname=$4::text AND polroles=ARRAY[$3::oid]::oid[] AND polcmd='r' AND polpermissive AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL)) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND has_table_privilege($3::oid,c.oid,'SELECT') AND NOT has_table_privilege($3::oid,c.oid,'SELECT WITH GRANT OPTION') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal AND NOT(c.relname='agent_release_versions' AND tgname='native_agent_release_immutable')) AS ok FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)"
