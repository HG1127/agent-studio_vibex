import {requireToolHubGenuineCi} from '../../services/pg-api/tests/helpers/tool-hub-genuine-guard.mjs'
export function requireOriginalToolHubGenuineCi(env=process.env){
 if(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_CI!=='YES_DISPOSABLE_ORIGINAL_TOOL_HUB_ONLY')throw Error('original_toolhub_genuine_explicit_purpose_required')
 if(!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_SOURCES_SHA256??'')||!/^[a-f0-9]{40}$/.test(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_EXPECTED_HEAD??'')||env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_EXPECTED_HEAD!==env.GITHUB_SHA)throw Error('original_toolhub_genuine_reviewed_head_sources_required')
 return requireToolHubGenuineCi(env)
}
