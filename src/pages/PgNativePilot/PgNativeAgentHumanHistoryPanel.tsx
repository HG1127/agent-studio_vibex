import {useEffect,useRef,useState} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeHumanHistoryPage} from "@/lib/pgNativePilotApi"
const button="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
export default function PgNativeAgentHumanHistoryPanel({api,runId,mode,active,onExpired}:{
  api:ReturnType<typeof createPgNativePilotApi>;runId:string|null;mode:"agent"|"workflow";active:boolean;onExpired:()=>void
}){
  const [page,setPage]=useState<PgNativeHumanHistoryPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("")
  const ticket=useRef(0)
  useEffect(()=>{++ticket.current;setPage(null);setError("");setLoading(false);return ()=>{++ticket.current}},[api,runId,mode,active])
  if(!runId)return null
  const load=async(after="")=>{
    if(!active||loading)return
    const read=++ticket.current;setLoading(true);setError("");setPage(null)
    try{
      const value=await(mode==="agent"?api.getAutonomousAgentHumanHistory(runId,after,10):api.getWorkflowAgentHumanHistory(runId,after,10))
      if(read===ticket.current)setPage(value)
    }catch(cause){
      if(read!==ticket.current)return
      if(cause instanceof PgNativePilotError&&cause.status===401){onExpired();return}
      setError("暂时无法核对本人回复记录，请刷新后重试。")
    }finally{if(read===ticket.current)setLoading(false)}
  }
  return <section aria-label="本人回复记录" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">本人回复记录</h3>
      <button type="button" className={button} disabled={!active||loading} onClick={()=>void load()}>读取本人回复记录</button></div>
    <p className="text-xs leading-5 text-slate-500">每页最多10条。读取时会重新核对原问题、回复回执与任务来源。</p>
    {loading&&<p role="status" className="text-sm text-slate-500">核对回复记录中…</p>}
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}
    {page?.available===false&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">原始来源或回复回执暂不可用，记录内容已隐藏。</p>}
    {page?.available===true&&!page.items.length&&<p className="text-sm text-slate-500">当前任务尚无已登记的本人回复。</p>}
    {page?.available===true&&page.items.map(item=><details key={item.request_id} className="space-y-2 rounded-xl bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium">{item.node_title} · 第 {item.round} 轮 · {item.decision==="approve"?"已批准方案":item.decision==="revise"?"已提交修改意见":"已回复问题"}</summary>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.question}</p>
      {item.draft&&<div><p className="text-xs font-semibold text-slate-500">原方案草案</p><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">{item.draft}</pre></div>}
      <div><p className="text-xs font-semibold text-slate-500">本人{item.decision==="approve"?"批准备注":item.decision==="revise"?"修改意见":"回复"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.answer||"无批准备注"}</p></div>
    </details>)}
    {page?.available===true&&page.next_after&&<button type="button" className={button} disabled={!active||loading} onClick={()=>void load(page.next_after!)}>下一页回复记录</button>}
  </section>
}
