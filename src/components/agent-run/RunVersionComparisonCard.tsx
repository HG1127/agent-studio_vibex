import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRightLeft, Clock3, GitCompareArrows, Loader2, RefreshCw } from "lucide-react"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { buildRunComparison,type ComparisonRun,type ComparisonEvent } from "@/lib/runComparison"
import type { AgentRunRow,RunEventRow } from "@/pages/AgentRun/useAgentRun"

type Props = {run:AgentRunRow;history:AgentRunRow[];events:RunEventRow[]}
type HistoryChoice=Pick<AgentRunRow,"id"|"spec_id"|"status"|"created">
type OptimizationLineage={
  id:string;source_run_id:string;changed_keys:string[];created_ms:number;
  accepted_revision_id:string;feedback_unchanged:boolean
}
const CHANGE_LABELS:Record<string,string>={
  goal:"核心目标",task_scope:"任务范围",deliverables:"交付物",
  task_plan:"任务步骤",done_criteria:"完成标准",tools:"工具授权",
  knowledge_base_ids:"知识库",require_plan_review:"阶段审批",
  require_approval:"写入审批",
}
function formatMetric(value:number|null,unit:string){
  return value===null?"未记录":String(value)+unit
}
function scoreLabel(score:number|null,mode:string|null){
  if(score===null)return "未评估"
  return score+" 分（"+(mode==="llm"?"模型综合评价":mode==="rule"?"规则降级评分":"来源未知")+"）"
}
function timeLabel(value:string){
  const d=new Date(value.replace(" ","T"))
  return Number.isNaN(d.getTime())?value:d.toLocaleString("zh-CN")
}
export function RunVersionComparisonCard({run,history,events}:Props){
  const [ownedHistory,setOwnedHistory]=useState<HistoryChoice[]|null>(null)
  const [historyPage,setHistoryPage]=useState(1)
  const [historyPages,setHistoryPages]=useState(1)
  const [historyTotal,setHistoryTotal]=useState(0)
  const [historyLoading,setHistoryLoading]=useState(false)
  const [historyError,setHistoryError]=useState("")
  const [historyRevision,setHistoryRevision]=useState(0)
  const [directRunId,setDirectRunId]=useState("")
  useEffect(()=>{
    setHistoryPage(1)
    setOwnedHistory(null)
    setHistoryTotal(0)
    setHistoryPages(1)
    setDirectRunId("")
  },[run.id])
  useEffect(()=>{
    if(!run.spec_id)return
    const abort=new AbortController()
    setHistoryLoading(true)
    setHistoryError("")
    void(async()=>{
      try{
        const res=await fetch(getPocketBaseUrl()+"/api/agent-specs/"+
          encodeURIComponent(run.spec_id)+"/run-history?page="+historyPage+"&perPage=25",{
          headers:{...vibexAuthHeaders()},signal:abort.signal,
        })
        if(!res.ok)throw new Error("run_history_unavailable")
        const data=await res.json()
        if(!Array.isArray(data?.items)||!Number.isFinite(Number(data.totalItems)))
          throw new Error("invalid_history_response")
        if(abort.signal.aborted)return
        const pageItems=(data.items as HistoryChoice[]).filter(item=>item.spec_id===run.spec_id)
        setOwnedHistory(previous=>{
          const combined=historyPage===1?pageItems:[...(previous||[]),...pageItems]
          return [...new Map(combined.map(item=>[item.id,item])).values()]
        })
        setHistoryTotal(Number(data.totalItems))
        setHistoryPages(Math.max(1,Number(data.totalPages)||1))
      }catch{
        if(!abort.signal.aborted)setHistoryError(
          "完整历史索引暂不可用，下面仅能显示已加载的近期记录；请重试。")
      }finally{if(!abort.signal.aborted)setHistoryLoading(false)}
    })()
    return()=>abort.abort()
  },[run.id,run.spec_id,historyPage,historyRevision])

  const candidates=useMemo(()=>{
    const currentTime=Date.parse(run.created.replace(" ","T"))||0
    return (ownedHistory||history).filter(row=>row.spec_id===run.spec_id && row.id!==run.id &&
      (Date.parse(row.created.replace(" ","T"))||0)<=currentTime)
      .sort((a,b)=>(Date.parse(b.created)||0)-(Date.parse(a.created)||0))
  },[ownedHistory,history,run.id,run.spec_id,run.created])
  const [beforeId,setBeforeId]=useState("")
  const [before,setBefore]=useState<AgentRunRow|null>(null)
  const [beforeEvents,setBeforeEvents]=useState<RunEventRow[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [revision,setRevision]=useState(0)
  const lineageId=typeof run.config?.optimization_lineage_id==="string"
    ?String(run.config.optimization_lineage_id):""
  const [lineage,setLineage]=useState<OptimizationLineage|null>(null)
  const [lineageError,setLineageError]=useState("")
  useEffect(()=>{
    const abort=new AbortController()
    setLineage(null);setLineageError("")
    if(!/^[A-Za-z0-9]{15}$/.test(lineageId))return
    void(async()=>{
      try{
        const response=await fetch(getPocketBaseUrl()+"/api/agent-specs/"+
          encodeURIComponent(run.spec_id)+"/optimization-lineage?audit_id="+encodeURIComponent(lineageId),{
          headers:{...vibexAuthHeaders()},signal:abort.signal,
        })
        if(!response.ok)throw new Error("unavailable")
        const data=await response.json()
        const item=Array.isArray(data.items)?data.items.find((row:OptimizationLineage)=>row.id===lineageId):null
        if(!item)throw new Error("audit_not_found")
        if(!abort.signal.aborted)setLineage(item)
      }catch{if(!abort.signal.aborted)setLineageError("暂时无法验证反馈与版本记录的关联。")}
    })()
    return()=>abort.abort()
  },[run.spec_id,run.id,lineageId])

  useEffect(()=>setBeforeId(candidates[0]?.id||""),[run.id,candidates[0]?.id])
  useEffect(()=>{
    if(!beforeId){setBefore(null);setBeforeEvents([]);setLoading(false);return}
    let cancelled=false
    const abort=new AbortController()
    setBefore(null);setBeforeEvents([]);setError("");setLoading(true)
    void(async()=>{
      try{
        const headers={...vibexAuthHeaders()}
        const [recordRes,eventRes]=await Promise.all([
          fetch(getPocketBaseUrl()+"/api/agent_runs/"+encodeURIComponent(beforeId),{
            headers,signal:abort.signal,
          }),
          fetch(getPocketBaseUrl()+"/api/run_events?run_id="+encodeURIComponent(beforeId)+
            "&perPage=200&sort=created",{headers,signal:abort.signal}),
        ])
        if(!recordRes.ok||!eventRes.ok)throw new Error("missing_permission")
        const record=await recordRes.json() as AgentRunRow
        const detail=await eventRes.json()
        if(!record?.id||record.id!==beforeId||record.id===run.id||
          record.spec_id!==run.spec_id||!Array.isArray(detail?.items)||
          Date.parse(record.created.replace(" ","T"))>Date.parse(run.created.replace(" ","T")))
          throw new Error("invalid_comparison")
        if(!cancelled){setBefore(record);setBeforeEvents(detail.items)}
      }catch{
        if(!cancelled)setError("无法读取这条历史运行的完整记录，可能已删除或当前账号无权查看。")
      }finally{if(!cancelled)setLoading(false)}
    })()
    return()=>{cancelled=true;abort.abort()}
  },[beforeId,run.spec_id,revision])
  const result=useMemo(()=>{
    if(!before||before.spec_id!==run.spec_id)return null
    try{return buildRunComparison(before as ComparisonRun,run as ComparisonRun,
      beforeEvents as ComparisonEvent[],events as ComparisonEvent[])}
    catch{return null}
  },[before,run,beforeEvents,events])
  if(!run.id||!run.spec_id)return null
  return <section id="run-version-compare" aria-label="Agent 前后运行和版本对比"
    className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <GitCompareArrows className="h-5 w-5 text-primary"/>前后运行与方案变更对比
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          根据两次运行的持久化配置快照、事件和评估对比；不是按模型猜测改动。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="compare-run-select" className="text-xs text-muted-foreground">基准运行</label>
        <select id="compare-run-select" value={beforeId} onChange={e=>setBeforeId(e.target.value)}
          className="min-h-9 max-w-64 rounded-lg border border-border bg-background px-2 text-xs">
          {beforeId&&!candidates.some(item=>item.id===beforeId)&&
            <option value={beforeId}>运行 ID · {beforeId}</option>}
          {!beforeId && <option value="">尚无可比较的基准运行</option>}
          {candidates.map(item=><option key={item.id} value={item.id}>
            {timeLabel(item.created)} · {item.status}
          </option>)}
        </select>
        <button type="button" disabled={loading} onClick={()=>setRevision(x=>x+1)}
          aria-label="刷新历史版本对比"
          className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40">
          <RefreshCw className="h-4 w-4"/>
        </button>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-muted-foreground">
        {historyLoading?"正在加载运行索引…":historyError?"历史索引不可用":
          "已加载 "+(ownedHistory?.length||0)+" / "+historyTotal+" 条（每页 25 条）"}
      </span>
      {historyPage<historyPages&&<button type="button" disabled={historyLoading}
        onClick={()=>setHistoryPage(page=>page+1)}
        className="min-h-9 rounded-lg border border-border px-3 font-semibold text-primary hover:bg-secondary disabled:opacity-40">
        加载更早运行
      </button>}
      {historyError&&<button type="button"
        onClick={()=>setHistoryRevision(x=>x+1)}
        className="font-semibold text-primary underline">重试加载完整历史</button>}
      <label className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-muted-foreground">按运行 ID 定位</span>
        <input value={directRunId} onChange={e=>setDirectRunId(e.target.value.trim().slice(0,15))}
          aria-label="输入要比较的历史运行 ID" placeholder="输入 15 位运行 ID"
          className="min-h-9 w-52 rounded-lg border border-border bg-background px-2.5 text-xs"/>
      </label>
      <button type="button" disabled={!/^[A-Za-z0-9]{15}$/.test(directRunId)||directRunId===run.id}
        onClick={()=>setBeforeId(directRunId)}
        className="min-h-9 rounded-lg border border-primary/30 px-3 font-semibold text-primary hover:bg-primary/5 disabled:opacity-40">
        读取并比较
      </button>
    </div>
    {!historyLoading&&!candidates.length&&!beforeId&&
      <p role="status" className="mt-3 text-xs text-muted-foreground">
        当前尚无更早的已加载运行；可以继续加载历史，或输入准确的运行 ID。
      </p>}
    {lineageError&&<p role="alert" className="mt-2 text-xs text-destructive">{lineageError}</p>}
    {loading&&<p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin"/>正在读取历史运行与工具事件…
    </p>}
    {error&&<p role="alert" className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
      {error}
    </p>}
    {!loading&&!error&&result&&before&&<>
      <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3 text-xs leading-relaxed">
        {lineage?.source_run_id===before.id ?
          <div>
            <p className="font-semibold text-foreground">
              {lineage.feedback_unchanged
                ?"已核验：这次新方案由所选基准运行的用户反馈触发，并在服务器保存变更记录"
                :"找到已保存的反馈关联，但原反馈后来发生变化"}
            </p>
            <p className="mt-1 text-muted-foreground">
              触发变更的字段：{lineage.changed_keys.map(k=>CHANGE_LABELS[k]||k).join("、")||"未记录"}。
              记录编号：{lineage.id}，关联版本：{lineage.accepted_revision_id}
            </p>
            {!lineage.feedback_unchanged&&<p className="mt-1 text-amber-700 dark:text-amber-400">
              当前显示的反馈文本可能不是触发该次优化的原始内容，不能视为同一份反馈。
            </p>}
          </div>:
          lineage?<div>
            <p className="font-semibold text-foreground">新运行已携带受服务器校验的优化来源，但当前选择的基准运行不是直接来源。</p>
            <button type="button" onClick={()=>setBeforeId(lineage.source_run_id)}
              className="mt-2 rounded-lg border border-primary/30 px-3 py-2 font-semibold text-primary hover:bg-primary/5">
              切换到触发反馈的原运行
            </button>
          </div>:
          <p className="text-muted-foreground">
            本次运行没有可核验的「反馈 → 接受修改 → 再试跑」关联标识。
            即使配置或分数发生变化，也不能由此判断修改来自当前基准运行的反馈。
          </p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-secondary/30 p-3 text-xs sm:grid-cols-4">
        <div><p className="text-muted-foreground">前一轮状态</p><p className="mt-1 font-semibold">{result.earlier.status}</p></div>
        <div><p className="text-muted-foreground">当前轮状态</p><p className="mt-1 font-semibold">{result.later.status}</p></div>
        <div><p className="text-muted-foreground">前一轮评估</p><p className="mt-1 font-semibold">{scoreLabel(result.beforeScore,result.beforeScoreMode)}</p></div>
        <div><p className="text-muted-foreground">当前轮评估</p><p className="mt-1 font-semibold">{scoreLabel(result.afterScore,result.afterScoreMode)}</p></div>
      </div>
      {(result.beforeScore!==null || result.afterScore!==null) && <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {[
          {name:"基准评分",score:result.beforeScore,mode:result.beforeScoreMode},
          {name:"当前评分",score:result.afterScore,mode:result.afterScoreMode},
        ].map(item=><div key={item.name} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{item.name}</span>
            <span className="text-muted-foreground">{scoreLabel(item.score,item.mode)}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
            role="meter" aria-label={item.name} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={item.score===null?undefined:Math.min(100,Math.max(0,item.score))}>
            {item.score!==null&&<div className="h-full rounded-full bg-primary"
              style={{width:Math.min(100,Math.max(0,item.score))+"%"}}/>}
          </div>
        </div>)}
      </div>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {name:"工具结果次数",a:result.earlier.toolResultCount,b:result.later.toolResultCount,unit:" 次"},
          {name:"模型请求次数",a:result.earlier.modelCalls,b:result.later.modelCalls,unit:" 次"},
          {name:"运行耗时",a:result.earlier.durationSeconds,b:result.later.durationSeconds,unit:" 秒"},
          {name:"估算提示+输出字符",a:result.earlier.estimatedChars,b:result.later.estimatedChars,unit:" 字符"},
        ].map(item=><div key={item.name} className="rounded-xl border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">{item.name}</p>
          <p className="mt-2 text-sm font-semibold">{formatMetric(item.a,item.unit)}
            <ArrowRightLeft className="mx-1 inline h-3.5 w-3.5 text-muted-foreground"/>
            {formatMetric(item.b,item.unit)}
          </p>
        </div>)}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
        运行耗时按首尾状态事件计算，不包含之后的反馈时间；字符数是执行记录估计，不是供应商实际 Token 计费。
        实际 API 账单、工具收费和总成本尚无可靠数据，不能据此声称节省费用。
      </p>
      {result.scoreDifference!==null&&<p className="mt-2 text-xs text-muted-foreground">
        记录中的评分变化：{result.scoreDifference>0?"+":""}{result.scoreDifference} 分；
        {result.beforeScoreMode!==result.afterScoreMode
          ?" 两轮评分方法不同，分数不可直接作为同口径改善证据。"
          :" 仅表示该评分体系的数值变化，不代表客观任务质量一定改善。"}
      </p>}
      {result.feedback&&<div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
        <p className="text-xs font-semibold">基准运行的用户反馈</p>
        <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
          {result.feedback.rating==="down"?"不满意":"满意"}
          {result.feedback.tags?.length?" · "+result.feedback.tags.join("、"):""}
          {result.feedback.comment?" · "+result.feedback.comment:""}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">显示的是历史反馈记录，方案差异不一定全部由此条反馈造成。</p>
      </div>}
      <details className="mt-3 rounded-xl border border-border bg-background p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <GitCompareArrows className="h-4 w-4 text-primary"/>
          已保存的 Agent 配置变化 · {result.hasSnapshots?result.changes.length:"不可比较"} 项
        </summary>
        {!result.hasSnapshots?<p className="mt-3 text-xs text-muted-foreground">历史配置快照缺失，不能推断该版本改了什么。</p>:
          result.changes.length===0?<p className="mt-3 text-xs text-muted-foreground">
            两次运行的可比较 Agent 配置相同；结果波动可能来自任务指令、工具、模型或外部环境。
          </p>:<ul className="mt-3 space-y-3">
            {result.changes.map(change=><li key={change.key} className="rounded-lg border border-border bg-secondary/35 p-3 text-xs">
              <p className="font-semibold">{change.label}</p>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <div className="min-w-0 rounded-md bg-background p-2">
                  <p className="font-medium text-muted-foreground">之前</p>
                  <p className="mt-1 break-all whitespace-pre-wrap">{change.before}</p>
                </div>
                <div className="min-w-0 rounded-md border border-primary/20 bg-primary/5 p-2">
                  <p className="font-medium text-primary">之后</p>
                  <p className="mt-1 break-all whitespace-pre-wrap">{change.after}</p>
                </div>
              </div>
            </li>)}
          </ul>}
      </details>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link to={"/run-detail?run="+encodeURIComponent(before.id)}
          className="font-semibold text-primary hover:underline">查看基准运行与证据</Link>
        <Link to={"/run-detail?run="+encodeURIComponent(run.id)}
          className="font-semibold text-primary hover:underline">查看当前运行与证据</Link>
      </div>
    </>}
  </section>
}
