import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const localExecutorOperatorWorkflow='Agent Studio Native Local Executor operator isolated PG18 verification'
export function requireLocalExecutorOperatorCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==localExecutorOperatorWorkflow||env.GITHUB_JOB!=='pg18-local-executor-operator'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.AGENT_STUDIO_EXECUTOR_OPERATOR_CI!=='YES_DISPOSABLE_EXECUTOR_OPERATOR_ONLY'||['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_local_executor_operator_ci')
 return requireEphemeralPg18Ci(env)
}
