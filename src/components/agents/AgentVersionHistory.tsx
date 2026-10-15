import {useEffect,useState} from "react"
import {AlertCircle,CheckCircle2,GitCompareArrows,History,RotateCcw,ShieldCheck} from "lucide-react"
import {getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders} from "@/lib/studioAuth"

export type CollaborationPlan={
 goal:string
 task_scope:string
 deliverables:string[]
 task_plan:string[]
 done_criteria:string[]
}
type RevisionKind="before_accept"|"accepted"|"before_restore"|"restored"
type Revision={
 id:string;actor_uid:string;kind:RevisionKind;entry_type:"collab"|"direct";proposal_id:string;
 source_revision_id:string;spec_hash:string;safe:CollaborationPlan;
 note:string;occurred_ms:number
}
type VersionList={ok:boolean;spec_id:string;current_hash:string;items:Revision[]}
const labels=[
 {key:"goal",label:"目标"},
 {key:"task_scope",label:"任务范围"},
 {key:"deliverables",label:"交付物"},
 {key:"task_plan",label:"任务计划"},
 {key:"done_criteria",label:"完成标准"},
] as const
const versionLabels:Record<RevisionKind,string>={
 before_accept:"采纳前版本",accepted:"已采纳版本",
 before_restore:"恢复前备份",restored:"已恢复版本",
}
function labelVersion(item:Revision):string {
 if(item.entry_type==="direct")return item.kind==="before_accept"?"所有者直接编辑前":"所有者直接编辑后"
 return versionLabels[item.kind]||"历史版本"
}
const errors:Record<string,string>={
 collab_version_conflict:"Agent 已被其他成员修改，请刷新页面后重新比较。旧版本不能直接覆盖新内容。",
 collab_revision_not_found:"历史版本不存在或已失去访问权限。",
 collab_revision_invalid:"该历史版本不符合当前可编辑字段规则。",
 collab_no_changes:"历史版本的描述与当前相同，不需要恢复。",
 invalid_restore:"请选择有效历史版本、填写8～500字恢复说明并确认操作。",
 agent_not_found:"只有该 Agent 的所有者能查看或恢复历史版本。",
}
async function api<T>(method:string,route:string,body?:unknown):Promise<T>{
 const response=await fetch(getPocketBaseUrl()+route,{
  method,headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 })
 const data=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok)throw Error(errors[String(data.error||"")]||
   String(data.message||data.error||"操作失败"))
 return data as T
}
const asText=(value:string|string[])=>Array.isArray(value)?value.join("\n"):String(value||"")
const changes=(previous:CollaborationPlan,next:CollaborationPlan)=>labels.filter(x=>
 asText(previous[x.key])!==asText(next[x.key]))
function time(ms:number){
 return Number.isFinite(ms)&&ms>0?
  new Date(ms).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"
}
export function AgentPlanDiff({current,proposed,onlyChanged=true}:{
 current:CollaborationPlan;proposed:CollaborationPlan;onlyChanged?:boolean
}){
 const fields=onlyChanged?changes(current,proposed):labels
 return <div className="space-y-3">
  {fields.length===0?<p className="text-xs text-muted-foreground">
    此提案与当前版本的描述及计划相同，可能只存在模型/工具等受保护字段差异。
  </p>:fields.map(item=><div key={item.key} className="rounded-lg border bg-background p-3">
   <p className="mb-2 text-xs font-semibold">{item.label}</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <div><p className="mb-1 text-[11px] text-muted-foreground">当前正式版本</p>
     <p className="whitespace-pre-wrap break-words rounded-lg bg-secondary/40 px-3 py-2 text-xs leading-relaxed">
      {asText(current[item.key])||"（空）"}
     </p></div>
    <div><p className="mb-1 text-[11px] text-muted-foreground">待采纳 / 历史版本</p>
     <p className="whitespace-pre-wrap break-words rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed">
      {asText(proposed[item.key])||"（空）"}
     </p></div>
   </div>
  </div>)}
 </div>
}
export function AgentVersionHistory({specId,currentHash,current,onRestored}:{
 specId:string;currentHash:string;current:CollaborationPlan;onRestored:()=>void
}){
 const [rows,setRows]=useState<Revision[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 const [selected,setSelected]=useState("")
 const [reason,setReason]=useState("")
 const [busy,setBusy]=useState(false)
 const [nonce,setNonce]=useState(0)
 useEffect(()=>{
  let active=true
  void api<VersionList>("GET","/api/studio/agent-collab/versions?spec_id="+encodeURIComponent(specId))
   .then(data=>{if(active){setRows(data.items||[]);setError("")}})
   .catch(err=>{if(active)setError(String((err as Error).message||err))})
   .finally(()=>{if(active)setLoading(false)})
  return ()=>{active=false}
 },[specId,nonce])
 const target=rows.find(x=>x.id===selected)
 const changed=target?changes(current,target.safe).length:0
 const restore=async()=>{
  if(!target||busy)return
  if(reason.trim().length<8||reason.trim().length>500){
   setError("恢复原因必须填写8～500个字符。");return
  }
  if(!window.confirm(
   "确定恢复到 "+time(target.occurred_ms)+" 的描述/任务规划？\n"+
   "仅更改目标、任务范围、计划、交付物及完成标准；"+
   "不会恢复模型、工具、知识库或执行权限。\n"+
   "所有待审核草稿将取消，并保留完整审计。"
  ))return
  setBusy(true);setError("");setNotice("")
  try{
   await api("POST","/api/studio/agent-collab/restore",{
    spec_id:specId,revision_id:target.id,
    expected_current_hash:currentHash,reason:reason.trim(),confirm:true,
   })
   setSelected("");setReason("")
   setNotice("已恢复描述性字段，所有待审提案已取消，审计记录已保存。")
   onRestored()
  }catch(err){setError(String((err as Error).message||err))}
  finally{setBusy(false)}
 }
 return <section className="rounded-2xl border border-border bg-card p-5"
  aria-label="Agent 版本历史与安全恢复">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div><h3 className="flex items-center gap-2 text-sm font-semibold">
    <History size={17}/>Agent 描述与规划版本
   </h3>
   <p className="mt-1 text-xs text-muted-foreground">
    记录 Owner 直接修改、协作审核和恢复产生的安全文本版本；不存储模型密钥或受保护配置。
   </p></div>
   <button type="button" onClick={()=>setNonce(x=>x+1)}
    className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">
    刷新历史
   </button>
  </div>
  {error&&<p role="alert" className="mt-3 flex items-start gap-2 text-xs text-destructive">
   <AlertCircle size={16}/>{error}</p>}
  {notice&&<p role="status" className="mt-3 flex items-start gap-2 text-xs text-primary">
   <CheckCircle2 size={16}/>{notice}</p>}
  <div className="mt-4 space-y-2">
   {loading?<p role="status" className="text-xs text-muted-foreground">正在读取历史版本…</p>:
    rows.length===0?<p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
      暂无版本快照。所有者修改 Agent 方案或采纳协作提案后将自动记录安全版本。
    </p>:rows.map(item=><button key={item.id} type="button"
     aria-pressed={selected===item.id}
     className={"flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs "+
       (selected===item.id?"border-primary/50 bg-primary/5":"border-border hover:bg-secondary/40")}
     onClick={()=>setSelected(x=>x===item.id?"":item.id)}>
      <span className="font-semibold">{labelVersion(item)}</span>
      <span className="text-muted-foreground">{time(item.occurred_ms)}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {item.note||item.safe.goal}</span>
      <GitCompareArrows size={15} className="text-muted-foreground"/>
     </button>)}
  </div>
  {target&&<div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-secondary/20 p-4">
    <p className="text-xs font-semibold">与当前正式版本对比 · {changed} 个描述字段发生变化</p>
    <AgentPlanDiff current={current} proposed={target.safe}/>
    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
     <ShieldCheck className="h-4 w-4 shrink-0"/>
     恢复只作用于文本与规划，且需要当前完整配置版本匹配。受保护的工具、模型、
     知识库授权不会被旧快照覆盖。
    </p>
    <label className="block text-xs font-medium">恢复理由（仅所有者可操作）
     <textarea rows={2} value={reason} maxLength={500}
      onChange={e=>setReason(e.target.value)}
      className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
      placeholder="例如：上一版本的研究目标经过业务复核，更符合当前需求"/>
    </label>
    <button type="button" disabled={busy||changed===0||reason.trim().length<8}
     onClick={()=>void restore()}
     className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
     <RotateCcw size={14}/>{busy?"正在恢复…":"恢复此版本"}
    </button>
  </div>}
 </section>
}
