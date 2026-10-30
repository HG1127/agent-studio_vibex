// PROPOSAL: independent original-page purpose inside the existing F08 browser
// job. No effects, job impersonation, original-login permit or receipt reuse.
import {requireAgentInternalShareGenuineCi} from '../../services/pg-api/tests/helpers/agent-internal-share-genuine-guard.mjs'
export const originalInternalSharePurpose='YES_DISPOSABLE_ORIGINAL_INTERNAL_SHARE_ONLY'
export function requireOriginalInternalShareBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentInternalShareGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-internal-share-browser'||env.AGENT_STUDIO_F08_GENUINE_SUITE!=='browser'||
  env.AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI!==originalInternalSharePurpose||
  env.AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_STORY!=='original-internal-share'||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_EXPECTED_HEAD!==env.GITHUB_SHA||
  !/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||
  ['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME071_CI'].some(key=>env[key]!==undefined))
  throw Error('original_internal_share_browser_admission_refused')
 return Object.freeze({profile:'original-internal-share-page',target,head:env.GITHUB_SHA,origin:'https://localhost:17443',synthetic_only:true,production_GO:false})
}
