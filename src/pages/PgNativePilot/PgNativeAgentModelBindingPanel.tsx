import {useMemo,useState,type FormEvent} from "react"
import {KeyRound,Link2,ShieldAlert,Unlink} from "lucide-react"
import {PgNativePilotError,type PgNativeAgent,type PgNativeModelConnection,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>
const selectField="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
const actionButton="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"

export default function PgNativeAgentModelBindingPanel({
  api,agents,connections,onUpdated,runtimeSubmissionEnabled=false,initialAgentId,
}:{
  api:Api;agents:PgNativeAgent[];connections:PgNativeModelConnection[]
  onUpdated:()=>Promise<void>
  runtimeSubmissionEnabled?:boolean
  initialAgentId?:string
}){
  const initialAgent=agents.find(agent=>agent.id===initialAgentId)
  const [agentId,setAgentId]=useState(()=>initialAgent?.id??"")
  const [connectionId,setConnectionId]=useState(()=>initialAgent?.spec.model_binding?.connection_id??"")
  const [modelId,setModelId]=useState(()=>initialAgent?.spec.model_binding?.model_id??"")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const selectedAgent=agents.find(a=>a.id===agentId)
  // The server will recheck everything in one owner transaction.
  const available=useMemo(()=>connections.filter(c=>c.enabled&&c.status==="ok"&&
    ((c.provider==="openai"&&c.base_url==="https://api.openai.com/v1")||
     (c.provider==="anthropic"&&c.base_url==="https://api.anthropic.com/v1")||
     (c.provider==="gemini"&&c.base_url===
       "https://generativelanguage.googleapis.com/v1beta"))&&
    c.models.some(m=>/^[A-Za-z0-9._:/-]{1,120}$/.test(m))),
  [connections])
  const connection=available.find(c=>c.id===connectionId)
  const modelOptions=connection?.models.filter(m=>/^[A-Za-z0-9._:/-]{1,120}$/.test(m))??[]
  const beginAgent=(next:string)=>{
    setAgentId(next);setError("");setNotice("")
    const saved=agents.find(a=>a.id===next)?.spec.model_binding
    setConnectionId(saved?.connection_id??"")
    setModelId(saved?.model_id??"")
  }
  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(!selectedAgent||!connection||!modelOptions.includes(modelId))return
    setBusy(true);setError("");setNotice("")
    try{
      await api.bindAgentModel(selectedAgent.id,selectedAgent.revision,{
        connection_id:connection.id,connection_revision:connection.revision,
        model_id:modelId,
      })
      await onUpdated()
      setNotice("已验证并保存本人模型绑定；当前 Worker 不会使用此连接发起模型调用。")
    }catch(cause){
      setError(cause instanceof PgNativePilotError&&cause.status===409
        ?"Agent 或连接版本已变化、未测试通过或模型未列入配置。请刷新重选。"
        :cause instanceof PgNativePilotError&&cause.status===404
          ?"所选配置不属于当前员工或已不存在。"
          :"模型绑定未保存，请检查员工权限和配置授权。")
    }finally{setBusy(false)}
  }
  const unbind=async()=>{
    if(!selectedAgent?.spec.model_binding)return
    setBusy(true);setError("");setNotice("")
    try{
      await api.bindAgentModel(selectedAgent.id,selectedAgent.revision,null)
      await onUpdated()
      setConnectionId("");setModelId("")
      setNotice("已解除模型绑定。")
    }catch{
      setError("解除绑定失败，请刷新后确认 Agent 最新修订。")
    }finally{setBusy(false)}
  }
  return <section aria-label="Agent 模型选择" className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center gap-2"><KeyRound size={18} className="text-indigo-600"/>
      <h2 className="font-semibold">Agent 模型绑定</h2>
    </div>
    <p className="mt-2 text-xs leading-6 text-slate-500">
      仅能关联本人已启用、测试通过的官方模型连接。服务端检查所有者、模型 ID 与配置修订号；不会保存密钥到 Agent，也不会启动模型调用。
    </p>
    <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
      <label className="space-y-1 text-xs font-medium">选择 Agent
        <select aria-label="选择 Agent" className={selectField} value={agentId}
          onChange={e=>beginAgent(e.target.value)}>
          <option value="">请选择 Agent</option>
          {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium">模型连接
        <select aria-label="选择模型连接" className={selectField} value={connectionId}
          onChange={e=>{setConnectionId(e.target.value);setModelId("")}}
          disabled={!selectedAgent}>
          <option value="">请选择已测试连接</option>
          {available.map(c=><option value={c.id} key={c.id}>{c.name} · {c.provider}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium">具体模型
        <select aria-label="选择具体模型" className={selectField} value={modelId}
          onChange={e=>setModelId(e.target.value)} disabled={!connection}>
          <option value="">请选择模型 ID</option>
          {modelOptions.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 md:col-span-3">
        <button type="submit" className={actionButton}
          disabled={busy||!selectedAgent||!connection||!modelOptions.includes(modelId)}>
          <Link2 size={15}/>验证并保存绑定
        </button>
        {selectedAgent?.spec.model_binding&&<button type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          disabled={busy} onClick={()=>void unbind()}><Unlink size={15}/>解除绑定</button>}
      </div>
    </form>
    {selectedAgent?.spec.model_binding&&<p className="mt-3 text-xs text-slate-600">
      当前绑定：{selectedAgent.spec.model_binding.model_id} · 连接版本 {selectedAgent.spec.model_binding.connection_revision}
    </p>}
    {!available.length&&<p className="mt-3 text-xs text-amber-700">
      尚无可绑定的模型连接。请先在“模型连接”中通过独立授权的只读供应商检测。
    </p>}
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-800">
      <ShieldAlert className="mt-0.5 shrink-0" size={14}/>
      {runtimeSubmissionEnabled?"当前环境已授权提交绑定模型的任务。请进入“运行 Agent”，核对任务后再批准模型调用；调用可能产生费用。":
        "绑定只更新配置。当前环境尚未授权提交模型任务，授权后才会显示运行入口。"}
    </p>
    {notice&&<p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </section>
}
