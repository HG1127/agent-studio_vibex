import {useState,type FormEvent} from "react"
import {FilePlus2,Loader2,ShieldAlert} from "lucide-react"
import {PgNativePilotError,type PgNativeKnowledge,
  type PgNativeTextIngestUat,createPgNativePilotApi} from "@/lib/pgNativePilotApi"

type Api=ReturnType<typeof createPgNativePilotApi>

/** Development-only synthetic TXT/Markdown ingestion, NOT production import. */
export default function PgNativeTextIngestUatPanel({api,bases}:{
  api:Api;bases:PgNativeKnowledge[]
}){
  const [baseId,setBaseId]=useState("")
  const [filename,setFilename]=useState("")
  const [content,setContent]=useState("")
  const [saving,setSaving]=useState(false)
  const [result,setResult]=useState<PgNativeTextIngestUat["item"]|null>(null)
  const [error,setError]=useState("")
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    if(saving||!baseId||!filename.trim()||!content.trim())return
    setSaving(true);setError("");setResult(null)
    try{
      const saved=await api.ingestKnowledgeTextUat(baseId,filename.trim(),content)
      setResult(saved.item);setFilename("");setContent("")
    }catch(cause){
      const err=cause instanceof PgNativePilotError?cause:null
      setError(err?.status===405||err?.status===503
        ?"服务端尚未批准独立 TXT/MD 入库 UAT。"
        :err?.status===404?"知识库不存在或当前员工无权写入。"
        :err?.status===409?"同一文档内容已索引，无需重复导入。"
        :err?.status===400?"文件名或内容格式不符合限制。"
        :"隔离入库未完成，请检查独立测试服务。")
    }finally{setSaving(false)}
  }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
      <ShieldAlert size={18}/>隔离 TXT/Markdown 入库 UAT
    </h2>
    <p className="mt-2 text-xs leading-6 text-amber-900">
      仅在开发环境和专门授权的可销毁 PostgreSQL 测试库使用。
      这会真的写入测试库并建立关键词索引；不调用模型、不生成 Embedding，
      也不会改变旧 PocketBase 知识库。
    </p>
    <form className="mt-4 space-y-3" onSubmit={submit}>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        目标知识库
        <select value={baseId} required
          onChange={e=>{setBaseId(e.target.value);setResult(null)}}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <option value="">选择当前员工的知识库</option>
          {bases.map(base=><option key={base.id} value={base.id}>{base.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        文档文件名
        <input type="text" value={filename} required maxLength={120}
          onChange={e=>setFilename(e.target.value)} placeholder="example.md 或 notes.txt"
          autoComplete="off"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"/>
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        文本文档（最多 12,000 字符）
        <textarea value={content} required maxLength={12000} rows={5}
          onChange={e=>setContent(e.target.value)}
          placeholder="只输入合成测试内容，不得输入真实公司机密。"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"/>
      </label>
      <button type="submit" disabled={saving||!baseId||!filename.trim()||!content.trim()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {saving?<Loader2 className="animate-spin" size={17}/>:<FilePlus2 size={17}/>}
        将 TXT/MD 文本写入合成知识库
      </button>
    </form>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {result&&<p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700">
      {result.filename} 已索引 {result.chunk_count} 段。打开该知识库详情，即可通过关键词检索。
    </p>}
  </section>
}
