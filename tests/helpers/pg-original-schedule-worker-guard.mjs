import {requireEphemeralPg18Ci} from '../../services/pg-api/src/pg18-ephemeral-ci-guard.mjs'
import {selectNativePg18UatCapabilities} from '../../services/pg-api/src/native-config-uat-policy.ts'
export const scheduleWorkerPurpose='YES_DISPOSABLE_ORIGINAL_SCHEDULE_WORKER_TLS_ONLY'
export const scheduleWorkerStory='original-scheduled-tasks-worker'
export const scheduleWorkerWorkflow='Agent Studio Original ScheduledTasks Worker synthetic PG18 verification'
export const scheduleWorkerModelOrigin='https://127.0.0.1:7459'
export function requireOriginalScheduleWorkerCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const refuse=()=>{throw Error('refuse_non_ephemeral_original_schedule_worker_ci')}
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==scheduleWorkerWorkflow||env.GITHUB_JOB!=='pg18-original-schedule-worker'||!['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME??'')||env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF!=='refs/heads/codex/pg18-worker-heartbeat-20261028'||env.AGENT_STUDIO_ORIGINAL_SCHEDULE_WORKER_CI!==scheduleWorkerPurpose||env.AGENT_STUDIO_ORIGINAL_SCHEDULE_WORKER_STORY!==scheduleWorkerStory||env.AGENT_STUDIO_ORIGINAL_SCHEDULE_WORKER_MODEL_ORIGIN!==scheduleWorkerModelOrigin||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_SCHEDULE_WORKER_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|schedules)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??''))refuse()
 for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DATABASE_URL','AGENT_STUDIO_PG_WORKER_PASSWORD_FILE','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY','OPENROUTER_API_KEY'])if(env[key]!==undefined)refuse()
 for(const key of Object.keys(env))if(/^AGENT_STUDIO_(?:ORIGINAL_.*|F\d+_GENUINE)_CI$/.test(key)&&key!=='AGENT_STUDIO_ORIGINAL_SCHEDULE_WORKER_CI'&&env[key]!==undefined)refuse()
 if(env.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED!=='true'||env.AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED!=='APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY'||env.AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED!=='true'||env.AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED!=='APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY')refuse()
 const target=requireEphemeralPg18Ci(env),origin='https://localhost:17443',policy=selectNativePg18UatCapabilities(env,true,origin,uid),required=['configurationWrites','runApprovalUat','workflowV2ExecutionUat','autonomousAgentUat','scheduleRuntimeUat','boundModelExecutionUat']
 if(required.some(key=>policy[key]!==true)||Object.entries(policy).some(([key,value])=>value===true&&!required.includes(key)))refuse()
 return Object.freeze({target,origin,head:env.GITHUB_SHA,policy:Object.freeze(policy),profile:scheduleWorkerStory,modelOrigin:scheduleWorkerModelOrigin,synthetic_model_TLS_only:true,commercial_provider_allowed:false,production_GO:false})
}
