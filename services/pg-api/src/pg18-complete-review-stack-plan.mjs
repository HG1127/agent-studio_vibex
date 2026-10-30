// Independent fixed F28/F01 account phase. No C8/ReviewWorker ABI expansion.
import {serviceLoginKinds,serviceLogins} from './pg18-service-login-policy.mjs'
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v}
export const reviewStackDefinitions=freeze([
 {key:'review_dispatch',login:'agentstudio_review_dispatch_login',group:'agentstudio_review_dispatch',connlimit:-1},
 {key:'design_worker',login:'agentstudio_design_worker_login',group:'agentstudio_design_worker',connlimit:-1},
 {key:'design_dispatch',login:'agentstudio_design_dispatch_login',group:'agentstudio_design_dispatch',connlimit:-1},
])
const systemRoles=Object.freeze(['pg_checkpoint','pg_create_subscription','pg_database_owner','pg_execute_server_program','pg_maintain','pg_monitor','pg_read_all_data','pg_read_all_settings','pg_read_all_stats','pg_read_server_files','pg_signal_autovacuum_worker','pg_signal_backend','pg_stat_scan_tables','pg_use_reserved_connections','pg_write_all_data','pg_write_server_files'])
const fail=code=>{throw Error('complete069_review_stack_'+code)},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const original=[{login:'agentstudio_native_login',groups:['agentstudio_native_auth']},...serviceLoginKinds.map(k=>serviceLogins[k]),{login:'agentstudio_review_worker_login',groups:['agentstudio_review_worker']},{login:'agentstudio_local_executor_login',groups:['agentstudio_local_executor']}]
export const reviewStackPriorLogins=freeze(original.map(v=>({login:v.login,groups:[...v.groups],connlimit:['agentstudio_review_worker_login','agentstudio_local_executor_login'].includes(v.login)?3:-1})))
export function parseReviewStackArguments(argv){
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail('arguments_refused')
 if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
 const keys=['--profile','--confirm-database','--expected-source-sha256','--expected-system-identifier','--expected-database-oid','--review-operation-id','--executor-operation-id','--operation-id'],ids=[argv[12],argv[14],argv[16]]
 if(argv.length!==17||!['--prepare','--inspect-operation'].includes(argv[0])||keys.some((k,i)=>argv[1+i*2]!==k)||argv[2]!=='complete069'||argv[4]!=='agent_studio'||!hex(argv[6])||![argv[8],argv[10]].every(v=>/^[1-9][0-9]{0,19}$/.test(v))||!ids.every(v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))||new Set(ids).size!==3)fail('arguments_refused')
 return freeze({mode:argv[0].slice(2),sourceSha256:argv[6],target:{system_identifier:argv[8],database_oid:argv[10]},reviewOperationId:argv[12],executorOperationId:argv[14],operationId:argv[16]})
}
function verifier(value){
 const m=typeof value==='string'&&/^SCRAM-SHA-256\$15000:([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/.exec(value)
 if(!m||![16,32,32].every((n,i)=>{const b=Buffer.from(m[i+1],'base64');return b.length===n&&b.toString('base64')===m[i+1]}))fail('scram_refused')
 return value
}
export function checkedReviewStackDigests(values){
 const keys=reviewStackDefinitions.map(d=>d.login).sort()
 if(!values||Object.getPrototypeOf(values)!==Object.prototype||Object.keys(values).sort().join(',')!==keys.join(',')||keys.some(k=>!hex(Object.getOwnPropertyDescriptor(values,k)?.value)))fail('record_refused')
 return values
}
export function reviewStackSql(verifiers){
 const keys=reviewStackDefinitions.map(d=>d.login).sort()
 if(!verifiers||Object.getPrototypeOf(verifiers)!==Object.prototype||Object.keys(verifiers).sort().join(',')!==keys.join(','))fail('scram_refused')
 for(const d of reviewStackDefinitions)verifier(Object.getOwnPropertyDescriptor(verifiers,d.login)?.value)
 return Object.freeze([
  ...reviewStackDefinitions.flatMap(d=>['CREATE ROLE '+d.login+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT -1','GRANT CONNECT ON DATABASE agent_studio TO '+d.login,'GRANT '+d.group+' TO '+d.login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE']),
  ...reviewStackDefinitions.map(d=>"ALTER ROLE "+d.login+" LOGIN PASSWORD '"+verifiers[d.login]+"'"),
 ])
}
// ALL global pg_roles and pg_auth_members rows are checked. Unknown rows are
// never filtered out. PG18 system names also require reserved system OIDs.
export function inspectReviewStackRoleMatrix(rows,memberships,snapshotRoles,prepared){
 if(!Array.isArray(rows)||!Array.isArray(memberships)||!Array.isArray(snapshotRoles)||typeof prepared!=='boolean'||new Set(rows.map(r=>r?.name)).size!==rows.length)fail('role_matrix_refused')
 const expected=new Set([...snapshotRoles,...reviewStackPriorLogins.map(d=>d.login),...(prepared?reviewStackDefinitions.map(d=>d.login):[])]),logins=new Map([...reviewStackPriorLogins,...(prepared?reviewStackDefinitions.map(d=>({...d,groups:[d.group]})):[])].map(d=>[d.login,d]))
 const actual=new Set(),systems=new Set()
 for(const r of rows){
  if(!r||typeof r.name!=='string'||typeof r.id!=='string'||!/^[1-9][0-9]{0,9}$/.test(r.id)||BigInt(r.id)>4294967295n||typeof r.login!=='boolean'||typeof r.inherit!=='boolean'||r.config!==null||r.until!==null)fail('role_matrix_refused')
  if(expected.has(r.name)){
   if(Number(r.id)<16384)fail('role_matrix_refused')
   actual.add(r.name);const d=logins.get(r.name)
   if(r.login!==!!d||r.inherit!==false||[r.superuser,r.bypassrls,r.createdb,r.createrole,r.replication].some(v=>v!==false)||r.connlimit!==(d?d.connlimit:-1)||(d?(typeof r.verifier!=='string'||!r.verifier.startsWith('SCRAM-SHA-256$')):r.verifier!==null))fail('role_matrix_refused')
  }else if(r.name==='postgres'){
   if(r.id!=='10'||r.login!==true||r.inherit!==true||[r.superuser,r.bypassrls,r.createdb,r.createrole,r.replication].some(v=>v!==true)||r.connlimit!==-1||typeof r.verifier!=='string'||!r.verifier.startsWith('SCRAM-SHA-256$'))fail('role_matrix_refused')
  }else if(systemRoles.includes(r.name)){
   if(Number(r.id)>=16384||r.login!==false||r.inherit!==true||[r.superuser,r.bypassrls,r.createdb,r.createrole,r.replication].some(v=>v!==false)||r.connlimit!==-1||r.verifier!==null)fail('role_matrix_refused');systems.add(r.name)
  }else fail('unknown_global_role_refused')
 }
 if(actual.size!==expected.size||[...expected].some(n=>!actual.has(n))||systems.size!==systemRoles.length||!rows.some(r=>r.name==='postgres'))fail('role_matrix_refused')
 const grants=[...reviewStackPriorLogins.flatMap(d=>d.groups.map(g=>d.login+':'+g)),...(prepared?reviewStackDefinitions.map(d=>d.login+':'+d.group):[])].sort(),seen=[],systemSeen=[],systemGrants=['pg_monitor:pg_read_all_settings','pg_monitor:pg_read_all_stats','pg_monitor:pg_stat_scan_tables']
 for(const m of memberships){
  if(!m||!rows.some(r=>r.name===m.child)||!rows.some(r=>r.name===m.parent)||m.grantor!=='postgres'||[m.admin,m.inherit,m.set].some(v=>typeof v!=='boolean'))fail('membership_matrix_refused')
  if(expected.has(m.child)||expected.has(m.parent)){if(m.admin||m.inherit||!m.set)fail('membership_matrix_refused');seen.push(m.child+':'+m.parent)}
  else {if(!systemRoles.includes(m.child)||!systemRoles.includes(m.parent)||m.admin||!m.inherit||!m.set)fail('membership_matrix_refused');systemSeen.push(m.child+':'+m.parent)}
 }
 if(JSON.stringify(seen.sort())!==JSON.stringify(grants)||JSON.stringify(systemSeen.sort())!==JSON.stringify(systemGrants))fail('membership_matrix_refused')
 return freeze({application_roles:actual.size,system_roles:systems.size,global_roles:rows.length,prepared})
}
function oneHba(rows,login){
 const no={safe:false},hostTypes=['host','hostssl','hostnossl','hostgssenc','hostnogssenc'],user=v=>Array.isArray(v)&&v.some(x=>x===login||x==='all'||typeof x==='string'&&/^[@+/]/.test(x)),db=v=>Array.isArray(v)&&v.some(x=>['agent_studio','all','samerole','samegroup','sameuser'].includes(x)||typeof x==='string'&&/^[@/]/.test(x)),exact=(v,x)=>Array.isArray(v)&&v.length===1&&v[0]===x,opts=r=>!r.options||r.options.length===0
 const ipv4=v=>{if(typeof v!=='string')return null;const a=v.split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)?a.reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0:null}
 const family=(r,f)=>typeof r.address!=='string'||ipv4(r.address)===null&&!r.address.includes(':')?true:ipv4(r.address)!==null?f===4:f===6
 const loopPossible=r=>{if(typeof r.address==='string'&&r.address.includes(':'))return false;const a=ipv4(r.address),m=ipv4(r.netmask);return a===null||m===null||((a&m)>>>0)===((2130706433&m)>>>0)}
 const loop=r=>r?.type==='host'&&exact(r.database,'agent_studio')&&exact(r.user_name,login)&&r.address==='127.0.0.1'&&['255.255.255.255','32'].includes(r.netmask)&&r.auth_method==='scram-sha-256'&&opts(r)
 if(!Array.isArray(rows)||rows.some(r=>!r||r.error!=null||!Number.isSafeInteger(r.rule_number)||r.rule_number<1||!['local',...hostTypes].includes(r.type)||!Array.isArray(r.database)||!Array.isArray(r.user_name)||!r.database.length||!r.user_name.length||[...r.database,...r.user_name].some(v=>typeof v!=='string'||!v)||typeof r.auth_method!=='string'||r.options!=null&&(!Array.isArray(r.options)||r.options.some(v=>typeof v!=='string')))||new Set(rows.map(r=>r.rule_number)).size!==rows.length)return no
 const ordered=[...rows].sort((a,b)=>a.rule_number-b.rule_number),local=ordered.find(r=>r.type==='local'&&user(r.user_name)),tcp=ordered.find(r=>hostTypes.includes(r.type)&&user(r.user_name)&&db(r.database)&&loopPossible(r))
 const remote=f=>{const relevant=ordered.filter(r=>hostTypes.includes(r.type)&&user(r.user_name)&&family(r,f)),at=relevant.findIndex(r=>r.type==='host'&&exact(r.user_name,login)&&exact(r.database,'all')&&r.auth_method==='reject'&&opts(r)&&(f===4?r.address==='0.0.0.0'&&['0.0.0.0','0'].includes(r.netmask):r.address==='::'&&['::','0'].includes(r.netmask)));return at>=0&&relevant.slice(0,at).every(r=>f===4&&loop(r))}
 return {safe:!!local&&exact(local.database,'all')&&exact(local.user_name,login)&&local.auth_method==='reject'&&opts(local)&&loop(tcp)&&remote(4)&&remote(6)}
}
export function inspectReviewStackHba(rows){return reviewStackDefinitions.every(d=>oneHba(rows,d.login).safe===true)}
export function reviewStackPlan(){return freeze({format:'complete069_review_stack_plan_v1',profile:'complete069',fixed_logins:reviewStackDefinitions,prior_logins:reviewStackPriorLogins,new_groups:0,new_object_or_ledger_grants:0,prior_C8_and_Review_worker_ABIs_changed:false,old050_057_059_060_tools_changed:false,phase:'after_C8_Review_and_Executor_observations_before_F05_and_Telemetry',global_unknown_roles_refused:true,table_images_checked:133,ledger_rows:57,source_and_physical_target_required:true,external_private_operation_record:true,unknown_ACK_observation_readonly:true,original_assessment_and_design_auditors_required:true,preparation_starts_worker_Broker_provider_or_queue:false,runtime_authorization:false,network_used:false,credentials_read:false,writes_performed:false,services_started:false,qualifies:false,production_cutover_allowed:false})}
export function reviewStackRefusal(error){
 const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value,c=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 if(typeof v==='string'&&/^complete069_review_stack_[a-z_]+$/.test(v))return v
 if(typeof v==='string'&&/^complete_service_[a-z_]+$/.test(v))return 'complete069_review_stack_predecessor_'+v
 if(v==='complete069_source_refused')return 'complete069_review_stack_source_refused'
 if(v==='complete069_runtime_refused')return 'complete069_review_stack_runtime_refused'
 return typeof c==='string'&&/^[0-9A-Z]{5}$/.test(c)?'complete069_review_stack_sqlstate_'+c:'complete069_review_stack_operation_refused'
}
