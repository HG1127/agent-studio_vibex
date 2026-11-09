import {requireOriginalLoginBrowserCi} from '../../../../tests/helpers/pg-original-login-browser-guard.mjs'
import {requireAgentDesignGenuineCi} from './agent-design-genuine-fixture.mjs'

export const originalLoginHome071Purpose='YES_DISPOSABLE_ORIGINAL_LOGIN_HOME071_ONLY'
/** Independent browser purpose; never rewrites the actual job or TCP purpose. */
export function requireOriginalLoginHome071Ci(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const browser=requireOriginalLoginBrowserCi(env,platform,uid)
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI!==originalLoginHome071Purpose||
    env.AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_PROFILE!=='original-login-home071'||
    env.AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_STORY!=='original-login'||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD!==env.GITHUB_SHA||
    !/^refs\/heads\/codex\/pg18-(?:worker-heartbeat|agent-design)-[A-Za-z0-9._/-]+$/.test(env.GITHUB_REF??'')||
    ['AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME070_SUITE','AGENT_STUDIO_ORIGINAL_HOME070_EXPECTED_HEAD',
     'AGENT_STUDIO_ORIGINAL_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME071_SUITE','AGENT_STUDIO_ORIGINAL_HOME071_EXPECTED_HEAD'].some(key=>env[key]!==undefined))
  throw Error('original_login_home071_ci_admission_refused')
 return Object.freeze({profile:'original-login-home071',catalog_profile:'original-agent-catalog071',head:env.GITHUB_SHA,target,origin:browser.origin,synthetic_only:true,production_GO:false})
}
