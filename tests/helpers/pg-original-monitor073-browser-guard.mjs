import {requireOriginalLoginHome071Ci} from '../../services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs'
// Additional073 purpose composes the unchanged real069/070/071 base admission;
// it never edits job/head/target or relabels that base's installed profile.
export function requireOriginalMonitor073BrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const base=requireOriginalLoginHome071Ci(env,platform,uid)
 if(env.AGENT_STUDIO_ORIGINAL_MONITOR073_CI!=='YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY'||env.AGENT_STUDIO_ORIGINAL_MONITOR073_PROFILE!=='original-home-monitor073-metadata'||
  !['original-login','monitor073'].includes(env.AGENT_STUDIO_ORIGINAL_MONITOR073_STORY)||env.AGENT_STUDIO_ORIGINAL_MONITOR073_EXPECTED_HEAD!==env.GITHUB_SHA)throw Error('original_monitor073_browser_admission_refused')
 return Object.freeze({profile:'original-home-monitor073-metadata',story:env.AGENT_STUDIO_ORIGINAL_MONITOR073_STORY,head:base.head,target:base.target,origin:base.origin,
  predecessor:base,predecessor_profile:base.profile,synthetic_only:true,full_monitor_complete:false,production_GO:false})
}
