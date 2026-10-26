import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent} from "@/lib/pgNativePilotApi"
type Api=ReturnType<typeof createPgNativePilotApi>
const button="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:opacity-50"
export default function PgNativeAgentPlanReviewPanel({api,agents,enabled,onUpdated,onExpired}:{api:Api;agents:PgNativeAgent[];enabled:boolean;onUpdated:()=>Promise<void>;onExpired:()=>void}){
  const [selected,setSelected]=useState("")
  const role=agents.find(item=>item.id===selected)
  return <section aria-label="角色默认方案审核" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="font-semibold">角色默认方案审核</h3>
    <p className="text-sm leading-6 text-slate-500">新任务可沿用角色设置，也可在提交时单独选择。保存会更新角色修订，运行中的任务会重新核对配置。</p>
    <label className="block text-sm">配置审核设置的角色<select aria-label="配置审核设置的角色" className="mt-2 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3" value={selected} onChange={event=>setSelected(event.target.value)}>
      <option value="">请选择本人角色</option>{agents.map(item=><option key={item.id} value={item.id}>{item.name} · 修订 {item.revision}</option>)}
    </select></label>
    {role&&<Setting key={role.id+":"+role.revision} api={api} role={role} enabled={enabled} onUpdated={onUpdated} onExpired={onExpired}/>}
  </section>
}
function Setting({api,role,enabled,onUpdated,onExpired}:{api:Api;role:PgNativeAgent;enabled:boolean;onUpdated:()=>Promise<void>;onExpired:()=>void}){
  const [required,setRequired]=useState(role.spec.require_plan_review===true),[busy,setBusy]=useState(false),[message,setMessage]=useState("")
  const generation=useRef(0)
  useEffect(()=>{const current=++generation.current;return ()=>{if(generation.current===current)++generation.current}},[])
  const save=async()=>{
    if(!enabled||busy||required===(role.spec.require_plan_review===true))return
    const current=generation.current;setBusy(true);setMessage("")
    try{
      await api.updateAgentPlanReview(role.id,role.revision,required)
      if(generation.current!==current)return
      setMessage("角色审核设置已保存。");await onUpdated()
    }catch(error){
      if(generation.current!==current)return
      if(error instanceof PgNativePilotError&&error.status===401){onExpired();return}
      setMessage(error instanceof PgNativePilotError&&error.status===409?"角色修订已变化，请刷新后重新核对。":"保存结果尚未确认，请刷新角色设置后核对当前值。")
    }finally{if(generation.current===current)setBusy(false)}
  }
  return <div className="space-y-3">
    <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" aria-label="角色默认需要本人审核方案" className="mt-1.5" checked={required} disabled={!enabled||busy} onChange={event=>setRequired(event.target.checked)}/>默认需要本人审核方案，明确批准后继续后续交付。</label>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!enabled||busy||required===(role.spec.require_plan_review===true)} onClick={()=>void save()}>保存角色审核设置</button>
      <button type="button" className={button} disabled={busy} onClick={()=>void onUpdated()}>刷新角色审核设置</button></div>
    {message&&<p role="status" className="text-sm text-slate-600">{message}</p>}
  </div>
}
