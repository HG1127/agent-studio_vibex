import {requireWebEgressGuardGenuineCi} from './web-egress-guard-genuine-guard.mjs'
export const webCitationCases=Object.freeze(['search_snippet','fetch_redirect','search_empty','search_challenge','fetch_empty_location'])
export function requireWebCitationBoundariesCi(env=process.env){
 if(env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_CI!=='YES_DISPOSABLE_WEB_CITATION_BOUNDARIES_ONLY'||!webCitationCases.includes(env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_CASE)||!/^[a-f0-9]{64}$/.test(env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_SOURCES_SHA256??'')||!/^[a-f0-9]{40}$/.test(env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_EXPECTED_HEAD??'')||env.AGENT_STUDIO_WEB_CITATION_BOUNDARIES_EXPECTED_HEAD!==env.GITHUB_SHA)throw Error('web_citation_boundaries_genuine_purpose_sources_required')
 return requireWebEgressGuardGenuineCi(env)
}
