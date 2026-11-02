import {requireEphemeralPg18Ci} from '../../services/pg-api/src/pg18-ephemeral-ci-guard.mjs'
import {selectNativePg18UatCapabilities} from '../../services/pg-api/src/native-config-uat-policy.ts'
export const originalSchedules078Purpose='YES_DISPOSABLE_ORIGINAL_SCHEDULES078_ONLY'
export const originalSchedules078Story='original-scheduled-tasks078'
export const originalSchedules078Workflow='Agent Studio Original ScheduledTasks078 genuine PG18 browser verification'
export function requireOriginalSchedules078Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const refuse=()=>{throw Error('refuse_non_ephemeral_original_schedules078_ci')}
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==originalSchedules078Workflow||env.GITHUB_JOB!=='pg18-original-schedules078'||!['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME??'')||env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF!=='refs/heads/codex/pg18-worker-heartbeat-20261028'||env.AGENT_STUDIO_ORIGINAL_SCHEDULES078_CI!==originalSchedules078Purpose||env.AGENT_STUDIO_ORIGINAL_SCHEDULES078_STORY!==originalSchedules078Story||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_SCHEDULES078_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|schedules)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))refuse()
 for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','AGENT_STUDIO_F01_GENUINE_CI'])if(env[name]!==undefined)refuse()
 for(const name of Object.keys(env))if(/^AGENT_STUDIO_ORIGINAL_.*_CI$/.test(name)&&name!=='AGENT_STUDIO_ORIGINAL_SCHEDULES078_CI'&&env[name]!==undefined)refuse()
 const target=requireEphemeralPg18Ci(env),origin='https://localhost:17443',policy=selectNativePg18UatCapabilities(env,true,origin,uid),required=['configurationWrites','workflowV2ExecutionUat','autonomousAgentUat','scheduleRuntimeUat']
 if(required.some(key=>policy[key]!==true)||Object.entries(policy).some(([key,value])=>value===true&&!required.includes(key)))refuse()
 return Object.freeze({target,origin,head:env.GITHUB_SHA,policy:Object.freeze(policy),profile:'original-schedules078-disposable-authority-queue-only',synthetic_only:true,Worker_started:false,provider_execution_allowed:false,production_GO:false})
}
