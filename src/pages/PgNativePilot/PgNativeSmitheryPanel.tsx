import {useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeSmitheryConnection} from "@/lib/pgNativePilotApi"
import {createPgNativeSmitherySession,type SmitheryView} from "@/lib/pgNativeSmitherySession"
import {safeSmitherySetupUrl} from "../../../services/pg-api/src/smithery-contracts"
const button="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50"
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm disabled:opacity-50"
type Controller=ReturnType<typeof createPgNativeSmitherySession>
const initial:SmitheryView={key:null,connections:[],namespaces:[],catalog:null,catalogQuery:"",busy:false,loading:false,pending:null,canRetry:false,canRecoverRemote:false,error:"",notice:""}
export default function PgNativeSmitheryPanel({api,active,enabled,onExpired}:{api:ReturnType<typeof createPgNativePilotApi>;active:boolean;enabled:boolean;onExpired:()=>void}){
  const [view,setView]=useState(initial),[apiKey,setApiKey]=useState(""),[query,setQuery]=useState(""),[namespace,setNamespace]=useState(""),[server,setServer]=useState(""),
    [name,setName]=useState(""),[description,setDescription]=useState(""),[consent,setConsent]=useState(""),[removeFor,setRemoveFor]=useState<number|null>(null)
  const controller=useRef<Controller|null>(null)
  useEffect(()=>{
    const model=createPgNativeSmitherySession(api,{onExpired});controller.current=model;setView(model.snapshot())
    const unsubscribe=model.subscribe(()=>setView(model.snapshot()))
    return ()=>{unsubscribe();model.dispose();if(controller.current===model)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setActive(active);if(!active)setApiKey("")},[active,api,onExpired])
  const locked=!active||!enabled||view.busy||view.loading||Boolean(view.pending),selection={namespace,server,name,description},selectionKey=JSON.stringify({selection,keyRevision:view.key?.revision}),
    canConnect=Boolean(view.key?.has_key&&view.namespaces.includes(namespace)&&view.catalog?.items.some(item=>item.server===server)&&name.trim()&&description.trim())
  const saveKey=(event:FormEvent)=>{event.preventDefault();if(locked||!view.key||!apiKey)return;const value=apiKey;setApiKey("");void controller.current?.saveKey(value)}
  const connect=(event:FormEvent)=>{event.preventDefault();if(locked||!canConnect||consent!==selectionKey)return;setConsent("");void controller.current?.connect(selection)}
  return <section aria-label="Smithery 托管连接" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <div><h2 className="font-semibold">Smithery 托管接入</h2><p className="mt-2 text-sm leading-6 text-slate-600">保存本人密钥后，选择工作空间与插件。需要授权时由你打开 Smithery 官方页面；返回后手动刷新连接，再到 MCP 连接中发现工具并绑定 Agent 或工作流。</p></div>
    {!enabled&&<p className="text-sm text-amber-900">当前环境未开放 Smithery 管理。</p>}
    {view.error&&<p role="alert" className="text-sm text-rose-800">{view.error}</p>}{view.notice&&<p role="status" className="text-sm text-slate-600">{view.notice}</p>}
    <button type="button" className={button} disabled={locked} onClick={()=>void controller.current?.load()}>读取本人 Smithery 配置</button>
    {view.key&&<div className="space-y-3"><p className="text-sm">{view.key.has_key?"已保存密钥，尾号 "+view.key.tail:"尚未保存 Smithery 密钥"} · 修订 {view.key.revision}</p>
      <form onSubmit={saveKey} className="space-y-2"><label className="block text-sm">Smithery API Key<input type="password" aria-label="Smithery API Key" autoComplete="off" spellCheck={false} maxLength={512} className={field} value={apiKey} disabled={locked} onChange={event=>setApiKey(event.target.value)}/></label>
        <p className="text-xs leading-5 text-slate-500">保存时会向 Smithery 验证密钥。更换密钥会停用原托管工具，需要逐个刷新连接并重新发现工具。</p>
        <button type="submit" className={button} disabled={locked||!apiKey}>验证并保存 Smithery 密钥</button>
      </form>
      {view.key.has_key&&<div className="space-y-2"><button type="button" className={button} disabled={locked} onClick={()=>setRemoveFor(view.key!.revision)}>移除本地 Smithery 密钥</button>
        {removeFor===view.key.revision&&<div role="group" aria-label="确认移除 Smithery 密钥" className="space-y-2 text-sm text-amber-900"><p>移除后，所有本人托管工具会立即停用。远端连接仍保留；如需撤销远端连接，请先逐个断开。</p>
          <button type="button" className={button} disabled={locked} onClick={()=>{setRemoveFor(null);void controller.current?.removeKey()}}>确认移除并停用本人工具</button></div>}
      </div>}
    </div>}
    {view.key?.has_key&&<div className="space-y-3 border-t border-slate-100 pt-4">
      <button type="button" className={button} disabled={locked} onClick={()=>void controller.current?.namespaces()}>读取本人 Smithery 工作空间</button>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();if(!locked)void controller.current?.search(query)}}>
        <label className="min-w-48 flex-1 text-sm">搜索 Smithery 插件<input className={field} value={query} maxLength={100} disabled={locked} onChange={event=>setQuery(event.target.value)}/></label>
        <button type="submit" className={button} disabled={locked}>搜索插件目录</button>
      </form>
      <form onSubmit={connect} className="space-y-3"><fieldset disabled={locked} className="space-y-3"><legend className="text-sm font-medium">建立本人的托管连接</legend>
        <label className="block text-sm">Smithery 工作空间<select className={field} value={namespace} onChange={event=>setNamespace(event.target.value)}><option value="">请先读取并选择本人工作空间</option>{view.namespaces.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
        <label className="block text-sm">Smithery 插件<select className={field} value={server} onChange={event=>{const item=view.catalog?.items.find(item=>item.server===event.target.value);setServer(event.target.value);setName(item?.name??"");setDescription(item?.description||item?.server||"")}}><option value="">请先搜索并选择插件</option>{view.catalog?.items.map(item=><option key={item.server} value={item.server}>{item.name} · {item.server}</option>)}</select></label>
        {server&&<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-500">{view.catalog?.items.find(item=>item.server===server)?.description}</p>}
        <label className="block text-sm">托管连接名称<input className={field} value={name} maxLength={100} onChange={event=>setName(event.target.value)}/></label>
        <label className="block text-sm">托管连接用途<input className={field} value={description} maxLength={500} onChange={event=>setDescription(event.target.value)}/></label>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={consent===selectionKey} onChange={event=>setConsent(event.target.checked?selectionKey:"")}/>我已核对工作空间和插件，允许在 Smithery 建立此连接。</label>
        <button type="submit" className={button} disabled={!canConnect||consent!==selectionKey}>建立 Smithery 托管连接</button>
      </fieldset></form>
      {view.catalog?.next_page!==0&&view.catalog&&<button type="button" className={button} disabled={locked} onClick={()=>void controller.current?.search(view.catalogQuery,view.catalog!.next_page)}>读取下一页插件</button>}
    </div>}
    {view.pending&&<div role="group" aria-label="核对上次 Smithery 操作" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm"><p>上次操作结果待核对，已暂停其他更改。</p>
      <button type="button" className={button} disabled={!active||!enabled||view.busy||view.loading} onClick={()=>void controller.current?.reconcile()}>读取当前记录核对上次 Smithery 操作</button>
      {view.canRetry&&<button type="button" className={button} disabled={!active||!enabled||view.busy||view.loading} onClick={()=>void controller.current?.retry()}>使用原请求重试 Smithery 操作</button>}
      {view.canRecoverRemote&&<button type="button" className={button} disabled={!active||!enabled||view.busy||view.loading} onClick={()=>void controller.current?.recoverRemote()}>仅刷新远端状态核对上次操作</button>}
    </div>}
    <div className="space-y-3" aria-label="本人 Smithery 托管连接列表">{view.connections.map(row=><SmitheryConnectionCard key={row.id} row={row} enabled={!locked} onAction={action=>void controller.current?.operate(row.id,action)}/>)}</div>
  </section>
}
const states:Record<string,string>={pending:"正在建立或核对",unknown:"结果待核对",paused:"本人已停用",connected:"远端已连接",disconnected:"远端已断开",auth_required:"需要官方授权",input_required:"需要补充配置",error:"未通过验证",revoking:"正在撤销",revoke_unknown:"远端撤销待核对",revoked:"远端已撤销",needs_key:"需要本人密钥",needs_refresh:"需要刷新连接"}
export function SmitheryConnectionCard({row,enabled,onAction}:{row:PgNativeSmitheryConnection;enabled:boolean;onAction:(action:"refresh"|"revoke"|"retry"|"pause")=>void}){
  const [confirmFor,setConfirmFor]=useState(0),setup=safeSmitherySetupUrl(row.setup_url)
  return <article className="space-y-2 rounded-xl border border-slate-100 p-3">
    <h3 className="break-words text-sm font-semibold">{row.name}</h3><p className="break-words text-xs text-slate-500">{row.namespace} · {row.server} · 修订 {row.revision}</p>
    <p className="text-sm">{states[row.state]??"需要核对连接"}{row.enabled?row.mcp_status==="ok"?" · 工具已发现，可核对当前绑定":" · 请到 MCP 连接发现工具":" · 本地执行已停用"}</p>
    {!!row.missing.length&&<p className="break-words text-sm text-amber-900">待补充：{row.missing.join("、")}</p>}
    {enabled&&setup&&!row.revoke_requested&&<a href={setup} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-block text-sm text-indigo-700 underline">打开 Smithery 官方授权页面</a>}
    {row.state!=="revoked"&&<div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!enabled} onClick={()=>onAction("refresh")}>刷新 Smithery 连接状态</button>
      <button type="button" className={button} disabled={!enabled||row.state==="paused"} onClick={()=>onAction("pause")}>仅停用本地连接</button>
      {row.last_error==="smithery_remote_absent"&&!row.revoke_requested&&<button type="button" className={button} disabled={!enabled} onClick={()=>onAction("retry")}>沿用原编号重新建立此连接</button>}
      <button type="button" className={button} disabled={!enabled} onClick={()=>setConfirmFor(row.revision)}>断开并撤销 Smithery 连接</button>
    </div>}
    {confirmFor===row.revision&&row.state!=="revoked"&&<div role="group" aria-label={"确认撤销 "+row.name} className="space-y-2 text-sm text-amber-900"><p>确认先停用本地执行，再请求 Smithery 撤销此连接？远端响应未确认时会保留待核对记录。</p>
      <button type="button" className={button} disabled={!enabled} onClick={()=>{setConfirmFor(0);onAction("revoke")}}>确认撤销此 Smithery 连接</button></div>}
  </article>
}
