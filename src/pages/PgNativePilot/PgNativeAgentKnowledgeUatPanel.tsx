import {useEffect,useState,type FormEvent} from "react"
import {BookOpen,CheckCircle2,Loader2,ShieldAlert} from "lucide-react"
import {PgNativePilotError,type PgNativeAgent,type PgNativeKnowledge,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>
function message(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===405)return "当前隔离环境未批准修改 Agent 配置。"
    if(error.status===404)return "Agent 或知识库不存在，或当前员工无权使用。"
    if(error.status===409)return "Agent 配置版本已改变，请刷新后再试。"
    if(error.status===401)return "员工会话已失效，请重新登录。"
  }
  return "知识库绑定失败。请确认隔离测试服务和当前账号状态。"
}

/** DEV-only binding form; backend validates owner, tool and optimistic revision. */
export default function PgNativeAgentKnowledgeUatPanel({api,agents,bases,onSaved}:{
  api:Api;agents:PgNativeAgent[];bases:PgNativeKnowledge[]
  onSaved:()=>Promise<void>
}){
  const [agentId,setAgentId]=useState("")
  const [selected,setSelected]=useState<string[]>([])
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [success,setSuccess]=useState("")
  const agent=agents.find(x=>x.id===agentId)
  useEffect(()=>{
    setSelected(agent?.spec.knowledge_base_ids??[])
    setError("");setSuccess("")
  },[agentId,agent?.revision])
  const toggle=(id:string)=>{
    setError("");setSuccess("")
    setSelected(old=>old.includes(id)?old.filter(x=>x!==id):
      old.length<3?[...old,id]:old)
  }
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    if(!agent||saving)return
    setSaving(true);setError("");setSuccess("")
    try{
      await api.updateAgentKnowledgeBases(agent.id,agent.revision,selected)
      await onSaved()
      setSuccess("已保存本人 Agent 的知识库权限绑定。任务仍需单独审批才可能执行。")
    }catch(e){setError(message(e))}
    finally{setSaving(false)}
  }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
      <ShieldAlert size={18}/>Agent 关联知识库 · 隔离配置 UAT
    </h2>
    <p className="mt-2 text-xs leading-6 text-amber-900">
      仅在本地开发且服务端单独批准配置写入时可用。最多关联 3 个本人私有知识库。
      此操作仅修改 Agent 配置，不会启动任务、调用模型或触发 Embedding。
    </p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        目标 Agent
        <select required value={agentId} onChange={e=>setAgentId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <option value="">请选择我的 Agent</option>
          {agents.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </label>
      {!!agent&&<fieldset className="space-y-2">
        <legend className="text-sm font-medium">允许检索的知识库（{selected.length}/3）</legend>
        {bases.length===0&&<p className="text-xs text-slate-500">当前员工没有可绑定的私有知识库。</p>}
        {bases.map(item=><label key={item.id}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
          <input type="checkbox" checked={selected.includes(item.id)}
            disabled={!selected.includes(item.id)&&selected.length>=3}
            onChange={()=>toggle(item.id)}/>
          <BookOpen size={16} className="text-slate-500"/>
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
        </label>)}
      </fieldset>}
      <button type="submit" disabled={!agent||saving}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {saving?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>}
        保存关联（只更新配置）
      </button>
    </form>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {success&&<p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm text-emerald-800">{success}</p>}
  </section>
}
