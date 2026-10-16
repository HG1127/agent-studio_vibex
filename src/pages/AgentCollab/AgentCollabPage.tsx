import {useEffect,useState,type FormEvent} from "react"
import {Link} from "react-router-dom"
import {AlertCircle,CheckCircle2,GitPullRequest,RefreshCw,ShieldCheck,UsersRound} from "lucide-react"
import {SiteShell} from "@/components/site/SiteShell"
import {getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders} from "@/lib/studioAuth"

type Role="owner"|"editor"|"viewer"
type SafeSpec={goal:string;task_scope:string;deliverables:string[];task_plan:string[];done_criteria:string[]}
type Shared={id:string;name:string;role:Role;owner_uid:string;owner_name:string}
type Grant={member_id:string;role:"viewer"|"editor";name:string;active:boolean}
type Proposal={id:string;author_uid:string;base_hash:string;proposed:SafeSpec;
 comment:string;status:"pending"|"accepted"|"rejected";created_ms:number;reviewed_ms:number}
type Detail={ok:boolean;id:string;name:string;role:Role;owner_uid:string;current:SafeSpec;
 base_hash:string;grants:Grant[];proposals:Proposal[]}
const explain:Record<string,string>={
 agent_not_found:"此 Agent 不存在或当前账号无权访问。",
 invalid_recipient_email:"请填写公司员工的完整工作邮箱。",
 recipient_not_found:"员工不存在、已停用或不可授权给自己。",
 invalid_collab_spec:"请完善有效的目标及研究步骤，列表内容不可超过规定长度。",
 collab_protected_field:"协作修改不得包含模型、工具、知识库引用等受保护配置。",
 collab_version_conflict:"Agent 方案已经被别人修改。请刷新，核对最新版本后再提交。",
 collab_pending_exists:"当前已有一份待审核的修改提案，请等待所有者处理。",
 collab_already_reviewed:"该提案已经处理完毕，不能重复审批。",
 collab_grant_not_found:"授权已经撤销或不存在。",
 collab_limit:"单个 Agent 最多同时授权30位团队成员。",
}
async function api<T>(method:string,url:string,body?:unknown):Promise<T>{
 const res=await fetch(getPocketBaseUrl()+url,{method,
  headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 })
 const result=await res.json().catch(()=>({})) as Record<string,unknown>
 if(!res.ok)throw Error(explain[String(result.error||"")]||String(result.error||"请求失败"))
 return result as T
}
const inputClass="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
const buttonClass="rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-40"
const split=(text:string)=>text.split("\n").map(x=>x.trim()).filter(Boolean)
const join=(items:string[])=>(items||[]).join("\n")
const empty:SafeSpec={goal:"",task_scope:"",deliverables:[],task_plan:[],done_criteria:[]}

export default function AgentCollabPage(){
 const [items,setItems]=useState<Shared[]>([])
 const [selected,setSelected]=useState("")
 const [detail,setDetail]=useState<Detail|null>(null)
 const [draft,setDraft]=useState<SafeSpec>(empty)
 const [comment,setComment]=useState("")
 const [email,setEmail]=useState("")
 const [role,setRole]=useState<"viewer"|"editor">("viewer")
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 const [revision,setRevision]=useState(0)

 useEffect(()=>{
  let current=true
  void api<{items:Shared[]}>("GET","/api/studio/agent-collab/list")
   .then(r=>{
    if(!current)return
    setItems(r.items||[])
    setSelected(s=>r.items.some(i=>i.id===s)?s:(r.items[0]?.id||""))
   }).catch(e=>{if(current)setError(String(e.message||e))})
   .finally(()=>{if(current)setLoading(false)})
  return ()=>{current=false}
 },[revision])
 useEffect(()=>{
  let current=true
  if(!selected){
   // Avoid synchronously updating React state inside an effect.
   void Promise.resolve().then(()=>{if(current)setDetail(null)})
   return ()=>{current=false}
  }
  void api<Detail>("GET","/api/studio/agent-collab/detail?spec_id="+encodeURIComponent(selected))
   .then(r=>{
    if(!current)return
    setDetail(r);setDraft(r.current);setComment("");setError("")
   }).catch(e=>{if(current){setDetail(null);setError(String(e.message||e))}})
  return ()=>{current=false}
 },[selected,revision])
 const refresh=()=>{setLoading(true);setRevision(v=>v+1)}
 const submitGrant=async(e:FormEvent)=>{
  e.preventDefault()
  if(!detail||detail.role!=="owner"||busy)return
  if(!window.confirm("确认授权 "+email+" "+(role==="editor"?"提交方案修改建议":"查看方案业务字段")+
    "？不会开放模型密钥、工具或私有知识库；协作者不能直接发布。"))return
  setBusy(true);setError("");setNotice("")
  try{
   await api("POST","/api/studio/agent-collab/grant",{
    action:"grant",spec_id:detail.id,recipient_email:email.trim(),role,
   })
   setNotice("协作者已授权，可进入此页面查看或提交版本建议。")
   setEmail("");refresh()
  }catch(e){setError(String((e as Error).message||e))}
  finally{setBusy(false)}
 }
 const revoke=async(grant:Grant)=>{
  if(!detail||busy||!window.confirm("确认撤销 "+grant.name+" 的 Agent 协作权限？"))return
  setBusy(true);setError("");setNotice("")
  try{
   await api("POST","/api/studio/agent-collab/grant",{
    action:"revoke",spec_id:detail.id,member_id:grant.member_id,
   })
   setNotice("授权已撤销。");refresh()
  }catch(e){setError(String((e as Error).message||e))}
  finally{setBusy(false)}
 }
 const propose=async(e:FormEvent)=>{
  e.preventDefault()
  if(!detail||detail.role!=="editor"||busy)return
  if(!window.confirm("确认提交 Agent 方案修改提案？这不会直接覆盖所有者的正式版本，也不会改变执行权限。"))return
  setBusy(true);setError("");setNotice("")
  try{
   await api("POST","/api/studio/agent-collab/propose",{
    spec_id:detail.id,base_hash:detail.base_hash,comment:comment.trim(),proposed:draft,
   })
   setNotice("已提交建议，等待 Agent 所有者审核。");refresh()
  }catch(e){setError(String((e as Error).message||e))}
  finally{setBusy(false)}
 }
 const review=async(proposal:Proposal,decision:"accept"|"reject")=>{
  if(!detail||detail.role!=="owner"||busy)return
  if(!window.confirm(
   decision==="accept"?
    "确认合并该协作者修改到正式 Agent 方案？系统会保留当前工具、模型、知识库与执行权限。":
    "确认拒绝该协作提案？"
  ))return
  setBusy(true);setError("");setNotice("")
  try{
   await api("POST","/api/studio/agent-collab/review",{
    spec_id:detail.id,proposal_id:proposal.id,decision,confirm:true,
   })
   setNotice(decision==="accept"?"已审核并合并到正式 Agent 方案。":"已拒绝该提案。")
   refresh()
  }catch(e){setError(String((e as Error).message||e))}
  finally{setBusy(false)}
 }
 const setField=(field:keyof SafeSpec,value:string)=>{
  setDraft(s=>({...s,[field]:field==="goal"||field==="task_scope"?value:split(value)}))
 }
 return <SiteShell><main className="min-h-screen flex-1 bg-background p-4 text-foreground sm:p-7">
  <div className="w-full min-w-0 space-y-5">
   <header className="flex flex-wrap items-center justify-between gap-3">
    <div><h1 className="flex items-center gap-2 text-2xl font-semibold">
     <UsersRound className="h-6 w-6 text-primary"/>Agent 团队协作
    </h1><p className="mt-1 text-sm text-muted-foreground">
      团队围绕同一个 Agent 讨论与修改方案；提案经所有者审查后才合并，版本不静默覆盖。
    </p></div>
    <button className={buttonClass+" flex items-center gap-1"} disabled={busy||loading}
     onClick={refresh}><RefreshCw size={15}/>刷新</button>
   </header>
   {error&&<p role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <AlertCircle size={16}/>{error}</p>}
   {notice&&<p role="status" className="flex gap-2 rounded-xl border bg-secondary p-3 text-sm">
    <CheckCircle2 size={16} className="text-primary"/>{notice}</p>}
   <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
    <section className="rounded-2xl border bg-card p-4">
     <h2 className="mb-3 text-sm font-semibold">我的与团队 Agent</h2>
     {loading?<p className="text-xs text-muted-foreground">读取中…</p>:
      items.length===0?<p className="text-xs text-muted-foreground">暂无 Agent。
       <Link className="ml-1 text-primary underline" to="/">前往创建</Link>
      </p>:<div className="space-y-2">{items.map(agent=>
       <button key={agent.id} type="button"
        onClick={()=>{setSelected(agent.id);setError("");setNotice("")}}
        className={"w-full rounded-lg border p-3 text-left text-sm transition "+(
         selected===agent.id?"border-primary/50 bg-primary/5":"hover:bg-secondary")}>
        <p className="truncate font-medium">{agent.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
         {agent.role==="owner"?"我创建的":agent.role==="editor"?"编辑协作者":"查看协作者"}
         {agent.role!=="owner"?" · "+agent.owner_name:""}
        </p>
       </button>)}</div>}
    </section>
    <div className="space-y-5">
     {!detail?<section className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
      {selected?"正在读取 Agent 方案权限与修订记录…":"选择一个 Agent 开始协作"}
     </section>:<>
      <section className="rounded-2xl border bg-card p-5">
       <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{detail.name}</h2>
         <p className="mt-1 text-xs text-muted-foreground">权限：{detail.role==="owner"?"Owner 所有者":
          detail.role==="editor"?"Editor 提案编辑":"Viewer 只读查看"}</p></div>
        {detail.role==="owner"&&<Link className="text-xs text-primary underline" to="/">
         前往我的 Agent 正式配置
        </Link>}
       </div>
       <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={16} className="mt-0.5 shrink-0"/>
        这里只共享业务目标、范围、交付物、步骤及完成标准。
        模型密钥、知识库绑定、外部工具和运行记录不会授予协作者；协作者不能运行所有者的 Agent。
       </p>
       {detail.role==="editor"?<form onSubmit={e=>void propose(e)} className="mt-4 space-y-3">
        <label className="block text-xs font-medium">研究目标
         <textarea required maxLength={3000} rows={3} className={inputClass}
          value={draft.goal} onChange={e=>setField("goal",e.target.value)}/>
        </label>
        <label className="block text-xs font-medium">研究范围
         <textarea maxLength={4000} rows={2} className={inputClass}
          value={draft.task_scope} onChange={e=>setField("task_scope",e.target.value)}/>
        </label>
        {([
          ["deliverables","交付物"],
          ["task_plan","执行步骤"],
          ["done_criteria","完成标准"],
        ] as const).map(([key,label])=><label key={key} className="block text-xs font-medium">
         {label}（每行一项）
         <textarea rows={4} className={inputClass}
          value={join(draft[key])} onChange={e=>setField(key,e.target.value)}/>
        </label>)}
        <label className="block text-xs font-medium">本次修改说明
         <textarea required minLength={8} maxLength={600} rows={2} className={inputClass}
          placeholder="描述修改依据、预期收益及可能影响"
          value={comment} onChange={e=>setComment(e.target.value)}/>
        </label>
        <button disabled={busy||comment.trim().length<8||!draft.goal.trim()}
         className="rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
         <GitPullRequest size={15} className="mr-1 inline"/>提交修改提案
        </button>
       </form>:<div className="mt-4 space-y-3">
        {([
          ["goal","研究目标"],["task_scope","研究范围"],["deliverables","交付物"],
          ["task_plan","执行步骤"],["done_criteria","完成标准"],
        ] as const).map(([field,label])=><div key={field} className="rounded-xl border p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
          <p className="whitespace-pre-wrap text-sm">
           {Array.isArray(detail.current[field])?join(detail.current[field]):detail.current[field]||"—"}
          </p>
        </div>)}
       </div>}
      </section>
      {detail.role==="owner"&&<section className="rounded-2xl border bg-card p-5">
       <h3 className="text-sm font-semibold">授权 Agent 协作成员</h3>
       <p className="mt-1 text-xs text-muted-foreground">
        Viewer 查看安全方案；Editor 可提交修改提案，由所有者审批后合并。都不能直接改模型和执行权限。
       </p>
       <form onSubmit={e=>void submitGrant(e)} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[175px] flex-1 text-xs">工作邮箱
         <input type="email" required maxLength={180} className={inputClass}
          value={email} onChange={e=>setEmail(e.target.value)} placeholder="coworker@company.com"/>
        </label>
        <label className="text-xs">权限
         <select className={inputClass} value={role} onChange={e=>setRole(e.target.value as "viewer"|"editor")}>
          <option value="viewer">Viewer · 查看</option><option value="editor">Editor · 提案</option>
         </select>
        </label>
        <button className="rounded-lg bg-primary px-3 py-2.5 text-xs text-primary-foreground disabled:opacity-50"
         disabled={busy||!email.trim()}>添加授权</button>
       </form>
       <div className="mt-3 space-y-2">{detail.grants.length===0?
        <p className="text-xs text-muted-foreground">尚无协作者</p>:
        detail.grants.map(member=><div key={member.member_id}
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-xs">
          <span className="min-w-0 flex-1">{member.name}</span>
          <span className="text-muted-foreground">
           {member.role==="editor"?"可提交提案":"只读查看"}{!member.active?" · 已停用":""}
          </span>
          <button className={buttonClass} disabled={busy} onClick={()=>void revoke(member)}>撤销</button>
        </div>)}
       </div>
      </section>}
      <section className="rounded-2xl border bg-card p-5">
       <h3 className="text-sm font-semibold">方案修订与审核记录</h3>
       <p className="mt-1 text-xs text-muted-foreground">只有 Owner 可接受或拒绝提案；出现版本冲突时必须刷新并重审。</p>
       <div className="mt-4 space-y-3">
        {detail.proposals.length===0?<p className="text-xs text-muted-foreground">尚无修订提案</p>:
         detail.proposals.map(proposal=><article key={proposal.id} className="rounded-xl border p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2">
           <span className="font-semibold">{proposal.status==="pending"?"待审核":
            proposal.status==="accepted"?"已合并":"已拒绝"}</span>
           <span className="text-muted-foreground">{new Date(proposal.created_ms).toLocaleString("zh-CN")}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap">修改说明：{proposal.comment}</p>
          <details className="mt-2 rounded-lg bg-secondary/40 p-2">
           <summary className="cursor-pointer font-medium">查看提议内容</summary>
           <p className="mt-2 whitespace-pre-wrap">目标：{proposal.proposed.goal}</p>
           <p className="mt-2 whitespace-pre-wrap">范围：{proposal.proposed.task_scope}</p>
           <p className="mt-2 whitespace-pre-wrap">步骤：{join(proposal.proposed.task_plan)}</p>
          </details>
          {detail.role==="owner"&&proposal.status==="pending"&&
           <div className="mt-3 flex gap-2">
            <button className={buttonClass} disabled={busy} onClick={()=>void review(proposal,"reject")}>拒绝</button>
            <button className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
             disabled={busy} onClick={()=>void review(proposal,"accept")}>审核并合并</button>
           </div>}
         </article>)}
       </div>
      </section>
     </>}
    </div>
   </div>
  </div>
 </main></SiteShell>
}
