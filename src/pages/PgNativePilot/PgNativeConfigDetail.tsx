import {useEffect,useState} from "react"
import {BookOpen,CheckCircle2,ChevronLeft,FileText,GitBranch,Loader2} from "lucide-react"
import {PgNativePilotError,type PgNativeAgent,type PgNativeWorkflow,
  type PgNativeKnowledge,type PgNativeKnowledgeDocument,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import PgNativeKnowledgeKeywordSearch from "./PgNativeKnowledgeKeywordSearch"

type Api=ReturnType<typeof createPgNativePilotApi>
export type DetailKind="agents"|"workflows"|"knowledge"
type Detail=
  |{kind:"agents";value:PgNativeAgent}
  |{kind:"workflows";value:PgNativeWorkflow}
  |{kind:"knowledge";value:PgNativeKnowledge;documents:PgNativeKnowledgeDocument[]}
function nodeName(value:unknown):string{
  if(!value||typeof value!=="object"||Array.isArray(value))return "未命名节点"
  const item=value as Record<string,unknown>
  const meta=item.data
  const title=meta&&typeof meta==="object"&&!Array.isArray(meta)
    ?(meta as Record<string,unknown>).title:undefined
  if(typeof title==="string"&&title.trim())return title.slice(0,90)
  return typeof item.type==="string"?item.type.slice(0,70):"未命名节点"
}
function errorMessage(error:unknown){
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "员工会话已失效，请重新登录。"
    if(error.status===404)return "记录不存在，或当前员工没有查看权限。"
    if(error.status===403)return "服务器拒绝访问此配置。"
  }
  return "暂时无法读取配置详情，请稍后重试。"
}

/** PG-only, owner-scoped, read-only record drilldown. Never uses PB SDK. */
export default function PgNativeConfigDetail({api,kind,id,onClose}:{
  api:Api;kind:DetailKind;id:string;onClose:()=>void
}){
  const [detail,setDetail]=useState<Detail|null>(null)
  const [pending,setPending]=useState(true)
  const [error,setError]=useState("")
  useEffect(()=>{
    let active=true
    setPending(true);setError("");setDetail(null)
    void (async()=>{
      try{
        let next:Detail
        if(kind==="agents"){
          next={kind,value:await api.getAgent(id)}
        }else if(kind==="workflows"){
          next={kind,value:await api.getWorkflow(id)}
        }else{
          // No document bodies, object_key, embeddings or search result
          // contents are requested by this read-only detail view.
          const [base,documents]=await Promise.all([
            api.getKnowledge(id),api.listKnowledgeDocuments(id)
          ])
          next={kind,value:base,documents}
        }
        if(active)setDetail(next)
      }catch(cause){
        if(active)setError(errorMessage(cause))
      }finally{
        if(active)setPending(false)
      }
    })()
    return ()=>{active=false}
  },[api,kind,id])
  const workflow=detail?.kind==="workflows"?detail.value.graph:undefined
  const workflowNodes=Array.isArray(workflow?.nodes)?workflow.nodes:[]
  const workflowEdges=Array.isArray(workflow?.edges)?workflow.edges:[]
  return <section aria-label="PostgreSQL 配置详情" className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
    <button type="button" onClick={onClose}
      className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
      <ChevronLeft size={17}/>返回列表
    </button>
    {pending&&<p className="flex items-center gap-2 text-sm text-slate-500" role="status">
      <Loader2 className="animate-spin" size={16}/>正在读取当前员工的配置详情…
    </p>}
    {error&&<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
    {detail?.kind==="agents"&&<>
      <h3 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 size={19}/> {detail.value.name}</h3>
      <p className="mt-1 text-xs text-slate-500">Agent 配置 · 版本 {detail.value.revision} · 只读</p>
      <div className="mt-4 space-y-4 text-sm text-slate-700">
        <div><p className="font-semibold">目标</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{detail.value.spec?.goal||"暂无目标"}</p></div>
        <div><p className="font-semibold">任务范围</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{detail.value.spec?.task_scope||"未设定"}</p></div>
        <div><p className="font-semibold">模型连接</p>
          <p className="mt-1 break-words text-slate-600">
            {detail.value.spec?.model_binding
              ?detail.value.spec.model_binding.model_id+
                " · 绑定版本 "+detail.value.spec.model_binding.connection_revision+
                "（实际执行取决于环境授权与审批）"
              :"尚未绑定模型"}
          </p>
        </div>
        <div><p className="font-semibold">关联知识库</p>
          <p className="mt-1 text-slate-600">已关联 {detail.value.spec?.knowledge_base_ids?.length??0} 个私有知识库。检索须符合当前员工权限且已索引，模型执行仍需独立审批。</p>
        </div>
        {([
          ["交付物",detail.value.spec?.deliverables],
          ["任务计划",detail.value.spec?.task_plan],
          ["完成标准",detail.value.spec?.done_criteria],
          ["已配置工具",detail.value.spec?.tools]
        ] as const).map(([label,items])=>
          <div key={label}><p className="font-semibold">{label}</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {(Array.isArray(items)?items:[]).map((item,index)=>
                <li key={index} className="break-words">{item}</li>)}
            </ul>
            {(!items||!items.length)&&<p className="text-slate-400">暂无</p>}
          </div>)}
      </div>
    </>}
    {detail?.kind==="workflows"&&<>
      <h3 className="flex items-center gap-2 text-lg font-semibold"><GitBranch size={19}/> {detail.value.name}</h3>
      <p className="mt-1 text-xs text-slate-500">Workflow 配置 · 版本 {detail.value.revision} · 只读结构核对</p>
      <p className="mt-3 text-sm text-slate-600">{workflowNodes.length} 个节点 · {workflowEdges.length} 条连线</p>
      {workflow?.version===2&&<p className="mt-2 text-sm text-amber-800">已保存节点配置。完整流程执行尚未开放。</p>}
      <ol className="mt-3 space-y-2">
        {workflowNodes.slice(0,50).map((node,index)=>
          <li key={index} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
            <span className="mr-2 text-xs text-slate-400">{index+1}</span>{nodeName(node)}
          </li>)}
      </ol>
      {workflowNodes.length>50&&<p className="mt-2 text-xs text-slate-500">仅展示前 50 个节点。</p>}
    </>}
    {detail?.kind==="knowledge"&&<>
      <h3 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={19}/> {detail.value.name}</h3>
      <p className="mt-1 text-xs text-slate-500">知识库 · 版本 {detail.value.revision} · 仅本人可见</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
        {detail.value.description||"暂无描述"}
      </p>
      <PgNativeKnowledgeKeywordSearch key={id} api={api} baseId={id}/>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="font-semibold">文档清单（只读）</h4>
        <p className="mt-1 text-xs text-slate-500">
          仅显示最多 30 条文档的文件名与索引状态，不展示正文、对象存储地址或向量。
        </p>
        {!detail.documents.length&&<p className="mt-4 text-sm text-slate-400">暂无已登记文档</p>}
        <div className="mt-3 space-y-2">{detail.documents.map(doc=>
          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileText size={17} className="shrink-0 text-slate-400"/>
              <span className="truncate" title={doc.filename}>{doc.filename}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-500">{doc.status}</span>
          </div>)}</div>
      </div>
    </>}
  </section>
}
