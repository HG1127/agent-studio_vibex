// Import-safe CI planning only. No database driver, SQL, socket or file read.
// The original disposable-main guard remains mandatory and unchanged.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

const prefix='AGENT_STUDIO_WORKER_HEARTBEAT_CI_'
const workflow='Agent Studio PG18 worker heartbeat isolated verification'
const job='pg18-worker-heartbeat-domain'
const granted=new WeakSet()
const refuse=()=>{throw Error('refuse_non_ephemeral_worker_heartbeat_ci')}

// This is a pure plan, not permission to connect. Only the real-host gate below
// mints a capability; callers cannot turn a cloned plan into target authority.
export function planWorkerHeartbeatCi(env=process.env){
 const main=requireEphemeralPg18Ci(env)
 if(env[prefix+'MODE']!=='SYNTHETIC_DOMAIN_ONLY'||env[prefix+'WRITE_APPROVED']!=='YES_DISPOSABLE_TELEMETRY_ONLY'||
  Object.keys(env).some(k=>env[k]!==undefined&&(k.startsWith(prefix)&&!['MODE','WRITE_APPROVED'].includes(k.slice(prefix.length))||
    ['TELEMETRY_DATABASE_URL','TELEMETRY_PGHOST','TELEMETRY_PGPORT','TELEMETRY_PGDATABASE'].includes(k))))refuse()
 return Object.freeze({main,telemetry_database:'agent_studio_telemetry',creates_production_database:false,
  old_database_reused:false,provider_calls:false,production_cutover_allowed:false})
}

export function requireWorkerHeartbeatCi(env=process.env){
 const plan=planWorkerHeartbeatCi(env)
 if(process.platform!=='linux'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
  env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job)refuse()
 granted.add(plan)
 return plan
}

// Options may only address the original disposable main DB or the fixed NEW
// telemetry DB in that same guarded service. No arbitrary DB/host/login input.
export function workerHeartbeatCiAdminOptions(capability,kind){
 if(!granted.has(capability)||!['main','telemetry'].includes(kind))refuse()
 return Object.freeze({...capability.main,database:kind==='main'?capability.main.database:capability.telemetry_database,
  max:2,statement_timeout:15000,query_timeout:20000})
}
