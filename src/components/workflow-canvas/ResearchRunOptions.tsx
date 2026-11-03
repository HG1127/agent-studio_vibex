import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {localApi} from '@/lib/localDevices'
import type {ModelOption,WfNode} from '@/pages/WorkflowCanvas/useWorkflowCanvas'

type Budget={model_calls:number;tool_calls:number;wall_ms:number;closing_model_calls:number}
type Stage={question_id?:string;max_steps?:number;acceptance?:string;allow_partial?:boolean;budget?:Budget}
export type ResearchLaunchDraft={enabled:boolean;case_id:string;model:string;budget:Budget;question_model_calls:number;stages:Record<string,Stage>}
export const newResearchLaunch=():ResearchLaunchDraft=>({enabled:false,case_id:'',model:'',budget:{model_calls:30,tool_calls:30,wall_ms:3600000,closing_model_calls:2},question_model_calls:12,stages:{}})

export function ResearchRunOptions({nodes,models,value,onChange}:{nodes:WfNode[];models:ModelOption[];value:ResearchLaunchDraft;onChange:(value:ResearchLaunchDraft)=>void}){
  const [questions,setQuestions]=useState<{question_id:string;question:string}[]>([]),[message,setMessage]=useState('')
  useEffect(()=>{
    const abort=new AbortController();setQuestions([]);setMessage('')
    if(value.enabled&&value.case_id)void localApi<{questions:{question_id:string;question:string}[]}>(`/api/business/cases/${encodeURIComponent(value.case_id)}`,undefined,abort.signal)
      .then(c=>{if(!abort.signal.aborted)setQuestions(c.questions)})
      .catch(()=>{if(!abort.signal.aborted)setMessage('任务不存在或当前员工无权读取。')})
    return ()=>abort.abort()
  },[value.enabled,value.case_id])
  const agents=nodes.filter(n=>n.type==='agent'),invalid=nodes.some(n=>!['start','agent','end'].includes(String(n.type)))
  function stageChange(id:string,patch:Partial<Stage>){onChange({...value,stages:{...value.stages,[id]:{...value.stages[id],...patch}}})}
  return <div className="rounded-xl border p-3 text-sm">
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>研究阶段模式</label>
    {value.enabled&&<div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">每个 Agent 阶段创建持久化子运行，按依赖推进。提示词支持 {'{{input}}'}，前驱产物以受保护引用传入。阶段交付和业务验收分别记录；正式记录可在<Link className="underline" to="/agent-run" target="_blank" rel="noreferrer">运行页</Link>创建业务任务并复核。</p>
      {invalid&&<p role="alert" className="text-destructive">研究模式仅支持开始、Agent 和结束节点组成的无环图。</p>}
      <label className="block">业务任务 ID<input className="mt-1 w-full rounded border bg-background p-2" value={value.case_id} onChange={e=>onChange({...value,case_id:e.target.value.trim(),stages:{}})}/></label>
      {message&&<p role="alert" className="text-destructive">{message}</p>}
      <label className="block">阶段默认模型<select aria-label="阶段默认模型" className="mt-1 w-full rounded border bg-background p-2" value={value.model} onChange={e=>onChange({...value,model:e.target.value})}><option value="">选择模型连接（启动时校验）</option>{models.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <p className="text-xs text-muted-foreground">以下额度统计请求意图，失败请求也计数。收尾额度包含在模型总额度内；不代表实际费用。</p>
      <div className="grid grid-cols-2 gap-2">
        <label>父任务模型总次数<input type="number" min={0} max={500} className="w-full rounded border bg-background p-1" value={value.budget.model_calls} onChange={e=>onChange({...value,budget:{...value.budget,model_calls:Number(e.target.value)}})}/></label>
        <label>父任务工具总次数<input type="number" min={0} max={200} className="w-full rounded border bg-background p-1" value={value.budget.tool_calls} onChange={e=>onChange({...value,budget:{...value.budget,tool_calls:Number(e.target.value)}})}/></label>
        <label>父任务预留收尾次数<input type="number" min={0} max={30} className="w-full rounded border bg-background p-1" value={value.budget.closing_model_calls} onChange={e=>onChange({...value,budget:{...value.budget,closing_model_calls:Number(e.target.value)}})}/></label>
        <label>父任务时限（分钟）<input type="number" min={1} max={1440} className="w-full rounded border bg-background p-1" value={value.budget.wall_ms/60000} onChange={e=>onChange({...value,budget:{...value.budget,wall_ms:Number(e.target.value)*60000}})}/></label>
        <label>每问题共享模型次数<input type="number" min={0} max={500} className="w-full rounded border bg-background p-1" value={value.question_model_calls} onChange={e=>onChange({...value,question_model_calls:Number(e.target.value)})}/></label>
      </div>
      {agents.map(n=>{const s=value.stages[n.id]||{},b=s.budget||{model_calls:12,tool_calls:12,closing_model_calls:1,wall_ms:1800000};return <fieldset key={n.id} className="space-y-2 rounded border p-2">
        <legend className="px-1 font-medium">{String(n.data.title||n.id)}</legend>
        <label className="block">绑定问题<select className="ml-2 max-w-full rounded border bg-background p-1" value={s.question_id||''} onChange={e=>stageChange(n.id,{question_id:e.target.value})}><option value="">跨问题阶段</option>{questions.map(q=><option key={q.question_id} value={q.question_id}>{q.question}</option>)}</select></label>
        <label className="block">验收方式<select aria-label="验收方式" className="ml-2 max-w-full rounded border bg-background p-1" value={s.acceptance||'results_present'} onChange={e=>stageChange(n.id,{acceptance:e.target.value})}><option value="results_present">保存了工具结果（技术验收）</option><option value="answer_present">问题答案记录存在（技术验收）</option><option value="research.evidence.v1">正式记录证据规则与人工复核</option><option value="execution_only">子运行正常结束（技术验收）</option></select></label>
        <div className="grid grid-cols-2 gap-2">
          <label>最多步骤<input type="number" min={1} max={30} className="w-full rounded border bg-background p-1" value={s.max_steps??10} onChange={e=>stageChange(n.id,{max_steps:Number(e.target.value)})}/></label>
          <label>模型总次数<input type="number" min={0} max={500} className="w-full rounded border bg-background p-1" value={b.model_calls} onChange={e=>stageChange(n.id,{budget:{...b,model_calls:Number(e.target.value)}})}/></label>
          <label>工具总次数<input type="number" min={0} max={200} className="w-full rounded border bg-background p-1" value={b.tool_calls} onChange={e=>stageChange(n.id,{budget:{...b,tool_calls:Number(e.target.value)}})}/></label>
          <label>收尾次数<input type="number" min={0} max={2} className="w-full rounded border bg-background p-1" value={b.closing_model_calls} onChange={e=>stageChange(n.id,{budget:{...b,closing_model_calls:Number(e.target.value)}})}/></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.allow_partial===true} onChange={e=>stageChange(n.id,{allow_partial:e.target.checked})}/>验收不完整时携带明确缺口继续</label>
      </fieldset>})}
    </div>}
  </div>
}

export function researchProfile(value:ResearchLaunchDraft,nodes:WfNode[]){
  if(!value.enabled)return undefined
  const model=/^custom:([^:]+):(.+)$/.exec(value.model)
  if(!value.case_id||!model)throw Error('研究模式需要业务任务 ID 和已验证的阶段默认模型。')
  if(nodes.some(n=>!['start','agent','end'].includes(String(n.type))))throw Error('研究模式仅支持开始、Agent 和结束节点。')
  const stages=Object.fromEntries(nodes.filter(n=>n.type==='agent').map(n=>[n.id,{acceptance:'results_present',max_steps:10,budget:{model_calls:12,tool_calls:12,closing_model_calls:1,wall_ms:1800000},...value.stages[n.id]}]))
  const questions=[...new Set(Object.values(stages).map(s=>s.question_id).filter((q):q is string=>Boolean(q)))]
  return {case_id:value.case_id,custom_model:{connection_id:model[1],model_id:model[2]},budget:value.budget,stages,question_budgets:Object.fromEntries(questions.map(q=>[q,{model_calls:value.question_model_calls,closing_model_calls:Math.min(1,value.question_model_calls),tool_calls:30,wall_ms:value.budget.wall_ms}]))}
}
