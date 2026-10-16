import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
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

export default function ManagerPage(){
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
      try{
        const account=await api<Account>("GET","/api/studio/me")
        const own=await api<Own>("GET","/api/studio/approval-delegations")
        if(!mounted)return
        setMe(account.user);setOwner(own)
        if(account.user.role==="admin"){
          const [overall,inbox]=await Promise.all([
            api<Company>("GET","/api/studio/company/overview"),
            api<{items:Assigned[]}>("GET","/api/studio/manager/approvals"),
          ])
          if(mounted){setCompany(overall);setAssigned(inbox.items||[])}
        }else if(mounted){setCompany(null);setAssigned([])}
        if(mounted)setError("")
      }catch(err){if(mounted)setError(String((err as Error).message||err))}
      finally{if(mounted)setLoading(false)}
    })()
    return ()=>{mounted=false}
  },[revision])

  const refresh=()=>{setLoading(true);setRevision(v=>v+1)}
  const grant=async(item:OwnPending)=>{
    const reviewerId=selection[item.run_id]||owner.reviewers[0]?.id
    if(!reviewerId)return
    const reviewNote=String(reviewNotes[item.run_id]||"").trim()
    if(reviewNote.length<8||reviewNote.length>500){
      setError("请先填写8～500字的审核说明，不要包含内部机密、密码或API Key。")
      return
    }
    const reviewer=owner.reviewers.find(r=>r.id===reviewerId)
    if(!window.confirm("确认将「"+item.title+"」当前待审批步骤委托给"+reviewer?.display_name+
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
    if(!window.confirm("确认撤销「"+item.title+"」的代审批授权？"))return
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
    if(!window.confirm(
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
  const stats=company?[
    {label:"在职员工",value:company.totals.active},
    {label:"执行中",value:company.totals.agent_running+company.totals.workflow_running},
    {label:"待审批",value:company.totals.pending_approvals},
    {label:"近7天失败",value:company.totals.failed_7d},
    {label:"超期计划",value:company.totals.overdue_schedules},
    {label:"知识库数量",value:company.totals.knowledge_bases},
  ]:[]
  return <SiteShell>
    <main className="min-h-screen flex-1 bg-background p-4 text-foreground sm:p-7">
      <div className="w-full min-w-0 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <ShieldCheck className="h-6 w-6 text-primary"/>公司运行与授权审批
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              负责人查看运行状态；员工按任务授权单次代审批，不转移知识库、凭据和任务所有权。
            </p>
          </div>
          <button className={btn+" inline-flex items-center gap-2"} disabled={loading||saving} onClick={refresh}>
            <RefreshCw size={15}/>刷新
          </button>
        </header>
        {error&&<div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle size={18}/>{error}
        </div>}
        {notice&&<div role="status" className="flex gap-2 rounded-xl border bg-secondary p-3 text-sm">
          <CheckCircle2 size={18} className="text-primary"/>{notice}
        </div>}
        {assigned.length>0 && <a href="#delegated-approvals"
          className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4"/>有 {assigned.length} 项委托审批等待处理
          </span>
          <span className="text-xs">前往审批 →</span>
        </a>}
        {loading?<div role="status" className={card+" flex items-center gap-2 text-sm text-muted-foreground"}>
          <Activity size={18} className="animate-pulse"/>正在验证权限并读取运行状态…
        </div>:<>
          {company&&<>
            <section className={card}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold"><Activity size={17}/>公司运行健康度</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    仅汇总状态及数量，不读取员工任务指令、执行内容与敏感凭据。
                  </p>
                </div>
                <span className={"text-xs "+(company.worker.alive?"text-emerald-700":"text-amber-700")}>
                  Worker {company.worker.alive?"正常响应":company.worker.configured?"心跳暂未响应":"未配置"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {stats.map(s=><div key={s.label} className="rounded-xl border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
                </div>)}
              </div>
              <details className="mt-4 rounded-lg border border-border bg-background/60 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                  按员工查看运行统计（{company.employees.length} 人）
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                  <thead><tr className="border-b text-muted-foreground">
                    {["员工","状态","Agent执行中","Workflow执行中","待审批","7天失败","超期计划"].map(s=>
                      <th key={s} className="px-2 py-3 font-medium">{s}</th>)}
                  </tr></thead>
                  <tbody>{company.employees.map(emp=><tr key={emp.id} className="border-b last:border-0">
                    <td className="px-2 py-3 font-medium">{emp.display_name}</td>
                    <td className="px-2 py-3">{emp.active?"在职":"已停用"}</td>
                    <td className="px-2 py-3 tabular-nums">{emp.agent_running}</td>
                    <td className="px-2 py-3 tabular-nums">{emp.workflow_running}</td>
                    <td className="px-2 py-3 tabular-nums">{emp.pending_approvals}</td>
                    <td className="px-2 py-3 tabular-nums">{emp.failed_7d}</td>
                    <td className="px-2 py-3 tabular-nums">{emp.overdue_schedules}</td>
                  </tr>)}</tbody>
                  </table>
                </div>
              </details>
              {company.truncated&&<p className="mt-2 text-xs text-amber-700">当前只统计前200名员工，请由运维升级分页后再用于全员报表。</p>}
            </section>
            <section id="delegated-approvals" className={card+" scroll-mt-20"}>
              <h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={17}/>委托给我的审批
                <span className="text-xs font-normal text-muted-foreground">（{assigned.length}）</span></h2>
              <p className="mt-1 text-xs text-muted-foreground">
                仅显示员工主动授权的任务与当前步骤。批准可能触发外部写入，请核对工具与参数预览。
              </p>
              <div className="mt-3 space-y-3">
                {assigned.length===0?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  当前没有获得员工授权的待审批事项。
                </p>:assigned.map(item=><article key={item.run_id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-medium">{item.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        来自 {item.owner_name} · 工具 {item.tool} · 第 {item.step_index} 步 · 截止 {formatTime(item.expires_ms)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className={btn+" inline-flex items-center gap-1"} disabled={saving}
                        onClick={()=>void decide(item,"reject")}><XCircle size={14}/>拒绝</button>
                      <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-40"
                        disabled={saving} onClick={()=>void decide(item,"approve")}>
                        <CheckCircle2 size={14}/>批准
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed">
                    <strong>员工说明：</strong>{item.review_note}
                  </p>
                  <details className="mt-3 rounded-lg bg-secondary/40 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">查看参数元信息（已隐藏实际字段值）</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{item.input_preview||"（无参数）"}</pre>
                  </details>
                </article>)}
              </div>
            </section>
          </>}
          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><UsersRound size={18}/>委托负责人审批我的任务</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              员工仍是任务所有者。代审批只对一个等待审核的 Agent 步骤生效，当前有效期24小时；
              任何人无法仅凭链接或用户ID接管你的 Agent 和资料。
            </p>
            <div className="mt-4 space-y-3">
              {owner.pending.length===0?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                暂无待审批的 Agent 运行。<Link to="/agent-run" className="ml-1 text-primary underline">查看运行任务</Link>
              </p>:owner.pending.map(item=><div key={item.run_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    步骤 {item.step_index} · {item.tool}
                    {item.reviewer_id?" · 已授权至 "+formatTime(item.expires_ms):""}
                  </p>
                </div>
                {item.reviewer_id?<button className={btn} disabled={saving} onClick={()=>void revoke(item)}>撤销授权</button>:
                  owner.reviewers.length===0?<p className="text-xs text-muted-foreground">暂无其他有效管理员</p>:
                  <div className="flex min-w-[230px] max-w-lg flex-1 flex-col gap-2">
                    <select aria-label={"选择 "+item.title+" 的负责人"} className="rounded-lg border bg-background px-2 py-2 text-xs"
                      value={selection[item.run_id]||owner.reviewers[0]?.id}
                      onChange={e=>setSelection(old=>({...old,[item.run_id]:e.target.value}))}>
                      {owner.reviewers.map(r=><option key={r.id} value={r.id}>{r.display_name}</option>)}
                    </select>
                    <label className="min-w-0 flex-1 text-xs">
                      <span className="text-muted-foreground">提交给负责人的审核说明（不得含机密内容）</span>
                      <textarea rows={2} maxLength={500} required
                        aria-label={"审核说明 "+item.title}
                        value={reviewNotes[item.run_id]||""}
                        onChange={e=>setReviewNotes(old=>({...old,[item.run_id]:e.target.value}))}
                        placeholder="例如：仅批准读取公开公司财报并核对统计口径，不得对外发送客户资料"
                        className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-2 py-2 text-xs"/>
                    </label>
                    <button className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-40"
                      disabled={saving} onClick={()=>void grant(item)}>授权24小时</button>
                  </div>}
              </div>)}
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Clock3 size={15}/>授予/撤销/批准/拒绝均由服务端记录审计。审批完成后由原运行器继续执行。
            {me?.role==="admin"&&<Link to="/staff" className="text-primary underline">员工与权限</Link>}
          </div>
        </>}
      </div>
    </main>
  </SiteShell>
}
