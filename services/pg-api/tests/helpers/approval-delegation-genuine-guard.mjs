// Pure purpose wrapper. No file/module source loading, pools, SQL or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const approvalDelegationGenuineWorkflow='Agent Studio F27 Exact Step Approval Delegation genuine PG18 isolated verification'
export const approvalDelegationGenuineApproval='YES_DISPOSABLE_F27_ONLY'
export const approvalDelegationGenuineApiJob='pg18-approval-delegation-genuine'
export const approvalDelegationGenuineBrowserJob='pg18-approval-delegation-browser'
const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
export function requireApprovalDelegationGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  const job=env.GITHUB_JOB,suite=env.AGENT_STUDIO_F27_GENUINE_SUITE
  const api=job===approvalDelegationGenuineApiJob&&['flow','database'].includes(suite)
  const browser=job===approvalDelegationGenuineBrowserJob&&suite==='browser'
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
    env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==approvalDelegationGenuineWorkflow||!api&&!browser||
    env.AGENT_STUDIO_F27_GENUINE_CI!==approvalDelegationGenuineApproval||injections.some(key=>env[key]!==undefined))throw Error('refuse_non_ephemeral_approval_delegation_genuine_ci')
  return requireEphemeralPg18Ci(env)
}
