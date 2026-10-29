// Pure dedicated-purpose guard. No pool, file read, source import or socket.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const agentPlanWorkflowGenuineWorkflow='Agent Studio F05 Plan Workflow genuine PG18 isolated verification'
export const agentPlanWorkflowGenuineJob='pg18-plan-workflow-genuine'
export const agentPlanWorkflowGenuineApproval='YES_DISPOSABLE_F05_ONLY'
const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
export function requireAgentPlanWorkflowGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentPlanWorkflowGenuineWorkflow||env.GITHUB_JOB!==agentPlanWorkflowGenuineJob||env.AGENT_STUDIO_F05_GENUINE_CI!==agentPlanWorkflowGenuineApproval||injections.some(key=>env[key]!==undefined))throw Error('refuse_non_ephemeral_agent_plan_workflow_genuine_ci')
  return requireEphemeralPg18Ci(env)
}
