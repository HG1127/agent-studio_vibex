// Pure independent071 admission. Reuses only the original F01 target guard.
import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'
export const originalHome071CiPurpose='YES_DISPOSABLE_ORIGINAL_CATALOG071_ONLY'
export function requireOriginalHome071Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_ORIGINAL_HOME071_CI!==originalHome071CiPurpose||env.AGENT_STUDIO_ORIGINAL_HOME071_SUITE!=='home071'||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_HOME071_EXPECTED_HEAD!==env.GITHUB_SHA||
  !/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||
  ['AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME070_SUITE','AGENT_STUDIO_ORIGINAL_HOME070_EXPECTED_HEAD'].some(key=>env[key]!==undefined))throw Error('original_home071_ci_admission_refused')
 return Object.freeze({profile:'original-agent-catalog071',head:env.GITHUB_SHA,target,synthetic_only:true,production_GO:false})
}
