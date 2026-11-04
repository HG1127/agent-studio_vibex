import {useEffect,useRef,useState} from 'react'
import {getStudioAccountInfo,verifyStudioSession} from '../../lib/studioAuth.ts'
import {subscribeStudioSessionPrivacy} from '../../lib/studioSessionPrivacy.ts'
import {createOriginalStudioReadTransport} from '../../lib/originalStudioReadTransport.ts'
import {createPgNativePilotApi} from '../../lib/pgNativePilotApi.ts'
import {createOriginalHarnessApi} from '../../lib/originalHarnessApi.ts'
import {createOriginalHarnessSourceCycle} from '../../lib/originalHarnessSources.ts'
import {createOriginalHarnessSession} from '../../lib/originalReadPageSession.ts'
import {HARNESS_SOURCES,type SourceKey,type SourceState} from '../../lib/harnessData.ts'
type Session=ReturnType<typeof createOriginalHarnessSession>
const initial=()=>Object.fromEntries(Object.keys(HARNESS_SOURCES).map(key=>[key,{loading:false}])) as Record<SourceKey,SourceState>
export function usePgHarness(){
 const owner=getStudioAccountInfo()?.id??'',[stored,setStored]=useState<ReturnType<Session['snapshot']>|null>(null),session=useRef<Session|null>(null)
 useEffect(()=>{
  if(!owner)return
  let alive=true
  const verify=async()=>{const status=await verifyStudioSession(),account=getStudioAccountInfo();if(status!=='authenticated'||!account?.active)throw Object.assign(Error('original_harness_identity_unavailable'),{status:status==='signed_out'?401:503});return account.id}
  const transport=createOriginalStudioReadTransport({employeeId:owner,verifyEmployee:verify}),controller=createOriginalHarnessSession({employeeId:owner,verifyEmployee:verify,readCycle:(current,signal)=>{
   const scoped:typeof fetch=(input,init)=>transport.forScope(current)(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])}),api=createPgNativePilotApi(scoped),own=createOriginalHarnessApi({employeeId:owner,transport:scoped})
   return createOriginalHarnessSourceCycle({snapshot:()=>own.snapshot(signal),overview:()=>api.getOwnOverview({signal}),stats:()=>api.toolHub.stats(),monitor:()=>api.toolHub.harness()})
  }})
  session.current=controller
  const publish=()=>{if(alive)setStored(controller.snapshot())},unsubscribe=controller.subscribe(publish),privacy=subscribeStudioSessionPrivacy(()=>{controller.hidePrivate();publish()});publish();void controller.refresh()
  return()=>{alive=false;unsubscribe();privacy();controller.dispose();transport.close();if(session.current===controller)session.current=null}
 },[owner])
 const current=Boolean(owner&&stored?.employeeId===owner&&!stored.closed),sources=current?stored!.sources:initial()
 return{nativeBackend:true,sources,authRequired:!owner||current&&Boolean(stored?.authRequired),refresh:async()=>{await session.current?.refresh()},loading:Object.values(sources).some(value=>value.loading)}
}
