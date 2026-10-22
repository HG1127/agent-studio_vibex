import {useState,type FormEvent} from "react"
import {AlertTriangle,LockKeyhole,Plus,RefreshCcw,Save,Trash2,Wrench} from "lucide-react"
import {
  PgNativePilotError,type PgNativeToolConnection,type PgNativeToolConnectionInput,
  createPgNativePilotApi,
} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>
type DraftHeader={key:string;value:string}
const field="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const primary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"

export default function PgNativeToolConnectionsPanel({
  api,items,canEdit,onUpdated,
}:{
  api:Api;items:PgNativeToolConnection[];canEdit:boolean
  onUpdated:()=>Promise<void>
}){
  const [editing,setEditing]=useState<PgNativeToolConnection|null>(null)
  const [open,setOpen]=useState(false)
  const [name,setName]=useState("")
  const [description,setDescription]=useState("")
  const [url,setUrl]=useState("")
  const [method,setMethod]=useState<"GET"|"POST">("POST")
  const [headers,setHeaders]=useState<DraftHeader[]>([])
  const [body,setBody]=useState("")
  const [timeout,setTimeout]=useState("15")
  const [enabled,setEnabled]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const reset=()=>{
    setEditing(null);setOpen(false);setName("");setDescription("");setUrl("")
    setMethod("POST");setHeaders([]);setBody("");setTimeout("15");setEnabled(true)
    setError("")
  }
  const startNew=()=>{
    reset();setOpen(true);setNotice("")
  }
  const startEdit=(item:PgNativeToolConnection)=>{
    setEditing(item);setOpen(true);setNotice("");setError("")
    setName(item.name);setDescription(item.description);setUrl(item.url)
    setMethod(item.method);setHeaders(item.headers.map(h=>({key:h.key,value:""})))
    setBody(item.body_template);setTimeout(String(item.timeout_s));setEnabled(item.enabled)
  }
  const changeHeader=(index:number,patch:Partial<DraftHeader>)=>
    setHeaders(old=>old.map((h,i)=>i===index?{...h,...patch}:h))
  const save=async(event:FormEvent)=>{
    event.preventDefault()
    if(!canEdit||busy)return
    setBusy(true);setError("");setNotice("")
    try{
      const input:PgNativeToolConnectionInput={
        name:name.trim(),description:description.trim(),url:url.trim(),method,
        headers:headers.filter(h=>h.key.trim()).map(h=>({
          key:h.key.trim(),value:h.value,
        })),
        body_template:method==="POST"?body:"",
        timeout_s:Number(timeout),enabled,
      }
      if(editing)await api.updateToolConnection(editing.id,editing.revision,input)
      else await api.createToolConnection(input)
      await onUpdated()
      reset()
      setNotice(editing?"工具配置已更新；执行仍关闭。":"工具配置已保存；执行仍关闭。")
    }catch(cause){
      setError(cause instanceof PgNativePilotError&&cause.status===409
        ?"配置版本已变化，请刷新后重新编辑。"
        :cause instanceof PgNativePilotError&&cause.status===400
          ?"字段不合法。URL 必须使用 HTTPS 公网域名，不允许 IP、内网域名、查询参数或凭据；请求头名称/值也必须合法。"
          :"保存失败，请检查独立 PostgreSQL 服务和当前员工权限。")
    }finally{setBusy(false)}
  }
  const remove=async(item:PgNativeToolConnection)=>{
    if(!canEdit||busy)return
    if(typeof window!=="undefined"&&!window.confirm("删除工具配置“"+item.name+"”？已加密保存的请求头将随配置删除。"))return
    setBusy(true);setError("");setNotice("")
    try{
      await api.deleteToolConnection(item.id)
      if(editing?.id===item.id)reset()
      await onUpdated()
      setNotice("工具配置及其加密请求头已删除。")
    }catch(cause){
      setError(cause instanceof PgNativePilotError&&cause.status===404
        ?"配置已不存在，请刷新列表。":"删除失败，请检查权限和最新配置版本。")
    }finally{setBusy(false)}
  }
  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Wrench size={20}/></span>
          <div>
            <h2 className="font-semibold">工具连接</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              管理工具端点、请求方法、请求模板和加密请求头。仅保存配置，不会探测端点、发起 HTTP 请求或执行工具。
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondary} disabled={busy}
            onClick={()=>void onUpdated()}><RefreshCcw size={15}/>刷新</button>
          {canEdit&&<button type="button" className={primary} disabled={busy}
            onClick={startNew}><Plus size={15}/>新增工具</button>}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <AlertTriangle size={15} className="mt-0.5 shrink-0"/>
        当前没有工具测试或运行接口。即使配置为“启用”，也不会触发网络请求；后续需完成受控 Worker 出站、SSRF 防护和人工审批验收。
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {notice&&<p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      <div className="mt-4 space-y-3">
        {!items.length&&<p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">尚未保存工具连接。</p>}
        {items.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{item.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{item.method}</span>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-800">未测试</span>
                {!item.enabled&&<span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">已停用</span>}
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              <p className="mt-2 break-all text-xs text-slate-500">{item.url}</p>
              <p className="mt-2 text-xs text-slate-500">请求头 {item.headers.length} 个 · 修订 {item.revision} · 超时 {item.timeout_s}s</p>
            </div>
            {canEdit&&<div className="flex gap-2">
              <button type="button" className={secondary} disabled={busy}
                onClick={()=>startEdit(item)}>编辑</button>
              <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
                disabled={busy} onClick={()=>void remove(item)}><Trash2 size={14}/>删除</button>
            </div>}
          </div>
          {!!item.headers.length&&<div className="mt-3 flex flex-wrap gap-2">
            {item.headers.map(h=><span key={h.key} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
              <LockKeyhole size={12}/>{h.key}: {h.value}
            </span>)}
          </div>}
        </article>)}
      </div>
    </section>
    {open&&<section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="font-semibold">{editing?"编辑工具连接":"新增工具连接"}</h3>
      <p className="mt-1 text-xs text-slate-500">修改请求头时，值留空表示保留已存值；删除一行则删除该请求头。新值在服务端加密保存。</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">名称
            <input className={field} required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：CRM 查询"/>
          </label>
          <label className="space-y-1 text-xs font-medium">请求方法
            <select className={field} value={method} onChange={e=>{const v=e.target.value as "GET"|"POST";setMethod(v);if(v==="GET")setBody("")}}>
              <option value="GET">GET</option><option value="POST">POST</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-xs font-medium">用途描述
          <textarea className={field} required maxLength={500} rows={2} value={description} onChange={e=>setDescription(e.target.value)} placeholder="说明该工具用途（仅保存，不会执行）"/>
        </label>
        <label className="block space-y-1 text-xs font-medium">HTTPS 端点
          <input className={field} required type="url" maxLength={1000} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.example.com/v1/query"/>
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-xs font-medium">请求头（值加密保存）</span>
            <button type="button" className={secondary} disabled={headers.length>=20}
              onClick={()=>setHeaders(old=>[...old,{key:"",value:""}])}><Plus size={14}/>添加请求头</button>
          </div>
          {headers.map((h,index)=><div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input className={field} maxLength={80} value={h.key}
              onChange={e=>changeHeader(index,{key:e.target.value})} placeholder="Authorization"/>
            <input className={field} type="password" autoComplete="new-password" maxLength={2048}
              value={h.value} onChange={e=>changeHeader(index,{value:e.target.value})}
              placeholder={editing?.headers.some(saved=>saved.key===h.key)?"已保存；留空保留":"输入新值"}/>
            <button type="button" className={secondary}
              onClick={()=>setHeaders(old=>old.filter((_,i)=>i!==index))}>移除</button>
          </div>)}
        </div>
        {method==="POST"&&<label className="block space-y-1 text-xs font-medium">请求体模板
          <textarea className={field} rows={4} maxLength={20000} value={body} onChange={e=>setBody(e.target.value)} placeholder='{"query":"{{input}}"}'/>
        </label>}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">超时（秒）
            <input className={field} type="number" min={1} max={60} required value={timeout} onChange={e=>setTimeout(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="accent-indigo-600" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
            启用配置（不会启用执行）
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={primary} type="submit" disabled={!canEdit||busy}>
            <Save size={15}/>{busy?"保存中…":"保存工具配置"}
          </button>
          <button className={secondary} type="button" disabled={busy} onClick={reset}>取消</button>
        </div>
      </form>
    </section>}
  </div>
}
