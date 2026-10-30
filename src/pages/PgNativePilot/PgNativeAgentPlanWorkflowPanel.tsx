import {useEffect,useRef,useState} from 'react'
import type {createPgNativePilotApi,PgNativeAgent,PgNativeModelConnection,PgNativeToolConnection,PgNativeKnowledge} from '@/lib/pgNativePilotApi'
import {createPgNativeAgentPlanWorkflowSession,emptyAgentPlanWorkflowView,type AgentPlanWorkflowSessionView,type PgNativeAgentPlanWorkflowSession} from '@/lib/pgNativeAgentPlanWorkflowSession'
import type {PgNativeAgentPlanWorkflowApi} from '@/lib/pgNativeAgentPlanWorkflow'
import {agentPlanWorkflowEditorResources} from '@/lib/pgNativeWorkflowGeneratedDraft'
import {agentPlanWorkflowOutputTokenLimits} from '../../../services/pg-api/src/agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowSourceValues,type AgentPlanWorkflowSourceValues} from '../../../services/pg-api/src/agent-plan-workflow-result.ts'
import type {WorkflowGraph} from '@/lib/pgNativeWorkflowGraph'
import PgNativeWorkflowWorkspace from './PgNativeWorkflowWorkspace'

export type PgNativeAgentPlanWorkflowPanelProps={api?:PgNativeAgentPlanWorkflowApi;workflowApi:ReturnType<typeof createPgNativePilotApi>;
  employeeId:string;scopeKey:string;active:boolean;available?:boolean;submissions?:boolean;saves?:boolean;configurationWrites?:boolean;
  agents:PgNativeAgent[];models:PgNativeModelConnection[];tools:PgNativeToolConnection[];bases:PgNativeKnowledge[];
  onExpired:()=>void;onSaved?:()=>void|Promise<void>;onOpenSavedWorkflow?:(id:string)=>void|Promise<void>}
type PresentationProps=Omit<PgNativeAgentPlanWorkflowPanelProps,'api'>&{view:AgentPlanWorkflowSessionView;bound:boolean;session?:PgNativeAgentPlanWorkflowSession}
type Form={specId:string;model:string;instruction:string;cap:number}
type CanvasSeed={key:string;name:string;graph:WorkflowGraph;source:AgentPlanWorkflowSourceValues}
const blank=():Form=>({specId:'',model:'',instruction:'',cap:8192})
const field='mt-1 block min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50'
const button='min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:opacity-40'
const primary=button+' bg-indigo-600 text-white'
const providerBases={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'}

export function PgNativeAgentPlanWorkflowPresentation(props:PresentationProps){
  const {employeeId,scopeKey,active,available,configurationWrites,view,bound,session,workflowApi,agents,models,tools,bases,onExpired,onOpenSavedWorkflow}=props
  const [form,setForm]=useState(blank),[seed,setSeed]=useState<CanvasSeed|null>(null),[discard,setDiscard]=useState(false),[error,setError]=useState('')
  const readable=bound&&active&&available===true&&view.active&&view.available&&view.employeeId===employeeId&&view.scopeKey===scopeKey
  const pending=Boolean(view.pending),locked=!readable||view.busy||pending,editing=readable&&seed!==null&&view.result?.result_status==='available'&&view.result.result?.request_id===view.receipt?.request_id
  const modelChoices=models.flatMap(row=>row.enabled&&row.status==='ok'&&row.base_url===providerBases[row.provider]?row.models.map(model=>({name:row.name+' · '+model,binding:JSON.stringify({connection_id:row.id,connection_revision:row.revision,model_id:model})})):[])
  useEffect(()=>{if(!readable){setForm(blank());setSeed(null);setDiscard(false);setError('')}},[readable,scopeKey])
  if(!active)return null
  const update=(patch:Partial<Form>)=>{if(locked||seed)return;setForm(current=>({...current,...patch}));session?.invalidatePreview();setError('')}
  const preview=async()=>{
    if(locked||seed||!form.specId||!form.model||!session)return
    try{session.setDraft({spec_id:form.specId,generation_model:JSON.parse(form.model),instruction:form.instruction,output_token_limit:form.cap});await session.preview()}
    catch{setError('请选择当前已保存的助手、可用模型和输出容量。')}
  }
  const loadCanvas=()=>{
    const result=view.result?.result,receipt=view.receipt
    if(locked||seed||!session||view.result?.result_status!=='available'||!result||!receipt)return
    const agent=agents.find(row=>row.id===receipt.source.spec_id&&row.revision===receipt.source.spec_revision)
    if(!agent){setError('来源助手版本尚未读取，请刷新本人资源后再打开草图。');return}
    try{
      const source=parseAgentPlanWorkflowSourceValues({source:receipt.source,name:agent.name,spec:agent.spec})
      setSeed({key:scopeKey+':'+receipt.request_id+':'+result.result_sha256,name:result.value.result.name,graph:structuredClone(result.value.result.graph),source});setDiscard(false);setError('')
    }catch{setError('来源方案无法核对，请刷新本人资源后重新查询。')}
  }
  const scoped=seed?agentPlanWorkflowEditorResources(seed.source,{agents,models,tools,bases}):null
  const currentSource=seed&&agents.some(row=>row.id===seed.source.source.spec_id&&row.revision===seed.source.source.spec_revision)
  return <section aria-label="从助手生成工作流草图" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">从助手生成工作流草图</h2>
    {!readable?<p role="status">工作流草图生成暂未开放。</p>:<>
      <p className="text-sm leading-6 text-slate-600">选择已有助手，让你选定的模型设计工作流。生成前单独确认费用；生成后在现有画布中编辑，再确认保存。</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();void preview()}}>
        <label className="min-w-0 text-sm">来源助手<select aria-label="来源助手" className={field} value={form.specId} disabled={locked||Boolean(seed)} onChange={event=>update({specId:event.target.value})}>
          <option value="">请选择本人已保存的助手</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · 修订 {agent.revision}</option>)}</select></label>
        <label className="min-w-0 text-sm">生成草图的模型<select aria-label="生成草图的模型" className={field} value={form.model} disabled={locked||Boolean(seed)} onChange={event=>update({model:event.target.value})}>
          <option value="">请选择已测试可用的本人模型</option>{modelChoices.map(choice=><option key={choice.binding} value={choice.binding}>{choice.name}</option>)}</select></label>
        <label className="text-sm sm:col-span-2">生成要求<textarea aria-label="生成要求" className={field} rows={3} maxLength={2000} value={form.instruction} disabled={locked||Boolean(seed)} onChange={event=>update({instruction:event.target.value})}/></label>
        <label className="text-sm">输出容量<select aria-label="输出容量" className={field} value={form.cap} disabled={locked||Boolean(seed)} onChange={event=>update({cap:Number(event.target.value)})}>
          {agentPlanWorkflowOutputTokenLimits.map(cap=><option key={cap} value={cap}>{cap} tokens</option>)}</select></label>
        <button type="submit" className={button+' self-end'} disabled={locked||Boolean(seed)||!form.specId||!form.model}>预览本次生成输入</button>
      </form>
      {view.preview&&<section aria-label="工作流生成输入预览" className="space-y-3 rounded-xl border p-4">
        <h3 className="font-medium">本次生成输入</h3><p className="text-sm">来源：{view.preview.source_values.name}。模型只负责生成草图，不会自动执行其中的节点。</p>
        <p className="whitespace-pre-wrap text-sm">{view.preview.choice.instruction||'按照现有助手方案设计。'}</p>
        <details><summary className="cursor-pointer text-sm">查看完整助手描述</summary><div className="mt-2 space-y-2 whitespace-pre-wrap text-sm">
          <p>{view.preview.source_values.spec.goal}</p><p>{view.preview.source_values.spec.task_scope}</p>
          {(['deliverables','task_plan','done_criteria'] as const).map(key=><ul key={key} className="list-inside list-disc">{view.preview!.source_values.spec[key].map((value,index)=><li key={index}>{value}</li>)}</ul>)}
        </div></details>
        <p className="text-xs text-slate-600">会保留来源中已选择的资源版本；生成模型不会自动成为节点的执行模型。缺少执行绑定的节点可以保留为待配置草稿。</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={view.feeReviewed} disabled={locked||!view.submissions} onChange={event=>session?.setFeeReviewed(event.target.checked)}/>我确认仅为这份草稿发起一次模型生成，并承担相应费用。</label>
        <button type="button" className={primary} disabled={locked||!view.submissions||!view.feeReviewed} onClick={()=>{void session?.submit()}}>确认费用并生成草图</button>
      </section>}
      {view.pending&&<div role="status" className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm"><p>本次{view.pending.kind==='save'?'保存':view.pending.kind==='control'?'取消或擦除':'生成'}尚未核对。请查询原请求结果，避免重复提交。</p>
        <button type="button" className={button} disabled={view.busy} onClick={()=>{void session?.confirmOriginal()}}>查询原请求结果</button></div>}
      {view.receipt&&!pending&&<div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm">
        <p>{view.result?.result_status==='available'?'草图已生成，可打开画布继续编辑。':view.result?.result_status==='stale'?'历史草图已保留；当前来源或资源已变化，暂不能保存。':view.result?.result_status==='erased'?'本次草图内容已擦除。':view.result?.result_status==='unavailable'?'本次没有可用草图。':view.result?.result_status==='unknown'?'本次模型结果仍未确认，请继续查询原请求。':'生成请求已记录，请查询原请求的当前结果。'}</p>
        <button type="button" className={button} disabled={locked} onClick={()=>{void session?.readResult()}}>查询生成结果</button>
        {view.result?.result_status==='available'&&!seed&&!view.saveReceipt&&<button type="button" className={button} disabled={locked} onClick={loadCanvas}>在现有画布中编辑草图</button>}
      </div>}
      {view.result?.result_status==='stale'&&view.result.result&&<p className="whitespace-pre-wrap text-sm">历史草图：{view.result.result.value.result.name} · {view.result.result.value.result.graph.description||'原始生成内容已保留。'}</p>}
      {editing&&seed&&scoped&&<section aria-label="生成草图画布" className="min-w-0 space-y-3">
        <PgNativeWorkflowWorkspace key={seed.key} api={workflowApi} workflows={[]} agents={scoped.agents} models={scoped.models} tools={scoped.tools} bases={scoped.bases}
          active={readable} writeEnabled={configurationWrites===true&&!view.saveReceipt&&Boolean(currentSource)} executionEnabled={false} onExpired={onExpired} onSaved={async()=>{}} onRun={()=>{}}
          generatedDraft={{key:seed.key,name:seed.name,graph:seed.graph,policy:scoped.policy,confirmed:Boolean(view.saveReceipt),disabled:locked||Boolean(view.saveReceipt)||!currentSource,
            onEdited:()=>session?.invalidateSavePreview(),onPreviewSave:async fields=>{if(!session||locked)return;session.editFields(fields);await session.previewSave()}}}/>
        {!currentSource&&<p role="alert" className="text-sm text-amber-900">来源助手版本已变化，请重新核对；当前草稿不会自动改用新版本。</p>}
        {!view.saveReceipt&&<div className="space-y-2 rounded-xl border p-4 text-sm"><label className="flex gap-2"><input type="checkbox" checked={discard} disabled={locked} onChange={event=>setDiscard(event.target.checked)}/>我确认放弃这份尚未保存的画布修改。</label>
          <button type="button" className={button} disabled={locked||!discard} onClick={()=>{session?.invalidateSavePreview();setSeed(null);setDiscard(false)}}>关闭并放弃当前画布草稿</button></div>}
      </section>}
      {view.savePreview&&<section aria-label="工作流独立保存确认" className="space-y-3 rounded-xl border p-4">
        <h3 className="font-medium">确认保存这份工作流</h3><p className="text-sm">{view.savePreview.candidate.name} · {view.savePreview.candidate.graph.nodes.length} 个节点。只新建工作流配置并保留来源记录，不运行节点。</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={view.saveReviewed} disabled={locked||!view.saves} onChange={event=>session?.setSaveReviewed(event.target.checked)}/>我已核对当前画布，确认将这份草稿保存为新的工作流配置。</label>
        <button type="button" className={primary} disabled={locked||!view.saves||!view.saveReviewed} onClick={()=>{void session?.save()}}>独立确认保存工作流</button>
      </section>}
      {view.saveReceipt&&<div role="status" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-sm"><p>工作流已保存，来源记录已保留。运行需要另行确认。</p>
        {onOpenSavedWorkflow&&<button type="button" className={button} disabled={locked} onClick={()=>{void Promise.resolve().then(()=>onOpenSavedWorkflow(view.saveReceipt!.workflow_id)).catch(()=>setError('暂时无法打开工作流，请刷新后重试。'))}}>打开已保存的工作流</button>}</div>}
      {view.receipt&&!pending&&!view.saveReceipt&&<details><summary className="cursor-pointer text-sm">取消生成或擦除内容</summary><div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={button} disabled={locked} onClick={()=>{if(window.confirm('确认取消这次生成？已可能发生的模型费用不会因此撤销。'))void session?.control('cancel',true)}}>取消这次生成</button>
        <button type="button" className={button+' text-rose-800'} disabled={locked} onClick={()=>{if(window.confirm('确认擦除这次生成的输入和草图内容？操作不可恢复，费用与最少收据记录会保留。')){setSeed(null);void session?.control('erase',true)}}}>擦除这次生成内容</button>
      </div></details>}
      {view.busy&&<p role="status" className="text-sm">正在核对本次操作…</p>}
      {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}{view.error&&<p role="alert" className="text-sm text-rose-800">{view.error}</p>}
    </>}
  </section>
}

type Binding={api:PgNativeAgentPlanWorkflowApi;employeeId:string;scopeKey:string;model:PgNativeAgentPlanWorkflowSession}
export default function PgNativeAgentPlanWorkflowPanel(props:PgNativeAgentPlanWorkflowPanelProps){
  const {api,employeeId,scopeKey,active,available,submissions,saves}=props,callbacks=useRef(props);callbacks.current=props
  const [binding,setBinding]=useState<Binding|null>(null)
  const bound=Boolean(api&&binding?.api===api&&binding.employeeId===employeeId&&binding.scopeKey===scopeKey&&binding.model.matchesScope(api,employeeId,scopeKey)),model=bound?binding!.model:undefined
  useEffect(()=>{
    if(!api){setBinding(null);return}
    const current=()=>callbacks.current.api===api&&callbacks.current.employeeId===employeeId&&callbacks.current.scopeKey===scopeKey
    let session:PgNativeAgentPlanWorkflowSession
    try{session=createPgNativeAgentPlanWorkflowSession(api,{employeeId,scopeKey,onExpired:()=>{if(current())callbacks.current.onExpired()}})}catch{setBinding(null);return}
    const publish=()=>setBinding({api,employeeId,scopeKey,model:session}),unsubscribe=session.subscribe(publish);publish()
    return()=>{unsubscribe();session.dispose()}
  },[api,employeeId,scopeKey])
  useEffect(()=>{if(model){model.setAvailability({available,submissions,saves});model.setActive(active)}},[model,active,available,submissions,saves])
  useEffect(()=>{
    if(!model)return
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(model.hasPendingOriginal()){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload)
  },[model])
  const view=active&&model?model.snapshot():emptyAgentPlanWorkflowView(employeeId,scopeKey),saved=useRef(''),saveId=view.saveReceipt?.request_id??''
  useEffect(()=>{if(!saveId||saved.current===saveId||!bound)return;saved.current=saveId;const latest=callbacks.current;if(latest.api===api&&latest.employeeId===employeeId&&latest.scopeKey===scopeKey)void Promise.resolve(latest.onSaved?.()).catch(()=>{})},[saveId,bound,api,employeeId,scopeKey])
  return <PgNativeAgentPlanWorkflowPresentation key={employeeId+':'+scopeKey+':'+String(bound)} {...props} view={view} bound={bound} session={model}/>
}
