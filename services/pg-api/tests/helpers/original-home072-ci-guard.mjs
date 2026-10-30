import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'
export function requireOriginalHome072Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_ORIGINAL_HOME072_CI!=='YES_DISPOSABLE_HOME_KNOWLEDGE072_ONLY'||env.AGENT_STUDIO_ORIGINAL_HOME072_SUITE!=='home072'||!/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_HOME072_EXPECTED_HEAD!==env.GITHUB_SHA||['070','071'].some(profile=>['CI','SUITE','EXPECTED_HEAD'].some(suffix=>env['AGENT_STUDIO_ORIGINAL_HOME'+profile+'_'+suffix]!==undefined)))throw Error('original_home072_ci_admission_refused')
 return Object.freeze({profile:'original-home-knowledge-statistics072',head:env.GITHUB_SHA,target,synthetic_only:true,production_GO:false})
}
