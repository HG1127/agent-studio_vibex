// Pure named-purpose gate; no dependency loading, filesystem, SQL or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const agentCallerGenuineWorkflow='Agent Studio F11 F12 Published Agent callers genuine PG18 isolated verification'
export const agentCallerGenuineApproval='YES_DISPOSABLE_F11_F12_CALLERS_ONLY'
export const agentCallerGenuineApiJob='pg18-agent-caller-genuine'
export const agentCallerGenuineBrowserJob='pg18-agent-caller-browser'
export function requireAgentCallerGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'],api=env.GITHUB_JOB===agentCallerGenuineApiJob&&['flow','database'].includes(env.AGENT_STUDIO_F11_F12_GENUINE_SUITE),browser=env.GITHUB_JOB===agentCallerGenuineBrowserJob&&env.AGENT_STUDIO_F11_F12_GENUINE_SUITE==='browser'
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentCallerGenuineWorkflow||!api&&!browser||env.AGENT_STUDIO_F11_F12_GENUINE_CI!==agentCallerGenuineApproval||injections.some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_agent_caller_genuine_ci')
 return requireEphemeralPg18Ci(env)
}
