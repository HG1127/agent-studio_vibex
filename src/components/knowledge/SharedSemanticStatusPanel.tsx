import {useEffect,useState} from "react"
import {BookOpenCheck,CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react"
import {Link} from "react-router-dom"
import {knowledgeApi} from "@/lib/knowledgeBases"

type SharedStatus={
  semantic_allowed:boolean
  compatible:boolean
  indexed_chunks:number
  total_chunks:number
  status:"owner_not_authorized"|"reader_model_missing"|
    "provider_model_incompatible"|"not_indexed"|"ready"|"partial"
}
const descriptions:Record<SharedStatus["status"],string>={
  owner_not_authorized:"所有者只授权了关键词/原文阅读，尚未开放语义查询。",
  reader_model_missing:"请在「模型连接」配置自己获得授权的 Embedding 模型；对方的密钥不会共享。",
  provider_model_incompatible:"你的 Embedding 模型 ID 和提供商接口需要与资料所有者的索引一致。",
  not_indexed:"所有者尚未为本库建立可用的向量索引。",
  ready:"双方模型兼容，已有索引就绪，可以使用语义或混合检索。",
  partial:"共享向量索引只覆盖部分资料，检索结果可能不完整。",
}
export function SharedSemanticStatusPanel({baseId}:{baseId:string}){
  const [state,setState]=useState<SharedStatus|null>(null)
  const [error,setError]=useState("")
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let mounted=true
    void knowledgeApi<SharedStatus>(
      "/api/knowledge-bases/semantic/shared-status?base_id="+encodeURIComponent(baseId))
      .then(value=>{if(mounted){setState(value);setError("")}})
      .catch(err=>{if(mounted)setError(String((err as Error).message||err))})
    return ()=>{mounted=false}
  },[baseId,revision])
  return <section aria-label="团队共享知识库语义检索状态"
    className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold">
        <BookOpenCheck className="h-4 w-4 text-primary"/>团队语义检索
      </h3><p className="mt-1 text-xs text-muted-foreground">
        复用所有者已有文档向量；查询时只使用你的模型连接与密钥。
      </p></div>
      <button type="button" onClick={()=>setRevision(x=>x+1)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
        <RefreshCw size={13}/>刷新兼容状态
      </button>
    </div>
    {error?<p role="alert" className="mt-3 flex items-center gap-2 text-xs text-destructive">
      <ShieldAlert size={15}/>{error}</p>:
      !state?<p role="status" className="mt-3 text-xs text-muted-foreground">正在检查共享语义检索权限与模型…</p>:
      <div className="mt-3">
        <p role="status" className="flex items-center gap-2 text-xs leading-relaxed">
          {state.compatible&&state.indexed_chunks>0?
            <CheckCircle2 size={15} className="text-primary"/>:
            <ShieldAlert size={15} className="text-muted-foreground"/>}
          {descriptions[state.status]}
        </p>
        {state.compatible&&<p className="mt-2 text-xs text-muted-foreground">
          可用向量片段：{state.indexed_chunks} / {state.total_chunks}
        </p>}
        {(state.status==="reader_model_missing"||state.status==="provider_model_incompatible")&&
          <p className="mt-2 text-xs text-muted-foreground">
            <Link to="/model-connections" className="text-primary underline">配置我的模型连接</Link>
            {" "}和当前账号的 Embedding 模型设置后，再点击刷新。
          </p>}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          自动模式在共享语义不可用时退回关键词检索。你的查询会发往自己选定的 Embedding 服务商；
          文档全文不会因此被发送，所有者的 API Key 不会暴露。
        </p>
      </div>}
  </section>
}
