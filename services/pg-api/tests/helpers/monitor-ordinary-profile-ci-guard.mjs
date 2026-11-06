import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'
// Separate schema-only hosted purpose. No074 Worker/source-egress grant is reused.
export function requireMonitorOrdinaryProfileCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 if(env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_CI!=='YES_DISPOSABLE_MONITOR074_ORDINARY077_SCHEMA_ONLY'||env.AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_SUITE!=='monitor074-ordinary077'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_MONITOR_ORDINARY_PROFILE_EXPECTED_HEAD!==env.GITHUB_SHA||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||Object.keys(env).some(k=>/^(?:AGENT_STUDIO_NATIVE_MONITOR07[34]_|AGENT_STUDIO_ORIGINAL_(?:PG_LOGIN|HOME07[012]|MONITOR07[34])_)/.test(k)))throw Error('monitor_ordinary_profile_ci_admission_refused')
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 return Object.freeze({target,head:env.GITHUB_SHA,profile:'monitor074-ordinary077',synthetic_only:true,runtime_authorization:false,production_GO:false})
}
