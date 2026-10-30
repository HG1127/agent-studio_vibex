import {useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type PgNativeAgent,type AgentMcpTool,type PgNativeMcpConnection,type createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {mcpChoices,readyMcpBinding,appendAgentMcpChoice} from "@/lib/pgNativeMcpConnection"
import {useMcpConnections} from "./useMcpConnections"
const button="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50"
export default function PgNativeAgentMcpToolsPanel({api,agents,active,enabled,onSaved,onExpired,initialAgentId}:{api:ReturnType<typeof createPgNativePilotApi>;
  agents:PgNativeAgent[];active:boolean;enabled:boolean;onSaved:()=>Promise<void>;onExpired:()=>void;initialAgentId?:string}){
  const [id,setId]=useState(()=>agents.find(agent=>agent.id===initialAgentId)?.id??""),[busyFor,setBusyFor]=useState(""),[reset,setReset]=useState(0)
  const metadata=useMcpConnections(api,active,onExpired),role=agents.find(agent=>agent.id===id),key=role?role.id+":"+role.revision+":"+reset:""
  return <section aria-label="Agent MCP 工具绑定" className="space-y-3 rounded-2xl border border-indigo-100 bg-white p-5">
    <h2 className="font-semibold">Agent MCP 工具</h2>
    <p className="text-sm leading-6 text-slate-600">只选择本人已发现的具体工具。连接目录或版本变化后需要重新核对；工具注解不会代替每次操作审批。</p>
    <button type="button" className={button} disabled={!active||Boolean(busyFor)||metadata.loading} onClick={()=>void metadata.load()}>读取本人 MCP 工具供 Agent 选择</button>
    {metadata.error&&<p role="alert" className="text-sm text-rose-800">{metadata.error}</p>}
    <label className="block space-y-2 text-sm">选择要绑定 MCP 工具的 Agent<select aria-label="MCP 工具绑定 Agent" className="w-full rounded-xl border p-2" value={id}
      disabled={!active||Boolean(busyFor)} onChange={event=>setId(event.target.value)}><option value="">请选择 Agent</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
    {role&&<AgentMcpForm key={key} api={api} role={role} connections={metadata.connections} enabled={active&&enabled&&!busyFor}
      onBusy={value=>setBusyFor(previous=>value?key:previous===key?"":previous)} onSaved={onSaved} onExpired={onExpired} onReset={()=>setReset(value=>value+1)}/>}
  </section>
}
export function AgentMcpForm({api,role,connections,enabled,onBusy,onSaved,onExpired,onReset}:{api:ReturnType<typeof createPgNativePilotApi>;
  role:PgNativeAgent;connections:PgNativeMcpConnection[];enabled:boolean;onBusy:(value:boolean)=>void;onSaved:()=>Promise<void>;onExpired:()=>void;onReset:()=>void}){
  const [selection,setSelection]=useState<AgentMcpTool[]>(()=>structuredClone(role.spec.mcp_tools??[])),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("")
  const alive=useRef(false);useEffect(()=>{alive.current=true;return ()=>{alive.current=false}},[])
  const choices=mcpChoices(connections),oldNames=new Set(role.spec.mcp_tools?.map(tool=>tool.name)??[])
  const remaining=(role.spec.tools??[]).filter(name=>!oldNames.has(name)).length
  const valid=selection.length<=10&&remaining+selection.length<=20&&selection.every(({name:_,...binding})=>readyMcpBinding(binding,connections.find(row=>row.id===binding.connection_id)))
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!enabled||busy||uncertain||!valid)return
    setBusy(true);onBusy(true);setError("")
    try{await api.updateAgentMcpTools(role.id,role.revision,selection);if(alive.current)await onSaved()}
    catch(cause){if(!alive.current)return
      if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
      const known=cause instanceof PgNativePilotError&&[400,403,404,405,409,429].includes(cause.status)
      setUncertain(!known);setError(known?"角色、工具目录或连接版本未通过检查，请读取最新配置核对。":"保存结果尚未确认，请读取当前角色核对后再编辑。")
    }finally{onBusy(false);if(alive.current)setBusy(false)}
  }
  const refresh=async()=>{
    setBusy(true);onBusy(true)
    try{await api.getAgent(role.id);if(alive.current){await onSaved();if(alive.current)onReset()}}
    catch(cause){if(alive.current){if(cause instanceof PgNativePilotError&&cause.status===401)onExpired();else setError("暂时无法读取当前角色，请稍后重试。")}}
    finally{onBusy(false);if(alive.current)setBusy(false)}
  }
  return <form onSubmit={submit} className="space-y-3">
    <p className="text-xs text-slate-500">当前角色修订 {role.revision} · 已保存 {role.spec.mcp_tools?.length??0} 个 MCP 工具</p>
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}
    <fieldset disabled={!enabled||busy||uncertain} className="space-y-2"><legend className="mb-2 text-sm font-medium">MCP 工具选择（最多 10 个，全部工具合计最多 20 个）</legend>
      {!choices.length&&<p className="text-sm text-slate-500">请读取本人连接；只有已发现且可同步调用的工具能被选择。</p>}
      {choices.map(choice=>{
        const selected=selection.find(tool=>tool.connection_id===choice.binding.connection_id&&tool.tool_name===choice.binding.tool_name)
        const current=!selected||selected.connection_revision===choice.binding.connection_revision&&selected.catalog_sha256===choice.binding.catalog_sha256
        return <div key={choice.binding.connection_id+":"+choice.binding.tool_name} className="space-y-2 rounded-xl border border-slate-100 p-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(selected)} disabled={!selected&&(selection.length>=10||remaining+selection.length>=20)}
            onChange={event=>setSelection(previous=>event.target.checked?appendAgentMcpChoice(previous,choice):previous.filter(tool=>tool.name!==selected?.name))}/><span className="break-words">{choice.title}</span></label>
          <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{choice.description}</p>
          {selected&&!current&&<button type="button" className={button} onClick={()=>setSelection(previous=>previous.map(tool=>tool===selected?{name:tool.name,...choice.binding}:tool))}>采用当前 MCP 工具目录与版本</button>}
        </div>
      })}
      {selection.filter(tool=>!choices.some(choice=>choice.binding.connection_id===tool.connection_id&&choice.binding.tool_name===tool.tool_name)).map(tool=><div key={tool.name} className="space-y-2 text-sm text-amber-900">
        <p className="break-words">{tool.tool_name}：已保存的连接尚未读取或已不可用。</p><button type="button" className={button} onClick={()=>setSelection(previous=>previous.filter(item=>item.name!==tool.name))}>移除 {tool.tool_name} 绑定</button>
      </div>)}
      <button type="submit" className={button} disabled={!valid}>保存 Agent MCP 工具绑定</button>
    </fieldset>
    <button type="button" className={button} disabled={busy} onClick={()=>void refresh()}>读取当前角色并放弃编辑草稿</button>
  </form>
}
