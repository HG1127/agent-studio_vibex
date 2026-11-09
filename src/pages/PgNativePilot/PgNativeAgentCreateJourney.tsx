import {useEffect,useRef,useState} from 'react'
import type {createPgNativePilotApi,PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection,PgNativeKnowledge} from '@/lib/pgNativePilotApi'
import {createPgNativeAgentCreateJourney,emptyNativeAgentCreateView,nativeAgentCreateStages,nativeAgentJourneyIssues,nativeJourneyCreatePlan,type NativeAgentCreateView,type PgNativeAgentCreateJourney as Controller} from '@/lib/pgNativeAgentCreateJourney'
import {resolveNativeJourneyAgentCache,type NativeJourneyAgentCache} from '@/lib/pgNativeAgentCreateJourneyCache'
import PgNativeAgentModelBindingPanel from './PgNativeAgentModelBindingPanel'
import PgNativeAgentHttpToolsPanel from './PgNativeAgentHttpToolsPanel'
import PgNativeAgentMcpToolsPanel from './PgNativeAgentMcpToolsPanel'
import PgNativeAgentKnowledgePanel from './PgNativeAgentKnowledgePanel'
export type NativeJourneyDestination='modelConnections'|'toolConnections'|'knowledge'|'runAgent'|'autonomousAgent'|'releases'|'agents'
type Props={api:ReturnType<typeof createPgNativePilotApi>;employeeId:string;scopeKey:string;active:boolean;enabled:boolean;loading:boolean;
 agents:PgNativeAgent[];models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];
 designAvailable:boolean;singleEnabled:boolean;autonomousEnabled:boolean;releasesAvailable:boolean;
 adoptRequest?:{id:string;selection:number}|null;onExpired:()=>void;onSaved:()=>Promise<void>;onOpenDesign:(agentId?:string)=>void;
 onNavigate:(destination:NativeJourneyDestination,agentId?:string)=>void}
type Presentation=Props&{view:NativeAgentCreateView;model?:Controller;retainedAgent:PgNativeAgent|null;onRefresh:()=>Promise<void>}
const button='min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40',primary=button+' bg-indigo-600 text-white'
const field='mt-1 block min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50'
export function PgNativeAgentCreateJourneyPresentation(p:Presentation){
 const {view,model,active,retainedAgent:agent}=p,[selected,setSelected]=useState(''),[checked,setChecked]=useState(false)
 const issues=nativeAgentJourneyIssues(agent,{models:p.models,tools:p.tools,bases:p.bases,loading:p.loading}),locked=!active||!view.active||!model||!p.enabled||view.busy||p.loading
 const resourceReady=Boolean(agent&&!issues.plan.length&&!issues.resources.length),trialMode=p.autonomousEnabled?'autonomous':'single'
 let manualReady=false;try{nativeJourneyCreatePlan(view.plan);manualReady=true}catch{}
 return <section aria-label="首次创建助手向导" hidden={!active} className="min-w-0 space-y-4 rounded-2xl border border-indigo-100 bg-white p-4 sm:p-5">
  <h2 className="text-lg font-semibold">一步步创建自己的助手</h2>
  <p className="text-sm leading-6 text-slate-600">先保存方案，再配置资源、核对真实试跑，最后前往发布页。每次运行与模型费用都在原有页面单独确认。</p>
  {!p.enabled&&!p.loading&&<p role="status" className="text-sm text-amber-900">当前环境未开放配置保存；可以读取本人已有助手，待权限恢复后继续。</p>}
  <ol aria-label="创建助手五个步骤" className="grid gap-2 sm:grid-cols-5">{nativeAgentCreateStages.map((label,index)=><li key={label}><button type="button" aria-current={view.stage===index?'step':undefined} disabled={!model||view.busy||index>=2&&!agent||index===4&&(!view.trial?.current||!resourceReady)} className={button+' w-full text-left '+(view.stage===index?'border-indigo-500 bg-indigo-50':'')} onClick={()=>model?.go(index)}>{index+1}. {label}</button></li>)}</ol>
  {view.error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{view.error}</p>}{view.notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{view.notice}</p>}
  {view.pendingCreate&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">创建结果尚未确认。先刷新本人助手列表，再明确选择实际保存的记录继续；这里不会重复提交创建。</p>}
  {view.pendingCreate&&view.createdId&&<button type="button" className={button} disabled={view.busy} onClick={()=>{void model?.selectExisting(view.createdId,true)}}>核对已返回标识的助手记录</button>}
  {!agent&&<details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm">继续配置本人已保存的助手</summary><div className="mt-3 space-y-3">
   <button type="button" className={button} disabled={view.busy||p.loading} onClick={()=>{void p.onSaved()}}>刷新本人助手列表</button>
   <label className="block text-sm">已保存助手<select aria-label="向导中的已保存助手" className={field} value={selected} disabled={view.busy} onChange={e=>{setSelected(e.target.value);setChecked(false)}}><option value="">请选择本人助手</option>{p.agents.map(row=><option key={row.id} value={row.id}>{row.name} · 修订 {row.revision}</option>)}</select></label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} disabled={view.busy||!selected}/>我确认继续配置所选的本人助手，不重复创建。</label>
   <button type="button" className={button} disabled={view.busy||!selected||!checked} onClick={()=>{void model?.selectExisting(selected,true)}}>重新读取并继续配置</button>
  </div></details>}
  <div hidden={view.stage!==0} className="space-y-3">
   <h3 className="font-medium">1. 描述需求</h3><p className="text-sm text-slate-600">说明要完成的工作、期望交付物和任务边界。</p>
   <label className="block text-sm">助手名称<input aria-label="向导助手名称" className={field} value={agent?.name??view.name} maxLength={120} disabled={locked||view.pendingCreate||Boolean(agent)} onChange={e=>model?.setDraft(e.target.value,view.goal)}/></label>
   <label className="block text-sm">工作需求<textarea aria-label="向导工作需求" className={field} rows={4} maxLength={3000} value={agent?.spec.goal??view.goal} disabled={locked||view.pendingCreate||Boolean(agent)} onChange={e=>model?.setDraft(view.name,e.target.value)}/></label>
   <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={locked||view.pendingCreate||!view.name.trim()||!view.goal.trim()} onClick={()=>model?.go(1)}>下一步：确认方案</button>
    {p.designAvailable&&<button type="button" className={button} onClick={()=>p.onOpenDesign(agent?.id)} disabled={view.busy||view.pendingCreate}>用自然语言设计完整方案</button>}</div>
  </div>
  <div hidden={view.stage!==1} className="space-y-3">
   <h3 className="font-medium">2. 确认方案</h3>
   {agent?<><p className="font-medium">{agent.name} · 修订 {agent.revision}</p>{(['goal','task_scope','deliverables','task_plan','done_criteria'] as const).map(key=><p key={key} className="whitespace-pre-wrap break-words text-sm">{Array.isArray(agent.spec[key])?(agent.spec[key] as string[]).join('\n'):agent.spec[key]}</p>)}</>:<><p className="font-medium">{view.name}</p><p className="whitespace-pre-wrap text-sm">{view.goal}</p><p className="text-sm text-slate-600">逐项明确范围、交付物、计划与验收标准，再确认保存。也可以使用现有的自然语言设计面板，编辑生成结果后单独保存。</p>
    {([['task_scope','任务范围'],['deliverables','交付物（每行一项）'],['task_plan','任务计划（每行一步）'],['done_criteria','完成标准（每行一项）']] as const).map(([key,label])=><label key={key} className="block text-sm">{label}<textarea aria-label={'向导'+label} className={field} rows={3} maxLength={key==='task_scope'?4000:15029} value={view.plan[key]} disabled={locked||view.pendingCreate} onChange={e=>model?.setPlan({[key]:e.target.value})}/></label>)}
   </>}
   {issues.plan.length>0&&agent&&<ul className="list-inside list-disc text-sm text-amber-900">{issues.plan.map(issue=><li key={issue}>{issue}</li>)}</ul>}
   <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>model?.go(0)} disabled={view.busy}>返回描述需求</button>
    {!agent&&<button type="button" className={primary} disabled={locked||view.pendingCreate||!view.name.trim()||!view.goal.trim()||!manualReady} onClick={()=>{void model?.create()}}>确认保存助手方案</button>}
    {agent&&<button type="button" className={primary} onClick={()=>model?.go(2)} disabled={view.busy}>下一步：连接资源</button>}
    {p.designAvailable&&<button type="button" className={button} onClick={()=>p.onOpenDesign(agent?.id)} disabled={view.busy||view.pendingCreate}>打开自然语言方案设计</button>}</div>
  </div>
  <div hidden={view.stage!==2} className="min-w-0 space-y-4">
   <h3 className="font-medium">3. 连接资源{agent?' · '+agent.name:''}</h3>
   <p className="text-sm text-slate-600">资源页新建或测试连接后，可返回这里刷新，再绑定到当前助手。资源访问权限由服务端再次核验。</p>
   <div className="flex flex-wrap gap-2">{([['modelConnections','去配置模型连接'],['toolConnections','去配置工具连接'],['knowledge','去配置知识库']] as const).map(([destination,label])=><button type="button" key={destination} className={button} onClick={()=>p.onNavigate(destination,agent?.id)} disabled={view.busy}>{label}</button>)}
    <button type="button" className={button} onClick={()=>{void p.onRefresh()}} disabled={view.busy||p.loading}>刷新当前助手与本人资源</button></div>
   {issues.resources.length>0&&<ul className="list-inside list-disc space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{issues.resources.map(issue=><li key={issue}>{issue}</li>)}</ul>}
   {agent&&<fieldset disabled={locked} className="min-w-0 space-y-4 border-0 p-0"><legend className="sr-only">当前助手的本人资源配置</legend>
    <PgNativeAgentModelBindingPanel api={p.api} agents={[agent]} initialAgentId={agent.id} connections={p.models} onUpdated={p.onRefresh}/>
    <PgNativeAgentHttpToolsPanel api={p.api} agents={[agent]} initialAgentId={agent.id} connections={p.tools} enabled={!locked} onSaved={p.onRefresh} onExpired={p.onExpired}/>
    <PgNativeAgentMcpToolsPanel api={p.api} agents={[agent]} initialAgentId={agent.id} active={active&&view.stage===2} enabled={!locked} onSaved={p.onRefresh} onExpired={p.onExpired}/>
    <PgNativeAgentKnowledgePanel api={p.api} agents={[agent]} initialAgentId={agent.id} bases={p.bases} active={active&&view.stage===2} enabled={!locked} onSaved={p.onRefresh} onExpired={p.onExpired}/>
   </fieldset>}
   <button type="button" className={primary} disabled={!resourceReady||view.busy} onClick={()=>model?.go(3)}>下一步：试跑验证</button>
  </div>
  <div hidden={view.stage!==3} className="space-y-3">
   <h3 className="font-medium">4. 试跑验证</h3><p className="text-sm">前往原有运行页核对任务、审批与费用。向导不会自动提交、批准或重发运行。</p>
   {agent?.spec.mcp_tools?.length?<p className="text-sm">运行页还会重新读取并检查 MCP 连接和工具版本。</p>:null}
   <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={!resourceReady||!p.singleEnabled&&!p.autonomousEnabled||view.busy} onClick={()=>p.onNavigate(p.autonomousEnabled?'autonomousAgent':'runAgent',agent?.id)}>打开当前助手的运行页</button>
    <button type="button" className={button} disabled={!agent||view.busy||!p.singleEnabled&&!p.autonomousEnabled} onClick={()=>{void model?.readTrial(trialMode)}}>读取当前助手的真实试跑结果</button></div>
   {!p.singleEnabled&&!p.autonomousEnabled&&<p role="status" className="text-sm">当前环境未开放助手运行；已保存方案与资源配置可以继续保留。</p>}
   {view.trial&&<div className="space-y-2 rounded-xl border p-3 text-sm"><p>{view.trial.current?'当前方案版本已有成功输出。':'试跑状态：'+view.trial.status+'；请核对当前方案版本。'}</p>{view.trial.current&&<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{view.trial.result}</pre>}</div>}
   <button type="button" className={primary} disabled={!view.trial?.current||!resourceReady||view.busy} onClick={()=>model?.go(4)}>已核对输出，下一步：发布</button>
  </div>
  <div hidden={view.stage!==4} className="space-y-3"><h3 className="font-medium">5. 核对与发布</h3>
   <p className="text-sm">在版本与发布页核对完整快照、验收记录和当前资源，再单独确认发布。配置变化后需要重新核对试跑。</p>
   <button type="button" className={primary} disabled={!p.releasesAvailable||!view.trial?.current||!resourceReady||view.busy} onClick={()=>p.onNavigate('releases',agent?.id)}>打开当前助手的版本与发布</button>
   {!p.releasesAvailable&&<p role="status" className="text-sm">当前环境未开放版本与发布，助手配置已保留。</p>}
  </div>
  {view.busy&&<p role="status" className="text-sm">正在核对本人记录…</p>}
 </section>
}
export default function PgNativeAgentCreateJourney(p:Props){
 const latest=useRef(p);latest.current=p
 const [binding,setBinding]=useState<{api:Props['api'];owner:string;scope:string;model:Controller}|null>(null)
 const bound=binding?.api===p.api&&binding.owner===p.employeeId&&binding.scope===p.scopeKey&&binding.model.matchesScope(p.api,p.employeeId,p.scopeKey),model=bound?binding!.model:undefined
 const [snapshot,setSnapshot]=useState(emptyNativeAgentCreateView),cache=useRef<NativeJourneyAgentCache<PgNativeAgent>>(null)
 useEffect(()=>{
  const current=()=>latest.current.api===p.api&&latest.current.employeeId===p.employeeId&&latest.current.scopeKey===p.scopeKey
  const controller=createPgNativeAgentCreateJourney(p.api,{employeeId:p.employeeId,scopeKey:p.scopeKey,onExpired:()=>{if(current())latest.current.onExpired()}})
  setBinding({api:p.api,owner:p.employeeId,scope:p.scopeKey,model:controller})
  const publish=()=>{if(current())setSnapshot(controller.snapshot())},off=controller.subscribe(publish);publish()
  return()=>{off();controller.dispose()}
 },[p.api,p.employeeId,p.scopeKey])
 useEffect(()=>{model?.setEnabled(p.enabled);model?.setActive(p.active)},[model,p.active,p.enabled])
 useEffect(()=>{if(model&&p.active)void model.refreshSelected()},[model,p.active])
 const delivered=useRef('')
 useEffect(()=>{
  if(!model||!p.active||!p.adoptRequest)return
  const key=p.adoptRequest.id+':'+p.adoptRequest.selection;if(delivered.current===key)return;delivered.current=key;void model.selectExisting(p.adoptRequest.id,true)
 },[model,p.active,p.adoptRequest])
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(model?.hasUnsavedDraft()){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[model])
 const view=bound&&snapshot.employeeId===p.employeeId&&snapshot.scopeKey===p.scopeKey?snapshot:emptyNativeAgentCreateView(p.employeeId,p.scopeKey)
 const projected=resolveNativeJourneyAgentCache(cache.current,model,p.active,view)
 cache.current=projected.cache
 const agent=projected.agent
 const refresh=async()=>{if(!model)return;await p.onSaved();if(latest.current.api===p.api&&latest.current.employeeId===p.employeeId&&latest.current.scopeKey===p.scopeKey)await model.refreshSelected()}
 return <PgNativeAgentCreateJourneyPresentation {...p} view={view} model={model} retainedAgent={agent} onRefresh={refresh}/>
}
