// Pure and side-effect free. Call before importing a driver or creating any
// process, file, model transport, browser, socket or database connection.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const agentCreateJourneyGenuineWorkflow='Agent Studio F02 employee creation genuine PG18 browser verification'
export function requireAgentCreateJourneyGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentCreateJourneyGenuineWorkflow||env.GITHUB_JOB!=='pg18-agent-create-journey-browser'||env.AGENT_STUDIO_F02_GENUINE_CI!=='YES_DISPOSABLE_F02_EMPLOYEE_JOURNEY_ONLY'||env.AGENT_STUDIO_F02_GENUINE_SUITE!=='browser'||['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_agent_create_journey_ci')
 return requireEphemeralPg18Ci(env)
}
