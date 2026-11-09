// Independent fixed review-worker preparation after C full069 bootstrap. Pure;
// reuses original057 service/auditors, never extends old six-login protocols.
import {serviceLoginTargetGuardSql} from './pg18-service-login-policy.mjs'
export const complete069ReviewWorkerAbi=Object.freeze({login:'agentstudio_review_worker_login',group:'agentstudio_review_worker',service:'agentstudio-pg18-review-worker.service',credential:'worker.secret'})
export const complete069ReviewWorkerTargetGuardSql=serviceLoginTargetGuardSql
export const complete069ReviewWorkerReservationSql='CREATE ROLE agentstudio_review_worker_login NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;\nGRANT CONNECT ON DATABASE agent_studio TO agentstudio_review_worker_login;\nGRANT agentstudio_review_worker TO agentstudio_review_worker_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;'
export function complete069ReviewWorkerActivationSql(verifier){
 const m=typeof verifier==='string'&&/^SCRAM-SHA-256\$15000:([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/.exec(verifier)
 if(!m||![16,32,32].every((n,i)=>{const b=Buffer.from(m[i+1],'base64');return b.length===n&&b.toString('base64')===m[i+1]}))throw Error('complete069_review_worker_scram_refused')
 return "ALTER ROLE agentstudio_review_worker_login LOGIN PASSWORD '"+verifier+"';"
}
const hostTypes=['host','hostssl','hostnossl','hostgssenc','hostnogssenc']
const user=v=>Array.isArray(v)&&v.some(x=>x===complete069ReviewWorkerAbi.login||x==='all'||typeof x==='string'&&/^[@+/]/.test(x))
const database=v=>Array.isArray(v)&&v.some(x=>['agent_studio','all','samerole','samegroup','sameuser'].includes(x)||typeof x==='string'&&/^[@/]/.test(x))
const exactUser=v=>Array.isArray(v)&&v.length===1&&v[0]===complete069ReviewWorkerAbi.login
const exactDb=v=>Array.isArray(v)&&v.length===1&&v[0]==='agent_studio'
const allDb=v=>Array.isArray(v)&&v.length===1&&v[0]==='all'
function ipv4(v){if(typeof v!=='string')return null;const a=v.split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)?a.reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0:null}
function couldLoopback(r){if(typeof r.address==='string'&&r.address.includes(':'))return false;const a=ipv4(r.address),m=ipv4(r.netmask);return a===null||m===null||((a&m)>>>0)===((2130706433&m)>>>0)}
const family=(r,f)=>{if(typeof r.address!=='string')return true;if(ipv4(r.address)!==null)return f===4;if(r.address.includes(':'))return f===6;return true}
const noOptions=r=>!r.options||r.options.length===0
const loopback=r=>r?.type==='host'&&exactUser(r.user_name)&&exactDb(r.database)&&r.address==='127.0.0.1'&&['255.255.255.255','32'].includes(r.netmask)&&r.auth_method==='scram-sha-256'&&noOptions(r)
export function inspectComplete069ReviewWorkerHba(rows){
 const no={local_reject:false,loopback_scram:false,remote_ipv4_reject:false,remote_ipv6_reject:false,safe:false}
 if(!Array.isArray(rows)||rows.some(r=>!r||r.error!=null||!Number.isSafeInteger(r.rule_number)||r.rule_number<1||!['local',...hostTypes].includes(r.type)||!Array.isArray(r.database)||!Array.isArray(r.user_name)||!r.database.length||!r.user_name.length||[...r.database,...r.user_name].some(v=>typeof v!=='string'||!v)||typeof r.auth_method!=='string'||r.options!=null&&(!Array.isArray(r.options)||r.options.some(v=>typeof v!=='string')))||new Set(rows.map(r=>r.rule_number)).size!==rows.length)return no
 const ordered=[...rows].sort((a,b)=>a.rule_number-b.rule_number),local=ordered.find(r=>r.type==='local'&&user(r.user_name)),tcp=ordered.find(r=>hostTypes.includes(r.type)&&user(r.user_name)&&database(r.database)&&couldLoopback(r))
 const local_reject=!!local&&exactUser(local.user_name)&&allDb(local.database)&&local.auth_method==='reject'&&noOptions(local),loopback_scram=loopback(tcp)
 const remote=f=>{const relevant=ordered.filter(r=>hostTypes.includes(r.type)&&user(r.user_name)&&family(r,f)),at=relevant.findIndex(r=>r.type==='host'&&exactUser(r.user_name)&&allDb(r.database)&&r.auth_method==='reject'&&noOptions(r)&&(f===4?r.address==='0.0.0.0'&&['0.0.0.0','0'].includes(r.netmask):r.address==='::'&&['::','0'].includes(r.netmask)));return at>=0&&relevant.slice(0,at).every(r=>f===4&&loopback(r))}
 const remote_ipv4_reject=remote(4),remote_ipv6_reject=remote(6)
 return {local_reject,loopback_scram,remote_ipv4_reject,remote_ipv6_reject,safe:local_reject&&loopback_scram&&remote_ipv4_reject&&remote_ipv6_reject}
}
export function complete069ReviewWorkerPlan(){return {format:'complete069_fixed_review_worker_plan_v1',abi:complete069ReviewWorkerAbi,profile:'complete069',fixed_existing_group_count:1,new_group_count:0,new_login_count:1,reservation_initially_NOLOGIN:true,reservation_initially_password_null:true,connection_limit:3,groups:{admin:false,inherit:false,set:true},new_table_column_function_schema_or_ledger_grants:0,existing057_version_column_grant_unchanged:true,original_six_enum_changed:false,C_eight_actions_changed:false,migration_ledger_writes:false,review_dispatch_login_included:false,original_operator_entry:'services/pg-api/src/agent-assessment-service.ts',original_actual_probe:'inspectAgentAssessmentOperatorPool(realDedicatedPool,fixedActualTarget,worker)',old_lifecycle_CI:'fresh050+051..057 only; not full069 acceptance',activation_via_this_module:false,preparation_CLI:'pg18-complete-review-worker-cli.mjs',preparation_is_runtime_authorization:false,credentials_read:false,network_used:false,writes_performed:false,services_started:false,production_cutover_allowed:false}}

export function parseComplete069ReviewWorkerArguments(argv){
 const fail=()=>{throw Error('complete069_review_worker_arguments_refused')}
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail()
 if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
 const keys=['--profile','--confirm-database','--expected-source-sha256','--expected-system-identifier','--expected-database-oid','--operation-id']
 if(argv.length!==13||!['--prepare','--inspect-operation'].includes(argv[0])||keys.some((k,i)=>argv[1+i*2]!==k)||argv[2]!=='complete069'||argv[4]!=='agent_studio'||!/^[a-f0-9]{64}$/.test(argv[6])||![argv[8],argv[10]].every(v=>/^[1-9][0-9]{0,19}$/.test(v))||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(argv[12]))fail()
 return Object.freeze({mode:argv[0].slice(2),sourceSha256:argv[6],target:Object.freeze({system_identifier:argv[8],database_oid:argv[10]}),operationId:argv[12]})
}
export function complete069ReviewWorkerRefusal(error){
 const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value,c=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 if(typeof v==='string'&&/^complete069_review_worker_[a-z_]+$/.test(v))return v
 if(typeof v==='string'&&/^complete_service_[a-z_]+$/.test(v))return 'complete069_review_worker_predecessor_'+v
 if(v==='complete069_source_refused')return 'complete069_review_worker_source_refused'
 if(v==='complete069_runtime_refused')return 'complete069_review_worker_runtime_refused'
 return typeof c==='string'&&/^[0-9A-Z]{5}$/.test(c)?'complete069_review_worker_sqlstate_'+c:'complete069_review_worker_operation_refused'
}
