import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgentCollaborationChoice as Choice,type PgNativeAgentCollaborationDetail as Detail,
  type PgNativeAgentCollaborationSummary as Summary,type PgNativeAgentCollaborationRevision as Revision,type PgNativeAgentSafeText as SafeText} from "@/lib/pgNativePilotApi"
import {collaborationChoice} from "@/lib/pgNativeAgentCollaboration"
import PgNativeAgentSafeFields,{PgNativeAgentSafeTextView} from "./PgNativeAgentSafeFields"
type Api=ReturnType<typeof createPgNativePilotApi>
type Source={expected_spec_revision:number;source_sha256:string}
type Pending={id:string;name:string;body:Choice}
const empty=():SafeText=>({goal:"",task_scope:"",deliverables:[],task_plan:[],done_criteria:[]})
const source=(detail:Detail):Source=>({expected_spec_revision:detail.revision,source_sha256:detail.source_sha256})
const field="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
function message(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===404)return "记录不可用或授权已撤销；原请求尚无可读取的确认时，可稍后再次核对。"
    if(error.status===409)return "配置、授权或提案已变化，请刷新并重新核对。"
    if(error.status===403||error.status===405)return "当前操作未获授权，请刷新查看可用操作。"
    if(error.status===400)return "请检查描述长度、列表项数、说明及确认选项；描述字段合计上限为 23000 字符。"
  }
  return "未收到操作确认。请核对原请求或刷新当前状态。"
}
const versionLabel:Record<Revision["kind"],string>={before_edit:"编辑前",edited:"所有者编辑",before_accept:"采纳前",accepted:"采纳提案",before_restore:"恢复前",restored:"恢复描述"}
export default function PgNativeAgentCollaborationPanel({api,active,canWrite,onUpdated,onExpired}:{api:Api;active:boolean;canWrite:boolean;onUpdated:()=>Promise<void>;onExpired:()=>void}){
  const [items,setItems]=useState<Summary[]>([]),[selected,setSelected]=useState("")
  const [detail,setDetail]=useState<Detail|null>(null),[history,setHistory]=useState<Revision[]>([])
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const [draft,setDraft]=useState<SafeText>(empty),[base,setBase]=useState<Source|null>(null),[formVersion,setFormVersion]=useState(0)
  const [comment,setComment]=useState(""),[email,setEmail]=useState(""),[access,setAccess]=useState<"viewer"|"editor">("viewer")
  const [checked,setChecked]=useState<Record<string,boolean>>({}),[restore,setRestore]=useState<{version:Revision;source:Source}|null>(null),[reason,setReason]=useState(""),[restoreChecked,setRestoreChecked]=useState(false)
  const [pending,setPending]=useState<Pending|null>(null),pendingRef=useRef<Pending|null>(null),locked=useRef(false),epoch=useRef(0),read=useRef(0)
  const selectedRef=useRef(""),activeRef=useRef(active),dirty=useRef(false),callbacks=useRef({onUpdated,onExpired})
  activeRef.current=active;callbacks.current={onUpdated,onExpired}
  const loadDraft=useCallback((value:Detail)=>{setDraft(structuredClone(value.safe));setBase(source(value));setFormVersion(v=>v+1);setComment("");dirty.current=false},[])
  const report=useCallback((e:unknown)=>{setError(message(e));if(e instanceof PgNativePilotError&&e.status===401)callbacks.current.onExpired()},[])
  const inspect=useCallback(async(id:string,reset=false)=>{
    const scope=epoch.current,ticket=++read.current;selectedRef.current=id;setSelected(id);setLoading(true);setError("")
    const valid=()=>scope===epoch.current&&ticket===read.current&&activeRef.current&&selectedRef.current===id
    try{
      const value=await api.getAgentCollaboration(id);if(!valid())return
      setDetail(value);setChecked({});if(reset||!dirty.current)loadDraft(value)
      const versions=value.role==="owner"?await api.getAgentCollaborationRevisions(id):[]
      if(valid())setHistory(versions)
    }catch(e){if(valid()){setDetail(null);setHistory([]);setDraft(empty());setBase(null);dirty.current=false;report(e)}}
    finally{if(valid())setLoading(false)}
  },[api,loadDraft,report])
  const refresh=useCallback(async()=>{
    const scope=epoch.current
    try{const values=await api.listAgentCollaboration();if(scope!==epoch.current||!activeRef.current)return
      setItems(values)
      const id=selectedRef.current
      if(id)await inspect(id)
    }catch(e){if(scope===epoch.current&&activeRef.current)report(e)}
  },[api,inspect,report])
  useEffect(()=>{epoch.current++;return()=>{epoch.current++;read.current++}},[api])
  useEffect(()=>{if(active)void refresh()},[active,refresh])
  const perform=async(body:Choice)=>{
    if(!detail||locked.current||pendingRef.current)return
    let sealed:Choice
    try{sealed=collaborationChoice(structuredClone(body))}catch{setError("请检查描述长度、列表项数与说明；描述字段合计上限为 23000 字符。");return}
    const value={id:detail.id,name:detail.name,body:sealed};pendingRef.current=value;setPending(value);locked.current=true;setBusy(true);setError("");setNotice("")
    const scope=epoch.current;let confirmed=false
    try{
      await api.changeAgentCollaboration(value.id,value.body);if(scope!==epoch.current)return
      confirmed=true
      pendingRef.current=null;setPending(null);setNotice("操作已确认。下方显示刷新后的当前状态。");setRestore(null);setRestoreChecked(false);setReason("");setComment("")
      dirty.current=false;await refresh();await callbacks.current.onUpdated()
    }catch(e){if(scope===epoch.current){if(confirmed){setError("操作已确认，刷新列表失败，请点击刷新协作。");if(e instanceof PgNativePilotError&&e.status===401)callbacks.current.onExpired()}else{
      // Explicit request rejection has no committed mutation. Transport loss or
      // an invalid acknowledgement keeps the original request for recovery.
      if(e instanceof PgNativePilotError&&[400,403,404,405,409].includes(e.status)){pendingRef.current=null;setPending(null)}
      report(e)
    }}}
    finally{if(scope===epoch.current){locked.current=false;setBusy(false)}}
  }
  const reconcile=async(resubmit=false)=>{
    const value=pendingRef.current;if(!value||locked.current||resubmit&&!canWrite)return
    locked.current=true;setBusy(true);setError("");const scope=epoch.current;let confirmed=false
    try{
      if(resubmit)await api.changeAgentCollaboration(value.id,value.body);else await api.confirmAgentCollaboration(value.id,value.body)
      if(scope!==epoch.current)return
      confirmed=true
      pendingRef.current=null;setPending(null);setNotice("原请求已确认，请以刷新后的状态为准。");setRestore(null);setRestoreChecked(false);dirty.current=false
      await refresh();await callbacks.current.onUpdated()
    }catch(e){if(scope===epoch.current){if(confirmed){setError("原请求已确认，刷新列表失败，请点击刷新协作。");if(e instanceof PgNativePilotError&&e.status===401)callbacks.current.onExpired()}else report(e)}}
    finally{if(scope===epoch.current){locked.current=false;setBusy(false)}}
  }
  const stale=Boolean(detail&&base&&(detail.revision!==base.expected_spec_revision||detail.source_sha256!==base.source_sha256))
  const disabled=busy||Boolean(pending)||loading
  const submit=(event:FormEvent)=>{event.preventDefault();if(!detail||!base||!canWrite||stale)return
    void perform(detail.role==="owner"?{action:"edit",request_id:crypto.randomUUID(),...base,safe:draft}:{action:"propose",request_id:crypto.randomUUID(),...base,proposed:draft,comment})}
  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Agent 描述与协作</h2><p className="mt-1 text-xs text-slate-500">共享目标、范围、交付物、任务计划和完成标准。描述修改由所有者审核；运行权限由各自所有者管理。</p></div>
        <button type="button" disabled={busy||loading} onClick={()=>void refresh()} className="shrink-0 rounded-lg border px-3 py-2 text-xs disabled:opacity-50">刷新协作</button></div>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
      {pending&&<div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>正在等待「{pending.name}」的原请求确认。核对完成前保持原内容。</p>
        <button type="button" disabled={busy} onClick={()=>void reconcile()} className="rounded-lg border border-amber-300 bg-white px-3 py-2">核对原请求</button>
        {canWrite&&<button type="button" disabled={busy} onClick={()=>void reconcile(true)} className="ml-2 rounded-lg border border-amber-300 bg-white px-3 py-2">用原请求重新提交</button>}
      </div>}
      <label className="mt-4 block space-y-1 text-xs font-medium">选择协作 Agent
        <select value={selected} disabled={disabled} className={field} onChange={e=>{
          const id=e.target.value;setDetail(null);setHistory([]);setRestore(null);setReason("");setRestoreChecked(false);setComment("");setEmail("");dirty.current=false
          if(id)void inspect(id,true);else{selectedRef.current="";setSelected("");read.current++;setBase(null);setDraft(empty())}
        }}><option value="">请选择</option>{items.map(item=><option key={item.id} value={item.id}>{item.name} · {({owner:"所有者",editor:"编辑者",viewer:"读者"})[item.role]}</option>)}</select>
      </label>
      {!items.length&&<p className="mt-3 text-sm text-slate-500">暂无本人角色或已共享角色。</p>}
      {loading&&<p role="status" className="mt-3 text-xs text-slate-500">正在读取协作状态…</p>}
    </section>
    {detail&&<>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><header><h3 className="font-semibold">{detail.name} · 当前描述</h3><p className="mt-1 text-xs text-slate-500">版本 {detail.revision} · {({owner:"所有者",editor:"编辑者",viewer:"读者"})[detail.role]}</p></header>
        <PgNativeAgentSafeTextView value={detail.safe}/>
        {detail.role!=="viewer"&&<form onSubmit={submit} className="space-y-3 border-t pt-4">
          <h4 className="text-sm font-semibold">{detail.role==="owner"?"编辑描述字段":"提出描述修改"}</h4>
          {stale&&<p role="alert" className="text-xs text-amber-800">配置已变化，请载入最新描述后重新核对修改。</p>}
          <button type="button" disabled={disabled} className="rounded-lg border px-3 py-1.5 text-xs" onClick={()=>loadDraft(detail)}>载入当前描述</button>
          <PgNativeAgentSafeFields key={detail.id+":"+formVersion} value={draft} disabled={disabled||!canWrite} onChange={value=>{dirty.current=true;setDraft(value)}}/>
          {detail.role==="editor"&&<label className="block text-xs">修改说明（至少 8 字符）<textarea required minLength={8} maxLength={600} rows={2} className={field} value={comment} disabled={disabled||!canWrite} onChange={e=>{dirty.current=true;setComment(e.target.value)}}/></label>}
          <button type="submit" disabled={disabled||!canWrite||stale||!draft.goal.trim()||detail.role==="editor"&&comment.trim().length<8} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{detail.role==="owner"?"保存描述字段":"提交修改提案"}</button>
        </form>}
      </section>
      {detail.role==="owner"&&<section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">协作授权</h3>
        {canWrite&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void perform({action:"grant",request_id:crypto.randomUUID(),recipient_email:email,role:access,expected_access_revision:0})}}>
          <label className="min-w-48 flex-1 text-xs">协作者员工邮箱<input type="email" required maxLength={180} className={field} value={email} disabled={disabled} onChange={e=>setEmail(e.target.value)}/></label>
          <label className="text-xs">协作权限<select className={field} value={access} disabled={disabled} onChange={e=>setAccess(e.target.value as "viewer"|"editor")}><option value="viewer">读者</option><option value="editor">编辑者</option></select></label>
          <button type="submit" disabled={disabled} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">授予协作权限</button>
        </form>}
        {detail.grants.map(grant=><div key={grant.recipient_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><p>{grant.name} · {grant.role==="editor"?"编辑者":"读者"} · {grant.active?(grant.recipient_active?"有效":"员工已停用"):"已撤销"}</p>
          <div className="flex gap-2">{canWrite&&grant.recipient_active&&<button type="button" disabled={disabled} className="rounded-lg border bg-white px-3 py-1.5 text-xs" onClick={()=>void perform({action:"grant_existing",request_id:crypto.randomUUID(),recipient_id:grant.recipient_id,role:grant.active?(grant.role==="editor"?"viewer":"editor"):grant.role,expected_access_revision:grant.revision})}>{grant.active?(grant.role==="editor"?"改为读者":"改为编辑者"):"重新授予"}</button>}
            {grant.active&&<button type="button" disabled={disabled} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs text-rose-700" onClick={()=>void perform({action:"revoke",request_id:crypto.randomUUID(),recipient_id:grant.recipient_id,expected_access_revision:grant.revision})}>撤销协作权限</button>}</div>
        </div>)}
      </section>}
      {detail.role!=="viewer"&&<section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">修改提案</h3>
        {!detail.proposals.length&&<p className="text-sm text-slate-500">暂无提案。</p>}
        {detail.proposals.map(proposal=><article key={proposal.id} className="space-y-3 rounded-xl border p-4"><p className="text-xs text-slate-500">基于版本 {proposal.base_revision} · {({pending:"待审核",accepted:"已采纳",rejected:"已拒绝",invalidated:"来源或授权已变化"})[proposal.status]}</p><p className="whitespace-pre-wrap text-sm">{proposal.comment}</p>
          <details><summary className="cursor-pointer text-xs font-semibold">查看提案描述</summary><div className="mt-3"><PgNativeAgentSafeTextView value={proposal.proposed}/></div></details>
          {detail.role==="owner"&&proposal.status==="pending"&&<div className="space-y-2"><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={checked[proposal.id]??false} disabled={disabled} onChange={e=>setChecked(prior=>({...prior,[proposal.id]:e.target.checked}))}/>我已核对该提案，确认本次审核决定。</label>
            <div className="flex gap-2"><button type="button" disabled={disabled||!canWrite||!checked[proposal.id]||proposal.base_revision!==detail.revision||proposal.base_sha256!==detail.source_sha256} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50" onClick={()=>void perform({action:"review",request_id:crypto.randomUUID(),...source(detail),proposal_id:proposal.id,proposal_sha256:proposal.proposal_sha256,decision:"accept",confirm:true})}>采纳提案</button>
              <button type="button" disabled={disabled||!checked[proposal.id]} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" onClick={()=>void perform({action:"review",request_id:crypto.randomUUID(),...source(detail),proposal_id:proposal.id,proposal_sha256:proposal.proposal_sha256,decision:"reject",confirm:true})}>拒绝提案</button></div>
          </div>}
        </article>)}
      </section>}
      {detail.role==="owner"&&<section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">描述版本历史</h3><p className="text-xs text-slate-500">恢复描述字段并保留当前模型、工具与知识绑定。</p>
        {!history.length&&<p className="text-sm text-slate-500">首次修改后显示安全描述版本。</p>}
        {history.map(version=><details key={version.id} className="space-y-3 rounded-xl border p-3"><summary className="cursor-pointer text-xs font-semibold">{versionLabel[version.kind]} · 版本 {version.spec_revision} · {new Date(version.created_at).toLocaleString("zh-CN")}</summary>
          <PgNativeAgentSafeTextView value={version.safe}/>{canWrite&&<button type="button" disabled={disabled} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" onClick={()=>{setRestore({version,source:source(detail)});setReason("");setRestoreChecked(false)}}>准备恢复此描述</button>}
        </details>)}
        {restore&&<form className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" onSubmit={e=>{e.preventDefault();if(disabled||!canWrite||!restoreChecked||reason.trim().length<8||restore.source.expected_spec_revision!==detail.revision||restore.source.source_sha256!==detail.source_sha256)return;void perform({action:"restore",request_id:crypto.randomUUID(),...restore.source,revision_id:restore.version.id,reason,confirm:true})}}>
          <h4 className="text-sm font-semibold">恢复版本 {restore.version.spec_revision} 的描述字段</h4>
          <label className="block text-xs">恢复原因（至少 8 字符）<textarea required minLength={8} maxLength={500} rows={2} className={field} value={reason} disabled={disabled||!canWrite} onChange={e=>setReason(e.target.value)}/></label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={restoreChecked} disabled={disabled||!canWrite} onChange={e=>setRestoreChecked(e.target.checked)}/>我已核对描述版本及当前配置，确认恢复描述字段。</label>
          <button type="submit" disabled={disabled||!canWrite||!restoreChecked||reason.trim().length<8||restore.source.expected_spec_revision!==detail.revision||restore.source.source_sha256!==detail.source_sha256} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50">确认恢复描述</button>
        </form>}
      </section>}
    </>}
  </div>
}
