import {createHash} from 'node:crypto'
import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {originalHomeStatisticsFunctionPins} from './native-home-knowledge-stats-pins.ts'
import {originalHome070PresenceSql,verifyNativeHomeAuthoringSchema} from './native-home-authoring-audit.ts'
import {originalAgentCatalog071PresenceSql,verifyNativeAgentCatalogSchema} from './native-agent-catalog-audit.ts'
import {verifyKnowledgeHelperCredentials} from './knowledge-content-privileges.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
const unavailable=():never=>{throw new HttpError(503,'original_home_knowledge_statistics_unavailable')}
const canonical=(value:string)=>value.replace(/\s+/g,'')
const expected072=['migration:pg_v9_072','function:original_home_knowledge_stats'].sort()
const expected070=['migration:pg_v9_070','relation:agent_spec_authoring','related_relation:agent_spec_authoring_pkey','type:agent_spec_authoring','type:_agent_spec_authoring','function:home_authoring_utf16_length','function:home_authoring_valid','constraint:agent_spec_authoring_pkey','constraint:agent_spec_authoring_owner_fk','constraint:agent_spec_authoring_valid_ck','policy:agent_spec_authoring_owner',...['agent_spec_id','owner_user_id','authoring','created_at','updated_at'].map(name=>'constraint:agent_spec_authoring_'+name+'_not_null')].sort()
const expected071=['migration:pg_v9_071','relation:agent_spec_favorites','related_relation:agent_spec_favorites_pkey','type:agent_spec_favorites','type:_agent_spec_favorites','constraint:agent_spec_favorites_pkey','constraint:agent_spec_favorites_owner_fk','policy:agent_spec_favorites_owner',...['agent_spec_id','owner_user_id','favorite','created_at','updated_at'].map(name=>'constraint:agent_spec_favorites_'+name+'_not_null')].sort()
export const originalHomeStatisticsPresenceSql="SELECT 'migration' AS kind,version AS name FROM agentstudio.schema_migrations WHERE version='pg_v9_072' UNION ALL "+
 "SELECT 'function',p.proname::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'original_home_knowledge_stats') UNION ALL "+
 "SELECT 'relation',c.relname::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'original_home_knowledge_stats') UNION ALL "+
 "SELECT 'type',t.typname::text FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (starts_with(t.typname,'original_home_knowledge_stats') OR starts_with(t.typname,'_original_home_knowledge_stats')) UNION ALL "+
 "SELECT 'constraint',c.conname::text FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND starts_with(c.conname,'original_home_knowledge_stats') UNION ALL "+
 "SELECT 'policy',p.polname::text FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(p.polname,'original_home_knowledge_stats') UNION ALL "+
 "SELECT 'trigger',t.tgname::text FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND NOT t.tgisinternal AND starts_with(t.tgname,'original_home_knowledge_stats') UNION ALL "+
 "SELECT 'event_trigger',evtname::text FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'original_home_knowledge_stats')"
function exact(rows:{kind:string;name:string}[],expected:string[]):void{if(!Array.isArray(rows)||rows.some(row=>typeof row.kind!=='string'||typeof row.name!=='string')||JSON.stringify(rows.map(row=>row.kind+':'+row.name).sort())!==JSON.stringify(expected))unavailable()}
async function principal(db:SqlClient):Promise<void>{
 const row=(await db.query<{ok:boolean}>("SELECT current_user='agentstudio_api' AND session_user<>current_user AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS ok FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
 if(row?.ok!==true)unavailable()
}
const functionSql="SELECT p.prosecdef AND p.provolatile='s' AND p.proisstrict=$4::boolean AND p.proretset=$5::boolean AND p.pronargs=$6::integer AND ($6::integer=0 OR p.proargtypes[0]='uuid'::regtype) AND NOT p.proleakproof AND p.prosupport=0 AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND l.lanname=$3::text AND "+
 "owner.rolname=$2::text AND NOT owner.rolcanlogin AND NOT owner.rolinherit AND NOT owner.rolsuper AND NOT owner.rolbypassrls AND NOT owner.rolcreatedb AND NOT owner.rolcreaterole AND NOT owner.rolreplication AND owner.rolconfig IS NULL AND owner.rolvaliduntil IS NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid=owner.oid OR m.member=owner.oid) AND "+
 "has_function_privilege('agentstudio_api',p.oid,'EXECUTE')=('agentstudio_api'=ANY($7::text[])) AND (p.proacl IS NULL OR coalesce(array_ndims(p.proacl),0)=1) AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(CASE WHEN array_ndims(p.proacl)=1 THEN p.proacl ELSE pg_catalog.acldefault('f',p.proowner) END) a WHERE a.grantee<>p.proowner AND (a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($7::text[])) OR a.is_grantable OR a.grantor<>p.proowner)) AS ok,p.prosrc AS source,pg_get_function_result(p.oid) AS result "+
 "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1::text)"
async function functions(db:SqlClient,statistics:boolean):Promise<void>{
 for(const pin of originalHomeStatisticsFunctionPins){
  if((pin.signature==='original_home_knowledge_stats(uuid)')!==statistics)continue
  const row=(await db.query<{ok:boolean;source:string;result:string}>(functionSql,['agentstudio.'+pin.signature,pin.owner,pin.language,pin.strict,pin.set,pin.args,[...pin.roles]])).rows[0]
  if(row?.ok!==true||typeof row.source!=='string'||typeof row.result!=='string'||canonical(row.result)!==pin.result||createHash('sha256').update(row.source).digest('hex')!==pin.sha256)unavailable()
 }
}
/** Validate original ACL code BEFORE invoking its metadata RPC. No auth DTO. */
export async function verifyOriginalHomeKnowledgeAclDependencies(db:SqlClient):Promise<void>{await db.query('SET LOCAL search_path=pg_catalog');await principal(db);await functions(db,false)}
/** Per-read072/dependency integrity; no caller-provided schema status or pins. */
export async function verifyOriginalHomeKnowledgeStats(db:SqlClient):Promise<void>{
 await verifyOriginalHomeKnowledgeAclDependencies(db);exact((await db.query<{kind:string;name:string}>(originalHomeStatisticsPresenceSql)).rows,expected072);await functions(db,true)
}
async function fullPredecessor(db:SqlClient):Promise<void>{
 exact((await db.query<{kind:string;name:string}>(originalHome070PresenceSql)).rows,expected070)
 exact((await db.query<{kind:string;name:string}>(originalAgentCatalog071PresenceSql)).rows,expected071)
 await verifyNativeHomeAuthoringSchema(db);await verifyNativeAgentCatalogSchema(db)
 // Original functions run verbatim on the actual072 catalog. No filtered view
 // is passed to any old auditor and no old complete069 receipt is minted.
 for(const verify of [verifyApprovalDelegationCredentials,verifyNativeLocalDeviceSchema,verifyAgentCallerCredentials,verifyOwnerToolTrialCredentials])if(await verify(db)!==true)unavailable()
 await verifyKnowledgeHelperCredentials(db)
 const tables=(await db.query<{name:string;ok:boolean}>("SELECT c.relname::text AS name,c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS ok FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname IN('knowledge_access','knowledge_access_receipts','knowledge_content_receipts','knowledge_bases','knowledge_documents','knowledge_chunks') ORDER BY c.relname")).rows
 if(tables.length!==6||tables.some(row=>row.ok!==true)||new Set(tables.map(row=>row.name)).size!==6)unavailable()
}
export async function inspectOptionalOriginalHomeKnowledgeStatisticsSchema(pool:SqlPool):Promise<'absent'|'installed'>{
 const db=await pool.connect();let primary:unknown,discard=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog');await principal(db)
  const rows=(await db.query<{kind:string;name:string}>(originalHomeStatisticsPresenceSql)).rows
  if(!Array.isArray(rows))unavailable();if(rows.length===0)return'absent'
  exact(rows,expected072);await verifyOriginalHomeKnowledgeStats(db);await fullPredecessor(db);return'installed'
 }catch(error){primary=error;throw error}
 finally{try{await db.query('ROLLBACK')}catch{discard=true;if(primary===undefined)throw Error('original_home_statistics_schema_rollback_required')}finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}}
}
