// Separate full069 preparation protocol. Original050/059/060 and six-service
// receipts are deliberately not extended, adopted or written by this tool.
import {serviceLoginKinds,serviceLogins} from './pg18-service-login-policy.mjs'
export const completeServiceActions=Object.freeze(['api','native-auth','first-admin','worker','identity','broker','index-worker','index-broker'])
const definitions=Object.freeze({...serviceLogins,'native-auth':Object.freeze({kind:'native-auth',login:'agentstudio_native_login',groups:Object.freeze(['agentstudio_native_auth'])})})
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),positive=v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const fail=()=>{throw Error('complete_service_arguments_refused')}
export function completeServiceDefinition(action){if(typeof action!=='string'||!Object.hasOwn(definitions,action))fail();return definitions[action]}
export function parseCompleteServiceArguments(argv){
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail()
 if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
 const keys=['--profile','--action','--confirm-database','--expected-source-sha256','--expected-system-identifier','--expected-database-oid','--operation-id']
 if(argv.length!==15||!['--prepare','--inspect-operation'].includes(argv[0])||keys.some((k,i)=>argv[1+i*2]!==k)||argv[2]!=='complete069'||!completeServiceActions.includes(argv[4])||argv[6]!=='agent_studio'||!hex(argv[8])||!positive(argv[10])||!positive(argv[12])||!uuid(argv[14]))fail()
 return Object.freeze({mode:argv[0].slice(2),action:argv[4],sourceSha256:argv[8],target:Object.freeze({system_identifier:argv[10],database_oid:argv[12]}),operationId:argv[14]})
}
// These are fixed identifiers from the original service definitions. A caller
// cannot supply a role, target database, privilege, SQL body or sixth account.
export function completeServiceSql(action,verifier){
 const d=completeServiceDefinition(action),existing=['api','worker','native-auth'].includes(action)
 if(action==='api'||action==='worker'){
  if(verifier!==undefined)fail()
  return Object.freeze(['ALTER ROLE '+d.login+' LOGIN'])
 }
 const m=typeof verifier==='string'&&/^SCRAM-SHA-256\$15000:([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/.exec(verifier)
 if(!m||![16,32,32].every((n,i)=>{const b=Buffer.from(m[i+1],'base64');return b.length===n&&b.toString('base64')===m[i+1]}))fail()
 return Object.freeze([...(existing?[]:['CREATE ROLE '+d.login+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION','GRANT CONNECT ON DATABASE agent_studio TO '+d.login,...d.groups.map(g=>'GRANT '+g+' TO '+d.login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')]),"ALTER ROLE "+d.login+" LOGIN PASSWORD '"+verifier+"'"])
}
export function completeServicePlan(){return Object.freeze({format:'complete069_service_preparation_plan_v1',profile:'complete069',host:'127.0.0.1',port:5333,database:'agent_studio',actions:completeServiceActions,original_six:serviceLoginKinds,accounts:Object.values(definitions),first_admin_implementation:'native-first-admin-cli.mjs:run',order:['api','native-auth','first-admin','worker/identity/broker/index-worker/index-broker'],api_seed_requires_original_scram_secret:true,original_worker_scram_preserved:true,actual_api_catalog_required_after_each_commit:true,actual_service_login_required:true,first_admin_required_before_worker:true,operation_record:'external_root_only_complete069_service_operation_v1',database_acl_grant:'direct_CONNECT_only',existing_public_TEMP_privilege_changed:false,migration_ledger_write:false,old_protocol_changed:false,executor_account_included:false,executor_preparation_order:'separate_operator_after_this_fresh_bootstrap',automatic_retry_authorized:false,services_started:false,network_used:false,secrets_read:false,writes_performed:false,production_cutover_allowed:false})}
export function completeServiceRefusal(error){
 const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value,c=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 return typeof v==='string'&&/^complete_service_[a-z_]+$/.test(v)?v:typeof c==='string'&&/^[0-9A-Z]{5}$/.test(c)?'complete_service_sqlstate_'+c:'complete_service_operation_refused'
}
