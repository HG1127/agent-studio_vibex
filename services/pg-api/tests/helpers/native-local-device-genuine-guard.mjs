// Purpose guard is pure and precedes filesystem, driver, pool and socket use.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'
export const nativeLocalDeviceGenuineWorkflow='Agent Studio F20 F21 Native Local Devices genuine PG18 isolated verification'
export const nativeLocalDeviceEmployeeBrowserWorkflow='Agent Studio F20 F21 Native Local Devices genuine employee browser verification'
export function requireNativeLocalDeviceGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const job=env.GITHUB_JOB,suite=env.AGENT_STUDIO_F20_F21_GENUINE_SUITE,api=job==='pg18-local-device-genuine'&&['flow','database'].includes(suite),browser=job==='pg18-local-device-browser'&&suite==='browser',executor=job==='pg18-local-device-executor'&&suite==='executor',workflow=env.GITHUB_WORKFLOW===nativeLocalDeviceGenuineWorkflow||browser&&env.GITHUB_WORKFLOW===nativeLocalDeviceEmployeeBrowserWorkflow
 if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||!workflow||!api&&!browser&&!executor||env.AGENT_STUDIO_F20_F21_GENUINE_CI!=='YES_DISPOSABLE_F20_F21_ONLY'||['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].some(k=>env[k]!==undefined))throw Error('refuse_non_ephemeral_native_local_device_genuine_ci')
 return requireEphemeralPg18Ci(env)
}
