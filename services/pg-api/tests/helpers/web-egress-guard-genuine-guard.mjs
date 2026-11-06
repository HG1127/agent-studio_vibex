import {requireToolHubGenuineCi} from './tool-hub-genuine-guard.mjs'
export function requireWebEgressGuardGenuineCi(env=process.env){
 if(env.AGENT_STUDIO_WEB_EGRESS_GUARD_CI!=='YES_DISPOSABLE_WEB_EGRESS_GUARD_ONLY'||env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE!=='flow'||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_WEB_EGRESS_GUARD_SOURCES_SHA256??'')||env.AGENT_STUDIO_WEB_EGRESS_GUARD_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.AGENT_STUDIO_WEB_EGRESS_GUARD_EXPECTED_HEAD??''))throw Error('web_egress_guard_genuine_purpose_sources_required')
 return requireToolHubGenuineCi(env)
}
