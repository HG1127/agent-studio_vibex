// Experimental telemetry registry. No I/O on import; no transaction, lock,
// connection or authority factory. Controller owns the original client, locks,
// approval, commit, journal, credential publication and lease barrier.
import {createHash, randomBytes, randomUUID, pbkdf2Sync, createHmac} from 'node:crypto'
import type {SqlClient} from './contracts.ts'
import type {ControlDbAccess} from './worker-heartbeat-activation-control-contract.ts'
import {assertWorkerHeartbeatControlDbAccess} from './worker-heartbeat-activation-control.ts'
import {workerHeartbeatKinds} from './worker-heartbeat-contract.ts'
import {parseWorkerHeartbeatReaderCatalogExpectations, type WorkerHeartbeatReaderCatalogExpectations}
 from './worker-heartbeat-activated-audit-core.ts'

declare const observationBrand:unique symbol, planBrand:unique symbol
export type RegistryObservation=Readonly<{[observationBrand]:true}>
export type RegistryPlan=Readonly<{[planBrand]:true}>
type Row=Record<string,unknown>
type Kind=typeof workerHeartbeatKinds[number]
type SlotMode='unused'|'active'|'retired'
type Binding={installation_id:string;system_id:string;database_oid:number;owner_oid:number;schema_oid:number;
 server_addr:string;server_port:number;postmaster_started_us:string;operator_name:string;role_oids:number[]}
type KindPolicy={kind:Kind;instrumented:boolean;enabled:boolean}
type SlotPolicy={kind:Kind;slot_no:1|2;mode:SlotMode;generation:string|null;verifier_sha256:string|null}
type Policy={protocol:'worker_heartbeat_activation_policy_v1';binding:Binding;
 reader:{login:boolean;verifier_sha256:string|null};kinds:KindPolicy[];slots:SlotPolicy[]}
type Dynamic={sequence:string;state:string|null;reason:string|null;at:string|null;draining:boolean}
type Observed={policy:Policy;dynamic:Dynamic[];at:string;catalog:WorkerHeartbeatReaderCatalogExpectations|null;
 policySha:string;materialSha:string;stateSha:string}
type PlanData={before:Observed;after:Policy;secrets:Map<number,{password:string;verifier:string}>;
 reset:Set<number>;changed:Set<number>;sha:string;beforeSha:string;afterSha:string;
 state:'prepared'|'applying'|'applied'|'failed';operationInFlight:boolean;applied?:Observed}
const observations=new WeakMap<object,Observed>(), plans=new WeakMap<object,PlanData>()
const kinds=[...workerHeartbeatKinds]
const names=['studio_telemetry_owner','studio_telemetry_reader',
 ...kinds.flatMap(kind=>[1,2].map(slot=>'studio_telemetry_tx_'+kind+'_'+slot))]
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const shaPattern=/^[a-f0-9]{64}$/, dec=/^(0|[1-9][0-9]*)$/
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const shaText=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex')
function fail():never{
 const error=Object.assign(new Error('worker_heartbeat_registry_refused'),
  {code:'registry_mismatch',status:503,automatic_retry_authorized:false})
 throw error
}
function obj(value:unknown,keys:readonly string[]):Row{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
 const ds=Object.getOwnPropertyDescriptors(value)
 if(Reflect.ownKeys(value).length!==keys.length)return fail()
 const answer:Row={}
 for(const key of keys){const d=ds[key];if(!d?.enumerable||!('value' in d))return fail();answer[key]=d.value}
 return answer
}
function list(value:unknown,length:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==length||
    Reflect.ownKeys(value).length!==length+1)return fail()
 return Array.from({length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value' in d))return fail();return d.value
 })
}
function bool(value:unknown):boolean{if(typeof value!=='boolean')return fail();return value}
function integer(value:unknown,min:number,max:number):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)return fail();return value
}
function oid(value:unknown):number{return integer(value,1,4294967295)}
function oidText(value:unknown):number{
 if(typeof value!=='string'||!dec.test(value)||value.length>10)return fail();return oid(Number(value))
}
function unsigned(value:unknown,max:bigint):string{
 if(typeof value!=='string'||!dec.test(value)||value.length>20||BigInt(value)>max)return fail();return value
}
function time(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||value.startsWith('0000-'))return fail()
 const ms=Date.parse(value);if(!Number.isSafeInteger(ms)||new Date(ms).toISOString()!==value)return fail();return value
}
function digest(value:unknown):string{
 if(typeof value!=='string'||!shaPattern.test(value))return fail();return value
}
function generation(value:unknown):string{
 if(typeof value!=='string'||!uuid.test(value))return fail();return value
}
function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b)}
function frozen<T>(value:T):T{
 if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value)}
 return value
}
function binding(raw:unknown):Binding{
 const b=obj(raw,['installation_id','system_id','database_oid','owner_oid','schema_oid',
  'server_addr','server_port','postmaster_started_us','operator_name','role_oids'])
 const installation_id=generation(b.installation_id)
 const system_id=unsigned(b.system_id,18446744073709551615n)
 if(system_id==='0'||b.server_addr!=='127.0.0.1'||typeof b.operator_name!=='string'||
  !/^[a-z_][a-z0-9_]{0,62}$/.test(b.operator_name)||b.operator_name.startsWith('studio_telemetry_'))return fail()
 const role_oids=list(b.role_oids,18).map(oid),owner_oid=oid(b.owner_oid)
 if(new Set([owner_oid,...role_oids]).size!==19)return fail()
 const started=unsigned(b.postmaster_started_us,99999999999999999999n);if(started==='0')return fail()
 return {installation_id,system_id,database_oid:oid(b.database_oid),owner_oid,schema_oid:oid(b.schema_oid),
  server_addr:b.server_addr,server_port:integer(b.server_port,1,65535),postmaster_started_us:started,
  operator_name:b.operator_name,role_oids}
}
/** Closed private-store DATA, never authority.
 * policy:{protocol,binding,reader:{login,verifier_sha256},kinds:[8],slots:[16]}.
 * binding pins installation/system/DB/owner/schema/address/port/postmaster/roles.
 * Slots are canonical kind-order then 1,2; mode unused|active|retired, generation,
 * verifier_sha256. Dormant/retired roles have NULL password; active require SCRAM.
 * Passing an original observation as expectedPolicy also enforces dynamic progress.
 */
function policy(raw:unknown):Policy{
 const p=obj(raw,['protocol','binding','reader','kinds','slots'])
 if(p.protocol!=='worker_heartbeat_activation_policy_v1')return fail()
 const r=obj(p.reader,['login','verifier_sha256']),login=bool(r.login)
 const reader={login,verifier_sha256:login?digest(r.verifier_sha256):null}
 if(!login&&r.verifier_sha256!==null)return fail()
 const kp=list(p.kinds,8).map((raw,i)=>{
  const k=obj(raw,['kind','instrumented','enabled'])
  if(k.kind!==kinds[i])return fail()
  const instrumented=bool(k.instrumented),enabled=bool(k.enabled)
  if(enabled&&!instrumented)return fail()
  return {kind:kinds[i]!,instrumented,enabled}
 })
 const sp=list(p.slots,16).map((raw,i):SlotPolicy=>{
  const s=obj(raw,['kind','slot_no','mode','generation','verifier_sha256'])
  const kind=kinds[Math.floor(i/2)]!,slot_no=(i%2+1) as 1|2
  if(s.kind!==kind||s.slot_no!==slot_no||!['unused','active','retired'].includes(s.mode as string))return fail()
  const mode=s.mode as SlotMode
  const gen=mode==='unused'?null:generation(s.generation)
  if(mode==='unused'&&s.generation!==null)return fail()
  const verifier_sha256=mode==='active'?digest(s.verifier_sha256):null
  if(mode!=='active'&&s.verifier_sha256!==null)return fail()
  if(mode==='active'&&!kp[Math.floor(i/2)]!.enabled)return fail()
  return {kind,slot_no,mode,generation:gen,verifier_sha256}
 })
 const generations=sp.flatMap(s=>s.generation?[s.generation]:[])
 if(new Set(generations).size!==generations.length)return fail()
 if(kp.some((k,i)=>k.enabled&&!sp.slice(i*2,i*2+2).some(s=>s.mode==='active')))return fail()
 return frozen({protocol:p.protocol,binding:binding(p.binding),reader,kinds:kp,slots:sp})
}
function digests(p:Policy){
 const b=p.binding
 const staticValue=[p.protocol,[b.installation_id,b.system_id,b.database_oid,b.owner_oid,b.schema_oid,
  b.server_addr,b.server_port,b.postmaster_started_us,b.operator_name,b.role_oids],
  [18,'UTF8'],names.map((name,i)=>[b.role_oids[i],name,
   i===0?false:i===1?p.reader.login:p.slots[i-2]!.mode==='active',
   false,false,false,false,false,false,i===0?-1:i===1?2:1,null,true,0]),
  p.kinds.map(k=>[k.kind,k.instrumented,k.enabled]),
  p.slots.map(s=>[s.kind,s.slot_no,s.mode,s.generation])]
 const materialValue=[p.reader.verifier_sha256,p.slots.map(s=>[s.generation,s.verifier_sha256])]
 const policySha=hash(staticValue),materialSha=hash(materialValue)
 return {policySha,materialSha,stateSha:hash([policySha,materialSha])}
}
// SQL is fixed, zero caller identifiers. Management-only pg_authid password
// digests never leave the private plan/observation. No raw reader table grants.
const targetSQL=`/* telemetry_activation_registry:target */
SELECT current_database() AS database,d.oid::text AS database_oid,d.datdba::text AS owner_oid,
 (SELECT oid::text FROM pg_catalog.pg_namespace WHERE nspname='studio_telemetry') AS schema_oid,
 session_user::text AS session_login,current_user::text AS actor,
 (current_user=session_user AND s.oid=d.datdba AND s.rolsuper) AS authentic_operator,
 NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles x WHERE NOT x.rolsuper AND pg_catalog.pg_has_role(x.oid,s.oid,'MEMBER')) AS owner_no_non_super_members,
 current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,
 inet_server_addr()::text AS server_addr,inet_server_port() AS server_port,
 (extract(epoch FROM pg_catalog.pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS postmaster_started_us,
 (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_id,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
 current_setting('search_path') AS search_path,(pg_catalog.pg_my_temp_schema()=0) AS no_temp,
 pg_catalog.pg_is_in_recovery() AS recovery,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(r.oid::text,r.rolname::text,r.rolcanlogin,r.rolinherit,r.rolsuper,
 r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolconnlimit,r.rolconfig,
 (r.rolvaliduntil IS NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_db_role_setting x WHERE x.setrole=r.oid)),
 (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid),
 CASE WHEN a.rolpassword IS NULL THEN NULL ELSE encode(sha256(convert_to(a.rolpassword,'UTF8')),'hex') END,
 (a.rolpassword IS NULL OR a.rolpassword ~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]{22}==[$][A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$'))
 ORDER BY r.rolname::text COLLATE "C"),'[]'::jsonb)
 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_authid a ON a.oid=r.oid
 WHERE pg_catalog.starts_with(r.rolname,'studio_telemetry_')) AS roles
FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles s ON s.rolname=session_user
WHERE d.datname=current_database() AND d.datallowconn AND NOT d.datistemplate AND d.datconnlimit=-1
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_db_role_setting x WHERE x.setdatabase=d.oid OR x.setrole=s.oid)`
const registrySQL=`/* telemetry_activation_registry:registry */
WITH clock AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) AS at)
SELECT 'telemetry_registry_observation_v1'::text AS protocol,
 current_user::text AS actor,session_user::text AS session_login,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
 current_setting('search_path') AS search_path,(pg_catalog.pg_my_temp_schema()=0) AS no_temp,
 (isfinite(clock.at) AND extract(year FROM clock.at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999) AS clock_valid,
 CASE WHEN isfinite(clock.at) AND extract(year FROM clock.at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999
 THEN to_char(clock.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS as_of,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(k.ordinal::integer,k.kind,k.instrumented,k.enabled)
 ORDER BY k.ordinal),'[]'::jsonb) FROM studio_telemetry.kind_config k) AS kinds,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(s.kind,s.slot_no::integer,s.login_oid::text,s.login_name,s.enabled,
 s.generation::text,s.last_sequence::text,s.state,s.reason,
 CASE WHEN s.observed_at IS NOT NULL AND isfinite(s.observed_at)
 AND extract(year FROM s.observed_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999
 THEN to_char(s.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,s.draining,
 (s.observed_at IS NULL OR (isfinite(s.observed_at)
 AND extract(year FROM s.observed_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999
 AND s.observed_at<=clock.at AND date_trunc('milliseconds',s.observed_at)=s.observed_at)))
 ORDER BY s.kind COLLATE "C",s.slot_no),'[]'::jsonb) FROM studio_telemetry.slot_state s) AS slots
FROM clock`
const targetKeys=['database','database_oid','owner_oid','schema_oid','session_login','actor','authentic_operator',
 'owner_no_non_super_members','version','encoding','server_addr','server_port','postmaster_started_us',
 'system_id','read_only','isolation','search_path','no_temp','recovery','roles']
const registryKeys=['protocol','actor','session_login','read_only','isolation','search_path','no_temp','clock_valid','as_of','kinds','slots']
async function query(db:SqlClient,access:ControlDbAccess,mode:'read'|'write',sql:string,values:unknown[]=[]):Promise<unknown[]>{
 assertWorkerHeartbeatControlDbAccess(db,access,mode)
 const result=await db.query(sql,values)
 assertWorkerHeartbeatControlDbAccess(db,access,mode)
 // pg.Result is a driver instance; only inspect its own data rows descriptor.
 if(!result||typeof result!=='object')return fail()
 const d=Object.getOwnPropertyDescriptor(result,'rows')
 if(!d||!('value' in d)||!Array.isArray(d.value)||Object.getPrototypeOf(d.value)!==Array.prototype||d.value.length>1)return fail()
 return list(d.value,d.value.length)
}
async function one(db:SqlClient,access:ControlDbAccess,mode:'read'|'write',sql:string,values:unknown[]=[]):Promise<unknown>{
 const rows=await query(db,access,mode,sql,values);if(rows.length!==1)return fail();return rows[0]
}
function context(r:Row,p:Policy,mode:'read'|'write'){
 if(r.actor!==p.binding.operator_name||r.session_login!==p.binding.operator_name||r.no_temp!==true||
 r.search_path!=='pg_catalog'||r.read_only!==(mode==='read'?'on':'off')||
 r.isolation!==(mode==='read'?'repeatable read':'read committed'))return fail()
}
function validateTarget(raw:unknown,p:Policy,mode:'read'|'write'):WorkerHeartbeatReaderCatalogExpectations|null{
 const t=obj(raw,targetKeys),b=p.binding
 context(t,p,mode)
 if(t.database!=='agent_studio_telemetry'||oidText(t.database_oid)!==b.database_oid||
 oidText(t.owner_oid)!==b.owner_oid||oidText(t.schema_oid)!==b.schema_oid||t.authentic_operator!==true||
 t.owner_no_non_super_members!==true||t.recovery!==false||integer(t.version,180000,189999)<180000||
 t.encoding!=='UTF8'||t.server_addr!==b.server_addr||t.server_port!==b.server_port||
 t.postmaster_started_us!==b.postmaster_started_us||t.system_id!==b.system_id)return fail()
 const sorted=list(t.roles,18),roles=new Map<string,unknown[]>()
 for(const raw of sorted){const r=list(raw,15);if(typeof r[1]!=='string'||roles.has(r[1]))return fail();roles.set(r[1],r)}
 const expectedRoles=names.map((name,i)=>{
  const r=roles.get(name);if(!r)return fail()
  const login=i===0?false:i===1?p.reader.login:p.slots[i-2]!.mode==='active'
  const verifier=i===0?null:i===1?p.reader.verifier_sha256:p.slots[i-2]!.verifier_sha256
  if(oidText(r[0])!==b.role_oids[i]||r[2]!==login||r.slice(3,9).some(v=>v!==false)||
   r[9]!== (i===0?-1:i===1?2:1)||r[10]!==null||r[11]!==true||r[12]!==0||
   r[13]!==verifier||r[14]!==true)return fail()
  return {oid:b.role_oids[i]!,name,login,inherit:false,super:false,bypass:false,create_db:false,
   create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}
 })
 // Preserve the old reader parser's LOGIN=true requirement verbatim.
 return p.reader.login?parseWorkerHeartbeatReaderCatalogExpectations({
  protocol:'worker_heartbeat_reader_catalog_expectations_v1',database_oid:b.database_oid,
  database_owner_oid:b.owner_oid,schema_oid:b.schema_oid,roles:expectedRoles}):null
}
function validateRegistry(raw:unknown,p:Policy,mode:'read'|'write'):{dynamic:Dynamic[];at:string}{
 const r=obj(raw,registryKeys);context(r,p,mode)
 if(r.protocol!=='telemetry_registry_observation_v1'||r.clock_valid!==true)return fail()
 const at=time(r.as_of)
 list(r.kinds,8).forEach((raw,i)=>{
  const k=list(raw,4),expected=p.kinds[i]!
  if(!same(k,[i+1,expected.kind,expected.instrumented,expected.enabled]))return fail()
 })
 const rawSlots=list(r.slots,16),byKey=new Map<string,unknown[]>()
 for(const raw of rawSlots){
  const s=list(raw,12);if(typeof s[0]!=='string'||(s[1]!==1&&s[1]!==2))return fail()
  const key=s[0]+':'+s[1];if(byKey.has(key))return fail();byKey.set(key,s)
 }
 const dynamic=p.slots.map((expected,i):Dynamic=>{
  const s=byKey.get(expected.kind+':'+expected.slot_no);if(!s)return fail()
  if(oidText(s[2])!==p.binding.role_oids[i+2]||s[3]!==names[i+2]||
   s[4]!== (expected.mode==='active')||s[5]!==expected.generation||s[11]!==true)return fail()
  const sequence=unsigned(s[6],9007199254740991n),draining=bool(s[10])
  if(sequence==='0'){
   if(s[7]!==null||s[8]!==null||s[9]!==null||draining)return fail()
   return {sequence,state:null,reason:null,at:null,draining:false}
  }
  if(expected.mode==='unused'||expected.generation===null)return fail()
  const observedAt=time(s[9]);if(observedAt>at)return fail()
  const state=s[7],reason=s[8]
  if(!((state==='unknown'&&(reason==='startup_checks_pending'||reason==='loop_unavailable'))||
   (state==='ready'&&reason==='startup_checks_complete')||(state==='draining'&&reason==='new_claims_closed'))||
   draining!==(state==='draining'))return fail()
  return {sequence,state:state as string,reason:reason as string,at:observedAt,draining}
 })
 return {dynamic,at}
}
function progression(before:Observed,after:Observed,reset:Set<number>=new Set()){
 if(after.at<before.at)return fail()
 before.dynamic.forEach((a,i)=>{
  const b=after.dynamic[i]!
  if(reset.has(i)){if(b.sequence!=='0'||b.state!==null||b.at!==null||b.reason!==null||b.draining)return fail();return}
  const oldSlot=before.policy.slots[i]!,newSlot=after.policy.slots[i]!
  if(oldSlot.generation!==newSlot.generation)return fail()
  // Before->locked observation can advance while active. Once locks are held,
  // retiring preserves that exact observation; inactive history never advances.
  if(oldSlot.mode!=='active'||newSlot.mode!=='active'){
   if(!same(a,b))return fail();return
  }
  const x=BigInt(a.sequence),y=BigInt(b.sequence)
  if(y<x||(y===x&&!same(a,b))||(y>x&&a.at!==null&&(b.at===null||b.at<a.at))||
   (a.draining&&!b.draining))return fail()
 })
}
async function observe(db:SqlClient,access:ControlDbAccess,mode:'read'|'write',p:Policy,previous?:Observed):Promise<Observed>{
 const catalog=validateTarget(await one(db,access,mode,targetSQL),p,mode)
 const data=validateRegistry(await one(db,access,mode,registrySQL),p,mode)
 const answer={policy:p,...data,catalog,...digests(p)}
 if(previous){if(previous.stateSha!==answer.stateSha)return fail();progression(previous,answer)}
 return frozen(answer)
}
function observation(value:RegistryObservation):Observed{
 if(!value||typeof value!=='object')return fail();const found=observations.get(value);if(!found)return fail();return found
}
function plan(value:RegistryPlan):PlanData{
 if(!value||typeof value!=='object')return fail();const found=plans.get(value);if(!found)return fail();return found
}
function makeObservation(value:Observed):RegistryObservation{
 const handle=Object.freeze(Object.create(null)) as RegistryObservation;observations.set(handle,value);return handle
}
export async function inspectWorkerHeartbeatActivationRegistry(db:SqlClient,access:ControlDbAccess,expectedPolicy:unknown):Promise<RegistryObservation>{
 try{
  assertWorkerHeartbeatControlDbAccess(db,access,'read')
  const previous=expectedPolicy&&typeof expectedPolicy==='object'?observations.get(expectedPolicy):undefined
  const p=previous?.policy??policy(expectedPolicy)
  return makeObservation(await observe(db,access,'read',p,previous))
 }catch{return fail()}
}
export function describeWorkerHeartbeatRegistry(value:RegistryObservation):Readonly<{
 policy_sha256:string;private_material_sha256:string;checked_at_utc:string;catalog_expectations:WorkerHeartbeatReaderCatalogExpectations|null}>{
 const o=observation(value)
 return Object.freeze({policy_sha256:o.policySha,private_material_sha256:o.materialSha,
  checked_at_utc:o.at,catalog_expectations:o.catalog})
}
function newSecret():{password:string;verifier:string}{
 // ASCII password needs no SASLprep transformation. Material is never caller supplied.
 const password=randomBytes(32).toString('hex'),salt=randomBytes(16)
 const salted=pbkdf2Sync(password,salt,4096,32,'sha256')
 const client=createHmac('sha256',salted).update('Client Key').digest()
 const stored=createHash('sha256').update(client).digest('base64')
 const server=createHmac('sha256',salted).update('Server Key').digest('base64')
 const verifier='SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+stored+':'+server
 salted.fill(0);client.fill(0);salt.fill(0)
 if(!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/.test(verifier))return fail()
 return {password,verifier}
}
/** draft is closed DATA:
 * {protocol:'worker_heartbeat_activation_draft_v1',
 * reader:'keep'|'activate'|'rotate'|'disable',
 * kinds:[{kind,instrumented,enabled} x8],
 * slots:[{kind,slot_no,action:'keep'|'activate'|'rotate'|'retire'} x16]}.
 * No OID/role/generation/password/SQL/approval field is accepted.
 * Historical generation non-reuse and publishing secrets require controller ledger.
 */
export function prepareWorkerHeartbeatRegistryPlan(value:RegistryObservation,draft:unknown):RegistryPlan{
 try{
  const before=observation(value),d=obj(draft,['protocol','reader','kinds','slots'])
  if(d.protocol!=='worker_heartbeat_activation_draft_v1'||
   !['keep','activate','rotate','disable'].includes(d.reader as string))return fail()
  const after=structuredClone(before.policy)
  const secrets=new Map<number,{password:string;verifier:string}>(),reset=new Set<number>(),changed=new Set<number>()
  const kp=list(d.kinds,8).map((raw,i)=>{
   const k=obj(raw,['kind','instrumented','enabled']);if(k.kind!==kinds[i])return fail()
   return {kind:kinds[i]!,instrumented:bool(k.instrumented),enabled:bool(k.enabled)}
  })
  after.kinds=kp
  if(d.reader==='activate'&&before.policy.reader.login)return fail()
  if(d.reader==='rotate'&&!before.policy.reader.login)return fail()
  if(d.reader==='activate'||d.reader==='rotate'){
   const s=newSecret();secrets.set(1,s);after.reader={login:true,verifier_sha256:shaText(s.verifier)}
  }else if(d.reader==='disable')after.reader={login:false,verifier_sha256:null}
  list(d.slots,16).forEach((raw,i)=>{
   const s=obj(raw,['kind','slot_no','action']),old=before.policy.slots[i]!
   if(s.kind!==old.kind||s.slot_no!==old.slot_no||!['keep','activate','rotate','retire'].includes(s.action as string))return fail()
   if(s.action==='activate'||s.action==='rotate'){
    if((s.action==='activate'&&old.mode==='active')||(s.action==='rotate'&&old.mode!=='active'))return fail()
    const gen=randomUUID();if(after.slots.some(x=>x.generation===gen))return fail()
    const secret=newSecret();secrets.set(i+2,secret)
    after.slots[i]={...old,mode:'active',generation:gen,verifier_sha256:shaText(secret.verifier)}
    changed.add(i);reset.add(i)
   }else if(s.action==='retire'){
    if(old.mode!=='active')return fail()
    after.slots[i]={...old,mode:'retired',verifier_sha256:null};changed.add(i)
   }
  })
  const checked=policy(after),afterSha=digests(checked).stateSha
  if(before.stateSha===afterSha)return fail()
  const data:PlanData={before,after:checked,secrets,reset,changed,
   sha:hash(['worker_heartbeat_registry_plan_v1',before.stateSha,afterSha]),
   beforeSha:before.stateSha,afterSha,state:'prepared',operationInFlight:false}
  const handle=Object.freeze(Object.create(null)) as RegistryPlan;plans.set(handle,data);return handle
 }catch{return fail()}
}
export function describeWorkerHeartbeatRegistryPlan(value:RegistryPlan):Readonly<{plan_sha256:string;before_sha256:string;after_sha256:string}>{
 const p=plan(value);return Object.freeze({plan_sha256:p.sha,before_sha256:p.beforeSha,after_sha256:p.afterSha})
}
/** SECRET DATA for controller root-private durable staging only; not a permit.
 * Caller must already have original write DbAccess (approved/locked transaction).
 * No filesystem/SQL/callbacks. Does not open a gate or attest durable publication.
 * Controller must durably stage/read back before apply, never send over reader
 * UDS or HTTP, and bind its approval/permit to describePlan's original plan SHA.
 */
export function readWorkerHeartbeatRegistryPlanMaterial(db:SqlClient,access:ControlDbAccess,value:RegistryPlan):Readonly<{
 plan_sha256:string;before_sha256:string;after_sha256:string;before_policy:unknown;after_policy:unknown;
 credentials:readonly Readonly<{role_oid:number;role_name:string;password:string;generation:string|null}>[]
}>{
 try{
  assertWorkerHeartbeatControlDbAccess(db,access,'write')
  const p=plan(value);if(p.state!=='prepared'||p.operationInFlight)return fail()
  const credentials=[...p.secrets].map(([i,s])=>({role_oid:p.after.binding.role_oids[i]!,
   role_name:names[i]!,password:s.password,generation:i===1?null:p.after.slots[i-2]!.generation}))
  const answer=frozen({plan_sha256:p.sha,before_sha256:p.beforeSha,after_sha256:p.afterSha,
   before_policy:structuredClone(p.before.policy),after_policy:structuredClone(p.after),credentials})
  assertWorkerHeartbeatControlDbAccess(db,access,'write')
  return answer
 }catch{return fail()}
}
const updateKindSQL=`/* telemetry_activation_registry:update_kind */
UPDATE studio_telemetry.kind_config SET instrumented=$3,enabled=$4
WHERE ordinal=$1 AND kind=$2 RETURNING ordinal::integer AS ordinal,kind,instrumented,enabled`
const resetSlotSQL=`/* telemetry_activation_registry:reset_slot */
UPDATE studio_telemetry.slot_state SET enabled=true,generation=$5::uuid,last_sequence=0,state=NULL,reason=NULL,observed_at=NULL,draining=false
WHERE kind=$1 AND slot_no=$2 AND login_oid=$3::oid AND login_name=$4
RETURNING kind,slot_no::integer AS slot_no,login_oid::text AS login_oid,login_name,enabled,generation::text AS generation,
last_sequence::text AS sequence,state,reason,observed_at,draining`
const retireSlotSQL=`/* telemetry_activation_registry:retire_slot */
UPDATE studio_telemetry.slot_state SET enabled=false
WHERE kind=$1 AND slot_no=$2 AND login_oid=$3::oid AND login_name=$4 AND generation=$5::uuid
RETURNING kind,slot_no::integer AS slot_no,enabled,generation::text AS generation`
const roleDisable=names.map(name=>'ALTER ROLE "'+name+'" NOLOGIN PASSWORD NULL')
const roleEnablePrefix=names.map(name=>'ALTER ROLE "'+name+'" LOGIN PASSWORD ')
const verifierPattern=/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/
async function emptyWrite(db:SqlClient,access:ControlDbAccess,sql:string){
 if((await query(db,access,'write',sql)).length!==0)return fail()
}
export async function applyLockedWorkerHeartbeatRegistryPlan(db:SqlClient,access:ControlDbAccess,value:RegistryPlan):Promise<void>{
 let p:PlanData|undefined,claimed=false
 try{
  assertWorkerHeartbeatControlDbAccess(db,access,'write')
  p=plan(value);if(p.state!=='prepared'||p.operationInFlight)return fail()
  // Consume before first await. Any SQL/ACK uncertainty permanently forbids retry.
  p.state='applying';p.operationInFlight=true;claimed=true
  const current=await observe(db,access,'write',p.before.policy,p.before)
  for(let i=1;i<18;i++){
   const old=i===1?p.before.policy.reader:p.before.policy.slots[i-2]!
   const next=i===1?p.after.reader:p.after.slots[i-2]!
   if(!same(old,next))await emptyWrite(db,access,roleDisable[i]!)
  }
  for(let i=0;i<8;i++){
   const k=p.after.kinds[i]!,before=p.before.policy.kinds[i]!
   if(same(k,before))continue
   const row=obj(await one(db,access,'write',updateKindSQL,[i+1,k.kind,k.instrumented,k.enabled]),
    ['ordinal','kind','instrumented','enabled'])
   if(!same(row,{ordinal:i+1,...k}))return fail()
  }
  for(const i of p.changed){
   const s=p.after.slots[i]!,b=p.after.binding,args=[s.kind,s.slot_no,b.role_oids[i+2],names[i+2],s.generation]
   if(p.reset.has(i)){
    const r=obj(await one(db,access,'write',resetSlotSQL,args),
     ['kind','slot_no','login_oid','login_name','enabled','generation','sequence','state','reason','observed_at','draining'])
    if(!same(r,{kind:s.kind,slot_no:s.slot_no,login_oid:String(b.role_oids[i+2]),login_name:names[i+2],
     enabled:true,generation:s.generation,sequence:'0',state:null,reason:null,observed_at:null,draining:false}))return fail()
   }else{
    const r=obj(await one(db,access,'write',retireSlotSQL,args),['kind','slot_no','enabled','generation'])
    if(!same(r,{kind:s.kind,slot_no:s.slot_no,enabled:false,generation:s.generation}))return fail()
   }
  }
  // Only changed reader/writer credentials; owner index 0 is never changed.
  for(const [i,s] of p.secrets){
   if(i<1||i>17||!verifierPattern.test(s.verifier))return fail()
   // ALTER ROLE has no bind-parameter syntax. Fixed identifier plus internally
   // generated closed ASCII SCRAM literal, containing no quote/backslash.
   await emptyWrite(db,access,roleEnablePrefix[i]!+"'"+s.verifier+"'")
  }
  const after=await observe(db,access,'write',p.after)
  progression(current,after,p.reset)
  p.applied=after;p.state='applied'
 }catch{if(p&&claimed)p.state='failed';return fail()}
 finally{if(p&&claimed)p.operationInFlight=false}
}
export async function verifyWorkerHeartbeatRegistryAfter(db:SqlClient,access:ControlDbAccess,value:RegistryPlan):Promise<RegistryObservation>{
 let p:PlanData|undefined,claimed=false
 try{
  assertWorkerHeartbeatControlDbAccess(db,access,'read')
  p=plan(value);if(p.state!=='applied'||!p.applied||p.operationInFlight)return fail()
  p.operationInFlight=true;claimed=true
  const after=await observe(db,access,'read',p.after)
  progression(p.applied,after,p.reset)
  return makeObservation(after)
 }catch{return fail()}
 finally{if(p&&claimed)p.operationInFlight=false}
}

