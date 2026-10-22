import {useEffect,useRef,useState,type FormEvent} from "react"
import type {PgNativeMcpConnection,PgNativeMcpInput,createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {createPgNativeMcpSession,emptyMcpView} from "@/lib/pgNativeMcpSession"
const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
const button="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50"
export default function PgNativeMcpConnectionsPanel({api,enabled,discoveryEnabled,active=true,onExpired}:{
  api:ReturnType<typeof createPgNativePilotApi>;enabled:boolean;discoveryEnabled:boolean;active?:boolean;onExpired:()=>void
}){
  const [view,setView]=useState(emptyMcpView),[deleteFor,setDeleteFor]=useState("")
  const model=useRef<ReturnType<typeof createPgNativeMcpSession>|null>(null)
  useEffect(()=>{
    const session=createPgNativeMcpSession(api,{onExpired});model.current=session;setView(session.snapshot())
    const unsubscribe=session.subscribe(()=>setView(session.snapshot()))
    return ()=>{unsubscribe();session.dispose();if(model.current===session)model.current=null}
  },[api,onExpired])
  const selected=view.items.find(item=>item.id===view.selected)??null,locked=!active||view.busy||Boolean(view.pending)
  return <section aria-label="MCP 远程连接" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <h2 className="font-semibold">MCP 远程工具连接</h2>
    <p className="text-sm leading-6 text-slate-600">保存远程服务后，可单独发现工具及参数。工具发现不会执行工具；绑定到 Agent 或工作流后，每次调用仍需环境授权和单独审批。</p>
    {view.error&&<p role="alert" className="text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="text-sm text-emerald-800">{view.notice}</p>}
    {!enabled&&<p className="text-sm text-amber-900">当前环境未开放 MCP 配置保存。</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={locked} onClick={()=>void model.current?.refresh()}>读取本人 MCP 连接</button>
      <button type="button" className={button} disabled={!enabled||locked} onClick={()=>model.current?.select("")}>新建 MCP 连接</button>
    </div>
    {view.pending&&<div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
      <p>上次操作结果待核对，暂时不能提交其他更改。</p>
      <button type="button" className={button} disabled={!active||view.busy} onClick={()=>void model.current?.reconcile()}>读取当前连接核对上次操作</button>
      {view.canRetryCreate&&<button type="button" className={button} disabled={!active||view.busy||!enabled} onClick={()=>void model.current?.retryCreate()}>用原请求重试保存</button>}
    </div>}
    {view.loaded&&!view.items.length&&<p className="text-sm text-slate-500">本人暂无 MCP 连接。</p>}
    <div className="space-y-2">{view.items.map(row=><button type="button" key={row.id} className={button+" block w-full text-left"} disabled={locked}
      aria-pressed={view.selected===row.id} onClick={()=>model.current?.select(row.id)}>
      <span className="break-words">{row.name} · 版本 {row.revision} · {row.status==="ok"?`${row.catalog?.tools.length??0} 个工具`:row.status==="error"?"发现失败":"未发现工具"}</span>
    </button>)}</div>
    {selected?.managed_by==="smithery"&&<p className="text-sm text-slate-600">此连接由 Smithery 托管，请在下方 Smithery 面板刷新授权或断开连接；这里可以单独发现工具。</p>}
    <McpConnectionForm key={view.selected+":"+view.formVersion} row={selected} enabled={enabled&&!locked&&!selected?.managed_by} onSave={input=>void model.current?.save(selected,input)}/>
    {selected&&<div className="space-y-3">
      {!discoveryEnabled&&<p className="text-sm text-amber-900">当前环境未开放外部 MCP 工具发现。</p>}
      <button type="button" className={button} disabled={!enabled||!discoveryEnabled||locked||!selected.enabled} onClick={()=>void model.current?.discover(selected)}>发现此连接的 MCP 工具</button>
      <button type="button" className={button} disabled={!enabled||locked||Boolean(selected.managed_by)} onClick={()=>setDeleteFor(selected.id+":"+selected.revision)}>移除 MCP 连接</button>
      {deleteFor===selected.id+":"+selected.revision&&<div role="group" aria-label="确认移除 MCP 连接" className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
        <p>确认移除 {selected.name} 及其已保存的请求头？</p>
        <button type="button" className={button} disabled={!enabled||locked} onClick={()=>{setDeleteFor("");void model.current?.remove(selected)}}>确认移除此连接</button>
        <button type="button" className={button} onClick={()=>setDeleteFor("")}>保留连接</button>
      </div>}
      <McpToolCatalog row={selected}/>
    </div>}
  </section>
}
export function McpConnectionForm({row,enabled,onSave}:{row:PgNativeMcpConnection|null;enabled:boolean;onSave:(input:PgNativeMcpInput)=>void}){
  const [name,setName]=useState(row?.name??""),[description,setDescription]=useState(row?.description??""),[url,setUrl]=useState(row?.url??"")
  const [active,setActive]=useState(row?.enabled??true),[headers,setHeaders]=useState(()=>row?.headers.map(header=>({key:header.key,value:""}))??[])
  const submit=(event:FormEvent)=>{event.preventDefault();if(enabled)onSave({name,description,url,enabled:active,headers})}
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-100 p-3">
    <fieldset disabled={!enabled} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{row?"编辑 MCP 连接":"新建 MCP 连接"}</legend>
      <label className="block space-y-1 text-sm">MCP 连接名称<input className={field} required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>
      <label className="block space-y-1 text-sm">MCP 连接用途<input className={field} required maxLength={500} value={description} onChange={event=>setDescription(event.target.value)}/></label>
      <label className="block space-y-1 text-sm">MCP 服务地址<input className={field} required type="url" maxLength={1000} value={url} placeholder="https://example.com/mcp" onChange={event=>setUrl(event.target.value)}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/>启用 MCP 连接</label>
      <div className="space-y-2">{headers.map((header,index)=><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}>
        <label className="space-y-1 text-xs">请求头名称 {index+1}<input required aria-label={"MCP 请求头名称 "+(index+1)} className={field} maxLength={80} value={header.key}
          onChange={event=>setHeaders(previous=>previous.map((item,i)=>i===index?{...item,key:event.target.value}:item))}/></label>
        <label className="space-y-1 text-xs">请求头值 {index+1}{row?"（留空保留原值）":""}<input type="password" autoComplete="new-password" aria-label={"MCP 请求头值 "+(index+1)} className={field} maxLength={2048} value={header.value}
          required={!row?.headers.some(item=>item.key===header.key.trim().toLowerCase())}
          onChange={event=>setHeaders(previous=>previous.map((item,i)=>i===index?{...item,value:event.target.value}:item))}/></label>
        <button type="button" className={button} onClick={()=>setHeaders(previous=>previous.filter((_,i)=>i!==index))}>移除请求头 {index+1}</button>
      </div>)}</div>
      <button type="button" className={button} disabled={headers.length>=20} onClick={()=>setHeaders(previous=>[...previous,{key:"",value:""}])}>添加 MCP 请求头</button>
      <button type="submit" className={button}>保存 MCP 连接</button>
    </fieldset>
  </form>
}
export function McpToolCatalog({row}:{row:PgNativeMcpConnection}){
  return <div role="group" aria-label="已发现的 MCP 工具" className="space-y-2">
    <p className="text-sm">协议版本：{row.catalog?.version??"尚未发现"}；工具注解仅作说明，每次调用仍需审批。</p>
    {row.catalog?.tools.map(tool=><details key={tool.name} className="rounded-xl border border-slate-100 p-3 text-sm">
      <summary className="break-words">{tool.name}{tool.read_only?" · 声明为只读":""}{tool.destructive?" · 声明可能删除或修改数据":""}{tool.requires_tasks?" · 需要异步任务协议":""}</summary>
      <p className="my-2 whitespace-pre-wrap break-words">{tool.description||"暂无说明"}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(tool.input_schema,null,2)}</pre>
    </details>)}
  </div>
}
