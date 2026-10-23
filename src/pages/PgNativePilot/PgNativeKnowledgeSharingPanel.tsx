import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeKnowledge} from "@/lib/pgNativePilotApi"
import {createKnowledgeMutationSession,type KnowledgeContentMetadata,type KnowledgeDocumentRow,type KnowledgeGrant,type SharedKnowledgeMetadata,type KnowledgeSearchHit,type KnowledgeMutationKind} from "@/lib/pgNativeKnowledgeSharing"
const button="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40"
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm disabled:opacity-40"
type Api=ReturnType<typeof createPgNativePilotApi>
function explanation(error:unknown){
  const status=(error as {status?:number})?.status
  if(status===401)return "员工会话已失效，请重新登录。"
  if(status===403||status===404)return "当前权限已变化，或该知识库、文档不再可用。"
  if(status===409)return "内容重复或版本已变化，请刷新查看当前状态。"
  if(status===400)return "请检查文件格式、内容长度和所填信息。"
  if(status===429)return "已达到文档或共享人数限制，或解析服务繁忙。"
  return "请求结果尚未确认，请核对回执后继续。"
}
export function SharedKnowledgeSearchHits({hits}:{hits:KnowledgeSearchHit[]}){
  return <ul aria-label="关键词检索结果" className="space-y-2">{hits.map(hit=><li key={hit.document_id+":"+hit.chunk_index} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{hit.citation}</p><p className="whitespace-pre-wrap break-words">{hit.snippet}</p></li>)}</ul>
}
export default function PgNativeKnowledgeSharingPanel({api,bases,active,enabled,onExpired}:{
  api:Api;bases:PgNativeKnowledge[];active:boolean;enabled:boolean;onExpired:()=>void
}){
  const [controller]=useState(()=>createKnowledgeMutationSession(api))
  const [mutation,setMutation]=useState(()=>controller.snapshot())
  const [shared,setShared]=useState<SharedKnowledgeMetadata[]>([]),[base,setBase]=useState("")
  const [metadata,setMetadata]=useState<KnowledgeContentMetadata|null>(null)
  const [documents,setDocuments]=useState<KnowledgeDocumentRow[]>([]),[grants,setGrants]=useState<KnowledgeGrant[]>([])
  const [query,setQuery]=useState(""),[hits,setHits]=useState<KnowledgeSearchHit[]>([])
  const [filename,setFilename]=useState("说明.md"),[text,setText]=useState("")
  const [email,setEmail]=useState(""),[role,setRole]=useState<"viewer"|"editor">("viewer"),[semantic,setSemantic]=useState(false)
  const [recipient,setRecipient]=useState<KnowledgeGrant|null>(null)
  const [remove,setRemove]=useState<KnowledgeDocumentRow|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const epoch=useRef(0),selection=useRef(0)
  useEffect(()=>()=>{epoch.current++;selection.current++;controller.reset()},[controller])
  const report=useCallback((err:unknown)=>{
    if(err instanceof PgNativePilotError&&err.status===401){controller.reset();onExpired();return}
    if([403,404].includes((err as {status?:number})?.status??0)){selection.current++;setMetadata(null);setDocuments([]);setGrants([]);setHits([]);setRemove(null);setLoading(false)}
    setError(explanation(err))
  },[controller,onExpired])
  const read=useCallback(async(id:string)=>{
    const ticket=++selection.current,life=epoch.current
    setLoading(true);setMetadata(null);setDocuments([]);setGrants([]);setHits([]);setRemove(null);setRecipient(null)
    try{
      const [current,docs]=await Promise.all([api.getSharedKnowledge(id),api.listSharedKnowledgeDocuments(id)])
      if(life!==epoch.current||ticket!==selection.current)return
      const access=current.access_role==="owner"?await api.listKnowledgeGrants(id):[]
      if(life!==epoch.current||ticket!==selection.current)return
      setMetadata(current);setDocuments(docs);setGrants(access)
    }catch(err){if(life===epoch.current&&ticket===selection.current)report(err)}
    finally{if(life===epoch.current&&ticket===selection.current)setLoading(false)}
  },[api,report])
  const refreshShared=useCallback(async()=>{
    const life=epoch.current
    try{const items=await api.listSharedKnowledge();if(life===epoch.current)setShared(items)}
    catch(err){if(life===epoch.current)report(err)}
  },[api,report])
  useEffect(()=>{if(active&&enabled)void refreshShared()},[active,enabled,refreshShared])
  useEffect(()=>{if(active&&enabled&&base)void read(base)},[active,enabled,base,read])
  useEffect(()=>{if(!enabled){selection.current++;setMetadata(null);setDocuments([]);setGrants([]);setHits([]);setLoading(false)}},[enabled])
  const locked=!enabled||loading||mutation.busy||mutation.pending!==null
  const edit=metadata?.access_role==="owner"||metadata?.access_role==="editor"
  const owner=metadata?.access_role==="owner"
  const mutate=async(kind:KnowledgeMutationKind,payload:Record<string,unknown>)=>{
    if(!enabled||controller.snapshot().pending||controller.snapshot().busy)return
    const life=epoch.current
    const task=controller.start(kind,base,{...payload,request_id:crypto.randomUUID()})
    setMutation(controller.snapshot());setError("");setNotice("")
    try{const result=await task;if(life!==epoch.current||result.stale)return
      if(result.confirmed){setNotice("操作已确认，以下显示重新读取的当前状态。");setText("");setEmail("");setRecipient(null);setRemove(null);await read(base);await refreshShared()}
    }catch(err){if(life===epoch.current)report(err)}
    finally{if(life===epoch.current)setMutation(controller.snapshot())}
  }
  const reconcile=async(retry=false)=>{
    const life=epoch.current,pending=controller.snapshot().pending
    if(!pending||controller.snapshot().busy)return
    const task=retry?controller.retry():controller.recover();setMutation(controller.snapshot());setError("")
    try{const result=await task;if(life!==epoch.current||result.stale)return
      setNotice(result.confirmed?"已核对操作回执；历史回执不会恢复已经撤销的权限。":"尚未找到回执。可继续核对，或明确重试同一请求。")
      if(result.confirmed){setText("");setEmail("");setRecipient(null);setRemove(null);await read(pending.base);await refreshShared()}
    }catch(err){if(life===epoch.current){report(err);if(!controller.snapshot().pending)await read(pending.base)}}
    finally{if(life===epoch.current)setMutation(controller.snapshot())}
  }
  const search=async(event:FormEvent)=>{
    event.preventDefault();const ticket=selection.current,life=epoch.current
    setLoading(true);setError("");setHits([])
    try{const result=await api.searchSharedKnowledge(base,query);if(life===epoch.current&&ticket===selection.current)setHits(result)}
    catch(err){if(life===epoch.current&&ticket===selection.current){setMetadata(null);setDocuments([]);setGrants([]);report(err)}}
    finally{if(life===epoch.current&&ticket===selection.current)setLoading(false)}
  }
  const fileInput=useRef<HTMLInputElement>(null)
  const upload=async()=>{
    const file=fileInput.current?.files?.[0],life=epoch.current,ticket=selection.current
    if(!file||locked||!edit)return
    if(file.size<1||file.size>524288){setError("文件需为 512 KiB 以内的受支持文件。");return}
    setLoading(true);setError("")
    try{
      let payload:Record<string,unknown>
      if(/\.(txt|md|markdown|csv|tsv|json|html?)$/i.test(file.name))payload={filename:file.name,text:await file.text()}
      else if(/\.(pdf|docx)$/i.test(file.name)){
        const bytes=new Uint8Array(await file.arrayBuffer());let wire=""
        for(let n=0;n<bytes.length;n+=8192)wire+=String.fromCharCode(...bytes.subarray(n,n+8192))
        payload={filename:file.name,content_base64:btoa(wire)}
      }else{setError("仅支持文本、Markdown、表格、JSON、HTML、PDF 和 DOCX。");return}
      if(life!==epoch.current||ticket!==selection.current)return
      setLoading(false);await mutate("import",payload)
    }catch(err){if(life===epoch.current)report(err)}
    finally{if(life===epoch.current){setLoading(false);if(fileInput.current)fileInput.current.value=""}}
  }
  const choices=[...bases.map(row=>({id:row.id,name:row.name,label:"我的知识库"})),...shared.map(row=>({id:row.id,name:row.name,label:row.owner_name+"共享 · "+(row.access_role==="editor"?"可编辑":"可查看")}))]
  return <section aria-label="知识库共享与文档" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold text-slate-900">知识库共享与文档</h2>
    <p className="text-sm leading-6 text-slate-600">查看者可以关键词搜索；编辑者可以上传和删除文档。所有者管理员工授权。当前尚未开放共享语义检索和 Agent 绑定。</p>
    <div className="flex flex-wrap gap-3">
      <label className="min-w-52 flex-1 text-sm">选择知识库<select className={field} value={base} disabled={locked} onChange={e=>{setBase(e.target.value);selection.current++;setMetadata(null);setDocuments([]);setGrants([]);setHits([]);setError("");setNotice("");setText("");setEmail("");setRecipient(null)}}><option value="">请选择</option>{choices.map(item=><option key={item.id} value={item.id}>{item.name} · {item.label}</option>)}</select></label>
      <button type="button" className={button} disabled={!enabled||mutation.busy} onClick={()=>{void refreshShared();if(base)void read(base)}}>刷新当前权限</button>
    </div>
    {mutation.pending&&<div role="status" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p>操作结果待确认：{mutation.pending.request}</p><p>表单已冻结，重试会使用原请求和原内容。</p><button type="button" className={button} disabled={mutation.busy||!enabled} onClick={()=>void reconcile()}>核对回执</button> <button type="button" className={button} disabled={mutation.busy||!enabled} onClick={()=>void reconcile(true)}>重试同一请求</button></div>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {loading&&<p role="status" className="text-sm">正在读取…</p>}
    {metadata&&<>
      <p className="text-sm text-slate-700">{metadata.name} · {owner?"所有者":edit?"编辑者":"查看者"}</p>
      <form className="flex gap-2" onSubmit={e=>void search(e)}><label className="flex-1 text-sm">关键词<input required minLength={2} maxLength={160} className={field} value={query} onChange={e=>setQuery(e.target.value)} disabled={locked}/></label><button type="submit" className={button} disabled={locked}>检索</button></form>
      <SharedKnowledgeSearchHits hits={hits}/>
      <ul aria-label="知识库文档" className="space-y-2">{documents.map(doc=><li key={doc.id} className="rounded-xl border border-slate-100 p-3 text-sm"><div className="flex justify-between gap-3"><span className="break-all">{doc.filename}</span>{edit&&<button type="button" className={button} disabled={locked} onClick={()=>setRemove(doc)}>删除</button>}</div>{remove?.id===doc.id&&<div className="mt-2 space-y-2" role="group" aria-label="确认删除文档"><p>确认删除 {doc.filename} 及其索引内容？</p><button type="button" className={button} disabled={locked} onClick={()=>void mutate("delete",{document_id:doc.id,sha256:doc.sha256})}>确认删除文档</button> <button type="button" className={button} disabled={locked} onClick={()=>setRemove(null)}>取消</button></div>}</li>)}</ul>
      {edit&&<div className="space-y-3 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">添加文档</h3><form className="space-y-2" onSubmit={e=>{e.preventDefault();void mutate("import",{filename,text})}}><label className="block text-sm">文本文件名<input required className={field} value={filename} maxLength={180} disabled={locked} onChange={e=>setFilename(e.target.value)}/></label><label className="block text-sm">文本内容<textarea required rows={4} maxLength={160000} className={field} value={text} disabled={locked} onChange={e=>setText(e.target.value)}/></label><button type="submit" className={button} disabled={locked}>保存文本并建立关键词索引</button></form><label className="block text-sm">或上传文件（512 KiB 以内）<input ref={fileInput} type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.pdf,.docx" className={field} disabled={locked}/></label><button type="button" className={button} disabled={locked} onClick={()=>void upload()}>上传所选文件</button></div>}
      {owner&&<div className="space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold">员工共享权限</h3>
        <form className="space-y-2" onSubmit={e=>{
          e.preventDefault()
          void mutate("access",recipient?{
            action:"grant_existing",recipient_id:recipient.recipient_user_id,
            role,semantic_allowed:semantic,expected_revision:recipient.revision,
          }:{action:"grant",recipient_email:email,role,semantic_allowed:semantic,expected_revision:0})
        }}>
          {recipient?<p className="text-sm">{recipient.revoked?"重新授权":"调整权限"}：{recipient.recipient_name}</p>:
            <label className="block text-sm">新增接收人的员工邮箱<input type="email" required maxLength={180} className={field} value={email} disabled={locked} onChange={e=>setEmail(e.target.value)}/></label>}
          <label className="block text-sm">权限<select className={field} value={role} disabled={locked} onChange={e=>setRole(e.target.value as "viewer"|"editor")}><option value="viewer">查看者</option><option value="editor">编辑者</option></select></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={semantic} disabled={locked} onChange={e=>setSemantic(e.target.checked)}/>语义检索授权（当前仅关键词检索）</label>
          <button type="submit" className={button} disabled={locked}>{recipient?"保存此员工授权":"授予新员工权限"}</button>
          {recipient&&<button type="button" className={button} disabled={locked} onClick={()=>{setRecipient(null);setEmail("");setRole("viewer");setSemantic(false)}}>取消调整</button>}
        </form>
        <ul className="space-y-2" aria-label="已有共享授权">{grants.map(item=><li key={item.recipient_user_id} className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <p>{item.recipient_name} · {item.revoked?"已撤销":item.access_role==="editor"?"编辑者":"查看者"}{!item.recipient_active?" · 员工已停用":""}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={locked||!item.recipient_active} onClick={()=>{setRecipient(item);setRole(item.access_role);setSemantic(item.revoked?false:item.semantic_allowed);setEmail("")}}>{item.revoked?"重新授权":"调整权限"}</button>
            {!item.revoked&&<>
              <button type="button" className={button} disabled={locked||!item.recipient_active} onClick={()=>void mutate("access",{action:"semantic",recipient_id:item.recipient_user_id,enabled:!item.semantic_allowed,expected_revision:item.revision})}>{item.semantic_allowed?"撤销语义许可":"允许语义检索"}</button>
              <button type="button" className={button} disabled={locked} onClick={()=>void mutate("access",{action:"revoke",recipient_id:item.recipient_user_id,expected_revision:item.revision})}>撤销共享</button>
            </>}
          </div>
        </li>)}</ul>
      </div>}
    </>}
  </section>
}
