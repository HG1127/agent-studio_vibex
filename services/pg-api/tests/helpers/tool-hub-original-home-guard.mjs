// Pure dedicated-purpose admission. No SQL, sockets, identity or supplied owner.
import {requireToolHubGenuineCi} from './tool-hub-genuine-guard.mjs'
export function selectToolHubOriginalHomePurpose(env){
 if(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_HOME_CI!=='YES_DISPOSABLE_ORIGINAL_TOOL_HUB_HOME_READ_ONLY')throw Error('original_toolhub_home_explicit_purpose_required')
 if(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_CI!=='YES_DISPOSABLE_ORIGINAL_TOOL_HUB_ONLY'||env.AGENT_STUDIO_TOOL_HUB_GENUINE_SUITE!=='browser'||env.GITHUB_JOB!=='pg18-tool-hub-browser')throw Error('original_toolhub_home_browser_purpose_required')
 if(!/^[a-f0-9]{40}$/.test(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_EXPECTED_HEAD??'')||env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_SOURCES_SHA256??'')||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_ORIGINAL_TOOL_HUB_HOME_SOURCES_SHA256??''))throw Error('original_toolhub_home_reviewed_head_sources_required')
 return Object.freeze({configurationWrites:false,allowNativeLocalAgentSpecs:false,allowMonitorBusinessSpecs:false,allowOriginalRoleUi:false})
}
export function requireToolHubOriginalHomeCi(env=process.env){selectToolHubOriginalHomePurpose(env);return requireToolHubGenuineCi(env)}
export const toolHubOriginalHomeBefore069=Object.freeze(['066_agent_approval_delegation','068_agent_public_callers'])
export const toolHubOriginalHomeAfter069=Object.freeze(['070_home_authoring'])
export function isToolHubOriginalHomeRoute(raw){return typeof raw==='string'&&(raw==='/api/v2/original-ui/agent-specs'||raw.startsWith('/api/v2/original-ui/agent-specs?')||raw.startsWith('/api/v2/original-ui/agent-specs/'))}
