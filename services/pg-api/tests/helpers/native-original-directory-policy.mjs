// Closed DATA/purpose checks only. No driver, filesystem or browser imports.
import {requireNativeLocalDeviceGenuineCi,nativeOriginalDirectoryBrowserWorkflow} from './native-local-device-genuine-guard.mjs'
import {parseLocalIntent,localCanonical,matchLocalReply} from '../../../../shared/native-local-device-contract.mjs'
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
export function requireOriginalDirectoryCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
 const target=requireNativeLocalDeviceGenuineCi(env,platform,uid)
 if(env.GITHUB_WORKFLOW!==nativeOriginalDirectoryBrowserWorkflow||env.GITHUB_JOB!=='pg18-original-directory-browser'||env.AGENT_STUDIO_F20_F21_GENUINE_SUITE!=='original-directory'||env.AGENT_STUDIO_ORIGINAL_DIRECTORY_APPROVED!=='YES_DISPOSABLE_ORIGINAL_DIRECTORY_ONLY')throw Error('original_directory_exact_purpose_required')
 return target
}
export function originalDirectoryRoute(method,raw,body){
 if(typeof raw!=='string'||raw.length>4096||/[\\\x00-\x20\x7f#]/.test(raw)||raw.split('?')[0].includes('%')||raw.split('?')[0].split('/').some(part=>part==='.'||part==='..'))return 'denied'
 if(raw.startsWith('/__pb')||raw.startsWith('/api/'))return 'legacy'
 const u=new URL(raw,'https://original-directory.invalid')
 if(!raw.startsWith('/')||u.origin!=='https://original-directory.invalid')return 'denied'
 if(u.pathname==='/__pg_native/api/native-auth/login-status')return method==='GET'&&raw===u.pathname?'native':'denied'
 if(raw.startsWith('/__pg_native/')){
  const p=u.pathname.slice('/__pg_native'.length);if(u.search)return 'denied'
  if(method==='GET'&&['/api/native-auth/me','/api/native-auth/capabilities','/api/v2/local-devices','/api/v2/local-device-pairings'].includes(p))return 'native'
  if(method==='GET'&&new RegExp('^/api/v2/local-devices/jobs/'+uuid+'$').test(p))return 'native'
  if(method==='POST'&&['/api/native-auth/login','/api/native-auth/logout'].includes(p))return 'native'
  if(method==='POST'&&['/api/v2/local-devices','/api/v2/local-devices/confirm'].includes(p)){
   try{const v=parseLocalIntent(body);if(!['enqueue','cancel'].includes(v.action)||v.action==='enqueue'&&v.input.tool!=='files.list')return 'denied';if(localCanonical(v)!==localCanonical(body))return 'denied';return 'native'}catch{return 'denied'}
  }
  return 'denied'
 }
 if(method!=='GET')return 'denied'
 if(u.pathname==='/login'&&(!u.search||u.search==='?next='+encodeURIComponent('/tool-hub?view=devices')))return 'page'
 if(u.pathname==='/tool-hub'&&(!u.search||u.search==='?view=devices'))return 'page'
 if(u.pathname==='/'&&!u.search)return 'page'
 if(!u.search&&/^\/(?:assets\/[A-Za-z0-9_.\/-]+|favicon\.(?:svg|ico)|agent-studio\.svg)$/.test(u.pathname)&&!u.pathname.split('/').includes('..')&&!/\.map$/.test(u.pathname))return 'asset'
 return 'denied'
}
export async function directoryReceiptIdentity(body,reply){
 const intent=parseLocalIntent(body),checked=await matchLocalReply(reply,intent),r=checked.receipt
 if(checked.pairing_code!==null)throw Error('original_directory_actual_receipt_mismatch')
 return Object.freeze({action:intent.action,request_id:intent.request_id,id:r.id})
}
