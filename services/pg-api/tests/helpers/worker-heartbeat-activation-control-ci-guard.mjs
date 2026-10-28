// Synthetic CI authority only. Import-safe; no driver, filesystem, SQL or
// Docker operation. The controller's production source/runtime/approval gates
// are independent and cannot accept one of these references as authority.
import {randomBytes} from 'node:crypto'
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

const prefix='AGENT_STUDIO_TELEMETRY_CONTROL_CI_'
const repository='HG1127/agent-studio_vibex'
const workflow='Agent Studio PG18 telemetry control isolated verification'
const job='pg18-telemetry-control-domain'
const workflowFile='.github/workflows/pg18-telemetry-control-ci.yml'
const capabilities=new WeakMap()
const refuse=()=>{throw Error('refuse_non_ephemeral_telemetry_control_ci')}
function values(raw){
 if(!raw||typeof raw!=='object')return refuse()
 const ds=Object.getOwnPropertyDescriptors(raw),keys=Reflect.ownKeys(raw)
 if(keys.length>4096||keys.some(k=>typeof k!=='string'||!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')||ds[k].value!==undefined&&typeof ds[k].value!=='string'))return refuse()
 return Object.assign(Object.create(null),Object.fromEntries(keys.map(k=>[k,ds[k].value])))
}
/** Public immutable data; does not grant connection or process authority. */
export function planWorkerHeartbeatActivationControlCi(raw=process.env){
 const env=values(raw),main=requireEphemeralPg18Ci(env)
 const branch=env.GITHUB_REF,run=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT
 if(env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!==repository||
  env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
  !/^[1-9][0-9]{0,31}$/.test(run??'')||!/^[1-9][0-9]{0,31}$/.test(attempt??'')||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||typeof branch!=='string'||
  !/^refs\/heads\/codex\/pg18-[A-Za-z0-9][A-Za-z0-9._/-]{0,179}$/.test(branch)||
  branch.includes('..')||branch.includes('//')||branch.endsWith('/')||
  env.GITHUB_WORKFLOW_REF!==repository+'/'+workflowFile+'@'+branch||
  env[prefix+'MODE']!=='OWNED_SYNTHETIC_CONTROL_ONLY'||
  env[prefix+'WRITE_APPROVED']!=='YES_DISPOSABLE_CONTROL_FIXTURE_ONLY')return refuse()
 for(const key of Object.keys(env)){
  if(key.startsWith(prefix)&&!['MODE','WRITE_APPROVED'].includes(key.slice(prefix.length)))return refuse()
  if(['TELEMETRY_DATABASE_URL','TELEMETRY_PGHOST','TELEMETRY_PGPORT','TELEMETRY_PGDATABASE','CONTROL_DATABASE_URL','CONTROL_PGHOST','CONTROL_PGPORT','CONTROL_PGDATABASE'].includes(key))return refuse()
 }
 return Object.freeze({format:'worker_heartbeat_activation_control_ci_plan_v1',main,
  run,attempt,source_revision:env.GITHUB_SHA,branch,
  image:'pgvector/pgvector:0.8.7-pg18',new_container_port:5333,
  fixed_native_database:'agent_studio',fixed_telemetry_database:'agent_studio_telemetry',
  production_target_reused:false,production_capability:false,provider_calls:false,production_cutover_allowed:false})
}
const host=()=>{
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||
  process.versions.node.split('.')[0]!=='24'||process.execArgv.some(v=>v!=='--experimental-strip-types'))return refuse()
}
/** Only the actual hosted process can mint the opaque fixture reference. */
export function requireWorkerHeartbeatActivationControlCi(env=process.env){
 if(env!==process.env)return refuse()
 host()
 const plan=planWorkerHeartbeatActivationControlCi(env)
 const proof=Object.freeze(Object.create(null))
 capabilities.set(proof,{plan,nonce:randomBytes(32).toString('hex')})
 return proof
}
function state(proof){
 const found=capabilities.get(proof);if(!found)return refuse()
 host()
 const now=planWorkerHeartbeatActivationControlCi(process.env)
 if(JSON.stringify(now)!==JSON.stringify(found.plan))return refuse()
 return found
}
/** Main is the untouched sponsor, never the controller or a target alias. */
export function workerHeartbeatActivationControlCiMainOptions(proof){
 const s=state(proof)
 return Object.freeze({...s.plan.main,max:2,ssl:false,options:'',query_timeout:20000})
}
/** Fixed fixture data; knowledge of a nonce does not mint a private lease. */
export function workerHeartbeatActivationControlCiDescriptor(proof){
 const s=state(proof)
 return Object.freeze({run:s.plan.run,attempt:s.plan.attempt,source_revision:s.plan.source_revision,
  nonce:s.nonce,image:s.plan.image,port:s.plan.new_container_port,
  native_database:s.plan.fixed_native_database,telemetry_database:s.plan.fixed_telemetry_database})
}
