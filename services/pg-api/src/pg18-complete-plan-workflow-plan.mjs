// Independent fixed F05 pair after C bootstrap. Pure source/plan only.
import {serviceLoginTargetGuardSql} from './pg18-service-login-policy.mjs'
import{complete069PlanWorkflowPredecessors,complete069PlanWorkflowPreparationOrder}from'./pg18-complete-plan-workflow-predecessor-plan.mjs'
export const complete069PlanWorkflowAbi=Object.freeze([
 Object.freeze({kind:'worker',login:'agentstudio_plan_workflow_worker_login',group:'agentstudio_plan_workflow_worker',service:'agentstudio-pg18-plan-workflow-worker.service',secret:'worker.secret'}),
 Object.freeze({kind:'broker',login:'agentstudio_plan_workflow_dispatch_login',group:'agentstudio_plan_workflow_dispatch',service:'agentstudio-pg18-plan-workflow-broker.service',secret:'dispatch.secret'}),
])
const fail=()=>{throw Error('complete069_plan_workflow_arguments_refused')},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export const complete069PlanWorkflowTargetGuardSql=serviceLoginTargetGuardSql
export const complete069PlanWorkflowReservationSql=complete069PlanWorkflowAbi.map(a=>'CREATE ROLE '+a.login+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;\nGRANT CONNECT ON DATABASE agent_studio TO '+a.login+';\nGRANT '+a.group+' TO '+a.login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;').join('\n')
export function complete069PlanWorkflowActivationSql(verifiers){
 if(!Array.isArray(verifiers)||verifiers.length!==2||verifiers[0]===verifiers[1])throw Error('complete069_plan_workflow_scram_refused')
 return complete069PlanWorkflowAbi.map((a,i)=>{const value=verifiers[i],m=typeof value==='string'&&/^SCRAM-SHA-256\$15000:([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if(!m||![16,32,32].every((n,j)=>{const b=Buffer.from(m[j+1],'base64');return b.length===n&&b.toString('base64')===m[j+1]}))throw Error('complete069_plan_workflow_scram_refused')
  return "ALTER ROLE "+a.login+" LOGIN PASSWORD '"+value+"';"
 }).join('\n')
}
export function parseComplete069PlanWorkflowArguments(argv){
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail()
 if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
 const keys=['--profile','--confirm-database','--expected-source-sha256','--expected-plan-workflow-source-sha256','--expected-system-identifier','--expected-database-oid','--operation-id']
 if(argv.length!==15||!['--prepare','--inspect-operation'].includes(argv[0])||keys.some((k,i)=>argv[1+i*2]!==k)||argv[2]!=='complete069'||argv[4]!=='agent_studio'||!hex(argv[6])||!hex(argv[8])||![argv[10],argv[12]].every(v=>/^[1-9][0-9]{0,19}$/.test(v))||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(argv[14]))fail()
 return Object.freeze({mode:argv[0].slice(2),sourceSha256:argv[6],planWorkflowSourceSha256:argv[8],target:Object.freeze({system_identifier:argv[10],database_oid:argv[12]}),operationId:argv[14]})
}
const hosts=['host','hostssl','hostnossl','hostgssenc','hostnogssenc'],exact=(values,value)=>Array.isArray(values)&&values.length===1&&values[0]===value
function ipv4(v){if(typeof v!=='string')return null;const a=v.split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)?a.reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0:null}
export function inspectComplete069PlanWorkflowHba(rows,login){
 const no={local_reject:false,loopback_scram:false,remote_ipv4_reject:false,remote_ipv6_reject:false,safe:false}
 if(!complete069PlanWorkflowAbi.some(a=>a.login===login)||!Array.isArray(rows)||rows.some(r=>!r||r.error!=null||!Number.isSafeInteger(r.rule_number)||r.rule_number<1||!['local',...hosts].includes(r.type)||!Array.isArray(r.database)||!Array.isArray(r.user_name)||!r.database.length||!r.user_name.length||[...r.database,...r.user_name].some(v=>typeof v!=='string'||!v)||typeof r.auth_method!=='string'||r.options!=null&&(!Array.isArray(r.options)||r.options.some(v=>typeof v!=='string')))||new Set(rows.map(r=>r.rule_number)).size!==rows.length)return no
 const user=r=>r.user_name.some(v=>v===login||v==='all'||/^[@+/]/.test(v)),db=r=>r.database.some(v=>['agent_studio','all','samerole','samegroup','sameuser'].includes(v)||/^[@/]/.test(v)),opts=r=>!r.options||r.options.length===0
 const loop=r=>r?.type==='host'&&exact(r.user_name,login)&&exact(r.database,'agent_studio')&&r.address==='127.0.0.1'&&['255.255.255.255','32'].includes(r.netmask)&&r.auth_method==='scram-sha-256'&&opts(r)
 const could=r=>{if(typeof r.address==='string'&&r.address.includes(':'))return false;const a=ipv4(r.address),m=ipv4(r.netmask);return a===null||m===null||((a&m)>>>0)===((2130706433&m)>>>0)}
 const ordered=[...rows].sort((a,b)=>a.rule_number-b.rule_number),local=ordered.find(r=>r.type==='local'&&user(r)),tcp=ordered.find(r=>hosts.includes(r.type)&&user(r)&&db(r)&&could(r))
 const local_reject=!!local&&exact(local.user_name,login)&&exact(local.database,'all')&&local.auth_method==='reject'&&opts(local),loopback_scram=loop(tcp)
 const remote=f=>{const relevant=ordered.filter(r=>hosts.includes(r.type)&&user(r)&&(typeof r.address!=='string'||(ipv4(r.address)!==null?f===4:r.address.includes(':')?f===6:true))),at=relevant.findIndex(r=>r.type==='host'&&exact(r.user_name,login)&&exact(r.database,'all')&&r.auth_method==='reject'&&opts(r)&&(f===4?r.address==='0.0.0.0'&&['0.0.0.0','0'].includes(r.netmask):r.address==='::'&&['::','0'].includes(r.netmask)));return at>=0&&relevant.slice(0,at).every(r=>f===4&&loop(r))}
 const remote_ipv4_reject=remote(4),remote_ipv6_reject=remote(6);return{local_reject,loopback_scram,remote_ipv4_reject,remote_ipv6_reject,safe:local_reject&&loopback_scram&&remote_ipv4_reject&&remote_ipv6_reject}
}
export function complete069PlanWorkflowPlan(){return{format:'complete069_fixed_plan_workflow_pair_plan_v1',profile:'complete069',fixed_pair:complete069PlanWorkflowAbi,exact_predecessor_logins:complete069PlanWorkflowPredecessors.map(a=>a.login),preparation_order:complete069PlanWorkflowPreparationOrder,new_groups:0,new_logins:2,atomic_pair:true,connection_limit_each:3,existing_role_takeover:false,partial_pair_adoption:false,direct_database_grant:'CONNECT on agent_studio only',membership:{admin:false,inherit:false,set:true},object_or_ledger_grants:0,original_C8_changed:false,original_review_ABI_changed:false,old050059060_changed:false,original_entry:'services/pg-api/src/agent-plan-workflow-service.ts',original_preflight_args:[['--preflight','worker'],['--preflight','broker']],broker_independent_original_pools:3,source_delivery_is_runtime_capability:false,preparation_is_runtime_authorization:false,network_used:false,credentials_read:false,writes_performed:false,services_started:false,production_cutover_allowed:false}}
export function complete069PlanWorkflowRefusal(error){const value=Object.getOwnPropertyDescriptor(error??{},'message')?.value,code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;if(typeof value==='string'&&/^complete069_plan_workflow_[a-z_]+$/.test(value))return value;if(typeof value==='string'&&/^complete_service_[a-z_]+$/.test(value))return'complete069_plan_workflow_predecessor_'+value;return typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?'complete069_plan_workflow_sqlstate_'+code:'complete069_plan_workflow_operation_refused'}
