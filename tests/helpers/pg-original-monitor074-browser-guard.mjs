import {requireAgentDesignGenuineCi} from '../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
export function requireOriginalMonitor074BrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireAgentDesignGenuineCi(env,platform,uid)
 if(env.GITHUB_JOB!=='pg18-agent-design-browser'||env.AGENT_STUDIO_ORIGINAL_MONITOR074_CI!=='YES_DISPOSABLE_ORIGINAL_MONITOR074_LIVE_CHAIN_ONLY'||env.AGENT_STUDIO_ORIGINAL_MONITOR074_STORY!=='original-agent-run-monitor074'||env.AGENT_STUDIO_ORIGINAL_MONITOR074_EXPECTED_HEAD!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
 ['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_MONITOR073_CI','AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME072_CI','AGENT_STUDIO_NATIVE_MONITOR073_CI'].some(k=>env[k]!==undefined))throw Error('original_monitor074_browser_admission_refused')
 return Object.freeze({target,head:env.GITHUB_SHA,profile:'original-agent-run-monitor074',synthetic_only:true,full_page_acceptance:false,production_GO:false})
}
