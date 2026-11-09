import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react'
import {useSearchParams} from 'react-router-dom'
import {resolveToolHubView} from '../../lib/toolHubView.ts'
import {invocationViewKey,isInvocationViewCurrent} from '../../lib/invocationViewKey.ts'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '../../lib/studioAuth.ts'
import {createPgNativePilotApi} from '../../lib/pgNativePilotApi.ts'
import {createOriginalToolConnectionsApi} from '../../lib/originalToolConnectionsApi.ts'
import {createOriginalModelConnectionsApi} from '../../lib/originalModelConnectionsApi.ts'
import {createOriginalHomeAgentApi} from '../../lib/originalHomeAgentApi.ts'
import {createOriginalToolHubActivityApi} from '../../lib/originalToolHubActivityApi.ts'
import {createOriginalToolHubTransport} from '../../lib/originalToolHubTransport.ts'
import {createOriginalToolHubSession,emptyOriginalToolHubFields,type OriginalToolHubFields} from '../../lib/originalToolHubSession.ts'
import {registerUnsavedWorkCheck} from '../../lib/unsavedNavigation.ts'
import {subscribeStudioSessionPrivacy} from '../../lib/studioSessionPrivacy.ts'
import {BUILTIN_TOOLS,SOURCE_META,INV_STATUS_META,type usePocketBaseToolHub,type ActiveDebugTarget,type ExternalToolRow} from './useToolHub.ts'
type Controller=ReturnType<typeof createOriginalToolHubSession>
type Snapshot=ReturnType<Controller['snapshot']>
type State=Omit<ReturnType<typeof usePocketBaseToolHub>,'invocationTotal'>&{invocationTotal:number|null}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function usePgOriginalToolHub():State{
 const [params,setParams]=useSearchParams(),routeView=resolveToolHubView(params.get('view')),rawRunId=(params.get('runId')??'').toLowerCase(),runId=uuid.test(rawRunId)?rawRunId:''
 const route=useRef({view:routeView,runId});route.current={view:routeView,runId}
 const [stored,setStored]=useState<Snapshot|null>(null),[initialError,setInitialError]=useState(''),[expanded,setExpanded]=useState(''),[copied,setCopied]=useState(false)
 const controller=useRef<Controller|null>(null),life=useRef(0),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null),account=getStudioAccountInfo()?.id??''
 const authorized=Boolean(stored?.visible&&!stored.closed&&stored.employeeId===account),visible=Boolean(authorized&&stored?.view===routeView&&stored.activityQuery.run_id===runId),view=visible?stored:null,fields=view?.fields??emptyOriginalToolHubFields()
 const query=view?.activityQuery??{tool:'',q:'',status:'',source:'',run_id:runId,page:1},activity=view?.activity
 const key=(q:typeof query)=>invocationViewKey(account,q.run_id,q.tool,q.q,q.status,q.source,q.page),historyCurrent=isInvocationViewCurrent(key(query),activity?key(activity.query):'')
 useEffect(()=>{
  let cancelled=false,session:Controller|null=null,transport:ReturnType<typeof createOriginalToolHubTransport>|null=null,unsubscribe:(()=>void)|undefined,unregister:(()=>void)|undefined,checking=false,reading=false
  const generation=++life.current
  const unsubscribePrivacy=subscribeStudioSessionPrivacy(()=>{session?.hidePrivate();setExpanded('');setCopied(false)})
  async function verify(){const status=await verifyStudioSession(),employee=getStudioAccountInfo();if(status==='unavailable'){session?.hidePrivate();throw Error('original_toolhub_identity_unavailable')}const owner=status==='authenticated'&&employee?.active?employee.id:'';if(session&&owner!==session.snapshot().employeeId)session.hidePrivate();return owner}
  const check=()=>{if(cancelled||checking||document.hidden||!session)return;checking=true;void session.verifyIdentity().catch(()=>{}).finally(()=>{checking=false})}
  const poll=()=>{if(cancelled||reading||document.hidden||!session)return;const current=session.snapshot();if(current.view!==route.current.view||current.activityQuery.run_id!==route.current.runId||current.view!=='debug'&&(current.view!=='activity'||current.activityQuery.page!==1))return;reading=true;void session.refresh(true).finally(()=>{reading=false})}
  const unload=(event:BeforeUnloadEvent)=>{if(session?.navigationBlocked()){event.preventDefault();event.returnValue=''}}
  void(async()=>{try{
   const employee=await verify();if(cancelled)return;if(!employee)throw Error('original_toolhub_signed_out')
   transport=createOriginalToolHubTransport({employeeId:employee,verifyEmployee:verify})
   const ownedTransport=transport
   session=createOriginalToolHubSession({employeeId:employee,initialView:route.current.view,initialRunId:route.current.runId,verifyEmployee:verify,ports:current=>{const scoped=ownedTransport.forScope(current);return{api:createPgNativePilotApi(scoped),activity:createOriginalToolHubActivityApi({employeeId:employee,transport:scoped}),tools:createOriginalToolConnectionsApi({employeeId:employee,transport:scoped}),models:createOriginalModelConnectionsApi({employeeId:employee,transport:scoped}),home:createOriginalHomeAgentApi({employeeId:employee,transport:scoped})}},confirm:value=>window.confirm(value.description),chooseModel:choices=>{
    const answer=window.prompt('选择本次内容摘要使用的本人模型编号；取消不执行。\n'+choices.map((c,i)=>(i+1)+'. '+c.name+' / '+c.model_id+'（版本 '+c.connection_revision+'）').join('\n'))
    if(answer===null||!/^\d+$/.test(answer.trim()))return null;return choices[Number(answer.trim())-1]??null
   }})
   if(cancelled){session.dispose();transport.close();return}controller.current=session
   const publish=()=>{if(!cancelled&&generation===life.current)setStored(session!.snapshot())};unsubscribe=session.subscribe(publish);unregister=registerUnsavedWorkCheck(()=>session?.navigationBlocked()??false);publish();await session.activate();publish()
  }catch{if(!cancelled&&generation===life.current)setInitialError('当前员工会话或工具中心接口尚未核实，请重新登录或刷新。')}})()
  window.addEventListener('focus',check);window.addEventListener('beforeunload',unload)
  const ownerTimer=window.setInterval(check,3000),pollTimer=window.setInterval(poll,5000)
  return()=>{cancelled=true;life.current++;unsubscribe?.();unsubscribePrivacy();unregister?.();window.clearInterval(ownerTimer);window.clearInterval(pollTimer);window.removeEventListener('focus',check);window.removeEventListener('beforeunload',unload);session?.dispose();transport?.close();if(controller.current===session)controller.current=null;if(copyTimer.current)clearTimeout(copyTimer.current)}
 },[])
 useEffect(()=>{controller.current?.setView(routeView,runId);setExpanded('');setCopied(false)},[routeView,runId])
 const canAct=()=>{const c=controller.current,s=c?.snapshot();return Boolean(c&&s?.visible&&!s.closed&&s.employeeId===getStudioAccountInfo()?.id&&s.view===route.current.view&&s.activityQuery.run_id===route.current.runId)}
 useEffect(()=>{if(visible)return;setExpanded('');setCopied(false);if(copyTimer.current)clearTimeout(copyTimer.current)},[visible,account])
 const set=<K extends keyof OriginalToolHubFields>(key:K):Dispatch<SetStateAction<OriginalToolHubFields[K]>>=>value=>{const c=controller.current;if(!canAct()||!c)return;const current=c.snapshot().fields[key];c.setField(key,typeof value==='function'?(value as (old:OriginalToolHubFields[K])=>OriginalToolHubFields[K])(current):value);setCopied(false)}
 const select=(target:ActiveDebugTarget)=>{if(!canAct())return;controller.current?.select(target);setCopied(false)}
 const refresh=()=>{if(canAct())void controller.current?.refresh()}
 const update=(key:'q'|'status'|'source',value:string)=>{if(canAct()){controller.current?.setActivityField(key,value);setExpanded('')}}
 const selected=view?.target?.kind==='external'?view.externalTools.find(t=>t.id===view.target!.id):null
 return{
  nativeBackend:true,isLoggedIn:authorized,needsRhLogin:Boolean(stored&&stored.epoch>0&&!authorized),onLoginClick:redirectToRhLogin,errorMsg:view?.error??(stored?.error||initialError),dismissError:()=>{setInitialError('');controller.current?.dismissError()},noticeMsg:view?.notice??'',dismissNotice:()=>controller.current?.dismissNotice(),
  builtinTools:BUILTIN_TOOLS.map(t=>t.id==='summarize'?{...t,desc:'使用明确选择的本人模型整理与提炼文本'}:t),externalTools:view?.externalTools??[],isLoadingExternal:visible&&Boolean(view?.loading),specOptions:view?.specOptions??[],invocationList:historyCurrent?view?.invocationList??[]:[],isLoadingInvocations:authorized&&routeView==='activity'&&Boolean(view?.loading||!historyCurrent&&!view?.invocationError),invocationFilter:query.tool,applyInvocationFilter:value=>{if(canAct()){controller.current?.setFilter(value);setExpanded('')}},
  invocationPage:query.page,invocationTotal:historyCurrent?activity!.total:null,invocationPages:historyCurrent?activity!.pages:1,invocationError:view?.invocationError??'',invocationSearch:query.q,invocationStatus:query.status,invocationSource:query.source,invocationRunId:runId,
  clearInvocationRunId:()=>{setParams(previous=>{const next=new URLSearchParams(previous);next.delete('runId');return next},{replace:true})},changeInvocationPage:page=>{if(canAct()){controller.current?.setActivityPage(page);setExpanded('')}},changeInvocationSearch:value=>update('q',value),changeInvocationStatus:value=>update('status',value),changeInvocationSource:value=>update('source',value),
  expandedInvocationId:visible?expanded:'',toggleInvocationRow:value=>{if(canAct())setExpanded(previous=>previous===value?'':value)},hubStats:view?.hubStats??null,monitorData:view?.monitorData??null,monitorLoading:visible&&Boolean(view?.loading),refreshMonitor:async()=>{if(canAct()&&route.current.view==='monitor')await controller.current?.refresh()},workerStatus:null,refreshWorkerStatus:async()=>{},
  activeTarget:view?.target??null,openBuiltinDebug:id=>{const meta=BUILTIN_TOOLS.find(t=>t.id===id);if(meta)select({kind:'builtin',id,title:meta.title})},openExternalDebug:(row:ExternalToolRow)=>select({kind:'external',id:row.id,title:row.name}),closeDebug:()=>{if(canAct()){setCopied(false);void controller.current?.close()}},
  debugExpression:fields.expression,setDebugExpression:set('expression'),debugText:fields.text,setDebugText:set('text'),debugFocus:fields.focus,setDebugFocus:set('focus'),debugKeyword:fields.keyword,setDebugKeyword:set('keyword'),debugSpecId:fields.specId,setDebugSpecId:set('specId'),debugUrl:fields.url,setDebugUrl:set('url'),debugQuery:fields.query,setDebugQuery:set('query'),debugLimit:fields.limit,setDebugLimit:set('limit'),debugExternalInput:fields.externalInput,setDebugExternalInput:set('externalInput'),confirmExternalWrite:fields.confirmExternalWrite,setConfirmExternalWrite:set('confirmExternalWrite'),requiresWriteConfirmation:Boolean(selected&&selected.method!=='GET'),isDebugging:visible&&Boolean(view?.busy),debugResult:view?.debugResult??null,copiedFlag:visible&&copied,
  runDebug:async()=>{if(canAct()){setCopied(false);await controller.current?.run()}},copyDebugOutput:async()=>{const c=controller.current,generation=life.current;if(!canAct()||!c)return;try{const ok=await c.copy(text=>navigator.clipboard.writeText(text));if(ok&&canAct()&&generation===life.current){setCopied(true);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>{if(generation===life.current)setCopied(false)},2000)}}catch{if(generation===life.current)setCopied(false)}},refreshNow:refresh,
  sourceMeta:SOURCE_META,invStatusMeta:{...INV_STATUS_META,started:{label:'已开始',badge:'bg-muted text-muted-foreground'},unknown:{label:'结果未确认',badge:'bg-secondary text-secondary-foreground'}}
 }
}
