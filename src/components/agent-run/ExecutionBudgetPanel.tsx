import {useEffect,useState} from 'react'
import {localApi} from '@/lib/localDevices'
export type ExecutionBudget={model_calls:number;tool_calls:number;search_calls:number;read_calls:number;wall_ms:number;closing_model_calls:number}
export function ExecutionBudgetSettings({value,onChange,maxSteps}:{value:ExecutionBudget|null;onChange:(value:ExecutionBudget|null)=>void;maxSteps:number}){
  const defaults:ExecutionBudget={model_calls:maxSteps*4+2,tool_calls:maxSteps*2,search_calls:maxSteps*2,read_calls:maxSteps*2,wall_ms:3600000,closing_model_calls:1}
  const fields:{key:keyof ExecutionBudget;label:string;max:number}[]=[{key:'model_calls',label:'模型请求总额',max:500},{key:'closing_model_calls',label:'其中预留收尾请求',max:2},{key:'tool_calls',label:'工具请求总额',max:200},{key:'search_calls',label:'其中搜索请求',max:200},{key:'read_calls',label:'其中读取请求',max:200}]
  return <details className="mt-3 rounded-xl border p-3 text-xs">
    <summary className="cursor-pointer font-medium">本次执行预算</summary>
    <p className="mt-2 text-muted-foreground">调用前持久化预留，重启不会重置。搜索和读取计入工具总额；计数不是账单金额。耗尽后保留已有记录和缺口。</p>
    <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={value!==null} onChange={e=>onChange(e.target.checked?defaults:null)}/>自定义本次预算</label>
    {value?<div className="mt-2 grid gap-2 sm:grid-cols-2">
      {fields.map(field=><label key={field.key}>{field.label}<input type="number" min={0} max={field.max} value={value[field.key]} className="ml-2 w-24 rounded border bg-background p-1" onChange={e=>onChange({...value,[field.key]:Number(e.target.value)})}/></label>)}
      <label>耗时上限（含等待，秒）<input type="number" min={1} max={86400} value={value.wall_ms/1000} className="ml-2 w-24 rounded border bg-background p-1" onChange={e=>onChange({...value,wall_ms:Number(e.target.value)*1000})}/></label>
    </div>:<p className="mt-2 text-muted-foreground">默认模型≤{defaults.model_calls} 次（含 1 次收尾），工具≤{defaults.tool_calls} 次，耗时≤1 小时。</p>}
  </details>
}
type BudgetState={question_id:string;limits:ExecutionBudget;usage:{model_intents:number;tool_intents:number;search_intents:number;read_intents:number;closing_intents:number}}
export function ExecutionBudgetStatus({runId,revision}:{runId:string;revision:string}){
  const [data,setData]=useState<BudgetState|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
  useEffect(()=>{
    const abort=new AbortController()
    void localApi<BudgetState>(`/api/agent-runs/${encodeURIComponent(runId)}/budget`,undefined,abort.signal).then(value=>{if(!abort.signal.aborted){setData(value);setError('')}})
      .catch(()=>{if(!abort.signal.aborted){setData(null);setError('预算读取未完成。')}})
    return ()=>abort.abort()
  },[runId,revision,refresh])
  return <details className="mt-3 rounded-xl border bg-card p-3 text-xs">
    <summary className="cursor-pointer font-medium">执行预算与已预留请求</summary>
    {data&&<p className="mt-2">模型 {data.usage.model_intents}/{data.limits.model_calls}（收尾 {data.usage.closing_intents}/{data.limits.closing_model_calls}） · 工具 {data.usage.tool_intents}/{data.limits.tool_calls} · 搜索 {data.usage.search_intents}/{data.limits.search_calls} · 读取 {data.usage.read_intents}/{data.limits.read_calls}{data.question_id?` · 问题 ${data.question_id}`:''}</p>}
    <p className="mt-2 text-muted-foreground">预留发生在请求前；故障和失败请求不自动返还。来源权限另行检查。</p>
    <button type="button" className="mt-2 rounded border px-2 py-1" onClick={()=>setRefresh(v=>v+1)}>刷新执行预算</button>
    {error&&<p role="status" className="mt-2">{error}</p>}
  </details>
}
