// A new full069 preparation protocol; the old optional operator stays read-only.
import {executorOperatorAbi,executorOperatorTargetGuardSql,disabledExecutorReservationSql,executorConnectGrant,executorActivationStatement,inspectExecutorHba} from './native-local-executor-operator-plan.mjs'
export const complete069ExecutorAbi=executorOperatorAbi
export const complete069ExecutorTargetGuardSql=executorOperatorTargetGuardSql
export const complete069ExecutorReservationSql=disabledExecutorReservationSql+'\n'+executorConnectGrant('agent_studio')
export const complete069ExecutorActivationSql=executorActivationStatement
export const inspectComplete069ExecutorHba=inspectExecutorHba
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
export function complete069ExecutorPlan(){return {format:'complete069_fixed_executor_plan_v1',profile:'complete069',abi:executorOperatorAbi,predecessor:'original C eight actions, then dedicated Review Worker preparation and live observation',new_login_count:1,new_group_count:0,connection_limit:3,reservation_initially_NOLOGIN:true,reservation_initially_password_null:true,groups:{admin:false,inherit:false,set:true},new_table_column_function_schema_or_ledger_grants:0,original_six_enum_changed:false,original_operator_changed:false,C_eight_actions_changed:false,preparation_CLI:'pg18-complete-executor-cli.mjs',original_actual_probe:'inspectNativeLocalExecutorPreflight(realDedicatedPool,fixedActualTarget)',original_service_preflight:'native-local-executor-service-preflight-cli.mjs --service-preflight',migration_ledger_writes:false,credentials_read:false,network_used:false,writes_performed:false,services_started:false,device_pairing_and_effects_executed:false,runtime_authorization:false,production_cutover_allowed:false}}
export function parseComplete069ExecutorArguments(argv){
 const fail=()=>{throw Error('complete069_executor_arguments_refused')}
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail()
 if(argv.length===1&&argv[0]==='--plan')return Object.freeze({mode:'plan'})
 const keys=['--profile','--confirm-database','--expected-source-sha256','--expected-system-identifier','--expected-database-oid','--review-operation-id','--operation-id']
 if(argv.length!==15||!['--prepare','--inspect-operation'].includes(argv[0])||keys.some((k,i)=>argv[1+i*2]!==k)||argv[2]!=='complete069'||argv[4]!=='agent_studio'||!/^[a-f0-9]{64}$/.test(argv[6])||![argv[8],argv[10]].every(v=>/^[1-9][0-9]{0,19}$/.test(v))||!uuid(argv[12])||!uuid(argv[14])||argv[12]===argv[14])fail()
 return Object.freeze({mode:argv[0].slice(2),sourceSha256:argv[6],target:Object.freeze({system_identifier:argv[8],database_oid:argv[10]}),reviewOperationId:argv[12],operationId:argv[14]})
}
export function complete069ExecutorRefusal(error){
 const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value,c=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 if(typeof v==='string'&&/^complete069_executor_[a-z_]+$/.test(v))return v
 if(typeof v==='string'&&/^complete_service_[a-z_]+$/.test(v))return 'complete069_executor_predecessor_'+v
 if(typeof v==='string'&&/^complete069_review_worker_[a-z_]+$/.test(v))return 'complete069_executor_review_predecessor_refused'
 if(v==='complete069_source_refused')return 'complete069_executor_source_refused'
 if(v==='complete069_runtime_refused')return 'complete069_executor_runtime_refused'
 return typeof c==='string'&&/^[0-9A-Z]{5}$/.test(c)?'complete069_executor_sqlstate_'+c:'complete069_executor_operation_refused'
}
