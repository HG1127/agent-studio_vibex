// Pure purpose guard. No source loading, pool, SQL, process, file or socket.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const toolHubGenuineWorkflow='Agent Studio F16-19 Tool Hub genuine PG18 isolated verification'
export const toolHubGenuineApproval='YES_DISPOSABLE_F16_19_TOOL_HUB_ONLY'
const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
export function requireToolHubGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const api=env.GITHUB_JOB==='pg18-tool-hub-genuine'&&['flow','database'].includes(env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE),browser=env.GITHUB_JOB==='pg18-tool-hub-browser'&&env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE==='browser'
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==toolHubGenuineWorkflow||!api&&!browser||env.AGENT_STUDIO_TOOL_HUB_GENUINE_CI!==toolHubGenuineApproval||injections.some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_tool_hub_genuine_ci')
 return requireEphemeralPg18Ci(env)
}
