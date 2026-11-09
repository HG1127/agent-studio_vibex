// Independent optional Executor operator proposal. Import and plan are pure.
// No original six-login protocol, migration ledger, HBA file or service changes.
import {serviceLoginTargetGuardSql} from './pg18-service-login-policy.mjs'
export const executorOperatorTargetGuardSql=serviceLoginTargetGuardSql
export const executorOperatorAbi=Object.freeze({login:'agentstudio_local_executor_login',group:'agentstudio_local_executor',unit:'agentstudio-pg18-native.service',secret:'local-executor.secret',vaultFile:'/root/.agentstudio-pg18-secrets/local-executor.secret',serviceFile:'/run/credentials/agentstudio-pg18-native.service/local-executor.secret',envKey:'AGENT_STUDIO_PG18_LOCAL_EXECUTOR_PASSWORD_FILE'})
export const disabledExecutorReservationSql="CREATE ROLE agentstudio_local_executor_login NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION CONNECTION LIMIT 3;\nGRANT agentstudio_local_executor TO agentstudio_local_executor_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;"
export function executorConnectGrant(database){if(!['agent_studio','agentstudio_pg18_ci'].includes(database))throw Error('executor_database_refused');return 'GRANT CONNECT ON DATABASE '+database+' TO agentstudio_local_executor_login;'}
export function executorActivationStatement(verifier){
 const m=typeof verifier==='string'&&/^SCRAM-SHA-256\$15000:([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/.exec(verifier)
 if(!m||![16,32,32].every((n,i)=>{const v=Buffer.from(m[i+1],'base64');return v.length===n&&v.toString('base64')===m[i+1]}))throw Error('executor_scram_verifier_refused')
 return "ALTER ROLE agentstudio_local_executor_login LOGIN PASSWORD '"+verifier+"';"
}
const maybeUser=v=>Array.isArray(v)&&v.some(x=>x===executorOperatorAbi.login||x==='all'||typeof x==='string'&&/^[@+/]/.test(x))
const maybeDatabase=v=>Array.isArray(v)&&v.some(x=>['agent_studio','all','samerole','samegroup','sameuser'].includes(x)||typeof x==='string'&&/^[@/]/.test(x))
const exactUser=v=>Array.isArray(v)&&v.length===1&&v[0]===executorOperatorAbi.login
const exactDatabase=v=>Array.isArray(v)&&v.length===1&&v[0]==='agent_studio'
const allDatabase=v=>Array.isArray(v)&&v.length===1&&v[0]==='all'
const hostTypes=['host','hostssl','hostnossl','hostgssenc','hostnogssenc']
function ipv4(v){if(typeof v!=='string')return null;const a=v.split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)?a.reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0:null}
function couldLoopback(r){if(typeof r.address==='string'&&r.address.includes(':'))return false;const a=ipv4(r.address),m=ipv4(r.netmask);if(a===null||m===null)return true;return ((a&m)>>>0)===((2130706433&m)>>>0)}
const family=(r,f)=>{if(typeof r.address!=='string')return true;if(ipv4(r.address)!==null)return f===4;if(r.address.includes(':'))return f===6;return true}
const loopbackGuard=r=>r?.type==='host'&&exactUser(r.user_name)&&exactDatabase(r.database)&&r.address==='127.0.0.1'&&['255.255.255.255','32'].includes(r.netmask)&&r.auth_method==='scram-sha-256'&&(!r.options||r.options.length===0)
export function inspectExecutorHba(rows){
 const refused={loopback_scram:false,local_reject:false,remote_ipv4_reject:false,remote_ipv6_reject:false,safe:false}
 if(!Array.isArray(rows)||rows.some(r=>!r||r.error!=null||!Number.isSafeInteger(r.rule_number)||r.rule_number<1||!['local',...hostTypes].includes(r.type)||!Array.isArray(r.database)||!Array.isArray(r.user_name)||!r.database.length||!r.user_name.length||[...r.database,...r.user_name].some(v=>typeof v!=='string'||!v)||typeof r.auth_method!=='string'||r.options!=null&&(!Array.isArray(r.options)||r.options.some(v=>typeof v!=='string')))||new Set(rows.map(r=>r.rule_number)).size!==rows.length)return refused
 const order=[...rows].sort((a,b)=>a.rule_number-b.rule_number),local=order.find(r=>r.type==='local'&&maybeUser(r.user_name)),tcp=order.find(r=>hostTypes.includes(r.type)&&maybeUser(r.user_name)&&maybeDatabase(r.database)&&couldLoopback(r))
 const local_reject=!!local&&exactUser(local.user_name)&&allDatabase(local.database)&&local.auth_method==='reject'&&(!local.options||local.options.length===0),loopback_scram=loopbackGuard(tcp)
 const remote=f=>{const relevant=order.filter(r=>hostTypes.includes(r.type)&&maybeUser(r.user_name)&&family(r,f)),i=relevant.findIndex(r=>r.type==='host'&&exactUser(r.user_name)&&allDatabase(r.database)&&r.auth_method==='reject'&&(!r.options||r.options.length===0)&&(f===4?r.address==='0.0.0.0'&&['0.0.0.0','0'].includes(r.netmask):r.address==='::'&&['::','0'].includes(r.netmask)));return i>=0&&relevant.slice(0,i).every(r=>f===4&&loopbackGuard(r))}
 const remote_ipv4_reject=remote(4),remote_ipv6_reject=remote(6)
 return {loopback_scram,local_reject,remote_ipv4_reject,remote_ipv6_reject,safe:loopback_scram&&local_reject&&remote_ipv4_reject&&remote_ipv6_reject}
}
export function localExecutorOperatorPlan(){return {format:'native_local_executor_operator_plan_v1',abi:executorOperatorAbi,role_reservation_initially_NOLOGIN:true,extra_group_count:1,group_membership:{admin:false,inherit:false,set:true},table_or_auth_grants:0,original_six_login_protocol_changed:false,migration_ledger_write:false,activation_via_this_cli_supported:false,service_preflight_read_only:true,device_pairing_and_effects_executed:false,network_used:false,secrets_read:false,writes_performed:false,services_started:false,production_cutover_allowed:false}}
