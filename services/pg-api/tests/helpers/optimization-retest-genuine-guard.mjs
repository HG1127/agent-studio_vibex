// Pure independent F29 browser purpose; no fs, dependencies, SQL or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const optimizationRetestWorkflow='Agent Studio F29 Employee Optimization Retest genuine PG18 browser verification'
export const optimizationRetestApproval='YES_DISPOSABLE_F29_EMPLOYEE_RETEST_ONLY'
export const optimizationRetestBrowserJob='pg18-optimization-retest-browser'
export function requireOptimizationRetestGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const injections=['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==optimizationRetestWorkflow||env.GITHUB_JOB!==optimizationRetestBrowserJob||env.AGENT_STUDIO_F29_RETEST_GENUINE_SUITE!=='browser'||env.AGENT_STUDIO_F29_RETEST_GENUINE_CI!==optimizationRetestApproval||injections.some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_optimization_retest_genuine_ci')
 return requireEphemeralPg18Ci(env)
}
