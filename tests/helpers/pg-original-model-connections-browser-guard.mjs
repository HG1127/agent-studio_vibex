import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
export const originalModelConnectionsPurpose='YES_DISPOSABLE_ORIGINAL_MODEL_CONNECTIONS_ONLY'
export function requireOriginalModelConnectionsBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_CI!==originalModelConnectionsPurpose||env.AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_STORY!=='original-model-connections'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_MODEL_CONNECTIONS_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||['AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI','AGENT_STUDIO_ORIGINAL_OVERVIEW_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','AGENT_STUDIO_ORIGINAL_MONITOR073_CI'].some(key=>env[key]!==undefined))throw Error('original_model_connections_browser_admission_refused')
 return Object.freeze({profile:'original-model-connections070071072073',target,head:env.GITHUB_SHA,origin:'https://localhost:17443',synthetic_only:true,production_GO:false})
}
