// Pure purpose wrapper. No file/module source loading, pools, SQL or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const agentInternalShareGenuineWorkflow='Agent Studio F08 Internal Template Share genuine PG18 isolated verification'
export const agentInternalShareGenuineApproval='YES_DISPOSABLE_F08_ONLY'
export const agentInternalShareGenuineApiJob='pg18-internal-share-genuine'
export const agentInternalShareGenuineBrowserJob='pg18-internal-share-browser'
const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
export function requireAgentInternalShareGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  const job=env.GITHUB_JOB,suite=env.AGENT_STUDIO_F08_GENUINE_SUITE
  const api=job===agentInternalShareGenuineApiJob&&['flow','database'].includes(suite)
  const browser=job===agentInternalShareGenuineBrowserJob&&suite==='browser'
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
    env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentInternalShareGenuineWorkflow||!api&&!browser||
    env.AGENT_STUDIO_F08_GENUINE_CI!==agentInternalShareGenuineApproval||injections.some(key=>env[key]!==undefined))throw Error('refuse_non_ephemeral_agent_internal_share_genuine_ci')
  return requireEphemeralPg18Ci(env)
}
