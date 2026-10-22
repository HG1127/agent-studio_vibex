import {useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type AgentHttpTool,type PgNativeAgent,type PgNativeToolConnection,type createPgNativePilotApi} from "@/lib/pgNativePilotApi"
const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
const button="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50"
type Props={api:ReturnType<typeof createPgNativePilotApi>;agents:PgNativeAgent[];connections:PgNativeToolConnection[];
  enabled:boolean;onSaved:()=>Promise<void>;onExpired:()=>void}
export default function PgNativeAgentHttpToolsPanel(props:Props){
  const [id,setId]=useState(""),[busyFor,setBusyFor]=useState(""),[reset,setReset]=useState(0)
  const agent=props.agents.find(item=>item.id===id)
  const formKey=agent?agent.id+":"+agent.revision+":"+reset:"",busy=Boolean(busyFor)
  return <section aria-label="Agent HTTP 工具绑定" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <h2 className="font-semibold">Agent 自定义 HTTP 工具</h2>
    <p className="text-sm leading-6 text-slate-600">为角色选择本人已启用的连接，并写明用途及所需参数。每次工具操作仍需单独审批。</p>
    {!props.enabled&&<p className="text-sm text-amber-900">当前环境或状态未开放工具配置保存。</p>}
    <label className="block space-y-2 text-sm">选择要配置工具的 Agent
      <select aria-label="工具绑定 Agent" className={field} value={id} disabled={!props.enabled||busy} onChange={event=>setId(event.target.value)}>
        <option value="">请选择 Agent</option>{props.agents.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {agent&&<p className="text-xs text-slate-500">当前角色修订 {agent.revision} · 已绑定 {agent.spec.http_tools?.length??0} 个 HTTP 工具</p>}
    {agent&&<AgentToolsForm key={formKey} {...props} enabled={props.enabled&&!busy} agent={agent}
      onBusy={value=>setBusyFor(previous=>value?formKey:previous===formKey?"":previous)} onReset={()=>setReset(value=>value+1)}/>}
  </section>
}
export function AgentToolsForm({api,agent,connections,enabled,onSaved,onExpired,onBusy,onReset}:{
  api:Props["api"];agent:PgNativeAgent;connections:PgNativeToolConnection[];enabled:boolean;onSaved:()=>Promise<void>;
  onExpired:()=>void;onBusy:(value:boolean)=>void;onReset:()=>void
}){
  const [selected,setSelected]=useState<AgentHttpTool[]>(()=>structuredClone(agent.spec.http_tools??[]))
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("")
  const active=useRef(false)
  useEffect(()=>{active.current=true;return ()=>{active.current=false}},[])
  const valid=selected.length<=10&&selected.every(item=>item.description.trim()&&
    connections.some(connection=>connection.id===item.connection_id&&connection.revision===item.connection_revision&&connection.enabled))
  const toggle=(connection:PgNativeToolConnection,checked:boolean)=>setSelected(previous=>checked?[...previous,{
    name:"http_c"+connection.id.replaceAll("-",""),description:connection.description.replace(/[\u0000-\u001f\u007f]/g," "),
    connection_id:connection.id,connection_revision:connection.revision,
  }]:previous.filter(item=>item.connection_id!==connection.id))
  const reload=async()=>{
    setBusy(true);onBusy(true)
    try{await onSaved();if(active.current)onReset()}
    catch{if(active.current)setError("刷新失败，请稍后重试。")}
    finally{onBusy(false);if(active.current)setBusy(false)}
  }
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!enabled||busy||uncertain||!valid)return
    setBusy(true);onBusy(true);setError("");setNotice("")
    try{
      await api.updateAgentHttpTools(agent.id,agent.revision,selected)
      if(!active.current)return
      setNotice("工具绑定已保存。启动任务时请核对最新角色配置。")
      await onSaved()
    }catch(cause){
      if(!active.current)return
      if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
      const known=cause instanceof PgNativePilotError&&[400,403,404,405,409,429].includes(cause.status)
      setUncertain(!known)
      setError(known?"工具归属、版本或配置权限未通过检查，请刷新核对。":"保存结果尚未确认，请刷新配置核对后再编辑。")
    }finally{onBusy(false);if(active.current)setBusy(false)}
  }
  return <form onSubmit={submit} className="space-y-3">
    {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}
    <fieldset disabled={!enabled||busy||uncertain} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">HTTP 工具选择（最多 10 个）</legend>
      {!connections.length&&<p className="text-sm text-slate-500">请先添加本人 HTTP 连接。</p>}
      {connections.map(connection=>{
        const chosen=selected.find(item=>item.connection_id===connection.id)
        return <div key={connection.id} className="space-y-2 rounded-xl border border-slate-100 p-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(chosen)}
            disabled={!chosen&&(!connection.enabled||selected.length>=10)} onChange={event=>toggle(connection,event.target.checked)}/>
            <span className="break-words">{connection.name} · {connection.method} {connection.url}{!connection.enabled?" · 已停用":""}</span></label>
          {chosen&&<>
            <label className="block space-y-1 break-all text-sm">用途与参数（{chosen.name}）
              <input aria-label={connection.name+" 用途与参数"} className={field} maxLength={500} required value={chosen.description}
                onChange={event=>setSelected(previous=>previous.map(item=>item.name===chosen.name?{...item,description:event.target.value}:item))}/>
            </label>
            {chosen.connection_revision!==connection.revision&&<div className="space-y-2 text-sm text-amber-900">
              <p>连接已从版本 {chosen.connection_revision} 更新至 {connection.revision}，请核对用途及发送范围。</p>
              <button type="button" className={button} onClick={()=>setSelected(previous=>previous.map(item=>item.name===chosen.name?{...item,connection_revision:connection.revision}:item))}>采用当前连接版本</button>
            </div>}
          </>}
        </div>
      })}
      {selected.filter(item=>!connections.some(connection=>connection.id===item.connection_id)).map(item=><div key={item.name} className="space-y-2 text-sm text-amber-900">
        <p>{item.name}：绑定连接暂不可用，请刷新或移除。</p><button type="button" className={button} onClick={()=>setSelected(previous=>previous.filter(tool=>tool.name!==item.name))}>移除此不可用绑定</button>
      </div>)}
      <button type="submit" className={button} disabled={!valid}>保存 HTTP 工具绑定</button>
    </fieldset>
    <button type="button" className={button} disabled={busy||!enabled} onClick={()=>void reload()}>放弃草稿并刷新工具配置</button>
  </form>
}
