import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react"
import {AlertTriangle,ArrowRight,BookOpen,Check,FileText,GitBranch,KeyRound,Loader2,Play,RefreshCw,Shield,ShieldAlert,X} from "lucide-react"
import {createPgPilotApi,PgPilotApiError,
  type PgAgentSpec,type PgApproval,type PgKnowledgeBase,type PgKnowledgeDocument,
  type PgKnowledgeHit,type PgRun,type PgWorkflow} from "@/lib/pgPilotApi"

type Section="agents"|"runs"|"workflows"|"knowledge"
const sections:{id:Section;label:string}[]=[
  {id:"agents",label:"Agent 配置"},
  {id:"runs",label:"执行与审批"},
  {id:"workflows",label:"Workflow"},
  {id:"knowledge",label:"知识库"},
]
const statusText:Record<PgRun["status"],string>={
  queued:"队列中",running:"模型运行中",awaiting_approval:"等待人工审批",
  paused:"暂停 / 待核对",succeeded:"已完成",failed:"失败",cancelled:"已取消",
}
const short=(id:string)=>id.slice(0,8)
const errorText=(err:unknown):string=>{
  if(err instanceof PgPilotApiError){
    if(err.status===401)return "OIDC 凭证缺失、无效或已过期，请重新获取经签名验证的员工访问令牌。"
    if(err.status===403)return "当前员工尚未在隔离 PostgreSQL 中完成身份映射，或账号已停用。"
    if(err.status===404)return "资源不存在，或当前员工无权访问。"
    if(err.status===409)return "请求发生版本或审批状态冲突，请刷新后重试。"
    if(err.code==="pilot_connection_unavailable")return "无法连接隔离 PostgreSQL API，请检查 127.0.0.1:7402 服务及本地代理。"
    return "请求失败（"+err.code+"）"
  }
  return "操作失败，请核查隔离环境状态。"
}
const field="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondary="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"

export default function PgPilotPage(){
  // Credentials never enter localStorage, sessionStorage, IndexedDB or URLs.
  const [draftToken,setDraftToken]=useState("")
  const [token,setToken]=useState("")
  const [section,setSection]=useState<Section>("agents")
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(false)
  const [agents,setAgents]=useState<PgAgentSpec[]>([])
  const [runs,setRuns]=useState<PgRun[]>([])
  const [workflows,setWorkflows]=useState<PgWorkflow[]>([])
  const [bases,setBases]=useState<PgKnowledgeBase[]>([])
  const [selectedSpecId,setSelectedSpecId]=useState("")
  const [selectedRunId,setSelectedRunId]=useState("")
  const [runDetail,setRunDetail]=useState<{run:PgRun;approval:PgApproval|null}|null>(null)
  const [baseId,setBaseId]=useState("")
  const [documents,setDocuments]=useState<PgKnowledgeDocument[]>([])
  const [hits,setHits]=useState<PgKnowledgeHit[]>([])
  const [agentName,setAgentName]=useState("")
  const [agentGoal,setAgentGoal]=useState("")
  const [instruction,setInstruction]=useState("")
  const [workflowName,setWorkflowName]=useState("")
  const [knowledgeName,setKnowledgeName]=useState("")
  const [knowledgeDescription,setKnowledgeDescription]=useState("")
  const [filename,setFilename]=useState("research-notes.txt")
  const [documentText,setDocumentText]=useState("")
  const [query,setQuery]=useState("")

  const api=useMemo(()=> {
    if(!token)return null
    try{return createPgPilotApi(token)}
    catch{return null}
  },[token])
  const refresh=useCallback(async()=>{
    if(!api)return
    setLoading(true)
    try {
      const [nextAgents,nextRuns,nextWorkflows,nextBases]=await Promise.all([
        api.listAgents(),api.listRuns(),api.listWorkflows(),api.listKnowledgeBases(),
      ])
      setAgents(nextAgents);setRuns(nextRuns);setWorkflows(nextWorkflows);setBases(nextBases)
      setSelectedSpecId(current=>nextAgents.some(x=>x.id===current)
        ?current:nextAgents[0]?.id||"")
      setSelectedRunId(current=>nextRuns.some(x=>x.id===current)
        ?current:nextRuns[0]?.id||"")
      setBaseId(current=>nextBases.some(x=>x.id===current)
        ?current:nextBases[0]?.id||"")
      setError("")
    }catch(err){setError(errorText(err))}
    finally{setLoading(false)}
  },[api])
  useEffect(()=>{
    let active=true
    // Schedule the asynchronous data fetch after effect subscription setup.
    void Promise.resolve().then(()=>{if(active)return refresh()})
    return ()=>{active=false}
  },[refresh])
  useEffect(()=>{
    if(!api||!selectedRunId)return
    let active=true
    const poll=async()=>{
      try{
        const item=await api.getRun(selectedRunId)
        if(active)setRunDetail({run:item.run,approval:item.approval})
      }catch{if(active)setRunDetail(null)}
    }
    void poll()
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void poll()},3500)
    return ()=>{active=false;window.clearInterval(timer)}
  },[api,selectedRunId])
  useEffect(()=>{
    if(!api||!baseId)return
    let active=true
    void api.listDocuments(baseId).then(items=>{
      if(active)setDocuments(items)
    }).catch(()=>{if(active)setDocuments([])})
    return ()=>{active=false}
  },[api,baseId])
  const runAction=async(action:()=>Promise<unknown>,success:string,after?:()=>Promise<unknown>)=>{
    if(!api||busy)return
    setBusy(true);setNotice("");setError("")
    try{
      await action()
      await refresh()
      if(after)await after()
      setNotice(success)
    }catch(err){setError(errorText(err))}
    finally{setBusy(false)}
  }
  const connect=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    try{
      createPgPilotApi(draftToken)
      setToken(draftToken.trim());setDraftToken("")
      setNotice("");setError("")
    }catch(err){setError(errorText(err))}
  }
  const disconnect=()=>{
    setToken("");setDraftToken("");setError("");setNotice("")
    setAgents([]);setRuns([]);setWorkflows([]);setBases([])
    setDocuments([]);setHits([]);setRunDetail(null)
  }
  const selectedRun=runDetail?.run?.id===selectedRunId
    ?runDetail.run:runs.find(x=>x.id===selectedRunId)
  const pendingApproval=selectedRun?.status==="awaiting_approval"&&
    runDetail?.run.id===selectedRun.id&&runDetail.approval?.status==="pending"
  return <main className="min-h-screen bg-[#f6f8fc] text-slate-900">
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-8">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-indigo-600">
            <Shield size={16}/> AGENT STUDIO · DATABASE MIGRATION
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">PostgreSQL V8.2 试验工作台</h1>
          <p className="mt-1 text-sm text-slate-500">隔离开发模式 · 独立 OIDC · 不接管原有 PocketBase 业务</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          <ShieldAlert size={15}/> 正式上线 NO-GO
        </div>
      </header>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0"/>
        <div>此页面仅供 <strong>127.0.0.1 开发环境</strong>进行隔离 API 验证。这里的 OIDC 令牌与旧 PocketBase 员工登录不互通；
          令牌不会持久化，但仍应仅使用经批准的测试身份。Workflow 暂时只保存结构，知识库检索仍为关键词检索。
          模型调用需要管理员单独开启隔离 Worker，可能产生模型费用；审批不等于已经执行。</div>
      </div>

      {!api ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><KeyRound size={22}/></span>
          <div><h2 className="font-semibold">连接隔离 PostgreSQL API</h2>
          <p className="text-xs text-slate-500">只接受由服务端实际验证的 OIDC 签名访问令牌</p></div>
        </div>
        <form className="space-y-4" onSubmit={connect}>
          <label className="block text-sm font-medium">测试员工 OIDC Access Token
            <input type="password" autoComplete="off" spellCheck={false}
              value={draftToken} onChange={e=>setDraftToken(e.target.value)}
              placeholder="仅在此会话内使用，不保存至浏览器" className={field}
              aria-label="测试员工 OIDC Access Token"/>
          </label>
          <p className="text-xs leading-5 text-slate-500">如未配置测试 OIDC 身份发行方，请先在独立环境完成身份接入；不要使用原 PocketBase token。</p>
          <button className={primary+" w-full"} type="submit">连接测试 API <ArrowRight size={16}/></button>
        </form>
      </section> : <>
        <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Check size={17}/> 已配置测试令牌 · API /__pg/api/v2
          </div>
          <div className="flex items-center gap-2">
            <button className={secondary} onClick={()=>void refresh()} disabled={loading||busy}>
              <RefreshCw size={15} className={loading?"animate-spin":""}/> 刷新
            </button>
            <button className={secondary} onClick={disconnect}><X size={15}/> 清除令牌</button>
          </div>
        </section>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Agent",agents.length],
            ["运行记录",runs.length],
            ["Workflow",workflows.length],
            ["知识库",bases.length],
          ].map(([name,total])=>
            <div key={name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{name}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{total}</p>
            </div>)}
        </div>
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="PostgreSQL 试验功能">
          {sections.map(item=><button key={item.id} type="button"
            onClick={()=>setSection(item.id)}
            className={"rounded-xl px-4 py-2.5 text-sm font-semibold transition "+
              (section===item.id?"bg-slate-900 text-white":"bg-white text-slate-600 hover:bg-slate-100")}>
            {item.label}
          </button>)}
        </nav>
        {section==="agents"&&<div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">新增 Agent 配置</h2>
            <p className="mb-5 text-xs text-slate-500">仅创建 PostgreSQL 私有配置，不会自动运行。</p>
            <form className="space-y-4" onSubmit={e=>{
              e.preventDefault()
              void runAction(()=>api.createAgent(agentName.trim(),agentGoal.trim()),
                "Agent 配置已写入隔离 PostgreSQL。").then(()=>{
                  setAgentName("");setAgentGoal("")
                })
            }}>
              <label className="block text-sm font-medium">Agent 名称
                <input required maxLength={120} value={agentName} onChange={e=>setAgentName(e.target.value)} className={field} placeholder="例如：投资研究助手"/>
              </label>
              <label className="block text-sm font-medium">任务目标
                <textarea required maxLength={2000} rows={5} value={agentGoal} onChange={e=>setAgentGoal(e.target.value)}
                  className={field} placeholder="清楚说明需要研究的问题和最终交付目标"/>
              </label>
              <button className={primary+" w-full"} type="submit" disabled={busy}>保存 Agent 配置</button>
            </form>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">本人 Agent 列表</h2>
            {agents.length===0?<p className="text-sm text-slate-500">暂无配置，可从左侧创建。</p>:
              <div className="space-y-2">{agents.map(item=>
                <button type="button" key={item.id} onClick={()=>{
                  setSelectedSpecId(item.id);setSection("runs")
                }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.spec.goal}</p>
                  </div><span className="shrink-0 text-xs text-slate-400">v{item.revision} <ArrowRight size={14} className="inline"/></span>
                </button>)}</div>}
          </section>
        </div>}

        {section==="runs"&&<div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Play size={17}/> 提交 Agent 任务</h2>
              <form className="space-y-4" onSubmit={e=>{
                e.preventDefault()
                if(!selectedSpecId)return
                void runAction(async()=>{
                  const outcome=await api.submitRun(selectedSpecId,instruction.trim(),
                    crypto.randomUUID())
                  setSelectedRunId(outcome.run.id)
                },"已提交准备任务，等待独立 Worker 领取。")
              }}>
                <label className="block text-sm font-medium">选择 Agent
                  <select className={field} value={selectedSpecId} onChange={e=>setSelectedSpecId(e.target.value)}>
                    {agents.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">运行指令
                  <textarea rows={4} maxLength={1200} value={instruction} onChange={e=>setInstruction(e.target.value)}
                    className={field} placeholder="输入具体研究或执行任务指令"/>
                </label>
                <button type="submit" className={primary+" w-full"} disabled={!selectedSpecId||!instruction.trim()||busy}>
                  <Play size={15}/> 入队运行
                </button>
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">运行历史</h2>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {runs.length===0?<p className="text-sm text-slate-500">尚无运行记录。</p>:
                  runs.map(item=><button key={item.id} type="button"
                    onClick={()=>{setSelectedRunId(item.id);setRunDetail(null)}}
                    className={"w-full rounded-xl border p-3 text-left "+
                      (selectedRunId===item.id?"border-indigo-300 bg-indigo-50":"border-slate-200 hover:bg-slate-50")}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold">{short(item.id)}</span>
                      <span className="text-xs text-slate-500">{statusText[item.status]}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.instruction||"无附加指令"}</p>
                  </button>)}
              </div>
            </section>
          </div>
          <section className="min-h-96 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">运行状态与人工审批</h2>
            {!selectedRun?<p className="text-sm text-slate-500">从左侧选择任务，查看状态与审批。</p>:<>
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <div><dt className="text-xs text-slate-500">任务编号</dt><dd className="mt-1 font-mono text-xs">{short(selectedRun.id)}</dd></div>
                <div><dt className="text-xs text-slate-500">运行状态</dt><dd className="mt-1 font-semibold">{statusText[selectedRun.status]}</dd></div>
                <div><dt className="text-xs text-slate-500">执行阶段</dt><dd className="mt-1 break-all text-xs">{String(selectedRun.checkpoint.stage||"prepare")}</dd></div>
                <div><dt className="text-xs text-slate-500">模型审批</dt><dd className="mt-1 text-xs">{runDetail?.run.id===selectedRun.id?(runDetail.approval?.status||"尚未请求"):"加载中"}</dd></div>
              </dl>
              {pendingApproval&&<div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield size={17}/> 模型调用审批</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">同意后将模型生成任务加入 PostgreSQL 队列。仅允许已配置的隔离模型 Worker 执行，可能产生调用费用。</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={primary} disabled={busy} onClick={()=>void runAction(
                    ()=>api.decideModel(selectedRun.id,"approved"),
                    "已批准并入队模型任务。请确认隔离 Worker 是否启用。",
                    async()=>{
                      const latest=await api.getRun(selectedRun.id)
                      setRunDetail({run:latest.run,approval:latest.approval})
                    })}><Check size={15}/> 批准模型调用</button>
                  <button className={secondary} disabled={busy} onClick={()=>void runAction(
                    ()=>api.decideModel(selectedRun.id,"rejected"),"已拒绝模型调用。",
                    async()=>{
                      const latest=await api.getRun(selectedRun.id)
                      setRunDetail({run:latest.run,approval:latest.approval})
                    })}>拒绝</button>
                </div>
              </div>}
              {selectedRun.status==="paused"&&
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={17}/> 已暂停，禁止自动重放</div>
                  <p className="mt-2 text-xs leading-5">异常代码：{selectedRun.last_error_code||String(selectedRun.checkpoint.stage||"")||"未配置"}。
                    如模型结果不明，需要管理员人工核对供应商实际调用情况；此试验台不提供强制恢复或重复扣费操作。</p>
                </div>}
              {selectedRun.status==="succeeded"&&<div className="mt-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText size={17}/> 模型生成结果</h3>
                <div className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6">{selectedRun.result_text||"结果暂未返回"}</div>
              </div>}
              {["queued","running"].includes(selectedRun.status)&&
                <p className="mt-5 text-sm text-slate-500">状态会每 3.5 秒刷新。需要分别开启准备 Worker 和经批准的模型 Worker。</p>}
            </>}
          </section>
        </div>}

        {section==="workflows"&&<div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><GitBranch size={18}/> 保存 Workflow 骨架</h2>
            <p className="mb-5 text-xs leading-5 text-slate-500">当前 PostgreSQL Workflow API 仅支持存储和读取节点与连线。这里不会执行任何工作流。</p>
            <form className="space-y-4" onSubmit={e=>{
              e.preventDefault()
              void runAction(()=>api.createWorkflow(workflowName.trim()),
                "Workflow 起止节点骨架已保存。")
            }}>
              <label className="block text-sm font-medium">名称
                <input className={field} required maxLength={120} value={workflowName} onChange={e=>setWorkflowName(e.target.value)} placeholder="例如：研究工作流"/>
              </label>
              <button className={primary+" w-full"} type="submit" disabled={busy}>创建 Workflow 骨架</button>
            </form>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold">已存储的工作流</h2>
            {workflows.length===0?<p className="text-sm text-slate-500">暂无工作流。</p>:
              <div className="space-y-3">{workflows.map(item=>
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div><h3 className="text-sm font-semibold">{item.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">v{item.revision} · {item.graph.nodes.length} 个节点 / {item.graph.edges.length} 条连线</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">不可执行</span>
                </div>)}</div>}
          </section>
        </div>}

        {section==="knowledge"&&<div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-semibold"><BookOpen size={17}/> 新增私有知识库</h2>
              <form className="space-y-3" onSubmit={e=>{
                e.preventDefault()
                void runAction(()=>api.createKnowledgeBase(knowledgeName.trim(),knowledgeDescription.trim()),
                  "知识库已创建。")
              }}>
                <label className="block text-sm font-medium">名称
                  <input required maxLength={120} className={field} value={knowledgeName} onChange={e=>setKnowledgeName(e.target.value)}/>
                </label>
                <label className="block text-sm font-medium">描述
                  <input maxLength={1000} className={field} value={knowledgeDescription} onChange={e=>setKnowledgeDescription(e.target.value)}/>
                </label>
                <button type="submit" disabled={busy} className={primary+" w-full"}>创建知识库</button>
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-sm font-semibold">当前知识库
                <select className={field} value={baseId} onChange={e=>{setBaseId(e.target.value);setDocuments([]);setHits([])}}>
                  {bases.map(base=><option key={base.id} value={base.id}>{base.name}</option>)}
                </select>
              </label>
              <p className="my-3 text-xs text-slate-500">已登记文档 · 仅显示本人文件名和索引状态</p>
              {documents.length===0?<p className="text-sm text-slate-400">暂无文档。</p>:
                <ul className="space-y-2">{documents.map(doc=><li key={doc.id}
                  className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                  <FileText size={15} className="shrink-0"/><span className="min-w-0 flex-1 break-words">{doc.filename}</span>
                  <span className="text-slate-500">{doc.status}</span>
                </li>)}</ul>}
            </section>
          </div>
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-1 font-semibold">导入测试 TXT / Markdown</h2>
              <p className="mb-4 text-xs text-slate-500">限制 12,000 字符；只在隔离环境使用不敏感测试内容。</p>
              <form className="space-y-3" onSubmit={e=>{
                e.preventDefault()
                if(!baseId)return
                void runAction(()=>api.importText(baseId,filename,documentText),
                  "文档已索引，支持关键词搜索。",
                  async()=>{setDocuments(await api.listDocuments(baseId))})
              }}>
                <label className="block text-sm font-medium">文件名
                  <input className={field} required maxLength={120} value={filename} onChange={e=>setFilename(e.target.value)}/>
                </label>
                <label className="block text-sm font-medium">文档正文
                  <textarea className={field} rows={5} maxLength={12000} required value={documentText} onChange={e=>setDocumentText(e.target.value)}/>
                </label>
                <button className={primary+" w-full"} disabled={!baseId||busy} type="submit">导入索引</button>
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-1 font-semibold">关键词检索</h2>
              <p className="mb-4 text-xs text-slate-500">当前为字面关键词匹配，并非 Embedding 语义检索或完整 RAG。</p>
              <form className="flex gap-2" onSubmit={e=>{
                e.preventDefault()
                if(!baseId)return
                void runAction(async()=>{setHits(await api.searchKnowledge(baseId,query.trim()))},
                  "关键词检索已完成。")
              }}>
                <input className={field+" !mt-0 min-w-0 flex-1"} minLength={2} maxLength={160} required value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入关键词"/>
                <button type="submit" className={primary} disabled={busy||!baseId}>搜索</button>
              </form>
              <div className="mt-4 space-y-2">{hits.map(hit=><div key={hit.citation} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-indigo-700">{hit.filename} · {hit.citation}</p>
                <p className="whitespace-pre-wrap break-words text-slate-700">{hit.snippet}</p>
              </div>)}</div>
            </section>
          </div>
        </div>}
      </>}
      {error&&<div className="fixed bottom-5 left-4 right-4 z-50 mx-auto flex max-w-xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-xl" role="alert">
        <p className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0"/>{error}</p>
        <button type="button" onClick={()=>setError("")} aria-label="关闭错误"><X size={16}/></button>
      </div>}
      {notice&&!error&&<div className="fixed bottom-5 left-4 right-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xl" role="status">
        <p className="flex items-center gap-2 text-sm text-emerald-700">{busy?<Loader2 className="animate-spin" size={16}/>:<Check size={16}/>} {notice}</p>
        <button type="button" onClick={()=>setNotice("")} aria-label="关闭通知"><X size={16}/></button>
      </div>}
    </div>
  </main>
}
