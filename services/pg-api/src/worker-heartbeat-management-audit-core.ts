// Independent MANAGEMENT catalog audit. Importing performs no I/O.
// Expectations are immutable comparison DATA, never authority. Caller owns
// real operator/client admission, RR READ ONLY transaction and private DbAccess
// facade checks on every query await. No SET ROLE, row adaptation, registry
// read, snapshot, connection, transaction management or activation is supplied.
// Original strict catalog body is preserved independently from the frozen
// reader auditor; reader LOGIN=false does not imply an all-dormant registry.
import type {SqlClient} from "./contracts.ts"
import {workerHeartbeatKinds} from "./worker-heartbeat-contract.ts"
import {workerHeartbeatSchemaPins} from "./worker-heartbeat-audit-core.ts"

const schema="studio_telemetry",ownerName="studio_telemetry_owner",readerName="studio_telemetry_reader"
const writerNames=workerHeartbeatKinds.flatMap(kind=>[1,2].map(slot=>`studio_telemetry_tx_${kind}_${slot}`))
const roleNames=[ownerName,readerName,...writerNames]
type Row=Record<string,unknown>
export type WorkerHeartbeatManagementExpectedRole=Readonly<{
 oid:number;name:string;login:boolean;inherit:false;super:false;bypass:false
 create_db:false;create_role:false;replication:false;connection_limit:-1|1|2
 config:null;no_expiry:true;memberships:0
}>
/** Caller-supplied comparisons only. This type has NO operator/activation authority.
 * roles must be owner, reader, then both slots for each workerHeartbeatKinds entry.
 * Reader and writer LOGIN are explicit booleans; owner is always NOLOGIN.
 * No enabled/generation/observation state or operator authority can be inferred.
 */
export type WorkerHeartbeatManagementCatalogExpectations=Readonly<{
 protocol:"worker_heartbeat_management_catalog_expectations_v1"
 database_oid:number;database_owner_oid:number;schema_oid:number
 operator:Readonly<{oid:number;name:string}>
 roles:readonly WorkerHeartbeatManagementExpectedRole[]
}>
export type WorkerHeartbeatManagementCatalogAudit=Readonly<{
 schema:"telemetry_v1";phase:"management_catalog_only";catalog_verified:true
 registry_verified:false;activation_current_verified:false
 native_authorization_verified:false;runtime_readiness_verified:false
}>
const result:WorkerHeartbeatManagementCatalogAudit=Object.freeze({
 schema:"telemetry_v1",phase:"management_catalog_only",catalog_verified:true,
 registry_verified:false,activation_current_verified:false,
 native_authorization_verified:false,runtime_readiness_verified:false,
})
const fail=():never=>{throw Error("unsafe_worker_heartbeat_management_catalog")}
const oid=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=4294967295
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function closed(value:unknown,keys:readonly string[]):Row{
 if(!value||typeof value!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
 const descriptors=Object.getOwnPropertyDescriptors(value)
 if(Reflect.ownKeys(value).length!==keys.length)return fail()
 const detached:Row={}
 for(const key of keys){
  const d=descriptors[key]
  if(!d||!d.enumerable||!("value" in d))return fail()
  detached[key]=d.value
 }
 return detached
}
/** Strict, detached comparisons. Parsing JSON is NOT verification of its origin. */
export function parseWorkerHeartbeatManagementCatalogExpectations(raw:unknown):WorkerHeartbeatManagementCatalogExpectations{
 try{
  const input=closed(raw,["protocol","database_oid","database_owner_oid","schema_oid","operator","roles"])
  if(input.protocol!=="worker_heartbeat_management_catalog_expectations_v1"||
    !oid(input.database_oid)||!oid(input.database_owner_oid)||!oid(input.schema_oid))return fail()
  const operator=closed(input.operator,["oid","name"])
  if(!oid(operator.oid)||typeof operator.name!=="string"||operator.name.length===0||
   Buffer.byteLength(operator.name,"utf8")>63||operator.name.includes("\0")||
   operator.name.startsWith("studio_telemetry_"))return fail()
  const entries=input.roles
  if(!Array.isArray(entries)||Object.getPrototypeOf(entries)!==Array.prototype||entries.length!==18||
    Reflect.ownKeys(entries).length!==19)return fail()
  const roleKeys=["oid","name","login","inherit","super","bypass","create_db","create_role","replication","connection_limit","config","no_expiry","memberships"] as const
  const roles:WorkerHeartbeatManagementExpectedRole[]=[]
  for(let i=0;i<18;i++){
   const descriptor=Object.getOwnPropertyDescriptor(entries,String(i))
   if(!descriptor?.enumerable||!("value" in descriptor))return fail()
   const r=closed(descriptor.value,roleKeys),limit=i===0?-1:i===1?2:1
   if(!oid(r.oid)||r.name!==roleNames[i]||typeof r.login!=="boolean"||
    (i===0&&r.login!==false)||r.inherit!==false||r.super!==false||
    r.bypass!==false||r.create_db!==false||r.create_role!==false||r.replication!==false||
    r.connection_limit!==limit||r.config!==null||r.no_expiry!==true||r.memberships!==0)return fail()
   roles.push(Object.freeze({...r}) as WorkerHeartbeatManagementExpectedRole)
  }
  if(new Set(roles.map(r=>r.oid)).size!==18||roles.some(r=>r.oid===input.database_owner_oid||r.oid===operator.oid))return fail()
  return Object.freeze({protocol:"worker_heartbeat_management_catalog_expectations_v1",
   database_oid:input.database_oid,database_owner_oid:input.database_owner_oid,
   schema_oid:input.schema_oid,operator:Object.freeze({oid:operator.oid,name:operator.name}),roles:Object.freeze(roles)})
 }catch{return fail()}
}
async function read(db:SqlClient,sql:string,args:unknown[]=[]):Promise<Row[]>{
 const answer=await db.query<Row>(sql,args)
 if(!answer||typeof answer!=="object")return fail()
 const field=Object.getOwnPropertyDescriptor(answer,"rows")
 if(!field||!("value" in field))return fail()
 const values:unknown=field.value
 if(!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype||
  Reflect.ownKeys(values).length!==values.length+1)return fail()
 const rows:Row[]=[]
 for(let i=0;i<values.length;i++){
  const entry=Object.getOwnPropertyDescriptor(values,String(i))
  if(!entry?.enumerable||!("value" in entry))return fail()
  const row:unknown=entry.value
  if(!row||typeof row!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(row)))return fail()
  const fields=Object.getOwnPropertyDescriptors(row),copied:Row={}
  for(const key of Reflect.ownKeys(row)){
   if(typeof key!=="string")return fail()
   const d=fields[key];if(!d?.enumerable||!("value" in d))return fail()
   Object.defineProperty(copied,key,{value:d.value,enumerable:true,writable:true,configurable:true})
  }
  rows.push(copied)
 }
 return rows
}
async function one(db:SqlClient,sql:string,args:unknown[]=[]):Promise<Row>{
 const rows=await read(db,sql,args);if(rows.length!==1)return fail();return rows[0]!
}
function ids(rows:Row[]):number[]{
 const values=rows.map(row=>row.id)
 if(values.some(value=>!oid(value))||new Set(values).size!==values.length)return fail()
 return values as number[]
}
const columns:Record<string,readonly [string,string,boolean,string|null][]>= {
 kind_config:[["ordinal","smallint",true,null],["kind","text",true,null],["instrumented","boolean",true,"false"],["enabled","boolean",true,"false"]],
 slot_state:[["kind","text",true,null],["slot_no","smallint",true,null],["login_oid","oid",true,null],["login_name","text",true,null],["enabled","boolean",true,"false"],["generation","uuid",false,null],["last_sequence","bigint",true,"'0'::bigint"],["state","text",false,null],["reason","text",false,null],["observed_at","timestamp with time zone",false,null],["draining","boolean",true,"false"]],
}
// Exact PG18 deparser contracts; genuine PG18 TCP must confirm these before use.
// Whitespace is significant too: no expression/coercion normalization fallback.
const checks:Record<string,string>={
 telemetry_kind_range:"((ordinal >= 1) AND (ordinal <= 8))",
 telemetry_kind_enabled:"((NOT enabled) OR instrumented)",
 telemetry_slot_range:"((slot_no >= 1) AND (slot_no <= 2))",
 telemetry_slot_sequence:"((last_sequence >= 0) AND (last_sequence <= '9007199254740991'::bigint))",
 telemetry_slot_enabled:"((NOT enabled) OR (generation IS NOT NULL))",
 telemetry_slot_observation:"(((last_sequence = 0) AND (state IS NULL) AND (reason IS NULL) AND (observed_at IS NULL) AND (NOT draining)) OR ((last_sequence > 0) AND (generation IS NOT NULL) AND (state IS NOT NULL) AND (reason IS NOT NULL) AND (observed_at IS NOT NULL) AND (((state = 'unknown'::text) AND (reason = ANY (ARRAY['startup_checks_pending'::text, 'loop_unavailable'::text]))) OR ((state = 'ready'::text) AND (reason = 'startup_checks_complete'::text)) OR ((state = 'draining'::text) AND (reason = 'new_claims_closed'::text))) AND (draining = (state = 'draining'::text))))",
}
const keys:Record<string,{table:string;kind:string;columns:string[]}>= {
 telemetry_kind_pk:{table:"kind_config",kind:"p",columns:["ordinal"]},
 telemetry_kind_unique:{table:"kind_config",kind:"u",columns:["kind"]},
 telemetry_slot_pk:{table:"slot_state",kind:"p",columns:["kind","slot_no"]},
 telemetry_slot_login_oid:{table:"slot_state",kind:"u",columns:["login_oid"]},
 telemetry_slot_login_name:{table:"slot_state",kind:"u",columns:["login_name"]},
 telemetry_slot_kind_fk:{table:"slot_state",kind:"f",columns:["kind"]},
}


/** Requires the actual expected operator session inside RR READ ONLY / pg_catalog.
 * No connection, role switch, registry read, snapshot call or activation is made.
 */
export async function verifyWorkerHeartbeatManagementCatalogCore(
 db:SqlClient,rawExpectations:unknown,
):Promise<WorkerHeartbeatManagementCatalogAudit>{
 try{
  // Detach synchronously before the first DB await; later caller mutation is irrelevant.
  const expected=parseWorkerHeartbeatManagementCatalogExpectations(rawExpectations)
  return await verifyCatalog(db,expected)
 }catch{return fail()}
}
async function verifyCatalog(db:SqlClient,expected:WorkerHeartbeatManagementCatalogExpectations):Promise<WorkerHeartbeatManagementCatalogAudit>{
 const target=await one(db,"/* telemetry_v1_management_catalog:target */ SELECT d.oid::integer AS database_id,pg_catalog.current_database() AS database,pg_catalog.current_setting('server_version_num')::integer AS version,pg_catalog.current_setting('server_encoding') AS encoding,d.datdba::integer AS owner_id,r.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND pg_catalog.pg_has_role(member.oid,r.oid,'MEMBER')) AS owner_super,"+
  "session_user::text AS login_name,caller.oid::integer AS login_oid,current_user::text AS actor_name,NOT pg_catalog.pg_is_in_recovery() AS primary,current_user=session_user AND caller.rolsuper AND caller.rolcanlogin AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND pg_catalog.pg_has_role(member.oid,caller.oid,'MEMBER')) AS authentic_audit,pg_catalog.current_setting('transaction_read_only')='on' AND pg_catalog.current_setting('transaction_isolation')='repeatable read' AS consistent_readonly,pg_catalog.current_setting('search_path')='pg_catalog' AND pg_catalog.pg_my_temp_schema()=0 AS controlled_path,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE NOT pg_catalog.starts_with(n.nspname,'pg_') AND n.nspname NOT IN('information_schema','public','studio_telemetry')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger) AND d.datallowconn AND NOT d.datistemplate AND d.datconnlimit=-1 AS isolated "+
  "FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba JOIN pg_catalog.pg_roles caller ON caller.rolname=session_user WHERE d.datname=pg_catalog.current_database()")
 if(target.database!=="agent_studio_telemetry"||target.database_id!==expected.database_oid||
  target.owner_id!==expected.database_owner_oid||!Number.isInteger(target.version)||Number(target.version)<180000||Number(target.version)>=190000||
  target.encoding!=="UTF8"||target.owner_super!==true||target.login_name!==expected.operator.name||target.login_oid!==expected.operator.oid||
  target.actor_name!==expected.operator.name||target.primary!==true||
  target.authentic_audit!==true||target.consistent_readonly!==true||target.controlled_path!==true||target.isolated!==true)return fail()
 const roles=await read(db,"/* telemetry_v1_management_catalog:roles */ SELECT r.oid::integer AS id,r.rolname::text AS name,r.rolcanlogin AS login,r.rolinherit AS inherit,r.rolsuper AS super,r.rolbypassrls AS bypass,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,r.rolconnlimit AS connection_limit,r.rolconfig AS config,r.rolvaliduntil IS NULL AS no_expiry,"+
  "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS memberships FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'studio_telemetry_') ORDER BY r.rolname")
 const roleIds=ids(roles)
 if(roles.length!==18||new Set(roles.map(r=>r.name)).size!==18)return fail()
 for(const actual of roles){
  const wanted=expected.roles.find(r=>r.name===actual.name)
  if(!wanted||actual.id!==wanted.oid)return fail()
  for(const key of ["login","inherit","super","bypass","create_db","create_role","replication","connection_limit","config","no_expiry","memberships"] as const)
   if(actual[key]!==wanted[key])return fail()
 }
 const namespaces=await read(db,"/* telemetry_v1_management_catalog:namespace */ SELECT n.oid::integer AS id,n.nspname AS name,n.nspowner::integer AS owner_id,obj_description(n.oid,'pg_namespace') AS comment FROM pg_catalog.pg_namespace n WHERE starts_with(n.nspname,'studio_telemetry')")
 if(namespaces.length!==1||namespaces[0]!.id!==expected.schema_oid||namespaces[0]!.name!==schema||
  namespaces[0]!.owner_id!==target.owner_id||namespaces[0]!.comment!=="agent_studio_telemetry/telemetry_v1/schema_full_dormant")return fail()
 const owner=roles.find(r=>r.name===ownerName)!,reader=roles.find(r=>r.name===readerName)!
 const relationRows=await read(db,"/* telemetry_v1_management_catalog:tables */ SELECT c.oid::integer AS id,c.relname AS name,c.relowner::integer AS owner_id,c.relam::integer AS access_method_id,am.amname::text AS access_method,am.amtype::text AS access_method_type,"+
  "h.oid::integer AS handler_id,'pg_catalog.heap_tableam_handler(pg_catalog.internal)'::pg_catalog.regprocedure::oid::integer AS heap_handler_id,hn.nspname::text AS handler_schema,h.proname::text AS handler_name,l.lanname::text AS handler_language,h.prosrc AS handler_source,"+
  "pg_catalog.pg_get_function_identity_arguments(h.oid) AS handler_args,pg_catalog.pg_get_function_result(h.oid) AS handler_result,h.prokind::text AS handler_kind,c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND c.relrowsecurity AND c.relforcerowsecurity AND NOT c.relhasrules AND c.reloptions IS NULL AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AS ok FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_am am ON am.oid=c.relam LEFT JOIN pg_catalog.pg_proc h ON h.oid=am.amhandler LEFT JOIN pg_catalog.pg_namespace hn ON hn.oid=h.pronamespace LEFT JOIN pg_catalog.pg_language l ON l.oid=h.prolang WHERE n.nspname=$1 AND c.relkind NOT IN('i')",[schema])
 const tableIds=ids(relationRows)
 if(relationRows.length!==2||!same(relationRows.map(x=>x.name).sort(),["kind_config","slot_state"])||relationRows.some(x=>x.owner_id!==owner.id||x.ok!==true||
  !oid(x.access_method_id)||x.access_method!=="heap"||x.access_method_type!=="t"||!oid(x.handler_id)||!oid(x.heap_handler_id)||x.handler_id!==x.heap_handler_id||
  x.handler_schema!=="pg_catalog"||x.handler_name!=="heap_tableam_handler"||x.handler_language!=="internal"||x.handler_source!=="heap_tableam_handler"||x.handler_args!=="internal"||x.handler_result!=="table_am_handler"||x.handler_kind!=="f"))return fail()
 const attrs=await read(db,"/* telemetry_v1_management_catalog:columns */ SELECT c.relname AS relation,a.attname AS name,a.attnum::integer AS ordinal,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default,"+
  "NOT a.attisdropped AND a.attidentity='' AND a.attgenerated='' AND a.attinhcount=0 AND a.attislocal AND a.attoptions IS NULL AND a.attfdwoptions IS NULL AND a.attacl IS NULL AND "+
  "a.attcollation=CASE WHEN a.atttypid='pg_catalog.text'::regtype THEN 'pg_catalog.\"C\"'::regcollation ELSE 0::oid END AS plain FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ANY($1::oid[]) AND a.attnum>0 ORDER BY c.relname,a.attnum",[tableIds])
 if(attrs.length!==15)return fail()
 for(const [table,expected] of Object.entries(columns)){const actual=attrs.filter(x=>x.relation===table);if(actual.length!==expected.length)return fail();for(let i=0;i<expected.length;i++){const a=actual[i]!,e=expected[i]!;if(a.ordinal!==i+1||a.name!==e[0]||a.type!==e[1]||a.required!==e[2]||a.default!==e[3]||a.plain!==true)return fail()}}
 const nulls=await read(db,"/* telemetry_v1_management_catalog:not_nulls */ SELECT c.relname AS relation,ARRAY(SELECT a.attname::text FROM unnest(x.conkey) k(n) JOIN pg_catalog.pg_attribute a ON a.attrelid=x.conrelid AND a.attnum=k.n) AS columns,x.convalidated AND x.conenforced AND NOT x.conperiod AND NOT x.condeferrable AND NOT x.condeferred AND x.conislocal AND x.coninhcount=0 AND x.conparentid=0 AND x.contypid=0 AND x.conbin IS NULL AS ok FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_class c ON c.oid=x.conrelid WHERE x.conrelid=ANY($1::oid[]) AND x.contype='n'",[tableIds])
 const expectedNulls=Object.entries(columns).flatMap(([relation,attrs])=>attrs.filter(a=>a[2]).map(a=>`${relation}:${a[0]}`)).sort()
 if(nulls.length!==11||nulls.some(x=>x.ok!==true||!Array.isArray(x.columns)||x.columns.length!==1)||!same(nulls.map(x=>`${x.relation}:${(x.columns as unknown[])[0]}`).sort(),expectedNulls))return fail()
 const constraints=await read(db,"/* telemetry_v1_management_catalog:constraints */ SELECT x.oid::integer AS id,x.conindid::integer AS index_id,c.relname AS relation,x.conname AS name,x.contype AS kind,ARRAY(SELECT a.attname::text FROM unnest(x.conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=x.conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,pg_get_expr(x.conbin,x.conrelid) AS expression,"+
  "x.confrelid::integer AS target_id,ARRAY(SELECT a.attname::text FROM unnest(x.confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=x.confrelid AND a.attnum=k.n ORDER BY k.o) AS target_columns,"+
  "x.convalidated AND x.conenforced AND NOT x.conperiod AND NOT x.condeferrable AND NOT x.condeferred AND x.conislocal AND x.coninhcount=0 AND x.conparentid=0 AND x.contypid=0 AND "+
  "CASE WHEN x.contype='c' THEN NOT x.connoinherit WHEN x.contype='f' THEN x.confmatchtype='s' AND x.confupdtype='a' AND x.confdeltype='a' ELSE true END AS ok FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_class c ON c.oid=x.conrelid WHERE x.conrelid=ANY($1::oid[]) AND x.contype<>'n'",[tableIds])
 if(constraints.length!==12||new Set(constraints.map(x=>x.name)).size!==12)return fail();ids(constraints)
 for(const x of constraints){const name=String(x.name),key=keys[name];if(x.ok!==true)return fail();if(Object.hasOwn(checks,name)){if(x.kind!=="c"||x.expression!==checks[name]||x.relation!==(name.startsWith("telemetry_kind_")?"kind_config":"slot_state"))return fail()}else if(key){if(x.kind!==key.kind||x.relation!==key.table||!same(x.columns,key.columns)||x.expression!==null)return fail();if(key.kind==="f"){if(x.target_id!==relationRows.find(t=>t.name==="kind_config")!.id||!same(x.target_columns,["kind"]))return fail()}else if(x.target_id!==0||!same(x.target_columns,[]))return fail()}else return fail()}
 const indexes=await read(db,"/* telemetry_v1_management_catalog:indexes */ SELECT ci.oid::integer AS id,ci.relname AS name,c.relname AS relation,ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
  "i.indisunique AND NOT i.indisexclusion AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnatts=i.indnkeyatts AND ci.reloptions IS NULL AND ci.relowner=$2::oid AND "+
  "am.amname='btree' AND NOT EXISTS(SELECT 1 FROM unnest(i.indoption::smallint[]) o WHERE o<>0) AND "+
  "NOT EXISTS(SELECT 1 FROM unnest(i.indclass::oid[]) o JOIN pg_catalog.pg_opclass op ON op.oid=o JOIN pg_catalog.pg_namespace n ON n.oid=op.opcnamespace WHERE n.nspname<>'pg_catalog' OR NOT op.opcdefault) AND "+
  "NOT EXISTS(SELECT 1 FROM unnest(i.indkey::smallint[],i.indcollation::oid[]) k(att,coll) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.att WHERE k.coll<>a.attcollation) AS ok,i.indisprimary AS primary "+
  "FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_am am ON am.oid=ci.relam WHERE i.indrelid=ANY($1::oid[])",[tableIds,owner.id])
 if(indexes.length!==5||new Set(indexes.map(x=>x.name)).size!==5||indexes.some(x=>{const k=keys[String(x.name)];return !k||!["p","u"].includes(k.kind)||x.relation!==k.table||!same(x.columns,k.columns)||x.ok!==true||x.primary!==(k.kind==="p")}))return fail()
 ids(indexes)
 if(constraints.some(x=>["p","u"].includes(String(x.kind))?x.index_id!==indexes.find(i=>i.name===x.name)?.id:x.kind==="f"?x.index_id!==indexes.find(i=>i.name==="telemetry_kind_unique")!.id:x.index_id!==0))return fail()
 const policies=await read(db,"/* telemetry_v1_management_catalog:policies */ SELECT c.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,p.polroles::integer[] AS roles,pg_get_expr(p.polqual,p.polrelid) AS qual,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE p.polrelid=ANY($1::oid[])",[tableIds])
 if(policies.length!==2||new Set(policies.map(x=>x.relation)).size!==2||policies.some(x=>!columns[String(x.relation)]||x.name!=="telemetry_owner_policy"||x.command!=="*"||x.permissive!==true||!same(x.roles,[owner.id])||x.qual!=="true"||x.check!=="true"))return fail()
 const funcs=await read(db,"/* telemetry_v1_management_catalog:routines */ SELECT p.oid::integer AS id,n.nspname AS schema,p.proname AS name,p.proowner::integer AS owner_id,oidvectortypes(p.proargtypes) AS args,format_type(p.prorettype,NULL) AS result,l.lanname AS language,p.provolatile AS volatility,p.prosecdef AS definer,p.proisstrict AS strict,p.proleakproof AS leakproof,p.proparallel AS parallel,p.prokind AS kind,p.pronargdefaults AS defaults,p.proargmodes AS modes,p.proargnames AS argnames,p.provariadic=0 AND p.prosupport=0 AND NOT p.proretset AS ordinary,p.proconfig AS config,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname=$1",[schema])
 const fnIds=ids(funcs)
 if(funcs.length!==2||new Set(funcs.map(x=>x.name)).size!==2)return fail()
 for(const f of funcs){if(!["record","snapshot"].includes(String(f.name))||f.schema!==schema||f.owner_id!==owner.id||f.args!==(f.name==="record"?"text, text, bigint, text, text":"")||f.result!=="jsonb"||f.language!=="plpgsql"||f.volatility!=="v"||f.definer!==true||f.strict!==false||f.leakproof!==false||f.parallel!=="u"||f.kind!=="f"||f.defaults!==0||f.modes!==null||f.argnames!==null||f.ordinary!==true||!same(f.config,["search_path=pg_catalog"])||f.sha!==workerHeartbeatSchemaPins[f.name as "record"|"snapshot"])return fail()}
 const acl=await read(db,"/* telemetry_v1_management_catalog:acl */ SELECT 'schema'::text AS object,$1::integer AS id,g.grantor::integer,g.grantee::integer,g.privilege_type AS privilege,g.is_grantable AS grantable FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) g WHERE n.oid=$1::oid "+
  "UNION ALL SELECT 'function',p.oid::integer,g.grantor::integer,g.grantee::integer,g.privilege_type,g.is_grantable FROM pg_catalog.pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g WHERE p.oid=ANY($2::oid[]) "+
  "UNION ALL SELECT 'table',c.oid::integer,g.grantor::integer,g.grantee::integer,g.privilege_type,g.is_grantable FROM pg_catalog.pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g WHERE c.oid=ANY($3::oid[])",[namespaces[0]!.id,fnIds,tableIds])
 const expectedAcl:Row[]=[]
 for(const privilege of ["USAGE","CREATE"])expectedAcl.push({object:"schema",id:namespaces[0]!.id,grantor:target.owner_id,grantee:target.owner_id,privilege,grantable:false})
 for(const r of roles)expectedAcl.push({object:"schema",id:namespaces[0]!.id,grantor:target.owner_id,grantee:r.id,privilege:"USAGE",grantable:false})
 for(const f of funcs){const grantees=f.name==="snapshot"?[owner.id,reader.id]:[owner.id,...roles.filter(r=>writerNames.includes(String(r.name))).map(r=>r.id)];for(const grantee of grantees)expectedAcl.push({object:"function",id:f.id,grantor:owner.id,grantee,privilege:"EXECUTE",grantable:false})}
 for(const id of tableIds)for(const privilege of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"])expectedAcl.push({object:"table",id,grantor:owner.id,grantee:owner.id,privilege,grantable:false})
 const sorted=(a:Row[])=>a.map(x=>JSON.stringify([x.object,x.id,x.grantor,x.grantee,x.privilege,x.grantable])).sort()
 if(!same(sorted(acl),sorted(expectedAcl)))return fail()
 const boundaries=await one(db,"/* telemetry_v1_management_catalog:boundaries */ WITH allowed_rel AS (SELECT c.oid,c.reltype FROM pg_catalog.pg_class c WHERE c.oid=ANY($2::oid[]) OR c.oid IN(SELECT reltoastrelid FROM pg_catalog.pg_class WHERE oid=ANY($2::oid[]))),allowed_class AS (SELECT oid FROM allowed_rel UNION SELECT indexrelid FROM pg_catalog.pg_index WHERE indrelid IN(SELECT oid FROM allowed_rel)),allowed_type AS (SELECT reltype AS oid FROM allowed_rel UNION SELECT typarray FROM pg_catalog.pg_type WHERE oid IN(SELECT reltype FROM allowed_rel)) "+
  "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_db_role_setting WHERE setrole=ANY($1::oid[]) OR setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=ANY($1::oid[]) OR defaclnamespace IN(0,$4::oid)) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.refclassid='pg_catalog.pg_authid'::regclass AND d.refobjid=ANY($1::oid[]) AND d.deptype='o' AND NOT(d.refobjid=$5::oid AND d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND ((d.classid='pg_catalog.pg_class'::regclass AND d.objid IN(SELECT oid FROM allowed_class)) OR (d.classid='pg_catalog.pg_type'::regclass AND d.objid IN(SELECT oid FROM allowed_type)) OR (d.classid='pg_catalog.pg_proc'::regclass AND d.objid=ANY($3::oid[]))))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN pg_catalog.pg_roles r WHERE r.oid=ANY($1::oid[]) AND NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND has_schema_privilege(r.oid,n.oid,'CREATE')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_catalog.pg_roles r WHERE r.oid=ANY($1::oid[]) AND NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND (r.oid<>$5::oid OR NOT(c.oid=ANY($2::oid[]))) AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'SELECT,UPDATE,USAGE') WHEN c.relkind IN('r','p','v','m','f') THEN has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') ELSE false END) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_catalog.pg_roles r WHERE r.oid=ANY($1::oid[]) AND NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND NOT(p.oid=ANY($3::oid[])) AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN pg_catalog.pg_roles r WHERE p.oid=ANY($3::oid[]) AND NOT r.rolsuper AND r.oid<>$5::oid AND has_function_privilege(r.oid,p.oid,'EXECUTE') AND NOT((p.proname='snapshot' AND r.rolname=$6) OR(p.proname='record' AND r.rolname=ANY($7::text[])))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r WHERE c.oid=ANY($2::oid[]) AND NOT r.rolsuper AND r.oid<>$5::oid AND r.rolname NOT IN('pg_read_all_data','pg_write_all_data','pg_maintain') AND (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN'))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles b WHERE b.rolname IN('pg_read_all_data','pg_write_all_data','pg_maintain') AND (b.rolcanlogin OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>b.oid AND pg_has_role(r.oid,b.oid,'MEMBER')))) AND "+
  "(SELECT count(*)=7 FROM pg_catalog.pg_class WHERE relnamespace=$4::oid) AND (SELECT count(*)=4 AND bool_and(t.typowner=$5::oid AND NOT t.typnotnull AND t.typbasetype=0 AND t.typdefault IS NULL AND t.typdefaultbin IS NULL AND t.typacl IS NULL AND t.typcollation=0 AND ((t.typtype='c' AND t.typrelid=ANY($2::oid[])) OR (t.typtype='b' AND t.typcategory='A' AND t.typrelid=0 AND t.typelem IN(SELECT reltype FROM allowed_rel)))) FROM pg_catalog.pg_type t WHERE t.typnamespace=$4::oid) AND "+
  "(SELECT count(*)=4 AND count(DISTINCT p.proname)=4 AND bool_and(t.tgisinternal AND t.tgrelid=ANY($2::oid[]) AND t.tgenabled='O' AND t.tgparentid=0 AND t.tgconstraint IN(SELECT oid FROM pg_catalog.pg_constraint WHERE conrelid=ANY($2::oid[]) AND contype='f') AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND t.tgargs=''::bytea AND p.pronamespace='pg_catalog'::regnamespace AND p.proname=ANY(ARRAY['RI_FKey_check_ins','RI_FKey_check_upd','RI_FKey_noaction_del','RI_FKey_noaction_upd'])) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid) AS ok",[roleIds,tableIds,fnIds,namespaces[0]!.id,owner.id,readerName,writerNames])
 if(boundaries.ok!==true)return fail()
 const database=await read(db,"/* telemetry_v1_management_catalog:database_acl */ SELECT g.grantor::integer,g.grantee::integer,g.privilege_type AS privilege,g.is_grantable AS grantable FROM pg_catalog.pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) g WHERE d.datname=current_database()")
 const expectedDB:Row[]=["CREATE","CONNECT","TEMPORARY"].map(privilege=>({object:"database",id:0,grantor:target.owner_id,grantee:target.owner_id,privilege,grantable:false}))
 for(const r of roles.filter(r=>r.name!==ownerName))expectedDB.push({object:"database",id:0,grantor:target.owner_id,grantee:r.id,privilege:"CONNECT",grantable:false})
 if(!same(sorted(database.map(x=>({...x,object:"database",id:0}))),sorted(expectedDB)))return fail()
 const sensitive=await read(db,"/* telemetry_v1_management_catalog:sensitive */ SELECT r.oid::integer AS role_id,n.nspname||'.'||c.relname AS name,c.relkind AS kind,has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS effective,"+
  "EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g WHERE g.grantee IN(r.oid,0::oid)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND g.grantee IN(r.oid,0::oid)) AS raw_grant FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname='pg_catalog' AND c.relname IN('pg_authid','pg_shadow') AND r.oid=ANY($1::oid[])",[roleIds])
 if(sensitive.length!==36||new Set(sensitive.map(x=>`${x.role_id}:${x.name}`)).size!==36||sensitive.some(x=>!oid(x.role_id)||!roleIds.includes(x.role_id)||x.effective!==false||x.raw_grant!==false||x.kind!==(x.name==="pg_catalog.pg_authid"?"r":x.name==="pg_catalog.pg_shadow"?"v":"!")))return fail()
 return result
}

