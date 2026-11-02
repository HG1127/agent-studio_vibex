import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'
// Pure admission only. This module opens no Pool, file, Worker or socket.
export function requireNativeMonitor074Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_NATIVE_MONITOR074_CI!=='YES_DISPOSABLE_MONITOR074_LIVE_CHAIN_ONLY'||env.AGENT_STUDIO_NATIVE_MONITOR074_SUITE!=='monitor074'||env.AGENT_STUDIO_NATIVE_MONITOR074_SOURCE_EGRESS!=='APPROVE_ONE_DECLARED_SYNTHETIC_HTTPBIN_SOURCE_ONLY'||
 !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_NATIVE_MONITOR074_EXPECTED_HEAD!==env.GITHUB_SHA||
 !/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||
 ['AGENT_STUDIO_NATIVE_MONITOR073_CI','AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME072_CI','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI'].some(k=>env[k]!==undefined))throw Error('native_monitor074_ci_admission_refused')
 return Object.freeze({target,head:env.GITHUB_SHA,synthetic_only:true,profile:'monitor074-live-chain',model_provider_calls:0,declared_source_egress_max:2,runtime_authorization:false,production_GO:false})
}
