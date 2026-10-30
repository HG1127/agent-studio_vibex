// Disposable original-entry diagnostic DATA. Never runtime/SQL authority.
import {isNativeError,isProxy} from 'node:util/types'
import {writeSync} from 'node:fs'
export const workerStartupDiagnosticPurpose='OBSERVE_DISPOSABLE_ORIGINAL_FIVE_WORKER_STARTUP_ONLY'
const entries=Object.freeze({'worker-loop.ts':['prepare','prepare'],'model-worker-loop.ts':['model','model'],'workflow-worker-loop.ts':['workflow_safe','workflow'],'workflow-v2-worker-loop.ts':['workflow_v2','workflow'],'autonomous-agent-worker-loop.ts':['agent_autonomous','agent']})
const phases=new Set(['entry','activation','credential_binding','credential_read','pg_import','pool_create','target_audit','worker_role_audit','knowledge_agent_audit','workflow_lineage_audit','schedule_audit','knowledge_runtime_audit','knowledge_tool_audit','human_input_audit','memory_schema_audit','memory_context_audit','outcome_schema_audit','failure_source_audit','dispatch_credentials','heartbeat_open','worker_import','worker_construct','loop_run','pool_cleanup'])
const sqlstates=new Set(['28P01','28000','42501','42704','42P01','42883','3F000','3D000','53300','53400','55000','57P01','08001','08006','57014','25P02','25006','XX000'])
const nodeCodes=new Set(['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT','ERR_REQUIRE_ESM','ERR_UNKNOWN_FILE_EXTENSION','ERR_INVALID_TYPESCRIPT_SYNTAX','ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING','ERR_INVALID_ARG_TYPE','ENOENT','EACCES','EPERM','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE'])
const classes=new Map([[TypeError.prototype,'TypeError'],[RangeError.prototype,'RangeError'],[SyntaxError.prototype,'SyntaxError'],[ReferenceError.prototype,'ReferenceError']])
export function workerStartupDiagnosticEntry(env,platform,uid,nodeMajor,argv,execArgv){
 if(platform!=='linux'||!Number.isInteger(uid)||uid<=0||nodeMajor!=='24'||env.AGENT_STUDIO_FULL069_WORKER_STARTUP_DIAGNOSTICS!==workerStartupDiagnosticPurpose||env.AGENT_STUDIO_PG_BAOTA18_ENABLED!=='true'||env.AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED!=='true'||env.AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED!=='APPROVE_ISOLATED_PG18_WORKER_TRIAL_ONLY'||env.AGENT_STUDIO_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_PG_PORT!=='5333'||env.AGENT_STUDIO_PG_DATABASE!=='agent_studio'||!Array.isArray(argv)||argv.length!==3||argv[2]!=='--serve'||typeof argv[1]!=='string'||!argv[1].startsWith('/')||argv[1].includes('//')||argv[1].split('/').some(v=>v==='.'||v==='..')||!Array.isArray(execArgv)||execArgv.length!==1||execArgv[0]!=='--experimental-strip-types')return null
 const leaf=argv[1].split('/').at(-1),pair=Object.hasOwn(entries,leaf)?entries[leaf]:null
 if(!pair||!argv[1].endsWith('/services/pg-api/src/'+leaf)||env.CREDENTIALS_DIRECTORY!=='/run/credentials/agentstudio-pg18-'+pair[1]+'.service')return null
 return pair[0]
}
export function workerStartupFailureData(entry,phase,error){
 if(!Object.values(entries).some(v=>v[0]===entry)||!phases.has(phase))return null
 let errorClass=null,sqlstate=null,errorCode=null
 try{if(isNativeError(error)&&!isProxy(error)){errorClass=classes.get(Object.getPrototypeOf(error))??'Error';const d=Object.getOwnPropertyDescriptor(error,'code'),code=d&&Object.hasOwn(d,'value')?d.value:null;if(typeof code==='string'){if(sqlstates.has(code))sqlstate=code;if(nodeCodes.has(code))errorCode=code}}}catch{errorClass=null;sqlstate=null;errorCode=null}
 return Object.freeze({event:'full069_original_worker_startup_failure',entry,phase,error_class:errorClass,sqlstate,error_code:errorCode,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
}
export function parseWorkerStartupFailureData(raw){
 if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)throw Error('worker_startup_observation_data')
 const keys=['event','entry','phase','error_class','sqlstate','error_code','observed_data_only','runtime_authorization','qualifies_run','production_GO'],ds=Object.getOwnPropertyDescriptors(raw)
 if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))throw Error('worker_startup_observation_data')
 const v=Object.fromEntries(keys.map(k=>[k,ds[k].value]))
 if(v.event!=='full069_original_worker_startup_failure'||!Object.values(entries).some(e=>e[0]===v.entry)||!phases.has(v.phase)||v.error_class!==null&&!['Error','TypeError','RangeError','SyntaxError','ReferenceError'].includes(v.error_class)||v.sqlstate!==null&&!sqlstates.has(v.sqlstate)||v.error_code!==null&&!nodeCodes.has(v.error_code)||v.observed_data_only!==true||['runtime_authorization','qualifies_run','production_GO'].some(k=>v[k]!==false))throw Error('worker_startup_observation_data')
 return Object.freeze(v)
}
let emitted=false
export function reportWorkerStartupFailure(phase,error){
 try{
  if(emitted)return
  const entry=workerStartupDiagnosticEntry(process.env,process.platform,process.getuid?.(),process.versions.node.split('.')[0],process.argv,process.execArgv)
  if(entry===null)return
  const data=workerStartupFailureData(entry,phase,error);if(data===null)return
  emitted=true;writeSync(2,JSON.stringify(data)+'\n')
 }catch{} // Closed stderr pipe/sink failures never replace the original error.
}
