import {useState} from "react"
import type {PgNativeAgentSafeText} from "@/lib/pgNativePilotApi"
import {agentDescriptiveLimits as limits} from "../../../shared/agent-role-limits.mjs"
const lists=[{key:"deliverables",label:"交付物"},{key:"task_plan",label:"任务计划"},{key:"done_criteria",label:"完成标准"}] as const
const field="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
export function PgNativeAgentSafeTextView({value}:{value:PgNativeAgentSafeText}){
  return <div className="space-y-3 text-sm text-slate-700">
    <div><p className="text-xs font-semibold text-slate-500">目标</p><p className="mt-1 whitespace-pre-wrap break-words">{value.goal}</p></div>
    <div><p className="text-xs font-semibold text-slate-500">任务范围</p><p className="mt-1 whitespace-pre-wrap break-words">{value.task_scope||"未填写"}</p></div>
    {lists.map(({key,label})=><details key={key} className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold">{label} · {value[key].length} 项</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{value[key].map((text,index)=><li key={index} className="whitespace-pre-wrap break-words">{text}</li>)}</ol>
    </details>)}
  </div>
}
export default function PgNativeAgentSafeFields({value,onChange,disabled=false}:{value:PgNativeAgentSafeText;onChange:(value:PgNativeAgentSafeText)=>void;disabled?:boolean}){
  const [keys,setKeys]=useState(()=>Object.fromEntries(lists.map(({key})=>[key,value[key].map(()=>crypto.randomUUID())])) as Record<typeof lists[number]["key"],string[]>)
  return <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
    <label className="block space-y-1 text-xs font-medium">描述目标
      <textarea required maxLength={limits.goal} rows={3} className={field} value={value.goal} onChange={e=>onChange({...value,goal:e.target.value})}/>
      <span className="block text-right text-slate-400">{value.goal.length} / {limits.goal}</span>
    </label>
    <label className="block space-y-1 text-xs font-medium">描述范围
      <textarea maxLength={limits.task_scope} rows={3} className={field} value={value.task_scope} onChange={e=>onChange({...value,task_scope:e.target.value})}/>
      <span className="block text-right text-slate-400">{value.task_scope.length} / {limits.task_scope}</span>
    </label>
    {lists.map(({key,label})=><fieldset key={key} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold">{label}（{value[key].length} / {limits.list_items}）</legend>
      {value[key].map((text,index)=><div key={keys[key][index]??index} className="flex items-start gap-2">
        <label className="min-w-0 flex-1 text-xs">{label} {index+1}
          <textarea rows={2} maxLength={limits.list_item} value={text} className={field}
            onChange={e=>onChange({...value,[key]:value[key].map((item,i)=>i===index?e.target.value:item)})}/>
        </label>
        <button type="button" aria-label={"移除"+label+" "+(index+1)} className="mt-5 rounded-lg border border-rose-200 px-2 py-2 text-xs text-rose-700" onClick={()=>{
          setKeys(prior=>({...prior,[key]:prior[key].filter((_,i)=>i!==index)}));onChange({...value,[key]:value[key].filter((_,i)=>i!==index)})
        }}>移除</button>
      </div>)}
      <button type="button" disabled={value[key].length>=limits.list_items} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50" onClick={()=>{
        setKeys(prior=>({...prior,[key]:[...prior[key],crypto.randomUUID()]}));onChange({...value,[key]:[...value[key],""]})
      }}>添加{label}</button>
    </fieldset>)}
  </fieldset>
}
