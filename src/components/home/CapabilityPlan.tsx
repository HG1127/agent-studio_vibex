import {useEffect,useState} from 'react'
import {localApi} from '@/lib/localDevices'
type Plan={ready_for_release:boolean;scope_note:string;requirements:{id:string;title:string;state:string;limits:string;missing_tools:string[]}[];bindings:{tool:string;state:string;requires_approval:boolean}[];input_contract:unknown;task_stages:unknown[];data_objects:string[];artifacts:string[];validators:unknown[]}
const labels:Record<string,string>={native:'原生可用',connected:'已连接',configuration_required:'待配置',development_required:'需开发'}
export function CapabilityPlan({specId,revision}:{specId:string;revision:string}){
  const [open,setOpen]=useState(false),[plan,setPlan]=useState<Plan|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
  useEffect(()=>{
    setPlan(null);setError('')
    if(!open)return
    const abort=new AbortController()
    void localApi<Plan>(`/api/agent_specs/${encodeURIComponent(specId)}/capability-plan`,undefined,abort.signal)
      .then(value=>{if(!abort.signal.aborted)setPlan(value)})
      .catch(()=>{if(!abort.signal.aborted)setError('能力清单读取未完成，请检查当前员工和方案权限。')})
    return ()=>abort.abort()
  },[specId,revision,open,refresh])
  return <details className="mt-3 rounded border p-2" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-xs font-medium">能力与依赖检查</summary>
    {open&&!plan&&!error&&<p role="status" className="mt-2 text-xs">读取服务端能力清单…</p>}
    {plan&&<div className="mt-2 space-y-2 text-xs">
      <p className="font-medium">{plan.ready_for_release?'当前依赖检查通过':'存在待配置或需开发能力'}</p>
      {plan.requirements.map(item=><div key={item.id} className="rounded border p-2">
        <p>{item.title} · <strong>{labels[item.state]||item.state}</strong></p>
        <p className="mt-1 text-muted-foreground">{item.limits}</p>
        {item.missing_tools.length>0&&<p className="mt-1">需在方案中选择：{item.missing_tools.join('、')}</p>}
      </div>)}
      {plan.bindings.map((item,index)=><p key={`${item.tool}:${index}`} className="break-all">工具 {item.tool} · {labels[item.state]||item.state}{item.requires_approval?' · 执行仍需审批':''}</p>)}
      <details><summary className="cursor-pointer">输入、数据、产物与验收契约</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({input:plan.input_contract,stages:plan.task_stages,data_objects:plan.data_objects,artifacts:plan.artifacts,validators:plan.validators},null,2)}</pre></details>
      <p className="text-muted-foreground">{plan.scope_note}</p>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {open&&<button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>setRefresh(v=>v+1)}>重新检查依赖</button>}
  </details>
}
