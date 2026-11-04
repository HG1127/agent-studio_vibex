import {useEffect,useMemo,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '../../lib/studioAuth.ts'
import {subscribeStudioSessionPrivacy} from '../../lib/studioSessionPrivacy.ts'
import {registerUnsavedWorkCheck} from '../../lib/unsavedNavigation.ts'
import {confirmInStudio,inputInStudio} from '../../lib/studioDialogs.ts'
import {safeMarketplaceQuery,safeChosenCatalogSlug} from '../../lib/toolSearchPrivacy.ts'
import {createPgNativePilotApi} from '../../lib/pgNativePilotApi.ts'
import {createOriginalModelConnectionsApi} from '../../lib/originalModelConnectionsApi.ts'
import {createOriginalMcpInventoryApi} from '../../lib/originalMcpInventoryApi.ts'
import {createOriginalPluginMarketTransport} from '../../lib/originalPluginMarketTransport.ts'
import {createOriginalPluginMcpRead,OriginalPluginSourceError} from '../../lib/originalPluginMarketSources.ts'
import {emptyOriginalPluginMarketView} from '../../lib/originalPluginMarketView.ts'
import {INVOKE_STATUS_META,type ConnectionRow} from './usePluginMarket.ts'
import {createOriginalPluginMarketSession} from '../../lib/originalPluginMarketSession.ts'
import {chooseOriginalPluginModel} from '../../lib/originalPluginModelChoice.ts'
type Controller=ReturnType<typeof createOriginalPluginMarketSession>
type Snapshot=ReturnType<Controller['snapshot']>
/** Keeps the original employee page and its props. Native Cookie verification
 * and server owner checks remain authoritative; route text grants nothing. */
export function usePgOriginalPluginMarket(){
 const account=getStudioAccountInfo(),employee=account?.active?account.id:'',[params]=useSearchParams(),requested=safeMarketplaceQuery(params.get('tool')??'')||safeChosenCatalogSlug(params.get('plugin')??'')
 const [stored,setStored]=useState<{employee:string;value:Snapshot}|null>(null),owned=useRef<Controller|null>(null),route=useRef(requested)
 route.current=requested
 useEffect(()=>{
  if(!employee)return
  let alive=true,controller:Controller
  const verify=async()=>{const status=await verifyStudioSession(),actual=getStudioAccountInfo();if(status!=='authenticated'||!actual?.active)throw new OriginalPluginSourceError(status==='signed_out'?401:503,'original_plugin_identity_unavailable');return actual.id}
  const transport=createOriginalPluginMarketTransport({employeeId:employee,verifyEmployee:verify}),storageKey='agentstudio.original-plugin-pending.v1.'+employee
  controller=createOriginalPluginMarketSession({employeeId:employee,verifyEmployee:verify,ports:(current,signal)=>{
   const send:typeof fetch=(input,init)=>transport.forScope(current)(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])}),api=createPgNativePilotApi(send),mcp=createOriginalPluginMcpRead({employeeId:employee,transport:send}),inventory=createOriginalMcpInventoryApi({employeeId:employee,transport:send}),models=createOriginalModelConnectionsApi({employeeId:employee,transport:send})
   return{api,mcp,inventory:abort=>inventory.listSnapshot(abort),managed:(id,abort)=>{abort.throwIfAborted();return api.getSmitheryConnection(id)},models:abort=>models.listSnapshot(abort),preview:async(raw,abort)=>{const response=await send('/__pg_native/api/v2/original-ui/plugin-market/discover-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raw),signal:abort});const value=await response.json();if(!response.ok)throw new OriginalPluginSourceError(response.status,'original_plugin_discovery_unconfirmed');return value}}
  },confirm:(purpose,message)=>confirmInStudio(message,{title:purpose==='fee'?'确认本次可能的费用':purpose==='step'?'批准原任务这一步':purpose==='discovery'?'仅发现工具能力':'确认本次操作',confirmLabel:'确认',cancelLabel:'取消'}),chooseModel:choices=>chooseOriginalPluginModel(choices,message=>inputInStudio(message,{title:'选择本人模型'})),chooseGroup:async count=>{const value=await inputInStudio('当前条目分为 '+count+' 组，每次最多8条。输入本次要翻译的组号（1–'+count+'）；只提交所选一组，其他组需另行确认费用。',{title:'选择本次翻译条目'});return value!==null&&/^[1-9][0-9]*$/.test(value.trim())&&Number(value)<=count?Number(value)-1:null},trialStorage:{read:()=>sessionStorage.getItem(storageKey+'.trial'),write:value=>sessionStorage.setItem(storageKey+'.trial',value),remove:()=>sessionStorage.removeItem(storageKey+'.trial')},storage:{read:()=>sessionStorage.getItem(storageKey),write:value=>sessionStorage.setItem(storageKey,value),remove:()=>sessionStorage.removeItem(storageKey)}})
  owned.current=controller
  const publish=()=>{const actual=getStudioAccountInfo();if(alive&&owned.current===controller&&actual?.active&&actual.id===employee)setStored({employee,value:controller.snapshot()})},unsubscribe=controller.subscribe(publish),privacy=subscribeStudioSessionPrivacy(()=>controller.hidePrivate()),unregister=registerUnsavedWorkCheck(()=>controller.navigationBlocked())
  const refresh=()=>{if(document.visibilityState==='visible')void controller.loadConnections()},resume=()=>{if(document.visibilityState==='visible')void controller.start()},beforeUnload=(event:BeforeUnloadEvent)=>{if(controller.navigationBlocked()){event.preventDefault();event.returnValue=''}}
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void controller.poll()},5000),inventory=window.setInterval(refresh,15000)
  window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('beforeunload',beforeUnload)
  publish();void controller.start().then(()=>{if(alive&&route.current){controller.setField('smitheryQuery',route.current);return controller.loadSmitheryServers(route.current,1)}})
  return()=>{alive=false;privacy();unsubscribe();unregister();window.clearInterval(poll);window.clearInterval(inventory);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('beforeunload',beforeUnload);if(owned.current===controller)owned.current=null;controller.dispose();transport.close()}
 },[employee])
 const actions=useMemo(()=>{
  const call=<K extends keyof Controller>(name:K)=>(...args:Controller[K] extends (...values:infer P)=>unknown?P:never)=>{const value=owned.current?.[name];if(typeof value==='function')return (value as (...values:typeof args)=>unknown)(...args)}
  return{onLoginClick:redirectToRhLogin,dismissError:call('dismissError'),dismissNotice:call('dismissNotice'),changeAdvancedOpen:call('changeAdvancedOpen'),submitMarketSearch:call('submitMarketSearch'),loadMoreMarket:call('loadMoreMarket'),retryMarket:call('retryMarket'),translateMarket:call('translateMarket'),saveSmitheryKey:call('saveSmitheryKey'),removeSmitheryKey:call('removeSmitheryKey'),loadSmitheryNamespaces:call('loadSmitheryNamespaces'),refreshSmitheryConnection:call('refreshSmitheryConnection'),loadSmitheryServers:call('loadSmitheryServers'),connectSmithery:call('connectSmithery'),connectCustomPlugin:call('connectCustomPlugin'),toggleConnection:call('toggleConnection'),reprobeConnection:call('reprobeConnection'),deleteConnection:call('deleteConnection'),openDrawer:call('openDrawer'),closeDrawer:call('closeDrawer'),runProbe:call('runProbe'),addHeaderRow:call('addHeaderRow'),updateHeaderRow:call('updateHeaderRow'),removeHeaderRow:call('removeHeaderRow'),runConnect:call('runConnect'),selectInvokeConn:call('selectInvokeConn'),selectInvokeTool:call('selectInvokeTool'),startInvokeFromDrawer:call('startInvokeFromDrawer'),runInvoke:call('runInvoke'),toggleLogRow:call('toggleLogRow'),setMarketSearchText:(value:string)=>owned.current?.setField('marketSearchText',value),setSmitheryKeyInput:(value:string)=>owned.current?.setField('smitheryKeyInput',value),setSmitheryQuery:(value:string)=>owned.current?.setField('smitheryQuery',value),setSmitheryNamespace:(value:string)=>owned.current?.setField('smitheryNamespace',value),setSmitherySelected:(value:Snapshot['smitherySelected'])=>owned.current?.setField('smitherySelected',value),setSmitheryConnectionResult:(value:Snapshot['smitheryConnectionResult'])=>owned.current?.setField('smitheryConnectionResult',value),setCustomOpen:(value:boolean)=>owned.current?.setField('customOpen',value),setCustomName:(value:string)=>owned.current?.setField('customName',value),setCustomUrl:(value:string)=>owned.current?.setField('customUrl',value),setCustomToken:(value:string)=>owned.current?.setField('customToken',value),setInvokeArgsText:(value:string)=>owned.current?.setField('invokeArgsText',value)}
 },[])
 // A previous employee's snapshot is never rendered while effects clean up.
 const value=stored?.employee===employee?stored.value:null
 const empty=useMemo(()=>createOriginalPluginEmptySnapshot(),[])
 return{...(value??empty),...actions,isLoggedIn:!!employee&&!!value?.isLoggedIn,needsRhLogin:!employee||!!value?.needsRhLogin}
}
function createOriginalPluginEmptySnapshot():Snapshot{return{...emptyOriginalPluginMarketView(),employeeId:'',epoch:0,visible:false,closed:false,advanced:false,connectionByUrl:{} as Record<string,ConnectionRow>,enabledConnections:[],connectedCount:null,drawerConnection:null,invokeConn:null,invokeTool:null,invokeStatusMeta:{...INVOKE_STATUS_META,started:{label:'已开始',badge:'bg-muted text-muted-foreground'},unknown:{label:'结果未确认',badge:'bg-secondary text-secondary-foreground'}}}}
