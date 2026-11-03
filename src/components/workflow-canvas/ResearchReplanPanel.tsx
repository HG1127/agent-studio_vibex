import {useEffect,useRef,useState} from 'react'
import {localApi} from '@/lib/localDevices'
import {getPocketBaseUrl} from '@/lib/pb'
import {vibexAuthHeaders} from '@/lib/studioAuth'
type Addition={model_calls:number;tool_calls:number;search_calls:number;read_calls:number;closing_model_calls:number;wall_ms:number}
type Preview={preview_hash:string;can_start:boolean;question_ids:string[];root_usage:{model_intents:number;tool_intents:number};root_limits:{parent:{model_calls:number;tool_calls:number}};decisions:{stage_id:string;title:string;action:string;reason:string}[];blocked:{code:string;stage_id?:string}[]}
const actionLabels:Record<string,string>={reuse:'复用已验收产物',run:'执行缺口阶段',review:'等待人工复核，复用已有执行',defer:'本次不执行，保留缺口'}
const errors:Record<string,string>={research_model_budget_required:'总模型额度已耗尽，需要明确追加。',research_question_budget_required:'问题模型额度不足，请给所选问题追加额度。',research_wall_budget_required:'总时限已到，需要明确延长。',research_question_wall_budget_required:'问题时限已到，需要明确延长。',research_write_reconciliation_required:'存在结果未知的外部操作，核查前不能自动重试。',research_dependency_outside_scope:'所选阶段依赖尚未完成的其他问题，请扩大范围或先处理前驱。',research_no_missing_work:'没有可自动执行的缺口阶段。',research_spec_revision_changed:'方案已改变，不能静默沿用新的方案重试。',research_model_unverified:'模型连接需要重新验证。'}
const zero=():Addition=>({model_calls:0,tool_calls:0,search_calls:0,read_calls:0,closing_model_calls:0,wall_ms:0})
export function ResearchReplanPanel({runId,caseId,onStarted}:{runId:string;caseId:string;onStarted:(id:string)=>void}){
  const [questions,setQuestions]=useState<{question_id:string;question:string}[]>([]),[automatic,setAutomatic]=useState(true),[selected,setSelected]=useState<string[]>([])
  const [extra,setExtra]=useState(zero),[questionExtra,setQuestionExtra]=useState<Record<string,{model_calls:number;wall_ms:number}>>({}),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const pending=useRef<{idempotency_key:string;preview_hash:string;request:unknown}|null>(null)
  useEffect(()=>{const abort=new AbortController();void localApi<{questions:typeof questions}>(`/api/business/cases/${encodeURIComponent(caseId)}`,undefined,abort.signal).then(c=>{if(!abort.signal.aborted)setQuestions(c.questions)}).catch(()=>{if(!abort.signal.aborted)setError('问题范围当前不可读取。')});return ()=>abort.abort()},[caseId])
  function edit(){setPreview(null);setError('')}
  function request(){return {question_ids:automatic?undefined:selected,additional_budget:extra,additional_question_budgets:automatic?{}:Object.fromEntries(selected.filter(q=>questionExtra[q]).map(q=>[q,questionExtra[q]]))}}
  async function inspect(){setBusy(true);setError('');try{setPreview(await localApi<Preview>(`/api/workflow-runs/${encodeURIComponent(runId)}/replan-preview`,request()))}catch{setError('预览失败：请检查是否正在查看最新的已结束执行，以及当前来源权限。')}finally{setBusy(false)}}
  async function start(){
    if(!preview?.can_start)return
    pending.current=pending.current||{idempotency_key:crypto.randomUUID(),preview_hash:preview.preview_hash,request:request()}
    setBusy(true);setError('')
    try{const response=await fetch(`${getPocketBaseUrl()}/api/workflow-runs/${encodeURIComponent(runId)}/replan`,{method:'POST',headers:{'Content-Type':'application/json',...vibexAuthHeaders()},body:JSON.stringify(pending.current)})
      if(!response.ok){const failure=new Error('replan_start_failed') as Error&{definite?:boolean};failure.definite=response.status>=400&&response.status<500;throw failure}
      const result=await response.json() as {run_id?:string};if(!result.run_id)throw Error('ambiguous_replan_reply');pending.current=null;onStarted(result.run_id)
    }
    catch(failure){if((failure as {definite?:boolean}).definite){pending.current=null;setPreview(null);setError('当前条件或记录已变化，未开始本次补查，请重新预览。')}else setError('启动结果尚未确认。可重试同一请求，或刷新查看后续执行。')}
    finally{setBusy(false)}
  }
  return <details className="mt-3 rounded border p-3" aria-label="只补缺口">
    <summary className="cursor-pointer font-medium">只补缺口</summary>
    <p className="my-2 text-xs text-muted-foreground">创建新的执行版本，复用当前可读取且仍有效的产物；旧记录、事实集和报告保留原版本。所有后续调用继续累计到原任务，失败调用也计数。</p>
    <fieldset disabled={busy||Boolean(pending.current)} className="space-y-2 disabled:opacity-60">
      <label className="flex items-center gap-2"><input type="checkbox" checked={automatic} onChange={e=>{setAutomatic(e.target.checked);edit()}}/>自动识别有缺口的问题</label>
      {!automatic&&questions.map(q=><div key={q.question_id} className="rounded border p-2"><label className="flex gap-2"><input type="checkbox" checked={selected.includes(q.question_id)} onChange={e=>{setSelected(s=>e.target.checked?[...s,q.question_id]:s.filter(id=>id!==q.question_id));edit()}}/>{q.question}</label>{selected.includes(q.question_id)&&<div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label>该问题追加模型次数<input type="number" min={0} max={500} className="w-full rounded border bg-background p-1" value={questionExtra[q.question_id]?.model_calls||0} onChange={e=>{setQuestionExtra(s=>({...s,[q.question_id]:{model_calls:Number(e.target.value),wall_ms:s[q.question_id]?.wall_ms||0}}));edit()}}/></label>
        <label>该问题延长分钟<input type="number" min={0} max={1440} className="w-full rounded border bg-background p-1" value={(questionExtra[q.question_id]?.wall_ms||0)/60000} onChange={e=>{setQuestionExtra(s=>({...s,[q.question_id]:{model_calls:s[q.question_id]?.model_calls||0,wall_ms:Number(e.target.value)*60000}}));edit()}}/></label>
      </div>}</div>)}
      <p className="text-xs text-muted-foreground">追加是对累计上限的明确授权，不重置已用计数。共享阶段同时占用所选问题的额度；请求次数不等同供应商费用。</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>总模型追加次数<input type="number" min={0} max={500} className="w-full rounded border bg-background p-1" value={extra.model_calls} onChange={e=>{setExtra({...extra,model_calls:Number(e.target.value)});edit()}}/></label>
        <label>总工具追加次数<input type="number" min={0} max={200} className="w-full rounded border bg-background p-1" value={extra.tool_calls} onChange={e=>{setExtra({...extra,tool_calls:Number(e.target.value)});edit()}}/></label>
        <label>搜索追加次数<input type="number" min={0} max={200} className="w-full rounded border bg-background p-1" value={extra.search_calls} onChange={e=>{setExtra({...extra,search_calls:Number(e.target.value)});edit()}}/></label>
        <label>读取追加次数<input type="number" min={0} max={200} className="w-full rounded border bg-background p-1" value={extra.read_calls} onChange={e=>{setExtra({...extra,read_calls:Number(e.target.value)});edit()}}/></label>
        <label>收尾追加次数<input type="number" min={0} max={30} className="w-full rounded border bg-background p-1" value={extra.closing_model_calls} onChange={e=>{setExtra({...extra,closing_model_calls:Number(e.target.value)});edit()}}/></label>
        <label>总时限延长分钟<input type="number" min={0} max={1440} className="w-full rounded border bg-background p-1" value={extra.wall_ms/60000} onChange={e=>{setExtra({...extra,wall_ms:Number(e.target.value)*60000});edit()}}/></label>
      </div>
      <button type="button" disabled={!automatic&&!selected.length} className="rounded border px-2 py-1 disabled:opacity-50" onClick={()=>void inspect()}>预览只补缺口</button>
    </fieldset>
    {preview&&<div className="mt-3 space-y-2 text-xs" aria-label="补查预览">
      <p>累计模型 {preview.root_usage.model_intents}/{preview.root_limits.parent.model_calls} · 工具 {preview.root_usage.tool_intents}/{preview.root_limits.parent.tool_calls}</p>
      {preview.decisions.map(d=><p key={d.stage_id}>{d.title}：{actionLabels[d.action]||d.action}</p>)}
      {preview.blocked.map((b,i)=><p role="alert" key={i}>{errors[b.code]||'当前条件不能开始补查，请检查阶段、预算和来源。'}</p>)}
      {preview.can_start&&<button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>void start()}>{pending.current?'重试同一补查请求':'确认预览并开始补查'}</button>}
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </details>
}
