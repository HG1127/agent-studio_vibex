// CI admission only, never database/identity attestation or production approval.
// Both original guards are retained; only this dedicated workflow/job is added.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
import {requireNativeBrowserCi} from '../../../../tests/pg-native-browser/ci-guard.mjs'
export const agentRunControlGenuineWorkflow='Agent Studio PG18 same-run control isolated verification'
export const agentRunControlGenuineJobs=Object.freeze({database:'pg18-agent-run-control-db',browser:'pg18-agent-run-control-browser'})
export function requireAgentRunControlGenuineCi(env=process.env,mode='database',platform=process.platform,uid=process.getuid?.()??0){
 const target=requireEphemeralPg18Ci(env)
 if(!Object.hasOwn(agentRunControlGenuineJobs,mode)||platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||process.versions.node.split('.')[0]!=='24'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==agentRunControlGenuineWorkflow||env.GITHUB_JOB!==agentRunControlGenuineJobs[mode]||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!/^refs\/heads\/[A-Za-z0-9_./-]+$/.test(env.GITHUB_REF??'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[1-9][0-9]{0,31}$/.test(env.GITHUB_RUN_ATTEMPT??'')||env.AGENT_STUDIO_F31_RUN_CONTROL_CI!=='SYNTHETIC_SAME_RUN_ONLY')throw Error('refuse_non_ephemeral_agent_run_control_ci')
 if(mode==='browser')requireNativeBrowserCi(env,platform,uid)
 return target
}
