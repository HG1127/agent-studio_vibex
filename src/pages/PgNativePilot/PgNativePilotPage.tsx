import {lazy,useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react"
import {Bot,BookOpen,BriefcaseBusiness,CheckCircle2,Database,
  KeyRound,Loader2,LogOut,Plus,RefreshCcw,ShieldCheck,Users,Workflow,
  AlertTriangle,ClipboardCheck,CalendarClock} from "lucide-react"
import {createPgNativePilotApi,PgNativePilotError,
  type PgNativeAgent,type PgNativeWorkflow,type PgNativeKnowledge,
  type PgNativeStaff} from "@/lib/pgNativePilotApi"
import PgConfigRecordEditor,{type PgConfigEditTarget} from "./PgConfigRecordEditor"
import PgNativeConfigDetail,{type DetailKind} from "./PgNativeConfigDetail"
import PgNativeSchedulesReadonlyPanel from "./PgNativeSchedulesReadonlyPanel"
import {createPgNativeSessionReadFence} from "@/lib/pgNativeSessionReadFence"

// The isolated Run UAT view is excluded from production builds and never
// unlocks backend task execution: the server enforces a separate approval.
const RUN_UAT_LOCAL_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_RUN_APPROVAL_UI_ENABLED==="true"
const RunUatPanel=RUN_UAT_LOCAL_ONLY
  ?lazy(()=>import("./PgNativeRunUatPanel")):null
// Real TXT/MD ingestion is independently approved in the Native API and
// NEVER included in the standalone production-candidate build.
const KB_INGEST_UAT_LOCAL_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_KB_TEXT_INGEST_UI_ENABLED==="true"
const TextIngestUatPanel=KB_INGEST_UAT_LOCAL_ONLY
  ?lazy(()=>import("./PgNativeTextIngestUatPanel")):null
const KB_AGENT_BINDING_DEV_ONLY=import.meta.env.DEV &&
  import.meta.env.VITE_AGENT_STUDIO_PG_AGENT_KB_BIND_UI_ENABLED==="true"
const AgentKnowledgeUatPanel=KB_AGENT_BINDING_DEV_ONLY
  ?lazy(()=>import("./PgNativeAgentKnowledgeUatPanel")):null
type Screen="agents"|"workflows"|"knowledge"|"schedules"|"employees"|"runs"
type State="checking"|"signedout"|"signedin"|"unavailable"
const field="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const button="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
const secondary="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
function describe(error:unknown):string {
  if(error instanceof PgNativePilotError){
    if(error.status===0)return "尚未连接 PostgreSQL 原生认证试验服务，请检查独立 API 与本地开发代理。"
    if(error.status===401)return "员工身份验证失败或会话已失效。"
    if(error.status===403)return "请求未通过权限或来源检查。"
    if(error.status===409)return error.code==="revision_conflict"
      ?"配置已被更新，请刷新后使用最新版本重试。":"该员工账号已存在，请核实。"
    if(error.status===429)return "操作过于频繁，请稍后再试。"
    return "请求未成功（"+error.code+"）。"
  }
  return "操作未成功，请联系管理员检查独立测试服务。"
}
export default function PgNativePilotPage({productionRoot=false}:{productionRoot?:boolean}){
  // PG-only build uses SAME-ORIGIN /api endpoints. Vite DEV retains
  // its own isolated /__pg_native proxy. No PocketBase tokens or storage.
  const api=useMemo(()=>createPgNativePilotApi(fetch,
    productionRoot?"":"/__pg_native"),[productionRoot])
  const [status,setStatus]=useState<State>("checking")
  const [profile,setProfile]=useState<PgNativeStaff|null>(null)
  const [section,setSection]=useState<Screen>("agents")
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [agents,setAgents]=useState<PgNativeAgent[]>([])
  const [workflows,setWorkflows]=useState<PgNativeWorkflow[]>([])
  const [knowledge,setKnowledge]=useState<PgNativeKnowledge[]>([])
  const [editing,setEditing]=useState<PgConfigEditTarget|null>(null)
  const [detailTarget,setDetailTarget]=useState<{kind:DetailKind;id:string}|null>(null)
  // In-flight reads from a revoked/changed session must never repopulate UI.
  const sessionFence=useRef(createPgNativeSessionReadFence())
  const [newName,setNewName]=useState("")
  const [newGoal,setNewGoal]=useState("")
  const [newDescription,setNewDescription]=useState("")
  const [staffEmail,setStaffEmail]=useState("")
  const [staffName,setStaffName]=useState("")
  const [staffPassword,setStaffPassword]=useState("")
  const refresh=useCallback(async()=>{
    const ticket=sessionFence.current.beginRead()
    setLoading(true)
    try{
      const [a,w,k]=await Promise.all([
        api.listAgents(),api.listWorkflows(),api.listKnowledge()
      ])
      if(!sessionFence.current.acceptsRead(ticket))return
      setAgents(a);setWorkflows(w);setKnowledge(k);setError("")
    }catch(err){
      if(!sessionFence.current.acceptsRead(ticket))return
      if(err instanceof PgNativePilotError&&err.status===401){
        sessionFence.current.invalidate()
        setProfile(null);setStatus("signedout")
        setAgents([]);setWorkflows([]);setKnowledge([])
        setEditing(null);setDetailTarget(null);setLoading(false)
      }
      setError(describe(err))
    }finally{
      if(sessionFence.current.acceptsRead(ticket))setLoading(false)
    }
  },[api])
  useEffect(()=>{
    let active=true
    const sessionAtStart=sessionFence.current.session()
    if(productionRoot && typeof window!=="undefined" &&
       window.location.protocol!=="https:"){
      setStatus("unavailable")
      return ()=>{active=false}
    }
    void api.me().then(user=>{
      if(!active||!sessionFence.current.acceptsSession(sessionAtStart))return
      setProfile(user);setStatus("signedin")
      void refresh()
    }).catch(err=>{
      if(!active||!sessionFence.current.acceptsSession(sessionAtStart))return
      setStatus(err instanceof PgNativePilotError&&err.status===401
        ?"signedout":"unavailable")
      setError(describe(err))
    })
    return ()=>{active=false}
  },[api,refresh,productionRoot])
  const login=async(event:FormEvent)=>{
    event.preventDefault()
    if(productionRoot && typeof window!=="undefined" &&
       window.location.protocol!=="https:"){
      setPassword("");setError("必须通过可信 HTTPS 登录")
      return
    }
    if(busy)return
    const sessionAtStart=sessionFence.current.invalidate()
    setAgents([]);setWorkflows([]);setKnowledge([])
    setEditing(null);setDetailTarget(null);setLoading(false)
    setBusy(true);setError("")
    try{
      await api.login(email,password)
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setPassword("")
      const user=await api.me()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setProfile(user);setStatus("signedin")
      setNotice("已通过 PostgreSQL 原生员工身份验证")
      await refresh()
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart)){
        setPassword("");setProfile(null);setStatus("signedout")
        setError(describe(err))
      }
    }finally{setBusy(false)}
  }
  const logout=async()=>{
    if(busy)return
    const sessionAtStart=sessionFence.current.invalidate()
    // Hide all private information before the network logout completes.
    setProfile(null);setStatus("checking")
    setAgents([]);setWorkflows([]);setKnowledge([])
    setEditing(null);setDetailTarget(null);setLoading(false)
    setBusy(true);setError("")
    try{
      await api.logout()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return
      setStatus("signedout")
      setNotice("");setNewGoal("");setStaffPassword("")
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart)){
        setStatus("unavailable")
        setError(describe(err))
      }
    }finally{setBusy(false)}
  }
  const action=async(work:()=>Promise<unknown>,message:string)=>{
    if(busy)return false
    const sessionAtStart=sessionFence.current.session()
    setBusy(true);setError("");setNotice("")
    try{
      await work()
      if(!sessionFence.current.acceptsSession(sessionAtStart))return false
      setNewName("");setNewGoal("");setNewDescription("")
      setStaffEmail("");setStaffName("");setStaffPassword("")
      setNotice(message)
      await refresh()
      return sessionFence.current.acceptsSession(sessionAtStart)
    }catch(err){
      if(sessionFence.current.acceptsSession(sessionAtStart))
        setError(describe(err))
      return false
    }finally{setBusy(false)}
  }

  const saveEditing=async(name:string,detail:string)=>{
    if(!editing)return
    const current=editing
    const success=await action(async()=>{
      if(current.kind==="agents"){
        await api.updateAgent(current.id,current.revision,name,detail)
      }else if(current.kind==="workflows"){
        await api.updateWorkflow(current.id,current.revision,name)
      }else{
        await api.updateKnowledge(current.id,current.revision,name,detail)
      }
    },"配置已更新并重新读取")
    if(success)setEditing(null)
  }
  const title=[{key:"agents" as const,label:"Agent 配置",icon:Bot,count:agents.length},
    {key:"workflows" as const,label:"Workflow",icon:Workflow,count:workflows.length},
    {key:"knowledge" as const,label:"知识库",icon:BookOpen,count:knowledge.length},
    {key:"schedules" as const,label:"定时计划（只读）",icon:CalendarClock,count:null},
    ...(RUN_UAT_LOCAL_ONLY&&!productionRoot?
      [{key:"runs" as const,label:"运行与审批 UAT",icon:ClipboardCheck,count:null}]:[]),
    {key:"employees" as const,label:"员工管理",icon:Users,count:null},
  ]
  // The independent PG18 build may be hosted only on company-trusted HTTPS.
  // Never display password input or initiate login on a plain HTTP origin.
  if(productionRoot && typeof window!=="undefined" &&
     window.location.protocol!=="https:"){
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
      <section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold">需要可信 HTTPS 连接</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          PostgreSQL 独立工作台仅支持经公司信任的 HTTPS 地址。
          当前未建立加密连接，因此不会展示管理员登录表单。
        </p>
      </section>
    </main>
  }
  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 sm:px-8 lg:py-9">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-indigo-600">
            <Database size={16}/> PostgreSQL 18 · Standalone Authentication
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{productionRoot?"PostgreSQL 独立工作台":"独立员工工作台"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{productionRoot?"独立 PostgreSQL 会话与本人 Agent、Workflow、知识库只读核验。尚未通过完整迁移验收，不运行 Agent 或模型任务。":"仅供本机隔离验证的原生员工登录、Agent、Workflow 与知识库配置。不会连接原 PocketBase 登录，也不会自动执行 Agent。"}</p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mr-1.5 inline-block" size={14}/> 正式切换 NO-GO
        </div>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        <ShieldCheck className="mr-2 inline-block align-middle text-indigo-600" size={18}/>
        独立 Cookie 会话 · 服务端验证身份 · PostgreSQL RLS 数据隔离 · 旧系统保持不变
      </div>
      {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
      {status==="checking"&&<div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-600">
        <Loader2 className="animate-spin" size={19}/> 正在验证 PostgreSQL 员工会话…
      </div>}
      {status==="unavailable"&&<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold">独立认证服务尚不可用</h2>
        <p className="mt-3 text-sm text-slate-500">请确认本地 PG18 Native API、HTTPS/来源及代理配置，当前不会退回到旧 PocketBase 凭证。</p>
        <button className={secondary+" mt-6"} onClick={()=>window.location.reload()}>重新检查连接</button>
      </div>}
      {status==="signedout"&&<section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
          <KeyRound size={21}/></span>
          <div><h2 className="text-lg font-semibold">原生员工账号登录</h2>
            <p className="text-xs text-slate-500">请使用独立 PostgreSQL 测试账号</p>
          </div></div>
        <form onSubmit={login} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">员工邮箱
            <input className={field} type="email" autoComplete="username" required
              value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="staff@company.com"/>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">密码
            <input className={field} type="password" autoComplete="current-password"
              required value={password} onChange={e=>setPassword(e.target.value)}/>
          </label>
          <button type="submit" className={button+" w-full"} disabled={busy}>
            {busy?<Loader2 size={17} className="animate-spin"/>:<ShieldCheck size={17}/>} 登录独立工作台
          </button>
        </form>
      </section>}
      {status==="signedin"&&profile&&<>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><BriefcaseBusiness size={20}/></div>
            <div><p className="font-medium">{profile.display_name}</p>
              <p className="text-xs text-slate-500">{profile.email} · {profile.is_admin?"管理员":"员工"}</p></div>
          </div>
          <div className="flex gap-2">
            <button className={secondary} onClick={()=>void refresh()} disabled={busy||loading}>
              <RefreshCcw className={loading?"animate-spin":""} size={15}/>刷新
            </button>
            <button className={secondary} onClick={()=>void logout()} disabled={busy}><LogOut size={15}/>退出</button>
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
          <nav aria-label="独立 PostgreSQL 功能" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 lg:flex-col lg:gap-1 lg:self-start">
            {title.filter(x=>(x.key!=="employees"||profile.is_admin)&&
              (!productionRoot||x.key!=="employees")).map(item=>
              <button key={item.key} type="button" onClick={()=>{setSection(item.key);setEditing(null);setDetailTarget(null)}}
                className={"flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium lg:w-full "+
                  (section===item.key?"bg-indigo-50 text-indigo-700":"text-slate-600 hover:bg-slate-50")}>
                <item.icon size={17}/>
                <span className="flex-1">{item.label}</span>
                {item.count!==null&&<span className="text-xs tabular-nums">{item.count}</span>}
              </button>)}
          </nav>
          <section className="min-w-0 space-y-5">
            {section==="agents"&&<>
              {!productionRoot&&<CreateCard title="创建 Agent 配置" description="创建后写入本人独立的 PG18 Agent 记录，不会自动运行。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createAgent(newName.trim(),newGoal.trim()),"Agent 配置已保存")}}>
                  <input required maxLength={120} className={field} placeholder="Agent 名称" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <textarea required maxLength={2000} rows={3} className={field} placeholder="Agent 的具体目标" value={newGoal} onChange={e=>setNewGoal(e.target.value)}/>
                  <button className={button} disabled={busy} type="submit"><Plus size={16}/>保存 Agent</button>
                </form>
              </CreateCard>}
              <Records title="我的 Agent" items={agents.map(x=>({
                id:x.id,name:x.name,description:x.spec?.goal||"",
                revision:x.revision,meta:"修订 "+x.revision}))}
                onInspect={item=>setDetailTarget({kind:"agents",id:item.id})}
                onEdit={!productionRoot?item=>setEditing({
                  kind:"agents",id:item.id,revision:item.revision,
                  name:item.name,detail:item.description
                }):undefined}/>
            </>}
            {section==="workflows"&&<>
              {!productionRoot&&<CreateCard title="创建 Workflow" description="仅保存开始 → 结束的最小工作流，不会执行节点或调用模型。">
                <form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createWorkflow(newName.trim()),"Workflow 结构已保存")}}>
                  <input required maxLength={120} className={field+" flex-1"} value={newName} placeholder="Workflow 名称" onChange={e=>setNewName(e.target.value)}/>
                  <button className={button} disabled={busy} type="submit"><Plus size={16}/>保存结构</button>
                </form>
              </CreateCard>}
              <Records title="我的 Workflow" items={workflows.map(x=>({
                id:x.id,name:x.name,description:"结构化工作流配置",
                revision:x.revision,meta:"修订 "+x.revision}))}
                onInspect={item=>setDetailTarget({kind:"workflows",id:item.id})}
                onEdit={!productionRoot?item=>setEditing({
                  kind:"workflows",id:item.id,revision:item.revision,
                  name:item.name,detail:""
                }):undefined}/>
            </>}
            {section==="agents"&&AgentKnowledgeUatPanel&&!productionRoot&&
              <AgentKnowledgeUatPanel key={profile.id} api={api}
                agents={agents} bases={knowledge} onSaved={refresh}/>
            }
            {section==="knowledge"&&<>
              {!productionRoot&&<CreateCard title="创建知识库" description="已支持本人已索引文本的关键词搜索；Embedding 和语义检索仍需后续联调。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createKnowledge(newName.trim(),newDescription.trim()),"知识库已创建")}}>
                  <input required maxLength={120} className={field} placeholder="知识库名称" value={newName} onChange={e=>setNewName(e.target.value)}/>
                  <textarea className={field} maxLength={1000} rows={2} placeholder="知识库介绍" value={newDescription} onChange={e=>setNewDescription(e.target.value)}/>
                  <button className={button} type="submit" disabled={busy}><Plus size={16}/>创建知识库</button>
                </form>
              </CreateCard>}
              <Records title="我的知识库" items={knowledge.map(x=>({
                id:x.id,name:x.name,description:x.description,
                revision:x.revision,meta:"修订 "+x.revision}))}
                onInspect={item=>setDetailTarget({kind:"knowledge",id:item.id})}
                onEdit={!productionRoot?item=>setEditing({
                  kind:"knowledge",id:item.id,revision:item.revision,
                  name:item.name,detail:item.description
                }):undefined}/>
            </>}
            {section==="knowledge"&&TextIngestUatPanel&&!productionRoot&&
              <TextIngestUatPanel key={profile.id} api={api} bases={knowledge}/>
            }
            {detailTarget&&detailTarget.kind===section&&
              <PgNativeConfigDetail key={profile.id+":"+detailTarget.kind+":"+detailTarget.id}
                api={api} kind={detailTarget.kind} id={detailTarget.id}
                onClose={()=>setDetailTarget(null)}/>
            }
            {section==="schedules"&&
              <PgNativeSchedulesReadonlyPanel key={profile.id} api={api}/>
            }
            {section==="runs"&&RunUatPanel&&!productionRoot&&
              <RunUatPanel key={profile.id} api={api} agents={agents}/>
            }
            {editing&&!productionRoot&&editing.kind===section&&
              <PgConfigRecordEditor
                key={editing.kind+":"+editing.id+":"+editing.revision}
                target={editing} busy={busy}
                onSave={saveEditing} onCancel={()=>setEditing(null)}/>
            }
            {section==="employees"&&profile.is_admin&&!productionRoot&&
              <CreateCard title="创建员工测试账号" description="仅管理员可操作，员工密码不在页面持久保存。">
                <form className="space-y-3" onSubmit={e=>{e.preventDefault();void action(()=>
                  api.createEmployee(staffEmail.trim(),staffPassword,staffName.trim()),"已创建独立员工账号")}}>
                  <input className={field} type="email" required placeholder="员工邮箱" value={staffEmail} onChange={e=>setStaffEmail(e.target.value)}/>
                  <input className={field} required maxLength={80} placeholder="员工姓名" value={staffName} onChange={e=>setStaffName(e.target.value)}/>
                  <input className={field} type="password" required minLength={12} maxLength={256} placeholder="初始密码（至少12位）" autoComplete="new-password" value={staffPassword} onChange={e=>setStaffPassword(e.target.value)}/>
                  <button className={button} type="submit" disabled={busy}><Plus size={16}/>创建员工</button>
                </form>
              </CreateCard>}
          </section>
        </div>
        <p className="text-center text-xs text-slate-400">{productionRoot?"独立 PostgreSQL 只读验证版 · Worker 未启用 · 正式迁移未完成":"开发模式试验页面 · 后台 Worker 已禁用 · 未批准正式切换"}</p>
      </>}
    </div>
  </main>
}

function CreateCard({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="font-semibold">{title}</h2>
    <p className="mb-5 mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
    {children}
  </section>
}
function Records({title,items,onEdit,onInspect}:{
  title:string
  items:{id:string;name:string;description:string;meta:string;revision:number}[]
  onEdit?:(item:{id:string;name:string;description:string;meta:string;revision:number})=>void
  onInspect?:(item:{id:string;name:string;description:string;meta:string;revision:number})=>void
}){
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="mb-4 flex items-center gap-2 font-semibold"><CheckCircle2 size={17} className="text-indigo-600"/>{title} <span className="text-xs text-slate-400">({items.length})</span></h2>
    {!items.length&&<p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">暂无记录</p>}
    <div className="space-y-2">{items.map(item=><div key={item.id} className="rounded-xl border border-slate-100 p-4">
      <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.name}</p><span className="text-xs text-slate-400">{item.meta}</span></div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p>
      {onInspect&&<button type="button" onClick={()=>onInspect(item)}
        className="mt-3 mr-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        查看详情
      </button>}
      {onEdit&&<button type="button" onClick={()=>onEdit(item)}
        className="mt-3 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
        编辑配置
      </button>}
    </div>)}</div>
  </section>
}
