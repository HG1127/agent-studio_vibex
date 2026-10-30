import {requireOriginalLoginHome071Ci} from '../../services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs'
import {originalLoginPath} from './pg-original-login-browser-guard.mjs'
export const originalOverviewPurpose='YES_DISPOSABLE_ORIGINAL_PERSONAL_OVERVIEW_ONLY'
export const originalOverviewPath='/__pg_native/api/v2/original-ui/internal-overview'
export const originalOverviewArtifacts=Object.freeze(['original-internal-overview-alice.png','original-internal-overview-bob.png','original-internal-overview-observation.json'])
export function requireOriginalOverviewBrowserCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const predecessor=requireOriginalLoginHome071Ci(env,platform,uid)
 if(env.AGENT_STUDIO_ORIGINAL_OVERVIEW_CI!==originalOverviewPurpose||env.AGENT_STUDIO_ORIGINAL_OVERVIEW_PROFILE!=='original-personal-overview071'||env.AGENT_STUDIO_ORIGINAL_OVERVIEW_STORY!=='internal-overview'||env.AGENT_STUDIO_ORIGINAL_OVERVIEW_EXPECTED_HEAD!==predecessor.head||['AGENT_STUDIO_ORIGINAL_MONITOR073_CI','AGENT_STUDIO_ORIGINAL_MONITOR073_PROFILE','AGENT_STUDIO_ORIGINAL_MONITOR073_STORY','AGENT_STUDIO_ORIGINAL_MONITOR073_EXPECTED_HEAD','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI'].some(k=>env[k]!==undefined))throw Error('original_overview_ci_admission_refused')
 return Object.freeze({profile:'original-personal-overview071',story:'internal-overview',head:predecessor.head,origin:predecessor.origin,predecessor:predecessor.profile,synthetic_only:true,production_GO:false})
}
// Host-only routing restriction. Cookie verification and owner checks remain in
// the actual Native handler. Expected-Employee is never an identity selector.
export function originalOverviewRequestPolicy(method,raw,accept=''){
 const pathname=originalLoginPath(raw)
 if(!pathname)return {kind:'denied',pathname:'/invalid-path'}
 if(/^\/__(?:pb|pg)(?:\/|$)/.test(pathname))return {kind:'legacy_denied',pathname}
 if(pathname.startsWith('/__pg_native/api/')){
  if(raw!==pathname)return {kind:'api_denied',pathname}
  const read=[originalOverviewPath,'/__pg_native/api/native-auth/me','/__pg_native/api/native-auth/capabilities']
  if(method==='GET'&&read.includes(pathname)||method==='POST'&&['/__pg_native/api/native-auth/login','/__pg_native/api/native-auth/logout'].includes(pathname))return {kind:'native',pathname}
  return {kind:'api_denied',pathname}
 }
 if(pathname.startsWith('/api')||pathname.startsWith('/__'))return {kind:'api_denied',pathname}
 if(!['GET','HEAD'].includes(method))return {kind:'denied',pathname}
 if(pathname==='/agent-studio.svg'||pathname.startsWith('/assets/'))return {kind:'asset',pathname}
 if(typeof accept==='string'&&accept.includes('text/html')&&['/login','/internal-overview'].includes(pathname))return {kind:'spa',pathname}
 return {kind:'denied',pathname}
}
