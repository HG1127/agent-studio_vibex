// Pure additive purpose. Existing F16 and fresh-PG admission remain unchanged.
import {requireToolHubGenuineCi,originalToolHubGenuineWorkflow} from './tool-hub-genuine-guard.mjs'
export const originalResourceWorkflowFile='.github/workflows/pg18-original-resource-read-ci.yml'
export const originalResourceApproval='YES_DISPOSABLE_ORIGINAL_RESOURCE_READ_ONLY'
export function originalResourceCase(raw){if(raw!=='harness'&&raw!=='execution_51')throw Error('one_original_resource_case_per_fresh_job_required');return raw}
export function requireOriginalResourceReadCi(env=process.env,selected=env.AGENT_STUDIO_ORIGINAL_RESOURCE_CASE,platform=process.platform,uid=process.getuid?.()??0){
 const storyCase=originalResourceCase(selected),ref='refs/heads/codex/pg18-worker-heartbeat-20261028'
 if(env.AGENT_STUDIO_ORIGINAL_RESOURCE_CI!==originalResourceApproval||env.AGENT_STUDIO_ORIGINAL_RESOURCE_CASE!==storyCase||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_WORKFLOW!==originalToolHubGenuineWorkflow||env.GITHUB_REF!==ref||env.GITHUB_WORKFLOW_REF!==env.GITHUB_REPOSITORY+'/'+originalResourceWorkflowFile+'@'+ref||env.GITHUB_JOB!=='pg18-tool-hub-browser'||env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE!=='browser'||!/^[a-f0-9]{40}$/.test(env.AGENT_STUDIO_ORIGINAL_RESOURCE_EXPECTED_HEAD??'')||env.AGENT_STUDIO_ORIGINAL_RESOURCE_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_RESOURCE_SOURCES_SHA256??''))throw Error('original_resource_explicit_fresh_job_purpose_required')
 return Object.freeze({storyCase,target:requireToolHubGenuineCi(env,platform,uid)})
}
export function originalResourceBefore069(storyCase){originalResourceCase(storyCase);return storyCase==='execution_51'?['066_agent_approval_delegation','067_native_local_devices','068_agent_public_callers']:[]}
export function originalResourceOwnerRoute(raw,storyCase){originalResourceCase(storyCase);return typeof raw==='string'&&(raw==='/api/v2/own-overview'||raw==='/api/v2/original-ui/harness-snapshot'||storyCase==='execution_51'&&(raw==='/api/v2/local-devices'||raw==='/api/v2/local-device-pairings'))}
