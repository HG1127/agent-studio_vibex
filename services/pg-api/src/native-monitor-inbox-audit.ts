import {createHash} from 'node:crypto'
import type {SqlClient,SqlPool} from './contracts.ts'
import {nativeMonitorTables as tables,nativeMonitorFunctions as functions} from './native-monitor-inbox-schema.ts'
const api='agentstudio_api',fail=():never=>{throw Error('unsafe_native_monitor_inbox_schema')},canonical=(v:string)=>v.replace(/\s+/g,'')
const placeholders="SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'native_monitor_')"
export const nativeMonitorPresenceSql="SELECT 'migration' AS kind,version AS name FROM agentstudio.schema_migrations WHERE version='pg_v9_073' UNION ALL "+
 "SELECT 'relation',c.relname::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'native_monitor_') UNION ALL "+
 "SELECT 'type',t.typname::text FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (starts_with(t.typname,'native_monitor_') OR starts_with(t.typname,'_native_monitor_')) UNION ALL "+
 "SELECT 'function',p.proname::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'native_monitor_') UNION ALL "+
 "SELECT 'constraint',c.conname::text FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND (starts_with(c.conname,'native_monitor_') OR c.conrelid IN("+placeholders+") OR c.confrelid IN("+placeholders+")) UNION ALL "+
 "SELECT 'policy',p.polname::text FROM pg_catalog.pg_policy p WHERE starts_with(p.polname,'native_monitor_') OR p.polrelid IN("+placeholders+") UNION ALL "+
 "SELECT 'trigger',t.tgname::text FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND (starts_with(t.tgname,'native_monitor_') OR t.tgrelid IN("+placeholders+")) UNION ALL "+
 "SELECT 'event_trigger',evtname::text FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'native_monitor_')"
export const nativeMonitorExpectedPresence=[
 'migration:pg_v9_073',...functions.map(f=>'function:'+f.name),
 ...tables.flatMap(t=>['relation:'+t.name,'type:'+t.name,'type:_'+t.name,'policy:'+t.name+'_owner','trigger:'+t.name+'_immutable',
  ...t.constraints.flatMap(c=>['constraint:'+c.name,...(['p','u'].includes(c.type)?['relation:'+c.name]:[])]),
  ...t.columns.filter(c=>c.required).map(c=>'constraint:'+t.name+'_'+c.name+'_not_null')]),
 'trigger:native_monitor_events_read_guard',
].sort()
function exactPresence(rows:{kind:string;name:string}[]){if(!Array.isArray(rows)||rows.some(r=>typeof r?.kind!=='string'||typeof r?.name!=='string')||JSON.stringify(rows.map(r=>r.kind+':'+r.name).sort())!==JSON.stringify(nativeMonitorExpectedPresence))fail()}
export async function verifyNativeMonitorInboxSchema(db:SqlClient):Promise<void>{
 exactPresence((await db.query<{kind:string;name:string}>(nativeMonitorPresenceSql)).rows)
 for(const t of tables){
  const name='agentstudio.'+t.name
  const states=(await db.query<{ok:boolean;api_oid:number}>("SELECT c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND c.relforcerowsecurity AND owner.rolsuper AND c.reloptions IS NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) AND "+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,owner.oid,'MEMBER')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
   "has_table_privilege($2,c.oid,'SELECT') AND NOT has_table_privilege($2,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AND "+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)) OR a.grantee<>c.relowner AND (a.is_grantable OR a.grantor<>c.relowner OR a.privilege_type<>'SELECT')) AS ok,"+
   "(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS api_oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner WHERE c.oid=to_regclass($1)",[name,api])).rows
   const state=states[0];if(!state)throw Error('unsafe_native_monitor_inbox_schema');if(states.length!==1||state.ok!==true||!Number.isSafeInteger(Number(state.api_oid))||Number(state.api_oid)<1)fail()
  const columns=(await db.query<{name:string;type:string;required:boolean;safe:boolean}>("SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity='' AND a.attgenerated='' AND coalesce(cardinality(a.attacl),0)=0 AND d.oid IS NULL AS safe FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[name])).rows
  if(columns.length!==t.columns.length)fail()
  for(let i=0;i<columns.length;i++){const c=columns[i]!,wanted=t.columns[i]!;if(c.name!==wanted.name||c.type!==wanted.type||c.required!==wanted.required||c.safe!==true)fail()}
  const policies=(await db.query<{name:string;command:string;permissive:boolean;roles:number[];using_expr:string;check_expr:string|null}>('SELECT polname AS name,polcmd AS command,polpermissive AS permissive,polroles AS roles,pg_get_expr(polqual,polrelid) AS using_expr,pg_get_expr(polwithcheck,polrelid) AS check_expr FROM pg_catalog.pg_policy WHERE polrelid=to_regclass($1)',[name])).rows
  const p=policies[0];if(policies.length!==1||!p||p.name!==t.name+'_owner'||p.command!=='r'||p.permissive!==true||JSON.stringify(p.roles.map(Number))!==JSON.stringify([Number(state.api_oid)])||canonical(p.using_expr)!=='(owner_user_id=agentstudio.actor_id())'||p.check_expr!==null)fail()
  const constraints=(await db.query<{name:string;type:string;keys:number[];valid:boolean;enforced:boolean;deferrable:boolean;deferred:boolean;local:boolean;ordinary:boolean;no_inherit:boolean;definition:string}>("SELECT conname AS name,contype AS type,conkey AS keys,convalidated AS valid,conenforced AS enforced,condeferrable AS deferrable,condeferred AS deferred,conislocal AND coninhcount=0 AND conparentid=0 AS local,contypid=0 AND NOT conperiod AS ordinary,connoinherit AS no_inherit,pg_get_constraintdef(oid,true) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass($1)",[name])).rows
  const expected:Record<string,{type:string;keys:number[];definition:string;deferred?:boolean}>={}
  for(const c of t.constraints){expected[c.name]={type:c.type,keys:c.keys.map(k=>t.columns.findIndex(col=>col.name===k)+1),definition:canonical(c.definition).replace('ONUPDATENOACTIONONDELETENOACTION',''),deferred:'deferred'in c&&c.deferred===true}}
  for(const [i,c]of t.columns.entries())if(c.required)expected[t.name+'_'+c.name+'_not_null']={type:'n',keys:[i+1],definition:'NOTNULL'+c.name}
  if(constraints.length!==Object.keys(expected).length||new Set(constraints.map(c=>c.name)).size!==constraints.length)fail()
  for(const c of constraints){const wanted=expected[c.name];if(!wanted||c.type!==wanted.type||c.valid!==true||c.enforced!==true||c.local!==true||c.ordinary!==true||c.deferrable!==(wanted.deferred===true)||c.deferred!==(wanted.deferred===true)||c.no_inherit!==['p','u','f'].includes(c.type)||JSON.stringify(c.keys)!==JSON.stringify(wanted.keys)||canonical(c.definition)!==wanted.definition)fail()}
  const indexes=(await db.query<{name:string;keys:string[];safe:boolean}>("SELECT ci.relname AS name,ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true) FROM generate_series(1,i.indnkeyatts) n) AS keys,i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate AND i.indnkeyatts=i.indnatts AND i.indexprs IS NULL AND i.indpred IS NULL AND a.amname='btree' AND ci.reloptions IS NULL AS safe FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid JOIN pg_catalog.pg_am a ON a.oid=ci.relam WHERE i.indrelid=to_regclass($1)",[name])).rows
  const expectedIndexes=t.constraints.filter(c=>['p','u'].includes(c.type));if(indexes.length!==expectedIndexes.length)fail();for(const i of indexes){const wanted=expectedIndexes.find(c=>c.name===i.name);if(!wanted||i.safe!==true||JSON.stringify(i.keys)!==JSON.stringify(wanted.keys))fail()}
  const triggers=(await db.query<{name:string;type:number;function_name:string;safe:boolean}>("SELECT tgname AS name,tgtype::integer AS type,(SELECT p.proname FROM pg_catalog.pg_proc p WHERE p.oid=t.tgfoid) AS function_name,tgenabled='O' AND tgconstraint=0 AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND octet_length(tgargs)=0 AND tgqual IS NULL AND tgattr=''::int2vector AND tgparentid=0 AND tgfoid IN(to_regprocedure('agentstudio.native_monitor_immutable()'),to_regprocedure('agentstudio.native_monitor_read_guard()')) AS safe FROM pg_catalog.pg_trigger t WHERE tgrelid=to_regclass($1) AND NOT tgisinternal",[name])).rows
  if(triggers.length!==(t.name==='native_monitor_events'?2:1))fail()
  for(const trigger of triggers){const read=trigger.name==='native_monitor_events_read_guard';if(trigger.safe!==true||trigger.name!==(read?'native_monitor_events_read_guard':t.name+'_immutable')||trigger.type!==(read?19:t.name==='native_monitor_events'?42:58)||trigger.function_name!==(read?'native_monitor_read_guard':'native_monitor_immutable'))fail()}
 }
 for(const f of functions){
  const rows=(await db.query<{ok:boolean;source:string}>("SELECT p.prokind='f' AND p.prosecdef=$2::boolean AND p.proisstrict=$3::boolean AND p.provolatile=$4::\"char\" AND NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.provariadic=0 AND p.prosupport=0 AND p.pronargdefaults=0 AND p.proargdefaults IS NULL AND p.proargnames IS NULL AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.prosqlbody IS NULL AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND l.lanname=$5::text AND format_type(p.prorettype,NULL)=$6::text AND owner.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,owner.oid,'MEMBER')) AND "+
   "has_function_privilege('agentstudio_api',p.oid,'EXECUTE')=$7::boolean AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND (NOT $7::boolean OR r.rolname<>'agentstudio_api') AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AND "+
   "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.grantee<>p.proowner AND (NOT $7::boolean OR a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_api') OR a.is_grantable)) AS ok,p.prosrc AS source FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner WHERE p.oid=to_regprocedure($1)",['agentstudio.'+f.name+'('+f.args+')',f.definer,f.strict,f.volatility,f.language,f.returns,f.api])).rows
  const row=rows[0];if(rows.length!==1||row?.ok!==true||typeof row.source!=='string'||createHash('sha256').update(row.source).digest('hex')!==f.sha256)fail()
 }
}
export async function inspectOptionalNativeMonitorInbox(pool:SqlPool):Promise<'absent'|'installed'>{
 const db=await pool.connect();let begun=false,primary:unknown,discard=false
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog')
  const rows=(await db.query<{kind:string;name:string}>(nativeMonitorPresenceSql)).rows;if(!Array.isArray(rows))fail();if(rows.length===0)return'absent'
  await verifyNativeMonitorInboxSchema(db);return'installed'
 }catch(error){primary=error;throw error}
 finally{try{if(begun)await db.query('ROLLBACK')}catch{discard=true;if(primary===undefined)throw Error('native_monitor_catalog_rollback_required')}finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}}
}
