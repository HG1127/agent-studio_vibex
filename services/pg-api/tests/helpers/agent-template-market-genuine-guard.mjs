// Pure purpose wrapper. No file/module source loading, pools, SQL or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const agentTemplateMarketGenuineWorkflow='Agent Studio F07 Template Market genuine PG18 isolated verification'
export const agentTemplateMarketGenuineApproval='YES_DISPOSABLE_F07_ONLY'
export const agentTemplateMarketGenuineApiJob='pg18-template-market-genuine'
export const agentTemplateMarketGenuineBrowserJob='pg18-template-market-browser'
const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
export function requireAgentTemplateMarketGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  const job=env.GITHUB_JOB,suite=env.AGENT_STUDIO_F07_GENUINE_SUITE
  const api=job===agentTemplateMarketGenuineApiJob&&['flow','database'].includes(suite)
  const browser=job===agentTemplateMarketGenuineBrowserJob&&suite==='browser'
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
    env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentTemplateMarketGenuineWorkflow||!api&&!browser||
    env.AGENT_STUDIO_F07_GENUINE_CI!==agentTemplateMarketGenuineApproval||injections.some(key=>env[key]!==undefined))throw Error('refuse_non_ephemeral_agent_template_market_genuine_ci')
  return requireEphemeralPg18Ci(env)
}
