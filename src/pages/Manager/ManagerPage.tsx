import { useEffect, useState } from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import { Link, useSearchParams } from "react-router-dom"
import {
  Activity, AlertCircle, CheckCircle2, ClipboardCheck, Clock3,
  RefreshCw, ShieldCheck, UsersRound, XCircle,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

type Employee = {id:string;display_name:string;role:string;active:boolean;
  agent_running:number;workflow_running:number;pending_approvals:number;
  failed_7d:number;overdue_schedules:number;knowledge_bases:number}
type Company = {scope:"company_metadata_only";truncated:boolean;
  totals:{employees:number;active:number;agent_running:number;workflow_running:number;
    pending_approvals:number;failed_7d:number;overdue_schedules:number;knowledge_bases:number};
  employees:Employee[];worker:{configured:boolean;alive:boolean;age_ms:number|null}}
type OwnPending={run_id:string;title:string;step_index:number;tool:string;
  reviewer_id:string;expires_ms:number}
type Reviewer={id:string;display_name:string}
type Own={reviewers:Reviewer[];pending:OwnPending[]}
type Assigned={run_id:string;title:string;owner_name:string;step_index:number;tool:string;
  fingerprint:string;input_preview:string;review_note:string;expires_ms:number}
type Account={user:{id:string;role:string;display_name:string}}
const issueMessages:Record<string,string>={
  admin_required:"只有获得授权的公司管理员才能查看负责人数据。",
  invalid_reviewer:"只能指定当前启用的公司管理员作为代审批负责人。",
  run_not_found:"任务不存在，或者该任务不属于你的账号。",
  delegation_not_found:"委托授权已经被撤销或不存在。",
  delegation_missing:"审批授权已撤销或过期，请员工重新授权。",
  approval_stale:"待审批步骤已变化，请刷新并重新核对。",
  approval_already_resolved:"该步骤已审批过，请刷新记录。",
  run_not_awaiting_approval:"该任务当前不是待审批状态。",
  review_confirmation_required:"请先确认你已审核即将执行的操作。",
}
async function api<T>(method:string,url:string,body?:unknown):Promise<T>{
  const response=await fetch(getPocketBaseUrl()+url,{
    method,headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const data=await response.json().catch(()=>({})) as Record<string,unknown>
  if(!response.ok)throw Error(issueMessages[String(data.error||"")]||String(data.message||data.error||"请求失败，请重试"))
  return data as T
}
const card="rounded-2xl border border-border bg-card p-5 shadow-sm"
const btn="rounded-lg border border-border px-3 py-2 text-xs transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
function formatTime(time:number){
  return Number.isFinite(time)&&time>0?
    new Date(time).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"
}

export default function ManagerPage({personalOnly=false}:{personalOnly?:boolean}){
  const [params,setParams]=useSearchParams()
  const requested=params.get("view")
  const view=personalOnly?"mine":requested==="company"||requested==="mine"?requested:"inbox"
  const [filter,setFilter]=useState("")
  const [inboxPage,setInboxPage]=useState(1)
  const [loadedAt,setLoadedAt]=useState(0)
  const changeView=(value:string)=>{const next=new URLSearchParams(params);next.set("view",value);setParams(next)}
  const [me,setMe]=useState<Account["user"]|null>(null)
  const [company,setCompany]=useState<Company|null>(null)
  const [owner,setOwner]=useState<Own>({reviewers:[],pending:[]})
  const [assigned,setAssigned]=useState<Assigned[]>([])
  const [selection,setSelection]=useState<Record<string,string>>({})
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [notice,setNotice]=useState("")
  const [revision,setRevision]=useState(0)

  useEffect(()=>{
    let mounted=true
    void (async()=>{
      setLoading(true);setError("")
      // Fetch only the active view. Company metrics cannot block the approval inbox.
      try{
        const account=await api<Account>("GET","/api/studio/me")
        if(!mounted)return
        setMe(account.user)
        if(view==="mine"){
          const own=await api<Own>("GET","/api/studio/approval-delegations")
          if(!Array.isArray(own.pending)||!Array.isArray(own.reviewers))throw Error("委托数据格式异常，请重新加载")
          if(mounted)setOwner(own)
        }else if(account.user.role==="admin"&&!personalOnly){
          if(view==="company"){
            const overall=await api<Company>("GET","/api/studio/company/overview")
            if(overall.scope!=="company_metadata_only"||!Array.isArray(overall.employees))throw Error("无法确认公司统计范围")
            if(mounted)setCompany(overall)
          }else{
            const inbox=await api<{items:Assigned[]}>("GET","/api/studio/manager/approvals")
            if(!Array.isArray(inbox.items))throw Error("审批列表格式异常，请重新加载")
            if(mounted){setAssigned(inbox.items);setInboxPage(1)}
          }
        }else throw Error("当前账号无权读取公司管理数据。请使用我的委托入口。")
        if(mounted)setLoadedAt(Date.now())
      }catch(err){if(mounted)setError(String((err as Error).message||err))}
      finally{if(mounted)setLoading(false)}
    })()
    return ()=>{mounted=false}
  },[revision,view,personalOnly])

  const refresh=()=>{setLoading(true);setRevision(v=>v+1)}
  const grant=async(item:OwnPending)=>{
    const reviewerId=selection[item.run_id]||""
    if(!reviewerId)return
    const reviewNote=String(reviewNotes[item.run_id]||"").trim()
    if(reviewNote.length<8||reviewNote.length>500){
      setError("请先填写8～500字的审核说明，不要包含内部机密、密码或API Key。")
      return
    }
    const reviewer=owner.reviewers.find(r=>r.id===reviewerId)
    if(!await confirmInStudio("确认将「"+item.title+"」当前待审批步骤委托给"+reviewer?.display_name+
      "？仅授权此任务，24 小时内有效，负责人可批准或拒绝该步骤。"))return
    setSaving(true);setError("");setNotice("")
    try{
      await api("POST","/api/studio/approval-delegations",{
        action:"grant",run_id:item.run_id,reviewer_id:reviewerId,
        expires_hours:24,review_note:reviewNote,
      })
      setNotice("已授权负责人审核当前任务。你可以随时撤销，执行权限不会转移给对方。")
      setReviewNotes(prev=>({...prev,[item.run_id]:""}))
      refresh()
    }catch(e){setError(String((e as Error).message||e))}
    finally{setSaving(false)}
  }
  const revoke=async(item:OwnPending)=>{
    if(!await confirmInStudio("确认撤销「"+item.title+"」的代审批授权？"))return
    setSaving(true);setError("");setNotice("")
    try{
      await api("POST","/api/studio/approval-delegations",{
        action:"revoke",run_id:item.run_id,
      })
      setNotice("已撤销代审批授权。");refresh()
    }catch(e){setError(String((e as Error).message||e))}
    finally{setSaving(false)}
  }
  const decide=async(item:Assigned,decision:"approve"|"reject")=>{
    const verb=decision==="approve"?"批准继续执行":"拒绝执行"
    if(!await confirmInStudio(
      "请核对以下员工授权的待执行步骤。\n"+
      "任务："+item.title+"\n工具："+item.tool+"\n"+
      "员工主动填写的审核说明："+item.review_note+"\n"+
      "参数元信息（内容已隐藏）："+item.input_preview+"\n\n"+
      "确定"+verb+"？审批仅作用于此步骤，并留下完整审计记录。"
    ))return
    setSaving(true);setError("");setNotice("")
    try{
      await api("POST","/api/studio/manager/decision",{
        run_id:item.run_id,step_index:item.step_index,
        fingerprint:item.fingerprint,decision,confirm:true,
      })
      setNotice(decision==="approve"?"已批准，任务将由原运行器继续执行。":"已拒绝，任务将交由运行器继续处理拒绝结果。")
      refresh()
    }catch(e){setError(String((e as Error).message||e))}
    finally{setSaving(false)}
  }
  const matching=assigned.filter(item=>(item.title+" "+item.owner_name+" "+item.tool).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
    .sort((a,b)=>a.expires_ms-b.expires_ms)
  const pageCount=Math.max(1,Math.ceil(matching.length/10))
  const currentPage=Math.min(inboxPage,pageCount)
  const shown=matching.slice((currentPage-1)*10,currentPage*10)
  const stats=company?[
    {label:"启用员工",value:company.totals.active},
    {label:"执行中",value:company.totals.agent_running+company.totals.workflow_running},
    {label:"公司待审批总数",value:company.totals.pending_approvals},
    {label:"近 7 天失败",value:company.totals.failed_7d},
    {label:"超期计划",value:company.totals.overdue_schedules},
    {label:"知识库数量",value:company.totals.knowledge_bases},
  ]:[]
  return <SiteShell><main data-studio-fluid-page="manager" className="w-full min-w-0 space-y-5 px-4 pb-12 pt-6 lg:px-8 2xl:px-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold text-primary">{personalOnly?"我的工作":"组织管理"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{personalOnly?"我的审批委托":"运行与审批"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{personalOnly?"只处理你本人任务的单次委托；不会转移任务所有权或资料权限。":"先处理被明确授权给你的审批；公司运行统计与自己的委托分开查看。"}</p>
      </div>
      <button type="button" className={btn+" inline-flex min-h-10 items-center gap-2"} disabled={loading||saving} onClick={refresh}>
        <RefreshCw size={15} className={loading?"animate-spin":""}/>刷新当前视图
      </button>
    </header>
    {!personalOnly&&<nav aria-label="管理工作区" className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-1.5">
      {[{key:"inbox",label:"待我审批",icon:ClipboardCheck},{key:"company",label:"公司运行",icon:Activity},{key:"mine",label:"我的委托",icon:UsersRound}].map(item=><button key={item.key} type="button"
        disabled={saving} aria-pressed={view===item.key} onClick={()=>changeView(item.key)}
        className={"inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 "+(view===item.key?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-secondary")}>
        <item.icon className="h-4 w-4"/>{item.label}
      </button>)}
    </nav>}
    {notice&&<p role="status" className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{notice}</p>}
    {error&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0"/><p className="min-w-0 flex-1">{error}。已隐藏旧数据，不能据此判断没有待办。</p><button type="button" className={btn} onClick={refresh}>重试</button>
    </div>}
    {loading?<div role="status" className={card+" flex items-center gap-2 text-sm text-muted-foreground"}><RefreshCw className="h-4 w-4 animate-spin"/>正在核对权限并读取当前视图…</div>:!error&&<>
      {view==="inbox"&&me?.role==="admin"&&!personalOnly&&<section id="delegated-approvals" aria-label="待我审批" className={card+" min-w-0"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">已授权给我的待办 <span className="ml-2 text-sm font-normal text-muted-foreground">{assigned.length} 项</span></h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">按截止时间排序；仅展示员工主动委托的当前步骤，不等于公司的全部待审批任务。</p></div>
          <label className="flex w-full items-center gap-2 rounded-xl border border-input px-3 sm:max-w-xs"><span className="sr-only">搜索审批任务、员工或工具</span><input aria-label="搜索审批任务、员工或工具" value={filter} onChange={e=>{setFilter(e.target.value);setInboxPage(1)}} placeholder="搜索任务、员工或工具" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
        </div>
        {!shown.length?<div className="mt-4 rounded-xl border border-dashed p-8 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-primary"/><p className="mt-3 text-sm font-medium">{filter?"没有匹配的审批":"目前没有委托给你的审批"}</p><p className="mt-2 text-xs text-muted-foreground">{filter?"调整关键词，不会更改任何授权。":"公司存在待审批任务，并不代表你已获得处理权限。"}</p>{filter&&<button type="button" className={btn+" mt-4"} onClick={()=>setFilter("")}>清除搜索</button>}</div>:
          <div className="mt-4 space-y-3">{shown.map(item=><article key={item.run_id+":"+item.step_index} className="min-w-0 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{item.title}</h3><p className="mt-1 break-words text-xs text-muted-foreground">来自 {item.owner_name} · 工具 {item.tool} · 第 {item.step_index} 步</p></div><span className="text-xs text-amber-700">截止 {formatTime(item.expires_ms)}</span></div>
            <p className="mt-3 rounded-lg bg-secondary/40 p-3 text-xs leading-6"><strong>员工审核说明：</strong>{item.review_note}</p>
            <details className="mt-3 rounded-lg border border-border px-3 py-2"><summary className="cursor-pointer text-xs font-medium">参数元信息与授权边界</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{item.input_preview||"（无参数）"}</pre><p className="mt-2 text-xs text-muted-foreground">批准可能触发外部写入；只作用于当前步骤，实际字段值未向你公开。</p></details>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {item.expires_ms<=Date.now()&&<span className="mr-auto text-xs text-destructive">授权已过期，请员工重新委托</span>}
              <button type="button" aria-label={"拒绝待审批调用："+item.title} disabled={saving||item.expires_ms<=Date.now()} className={btn+" inline-flex min-h-10 items-center gap-1"} onClick={()=>void decide(item,"reject")}><XCircle size={14}/>拒绝</button>
              <button type="button" aria-label={"批准待审批调用："+item.title} disabled={saving||item.expires_ms<=Date.now()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40" onClick={()=>void decide(item,"approve")}><ShieldCheck size={14}/>审核并批准</button>
            </div>
          </article>)}</div>}
        {matching.length>10&&<footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><span>已加载的授权待办中，每页展示 10 项</span><div className="flex items-center gap-3"><button type="button" className={btn} disabled={currentPage<=1||saving} onClick={()=>setInboxPage(currentPage-1)}>上一页</button><span>{currentPage} / {pageCount}</span><button type="button" className={btn} disabled={currentPage>=pageCount||saving} onClick={()=>setInboxPage(currentPage+1)}>下一页</button></div></footer>}
      </section>}
      {view==="company"&&company&&!personalOnly&&<section aria-label="公司运行统计" className={card+" min-w-0"}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">公司运行健康度</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">公司范围，仅汇总状态与数量，不读取员工任务内容和凭据。待审批总数不等于本人可处理数量。</p></div><Link to="/tool-hub?view=monitor" className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-primary">检查执行器状态</Link></div>
        <p className={"mt-3 text-xs "+(company.worker.alive?"text-emerald-700":"text-amber-700")}>Worker {company.worker.alive?"正常响应":company.worker.configured?"心跳暂未响应":"未配置"} · 统计仅代表本次读取</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{stats.map(item=><div key={item.label} className="rounded-xl border border-border bg-secondary/20 p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p></div>)}</div>
        <details className="mt-5 rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">按员工查看聚合状态（{company.employees.length} 人）</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{company.employees.map(emp=><article key={emp.id} className="min-w-0 rounded-lg border border-border p-3"><p className="break-words text-sm font-semibold">{emp.display_name}<span className="ml-2 text-xs font-normal text-muted-foreground">{emp.active?"已启用":"已停用"}</span></p><dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><div>执行中 <strong className="text-foreground">{emp.agent_running+emp.workflow_running}</strong></div><div>待审批 <strong className="text-foreground">{emp.pending_approvals}</strong></div><div>7 天失败 <strong className="text-foreground">{emp.failed_7d}</strong></div><div>超期计划 <strong className="text-foreground">{emp.overdue_schedules}</strong></div></dl></article>)}</div></details>
        {company.truncated&&<p role="status" className="mt-3 text-xs text-amber-700">当前只包含前 200 名员工，不能作为全公司完整报表。</p>}
      </section>}
      {view==="mine"&&<section aria-label="我的审批委托" className={card}>
        <h2 className="text-base font-semibold">委托负责人审批我的任务</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">选择具体负责人并说明允许执行的边界。只授权当前步骤，24 小时有效，可随时撤销。</p>
        {!owner.pending.length?<div className="mt-4 rounded-xl border border-dashed p-8 text-center"><p className="text-sm">目前没有等待审批的本人任务</p><Link to="/agent-run" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-xs font-semibold text-primary">查看我的运行</Link></div>:
          <div className="mt-4 space-y-4">{owner.pending.map(item=><article key={item.run_id} className="min-w-0 rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{item.title}</h3><p className="mt-1 break-words text-xs text-muted-foreground">步骤 {item.step_index} · {item.tool}</p></div><Link to={"/agent-run?run="+encodeURIComponent(item.run_id)+"#run-next-action"} className="text-xs font-semibold text-primary">回到原任务</Link></div>
            {item.reviewer_id?<div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">已委托 · 有效至 {formatTime(item.expires_ms)}</p><button type="button" disabled={saving} className={btn} onClick={()=>void revoke(item)}>撤销授权</button></div>:
              !owner.reviewers.length?<p className="mt-3 text-xs text-muted-foreground">暂无其他有效管理员；仍可返回原任务亲自核验。</p>:
              <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(180px,0.6fr)_minmax(0,1fr)]"><label className="text-xs font-medium">审批负责人<select aria-label={"选择 "+item.title+" 的负责人"} value={selection[item.run_id]||""} onChange={e=>setSelection(old=>({...old,[item.run_id]:e.target.value}))} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"><option value="">请选择负责人</option>{owner.reviewers.map(r=><option key={r.id} value={r.id}>{r.display_name}</option>)}</select></label><label className="text-xs font-medium">审核说明（请勿包含机密或凭据）<textarea aria-label={"审核说明 "+item.title} rows={3} maxLength={500} value={reviewNotes[item.run_id]||""} onChange={e=>setReviewNotes(old=>({...old,[item.run_id]:e.target.value}))} placeholder="说明允许执行的动作、目的及限制" className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"/></label><div className="md:col-span-2 flex justify-end"><button type="button" disabled={saving||!selection[item.run_id]||(reviewNotes[item.run_id]||"").trim().length<8} onClick={()=>void grant(item)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">确认委托 24 小时</button></div></div>}
          </article>)}</div>}
      </section>}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5"/>当前视图更新于 {formatTime(loadedAt)} · 授权与决策由服务端复核并记录审计{!personalOnly&&<Link to="/staff" className="ml-auto text-primary">管理成员权限</Link>}</p>
    </>}
  </main></SiteShell>
}
