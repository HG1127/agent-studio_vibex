import {useCallback,useEffect,useState,type FormEvent} from "react"
import {confirmInStudio} from "@/lib/studioDialogs"
import {CheckCircle2,ShieldCheck,UserPlus,UsersRound,Trash2} from "lucide-react"
import {knowledgeApi} from "@/lib/knowledgeBases"

type Grant={recipient_id:string;name:string;role:"viewer"|"editor";semantic_allowed:boolean;
 active:boolean;created_ms:number;updated_ms:number}
type Grants={base_id:string;grants:Grant[]}
const explain:Record<string,string>={
 recipient_not_found:"未找到此员工，或账号已停用。请核对工作邮箱。",
 invalid_recipient_email:"请输入完整的公司员工工作邮箱。",
 invalid_access_role:"请选择只读或文档编辑权限。",
 knowledge_share_limit:"当前资料库已达到50名协作者上限。",
 base_not_found:"知识库已经删除，或当前账号不是资料库所有者。",
}
export function KnowledgeSharePanel({baseId}:{baseId:string}){
 const [email,setEmail]=useState("")
 const [role,setRole]=useState<"viewer"|"editor">("viewer")
 const [semanticAllowed,setSemanticAllowed]=useState(false)
 const [grants,setGrants]=useState<Grant[]>([])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 const fetchGrants=useCallback(async()=>{
  const response=await knowledgeApi<Grants>(
    "/api/knowledge-bases/access?base_id="+encodeURIComponent(baseId))
  setGrants(response.grants||[])
 },[baseId])
 useEffect(()=>{
  let current=true
  void knowledgeApi<Grants>("/api/knowledge-bases/access?base_id="+encodeURIComponent(baseId))
   .then(response=>{if(current)setGrants(response.grants||[])})
   .catch(err=>{if(current)setError(String((err as Error).message||err))})
   .finally(()=>{if(current)setLoading(false)})
  return ()=>{current=false}
 },[baseId])
 const submit=async(e:FormEvent)=>{
  e.preventDefault()
  if(!email.trim()||saving)return
  if(!await confirmInStudio("确认授权 "+email.trim()+" 访问此知识库？\n"+
    (role==="editor"?
      "对方可上传及删除文档；若你的知识库启用后台向量化，新增资料可能产生你的 Embedding 模型费用。":
      "对方只能阅读目录与检索片段，不可修改文档。")+
    "\n撤销后对方将失去此资料库访问权。"))return
  setSaving(true);setError("");setNotice("")
  try{
   const result=await knowledgeApi<{recipient_name:string}>(
    "/api/knowledge-bases/access","POST",{
     action:"grant",base_id:baseId,recipient_email:email.trim(),role,
     semantic_allowed:semanticAllowed,
    })
   setNotice("已向 "+result.recipient_name+" 授予"+
    (role==="editor"?"文档编辑":"只读检索")+"权限")
   setEmail("")
   setSemanticAllowed(false)
   await fetchGrants()
  }catch(err){
   const message=String((err as Error).message||err)
   setError(explain[message]||message)
  }finally{setSaving(false)}
 }
 const updateSemantic=async(grant:Grant,next:boolean)=>{
  if(saving)return
  if(next&&!await confirmInStudio(
   "为 "+grant.name+" 开通团队语义检索？\n"+
   "对方只能通过自己的兼容 Embedding 模型生成查询向量，"+
   "读取您已有的文档向量；不会获得您的密钥，也不会将原文发给其 Embedding 服务。"
  ))return
  setSaving(true);setError("");setNotice("")
  try{
   await knowledgeApi("/api/knowledge-bases/access","POST",{
    action:"semantic",base_id:baseId,recipient_id:grant.recipient_id,enabled:next,
   })
   setNotice(next?"已允许 "+grant.name+" 使用自己的兼容模型检索。":
    "已关闭 "+grant.name+" 的共享语义检索，原文阅读权限不变。")
   await fetchGrants()
  }catch(err){setError(String((err as Error).message||err))}
  finally{setSaving(false)}
 }
 const revoke=async(grant:Grant)=>{
  if(saving||!await confirmInStudio("确定取消 "+grant.name+" 对当前知识库的访问权限？"))return
  setSaving(true);setError("");setNotice("")
  try{
   await knowledgeApi("/api/knowledge-bases/access","POST",{
    action:"revoke",base_id:baseId,recipient_id:grant.recipient_id,
   })
   setNotice("已撤销 "+grant.name+" 的访问权限")
   await fetchGrants()
  }catch(err){setError(String((err as Error).message||err))}
  finally{setSaving(false)}
 }
 return <section className="rounded-2xl border border-border bg-card p-5">
  <div className="flex items-start gap-2">
   <UsersRound className="mt-0.5 h-5 w-5 text-primary"/>
   <div>
    <h3 className="text-sm font-semibold">团队知识库授权</h3>
    <p className="mt-1 text-xs text-muted-foreground">
     默认私人资料；由所有者逐人授权。同事登录后可在「知识库」中看到被共享的资料。
    </p>
   </div>
  </div>
  <form onSubmit={e=>void submit(e)} className="mt-4 flex flex-wrap items-end gap-2">
   <label className="min-w-[175px] flex-1 text-xs text-muted-foreground">接收员工的工作邮箱
    <input type="email" autoComplete="off" required maxLength={180}
     value={email} onChange={e=>setEmail(e.target.value)}
     placeholder="colleague@company.com"
     className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"/>
   </label>
   <label className="text-xs text-muted-foreground">权限
    <select value={role} onChange={e=>setRole(e.target.value as "viewer"|"editor")}
     className="mt-1.5 block rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
     <option value="viewer">Viewer · 只读检索</option>
     <option value="editor">Editor · 编辑文档</option>
    </select>
   </label>
   <label className="flex items-center gap-2 text-xs text-muted-foreground">
    <input type="checkbox" checked={semanticAllowed}
     onChange={e=>setSemanticAllowed(e.target.checked)}/>
    同时允许共享语义
   </label>
   <button type="submit" disabled={saving||!email.trim()}
    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
    <UserPlus size={15}/>{saving?"正在保存…":"授予权限"}
   </button>
  </form>
  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
   <ShieldCheck size={13} className="mt-0.5 shrink-0"/>
   共享仅包含本知识库原文。不会分享模型密钥、其他 Agent 或执行记录；
   新授权默认仅关键词。您可另行允许语义检索：同事使用自己的兼容模型生成查询向量，复用您已建立的文档索引；不使用您的 API Key 或查询额度。
  </p>
  {error&&<p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
  {notice&&<p role="status" className="mt-3 flex items-center gap-1 text-xs text-primary"><CheckCircle2 size={14}/>{notice}</p>}
  <div className="mt-4 space-y-2">
   <p className="text-xs font-semibold">已授权成员（{grants.length}）</p>
   {loading?<p className="text-xs text-muted-foreground">读取权限中…</p>:
    grants.length===0?<p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
     暂无共享成员。
    </p>:grants.map(item=><div key={item.recipient_id}
      className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs">
      <span className="min-w-0 flex-1 font-medium">{item.name}</span>
      <span className="text-muted-foreground">{item.role==="editor"?"Editor · 可编辑":"Viewer · 只读"}
       {!item.active?" · 员工已停用":""}</span>
      <label className="inline-flex items-center gap-1.5 text-muted-foreground">
       <input type="checkbox" checked={item.semantic_allowed===true}
        disabled={saving||!item.active} aria-label={"允许 "+item.name+" 使用共享语义检索"}
        onChange={e=>void updateSemantic(item,e.target.checked)}/>
       语义检索
      </label>
      <button type="button" disabled={saving} aria-label={"撤销 "+item.name+" 的知识库授权"}
       onClick={()=>void revoke(item)}
       className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 px-2 py-1 text-destructive hover:bg-destructive/5 disabled:opacity-50">
       <Trash2 size={12}/>撤销
      </button>
    </div>)}
  </div>
 </section>
}
