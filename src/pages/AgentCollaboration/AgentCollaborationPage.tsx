import { useEffect, useState, type FormEvent } from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import { Link } from "react-router-dom"
import {
  AlertCircle, Bot, CheckCircle2, Eye, FilePenLine,
  History, LockKeyhole, RefreshCw, Send, ShieldCheck, Trash2, UserPlus, UsersRound,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
import {AgentPlanDiff,AgentVersionHistory} from "@/components/agents/AgentVersionHistory"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"

type CollabRole="owner"|"viewer"|"editor"
type SharedAgent={id:string;name:string;owner_uid:string;owner_name:string;role:CollabRole}
type AgentSummary={items:SharedAgent[]}
type Plan={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
type Member={member_id:string;name:string;role:"viewer"|"editor";active:boolean}
type Proposal={
 id:string;author_uid:string;status:"pending"|"accepted"|"rejected";created_ms:number;
 reviewed_ms:number;comment:string;base_hash:string;proposed:Plan
}
type Detail={ok:boolean;id:string;name:string;owner_uid:string;role:CollabRole;
 current:Plan;base_hash:string;grants:Member[];proposals:Proposal[]}
const errorMap:Record<string,string>={
 agent_not_found:"Agent 不存在，或尚未获得授权。请刷新列表。",
 invalid_access_role:"仅能授予 Viewer 或 Editor 权限。",
 invalid_recipient_email:"请输入正确的公司工作邮箱。",
 recipient_not_found:"该工作邮箱不属于启用中的员工账号。",
 editor_required:"当前账号不能提出修改。",
 collab_protected_field:"修改范围只能是 Agent 目标、任务范围与计划，不含密钥、工具和知识库绑定。",
 collab_version_conflict:"方案已被其他人更新，旧草稿不能覆盖新版本。请刷新并重新提交。",
 collab_pending_exists:"你还有一份未审核的提案，请等待所有者决定。",
 collab_already_reviewed:"此提案已经审核，请刷新。",
 collab_proposal_not_found:"提案不存在或无权查看。",
 invalid_collab_spec:"方案内容超出约定范围或缺少目标。",
 collab_limit:"每个 Agent 最多授权30位协作成员。",
 collab_author_revoked:"提案的编辑者已被撤销或停用，不能再采纳此提案。",
}
async function api<T>(method:string,url:string,body?:unknown):Promise<T>{
 const response=await fetch(getPocketBaseUrl()+url,{
  method,headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 })
 const data=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok){
  const key=String(data.error||"")
  throw Error(errorMap[key]||String(data.message||key||"请求未成功"))
 }
 return data as T
}
const box="rounded-2xl border border-border bg-card p-5"
const button="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-40"
const fmt=(ms:number)=>new Date(ms).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})
const editableFields=[
 {key:"deliverables",label:"交付物"},
 {key:"task_plan",label:"任务计划"},
 {key:"done_criteria",label:"完成标准"},
] as const

export default function AgentCollaborationPage(){
 const [agents,setAgents]=useState<SharedAgent[]>([])
 const [selected,setSelected]=useState("")
 const [detail,setDetail]=useState<Detail|null>(null)
 const [draft,setDraft]=useState<Plan|null>(null)
 const [draftLists,setDraftLists]=useState({
  deliverables:"",task_plan:"",done_criteria:"",
 })
 const [comment,setComment]=useState("")
 const [email,setEmail]=useState("")
 const [grantRole,setGrantRole]=useState<"viewer"|"editor">("viewer")
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(true)
 const [revision,setRevision]=useState(0)

 const refresh=()=>{setDetail(null);setDraft(null);setRevision(i=>i+1)}
 useEffect(()=>{
  let active=true
  void api<AgentSummary>("GET","/api/studio/agent-collab/list")
   .then(response=>{
     if(!active)return
     const items=response.items||[]
     setAgents(items)
     setSelected(old=>items.some(x=>x.id===old)?old:(items[0]?.id||""))
   })
   .catch(err=>{if(active)setError(String(err.message||err))})
   .finally(()=>{if(active)setLoading(false)})
  return ()=>{active=false}
 },[revision])
 useEffect(()=>{
  if(!selected)return
  let active=true
  void api<Detail>("GET","/api/studio/agent-collab/detail?spec_id="+encodeURIComponent(selected))
   .then(value=>{
    if(!active)return
    setDetail(value)
    setError("")
    setDraft(JSON.parse(JSON.stringify(value.current)) as Plan)
    setDraftLists({
     deliverables:value.current.deliverables.join("\n"),
     task_plan:value.current.task_plan.join("\n"),
     done_criteria:value.current.done_criteria.join("\n"),
    })
   }).catch(err=>{if(active)setError(String(err.message||err))})
  return ()=>{active=false}
 },[selected,revision])
 const act=async(fn:()=>Promise<unknown>,message:string):Promise<boolean>=>{
  if(busy)return false
  setBusy(true);setError("");setNotice("")
  try{await fn();setNotice(message);refresh();return true}
  catch(err){setError(String((err as Error).message||err));return false}
  finally{setBusy(false)}
 }
 const grant=async(e:FormEvent)=>{
  e.preventDefault()
  if(!detail||!email.trim())return
  const chosen=email.trim()
  if(!await confirmInStudio("授予 "+chosen+" "+(grantRole==="viewer"?"查看方案":"提交方案修改建议")+
   "权限？协作成员不能直接执行此 Agent、获取密钥或修改工具。"))return
  const granted=await act(()=>api("POST","/api/studio/agent-collab/grant",{
    spec_id:detail.id,action:"grant",role:grantRole,recipient_email:chosen,
   }),"已更新成员权限。")
  if(granted)setEmail("")
 }
 const revoke=async(member:Member)=>{
  if(!detail||!await confirmInStudio("撤销 "+member.name+" 的协作权限？"))return
  await act(()=>api("POST","/api/studio/agent-collab/grant",{
    spec_id:detail.id,action:"revoke",member_id:member.member_id,
  }),"协作授权已撤销。")
 }
 const propose=async(e:FormEvent)=>{
  e.preventDefault()
  if(!detail||!draft)return
  if(comment.trim().length<8||comment.length>600){
   setError("请填写8～600字修改理由。");return
  }
  const parseRows=(text:string)=>text.split("\n").map(s=>s.trim()).filter(Boolean)
  const parsed={
   ...draft,
   deliverables:parseRows(draftLists.deliverables),
   task_plan:parseRows(draftLists.task_plan),
   done_criteria:parseRows(draftLists.done_criteria),
  }
  if(["deliverables","task_plan","done_criteria"].some(name=>{
    const rows=parsed[name as "deliverables"|"task_plan"|"done_criteria"]
    return rows.length>30||rows.some(x=>x.length>500)
  })){
   setError("每个板块最多30项，每项不能超过500字符。");return
  }
  if(!await confirmInStudio("提交当前草稿给 Agent 所有者审核？不会立即改变正式 Agent 配置。"))return
  const proposed=await act(()=>api("POST","/api/studio/agent-collab/propose",{
    spec_id:detail.id,base_hash:detail.base_hash,proposed:parsed,comment:comment.trim(),
  }),"修改提案已提交，等待所有者审核。")
  if(proposed)setComment("")
 }
 const review=async(item:Proposal,decision:"accept"|"reject")=>{
  if(!detail)return
  const action=decision==="accept"?"正式应用该提案":"拒绝该提案"
  if(!await confirmInStudio("确认"+action+"？\n审核意见："+item.comment+
   "\n\n批准只更新描述和任务规划，不更改工具、模型和知识库授权。"))return
  await act(()=>api("POST","/api/studio/agent-collab/review",{
    spec_id:detail.id,proposal_id:item.id,decision,confirm:true,
  }),decision==="accept"?"方案已审查并写入同一个 Agent。":"提案已拒绝，保留记录。")
 }
 const changeList=(key:"deliverables"|"task_plan"|"done_criteria",value:string)=>{
  // Preserve unfinished lines and the cursor while the employee is typing.
  // Normalize only at submit time so Enter actually inserts a new list item.
  setDraftLists(old=>({...old,[key]:value}))
 }
 const pendingMine=detail?.proposals.some(x=>x.status==="pending")
 return <SiteShell><main className="min-h-screen flex-1 bg-background p-4 text-foreground md:p-7">
  <div className="w-full min-w-0 space-y-5">
   <header className="flex flex-wrap items-start justify-between gap-3">
    <div><h1 className="flex items-center gap-2 text-2xl font-semibold">
      <UsersRound className="h-6 w-6 text-primary"/>多人 Agent 协作</h1>
     <p className="mt-1 text-sm text-muted-foreground">
      协作同一 Agent 的目标和工作计划；提案经所有者审核后才更新正式版本。
     </p></div>
    <button className={button+" inline-flex items-center gap-2"} disabled={loading||busy}
     onClick={refresh}><RefreshCw size={16}/>刷新</button>
   </header>
   {error&&<p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
     <AlertCircle size={17}/>{error}</p>}
   {notice&&<p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-secondary p-3 text-sm">
     <CheckCircle2 size={17} className="text-primary"/>{notice}</p>}
   <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
    <aside className={box}>
     <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bot size={16}/>我参与的 Agent
      <span className="text-xs font-normal text-muted-foreground">({agents.length})</span></h2>
     {loading?<p role="status" className="text-sm text-muted-foreground">读取协作列表中…</p>:
      agents.length===0?<div className="space-y-2 text-xs text-muted-foreground">
       <p>还没有自己的 Agent，也没有同事共享的 Agent。</p>
       <Link to="/" className="text-primary underline">前往创建 Agent</Link>
      </div>:<div className="space-y-2">{agents.map(agent=><button
       key={agent.id} onClick={()=>{setDetail(null);setDraft(null);setSelected(agent.id)}} type="button"
       aria-current={agent.id===selected?"true":undefined}
       className={"w-full rounded-xl border p-3 text-left transition hover:bg-secondary "+
        (agent.id===selected?"border-primary/50 bg-primary/5":"border-border")}>
        <span className="block truncate text-sm font-medium">{agent.name}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
         {agent.role==="owner"?"Owner · 所有者":agent.role==="editor"?"Editor · 可提案":"Viewer · 只读"}
         {agent.role!=="owner"?" · "+agent.owner_name:""}
        </span>
       </button>)}</div>}
    </aside>
    {!selected?<WorkspaceEmptyState icon={Bot} title="选择一个 Agent 查看协作方案" description="从左侧列表选择；成员权限、提案和历史会在此显示。"/>:(!detail || detail.id!==selected)?<section className={box+" text-sm text-muted-foreground"}>
      正在加载授权的 Agent 方案…
    </section>:<div className="space-y-5">
     <section className={box}>
      <div className="flex items-center justify-between gap-3">
       <div><h2 className="text-lg font-semibold">{detail.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
         当前权限：{detail.role==="owner"?"Owner / 管理发布":detail.role==="editor"?"Editor / 提交建议":"Viewer / 查看方案"}
        </p></div>
       <LockKeyhole className="h-5 w-5 text-muted-foreground"/>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
       <p className="text-xs font-semibold">当前正式方案</p>
       <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{detail.current.goal||"尚未填写目标"}</p>
       <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{detail.current.task_scope||"尚未填写研究范围"}</p>
       <div className="mt-3 grid gap-3 md:grid-cols-3">
        {editableFields.map(f=><div key={f.key}>
         <p className="text-xs font-medium">{f.label}</p>
         <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          {detail.current[f.key]?.join("、")||"暂无"}</p>
        </div>)}
       </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
       <ShieldCheck size={15}/>协作只涉及任务描述；模型、工具、知识库绑定及运行权限仍归所有者。
      </p>
     </section>
     {detail.role==="owner"&&<section className={box}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={17}/>授权协作者</h3>
      <form onSubmit={e=>void grant(e)} className="mt-3 flex flex-wrap items-end gap-2">
       <label className="min-w-[190px] flex-1 text-xs">员工工作邮箱
        <input className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
         type="email" required autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}
         placeholder="colleague@company.com"/>
       </label>
       <label className="text-xs">权限
        <select value={grantRole} onChange={e=>setGrantRole(e.target.value as "viewer"|"editor")}
         className="mt-1.5 block rounded-lg border bg-background px-3 py-2.5 text-sm">
         <option value="viewer">Viewer</option><option value="editor">Editor</option>
        </select>
       </label>
       <button type="submit" className={button+" bg-primary text-primary-foreground hover:bg-primary/90"} disabled={busy}>授权</button>
      </form>
      <div className="mt-4 space-y-2">
       {detail.grants.length===0?<p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">暂无协作成员。</p>:
        detail.grants.map(m=><div key={m.member_id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs">
         <span className="min-w-0 flex-1 font-medium">{m.name}{m.active?"":" · 已停用"}</span>
         <span className="text-muted-foreground">{m.role}</span>
         <button className={button+" inline-flex items-center gap-1 text-destructive"} disabled={busy}
          onClick={()=>void revoke(m)}><Trash2 size={13}/>撤销</button>
        </div>)}
      </div>
     </section>}
     {detail.role==="editor"&&draft&&<section className={box}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><FilePenLine size={17}/>提出方案修改</h3>
      <p className="mt-1 text-xs text-muted-foreground">
       提案只会修改以下字段。多人同时编辑时，系统检查基础版本，拒绝覆盖其他人的新版本。
      </p>
      <form onSubmit={e=>void propose(e)} className="mt-4 space-y-3">
       <label className="block text-xs font-medium">Agent 目标
        <textarea className="mt-1.5 w-full rounded-lg border bg-background p-3 text-sm"
         required maxLength={3000} rows={3} value={draft.goal}
         onChange={e=>setDraft(v=>v?{...v,goal:e.target.value}:v)}/>
       </label>
       <label className="block text-xs font-medium">任务范围
        <textarea className="mt-1.5 w-full rounded-lg border bg-background p-3 text-sm"
         maxLength={4000} rows={3} value={draft.task_scope}
         onChange={e=>setDraft(v=>v?{...v,task_scope:e.target.value}:v)}/>
       </label>
       <div className="grid gap-3 md:grid-cols-3">{editableFields.map(f=><label key={f.key} className="text-xs font-medium">
        {f.label}（每行一项）
        <textarea rows={4} maxLength={5000} className="mt-1.5 w-full rounded-lg border bg-background p-3 text-sm"
         value={draftLists[f.key]} onChange={e=>changeList(f.key,e.target.value)}/>
       </label>)}</div>
       <label className="block text-xs font-medium">修改理由
        <textarea className="mt-1.5 w-full rounded-lg border bg-background p-3 text-sm"
         value={comment} maxLength={600} required rows={2}
         onChange={e=>setComment(e.target.value)}
         placeholder="说明本次修改对目标、交付质量的改进（至少8字）"/>
       </label>
       <button type="submit" disabled={busy||pendingMine||!comment.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        <Send size={14}/>提交所有者审核
       </button>
       {pendingMine&&<p className="mt-2 text-xs text-amber-700">你有一份待审核提案，暂不能再次提交。</p>}
      </form>
     </section>}
     <section className={box}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><History size={17}/>协作修改历史
       <span className="text-xs font-normal text-muted-foreground">({detail.proposals.length})</span>
      </h3>
      {detail.proposals.length===0?<p className="mt-3 rounded-lg border border-dashed p-5 text-xs text-muted-foreground">
       还没有协作提案。</p>:<div className="mt-3 space-y-3">
       {detail.proposals.map(item=><article key={item.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
         <div><p className="text-xs font-medium">{item.comment}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fmt(item.created_ms)} ·
           {item.status==="pending"?" 待审核":item.status==="accepted"?" 已采纳":" 已拒绝"}
          </p></div>
         {detail.role==="owner"&&item.status==="pending"&&<div className="flex gap-2">
          <button type="button" aria-label={"拒绝协作提案："+item.comment.slice(0,50)} disabled={busy} className={button} onClick={()=>void review(item,"reject")}>拒绝</button>
          <button type="button" aria-label={"采纳协作提案："+item.comment.slice(0,50)} disabled={busy} className={button+" bg-primary text-primary-foreground hover:bg-primary/90"}
           onClick={()=>void review(item,"accept")}>采纳</button>
         </div>}
        </div>
        <details className="mt-2 rounded-lg bg-secondary/30 p-3">
         <summary className="cursor-pointer text-xs">查看提案的具体内容</summary>
         <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{item.proposed.goal}</p>
         <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.proposed.task_scope}</p>
         {editableFields.map(f=><p key={f.key} className="mt-2 text-xs">
          <strong>{f.label}：</strong>{item.proposed[f.key].join("；")||"暂无"}
         </p>)}
         {detail.role==="owner"&&<div className="mt-3 border-t border-border pt-3">
           <p className="mb-2 text-xs font-semibold">与当前正式版本的逐字段差异</p>
           <AgentPlanDiff current={detail.current} proposed={item.proposed}/>
         </div>}
        </details>
       </article>)}
      </div>}
     </section>
     {detail.role==="owner"&&<AgentVersionHistory
       key={detail.id+"-"+detail.base_hash}
       specId={detail.id} currentHash={detail.base_hash} current={detail.current}
       onRestored={()=>{setNotice("已成功恢复 Agent 的描述与规划版本，旧提案已作废。");refresh()}}/>}
    </div>}
   </div>
   <p className="flex items-center gap-2 text-xs text-muted-foreground">
    <Eye size={14}/>Viewer 只能查看已分享的描述性方案；Edit 提案需所有者审核后更新，不开放联动执行。
    <Link to="/" className="text-primary underline">返回助手设计</Link>
   </p>
  </div>
 </main></SiteShell>
}
