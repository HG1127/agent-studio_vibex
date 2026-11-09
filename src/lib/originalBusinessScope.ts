import {useEffect,useSyncExternalStore} from 'react'
import {getStudioAccountInfo,verifyStudioSession} from './studioAuth'
import {subscribeStudioSessionPrivacy} from './studioSessionPrivacy'
import {createOriginalBusinessIdentity} from './originalBusinessIdentity'
const enabled=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'
export const originalBusinessIdentity=createOriginalBusinessIdentity(async()=>{
 const status=await verifyStudioSession(),employee=getStudioAccountInfo()
 return status==='authenticated'&&employee?.active?employee.id:''
})
if(enabled)subscribeStudioSessionPrivacy(()=>originalBusinessIdentity.invalidate())
export function useOriginalBusinessScope(){
 const state=useSyncExternalStore(originalBusinessIdentity.subscribe,originalBusinessIdentity.snapshot,originalBusinessIdentity.snapshot)
 useEffect(()=>{
  if(!enabled)return
  void originalBusinessIdentity.initialize().catch(()=>{})
  const check=()=>{if(!document.hidden)void originalBusinessIdentity.check().catch(()=>{})}
  const timer=window.setInterval(check,3000)
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}
 },[])
 return{enabled,ready:!enabled||state.ready,key:enabled?state.employee+':'+state.epoch:'pocketbase',recover:()=>{void originalBusinessIdentity.recover().catch(()=>{})}}
}
