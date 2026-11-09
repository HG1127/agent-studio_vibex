import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'
// Pure purpose admission only. No importer, DB/socket/file/provider effect.
export function requireNativeMonitor073Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_NATIVE_MONITOR073_CI!=='YES_DISPOSABLE_MONITOR073_METADATA_ONLY'||env.AGENT_STUDIO_NATIVE_MONITOR073_SUITE!=='monitor073'||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_NATIVE_MONITOR073_EXPECTED_HEAD!==env.GITHUB_SHA||
  !/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||
  ['AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME072_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI'].some(k=>env[k]!==undefined))throw Error('native_monitor073_ci_admission_refused')
 return Object.freeze({target,head:env.GITHUB_SHA,synthetic_only:true,profile:'monitor073-quarantined-metadata',runtime_authorization:false,production_GO:false})
}
