import {useEffect,useRef,useState,type FormEvent} from "react"
import {FileSearch,Loader2,Search,ShieldCheck} from "lucide-react"
import {PgNativePilotError,type PgNativeKeywordHit,
  createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>

/**
 * PG-native, owner-RLS-scoped LITERAL keyword search.
 * The server reads indexed chunks only and returns bounded citations.
 * No browser vector input, embedding provider, external model or PB SDK.
 */
export default function PgNativeKnowledgeKeywordSearch({api,baseId}:{
  api:Api;baseId:string
}){
  const [query,setQuery]=useState("")
  const [results,setResults]=useState<PgNativeKeywordHit[]>([])
  const [searched,setSearched]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const epoch=useRef(0)
  useEffect(()=>{
    setQuery("");setResults([]);setSearched(false);setError("")
    return ()=>{epoch.current++}
  },[baseId])
  const search=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(busy||query.trim().length<2)return
    const ticket=++epoch.current
    setBusy(true);setError("");setSearched(false);setResults([])
    try{
      const response=await api.searchKnowledgeKeyword(baseId,query.trim(),6)
      if(ticket!==epoch.current)return
      if(response.mode!=="literal_keyword"||response.scope!=="current_user"||
         response.indexed_only!==true||!Array.isArray(response.items))
        throw Error("unexpected_knowledge_search_scope")
      setResults(response.items)
      setSearched(true)
    }catch(cause){
      if(ticket!==epoch.current)return
      const err=cause instanceof PgNativePilotError?cause:null
      setError(err?.status===404
        ?"知识库不存在，或当前员工无权检索。"
        :err?.status===401?"员工会话已失效，请重新登录。"
        :err?.status===403?"检索被来源校验或权限策略拒绝。"
        :"检索未完成，请稍后重试。")
    }finally{
      if(ticket===epoch.current)setBusy(false)
    }
  }
  return <section aria-label="知识库关键词检索" className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
    <h4 className="flex items-center gap-2 font-semibold text-slate-900">
      <FileSearch size={17} className="text-indigo-600"/>检索已索引文档
    </h4>
    <p className="mt-1 text-xs leading-5 text-slate-600">
      仅关键词匹配，按当前员工权限返回匹配片段及来源引用。
      不调用大模型或 Embedding，尚不属于语义向量 RAG。
    </p>
    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={search}>
      <label className="min-w-0 flex-1">
        <span className="sr-only">搜索关键词</span>
        <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          type="search" required minLength={2} maxLength={160}
          placeholder="输入要检索的关键词（至少 2 字）"
          value={query} onChange={e=>setQuery(e.target.value)}
          autoComplete="off" spellCheck={false}/>
      </label>
      <button type="submit" disabled={busy||query.trim().length<2}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {busy?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>}
        检索
      </button>
    </form>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    {busy&&<p role="status" className="mt-3 text-xs text-slate-500">正在匹配本人已索引的知识片段…</p>}
    {searched&&!results.length&&
      <p role="status" className="mt-3 text-sm text-slate-500">没有找到匹配的已索引内容。</p>}
    {!!results.length&&<>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-600">
        <ShieldCheck size={14}/>找到 {results.length} 条匹配 · 最多显示 6 条
      </p>
      <ol className="mt-3 space-y-2">
        {results.map((hit,index)=><li key={hit.document_id+":"+hit.chunk_index+":"+index}
          className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="break-words text-xs font-semibold text-indigo-700">{hit.citation}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {hit.snippet}
          </p>
        </li>)}
      </ol>
    </>}
  </section>
}
