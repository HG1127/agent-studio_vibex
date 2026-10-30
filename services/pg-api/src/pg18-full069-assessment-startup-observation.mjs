// Disposable diagnostic DATA only. Never startup, identity, SQL or lease authority.
import {isNativeError,isProxy} from 'node:util/types'
import {writeSync} from 'node:fs'
export const assessmentStartupDiagnosticPurpose='OBSERVE_DISPOSABLE_ORIGINAL_ASSESSMENT_STARTUP_ONLY'
const boundaries=Object.freeze({configuration:'configuration_refused',credential_read:'credential_refused',tls_validation:'tls_refused',pg_import:'module_refused',pool_create:'pool_refused',operator_audit:'operator_audit_refused',design_audit_import:'module_refused',design_pool_create:'pool_refused',design_operator_audit:'operator_audit_refused',worker_import:'module_refused',client_construct:'client_refused',heartbeat_open:'heartbeat_binding_refused',worker_construct:'worker_refused',design_worker_import:'module_refused',design_client_construct:'client_refused',design_worker_construct:'worker_refused',startup_publish:'startup_publish_refused',loop_start:'loop_refused',cli_entry:'cli_refused'})
const sqlstates=new Set(['28P01','28000','42501','42704','42P01','42883','3F000','3D000','53300','53400','55000','57P01','08001','08006','57014','25P02','25006','XX000'])
const nodeCodes=new Set(['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT','ERR_REQUIRE_ESM','ERR_UNKNOWN_FILE_EXTENSION','ERR_INVALID_TYPESCRIPT_SYNTAX','ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING','ERR_INVALID_ARG_TYPE','ENOENT','EACCES','EPERM','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE'])
const classes=new Map([[Error.prototype,'Error'],[TypeError.prototype,'TypeError'],[RangeError.prototype,'RangeError'],[SyntaxError.prototype,'SyntaxError'],[ReferenceError.prototype,'ReferenceError']])
function dataRecord(raw,keys){if(!raw||typeof raw!=='object'||isProxy(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('assessment_startup_observation_data');const ds=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))throw Error('assessment_startup_observation_data');return Object.fromEntries(keys.map(k=>[k,ds[k].value]))}
function exactArray(raw,expected){if(isProxy(raw)||!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype)return false;const ds=Object.getOwnPropertyDescriptors(raw);return ds.length?.value===expected.length&&Reflect.ownKeys(ds).length===expected.length+1&&expected.every((v,i)=>ds[i]?.enumerable&&Object.hasOwn(ds[i],'value')&&ds[i].value===v)}
export function assessmentStartupDiagnosticEntry(env,platform,uid,nodeMajor,argv,execArgv){
 try{
  if(!env||typeof env!=='object'||isProxy(env)||platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||nodeMajor!=='24'||!exactArray(execArgv,['--experimental-strip-types'])||isProxy(argv)||!Array.isArray(argv)||Object.getPrototypeOf(argv)!==Array.prototype)return null
  const ds=Object.getOwnPropertyDescriptors(argv);if(ds.length?.value!==4||Reflect.ownKeys(ds).length!==5||[0,1,2,3].some(i=>!ds[i]?.enumerable||!Object.hasOwn(ds[i],'value')))return null
  const filename=ds[1].value;if(ds[2].value!=='--serve'||ds[3].value!=='worker'||typeof filename!=='string'||!filename.startsWith('/')||filename.includes('//')||filename.split('/').some(v=>v==='.'||v==='..')||!filename.endsWith('/services/pg-api/src/agent-assessment-service.ts'))return null
  const required={AGENT_STUDIO_FULL069_ASSESSMENT_STARTUP_DIAGNOSTICS:assessmentStartupDiagnosticPurpose,AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:'true',AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:'APPROVE_ISOLATED_PG18_WORKER_TRIAL_ONLY',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY',AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',CREDENTIALS_DIRECTORY:'/run/credentials/agentstudio-pg18-review-worker.service'}
  const ed=Object.getOwnPropertyDescriptors(env);if(Object.entries(required).some(([k,v])=>!ed[k]?.enumerable||!Object.hasOwn(ed[k],'value')||ed[k].value!==v))return null
  return 'assessment'
 }catch{return null}
}
export function assessmentStartupFailureData(phase,error){
 if(typeof phase!=='string'||!Object.hasOwn(boundaries,phase))return null
 let errorClass=null,sqlstate=null,errorCode=null
 try{if(isNativeError(error)&&!isProxy(error)){errorClass=classes.get(Object.getPrototypeOf(error))??'Error';const d=Object.getOwnPropertyDescriptor(error,'code'),value=d&&Object.hasOwn(d,'value')?d.value:null;if(typeof value==='string'){if(sqlstates.has(value))sqlstate=value;if(nodeCodes.has(value))errorCode=value}}}catch{errorClass=null;sqlstate=null;errorCode=null}
 return Object.freeze({event:'full069_assessment_worker_startup_failure',entry:'assessment',phase,refusal_class:boundaries[phase],error_class:errorClass,sqlstate,error_code:errorCode,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
}
export function parseAssessmentStartupFailureData(raw){
 const r=dataRecord(raw,['event','entry','phase','refusal_class','error_class','sqlstate','error_code','observed_data_only','runtime_authorization','qualifies_run','production_GO'])
 if(r.event!=='full069_assessment_worker_startup_failure'||r.entry!=='assessment'||typeof r.phase!=='string'||!Object.hasOwn(boundaries,r.phase)||r.refusal_class!==boundaries[r.phase]||r.error_class!==null&&!['Error','TypeError','RangeError','SyntaxError','ReferenceError'].includes(r.error_class)||r.sqlstate!==null&&!sqlstates.has(r.sqlstate)||r.error_code!==null&&!nodeCodes.has(r.error_code)||r.sqlstate!==null&&r.error_code!==null||r.error_class===null&&(r.sqlstate!==null||r.error_code!==null)||r.observed_data_only!==true||['runtime_authorization','qualifies_run','production_GO'].some(k=>r[k]!==false))throw Error('assessment_startup_observation_data')
 return Object.freeze(r)
}
let emitted=false
export function reportAssessmentStartupFailure(phase,error){
 try{if(emitted||assessmentStartupDiagnosticEntry(process.env,process.platform,process.getuid?.(),process.versions.node.split('.')[0],process.argv,process.execArgv)===null)return;const data=assessmentStartupFailureData(phase,error);if(data===null)return;emitted=true;writeSync(2,JSON.stringify(data)+'\n')}catch{}
}
