import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeKnowledge,KnowledgeEmbeddingConsent,KnowledgeEmbeddingSettings} from "@/lib/pgNativePilotApi"
import {createKnowledgeQuerySession,queryStillRunning,type KnowledgeQueryRequest,type KnowledgeQueryResult} from "@/lib/pgNativeKnowledgeQuerySession"
import {QUERY_CHARGE_ACKNOWLEDGEMENT} from "../../../services/pg-api/src/knowledge-query-contracts"
import {semanticButton as button,semanticField as field,semanticError} from "./pgNativeKnowledgeSemanticUi"

const retrievalNames={lexical:"关键词",semantic:"语义",hybrid:"混合"} as const
const explanations:Record<string,string>={query_charge_not_confirmed:"未逐次确认费用，本次使用关键词检索。",not_configured:"本人尚未配置可用向量模型，本次使用关键词检索。",
  query_not_authorized:"本人尚未授权查询费用，本次使用关键词检索。",not_indexed:"尚无可用语义索引，本次使用关键词检索。",
  provider_error:"向量服务未能返回可用结果，本次使用关键词检索。",dimensions_changed:"模型返回的维度与已有索引不兼容，本次使用关键词检索。",
  partial:"部分内容尚未完成索引，或部分共享资料仅允许关键词检索。"}
export function KnowledgeSemanticResults({result}:{result:KnowledgeQueryResult}){
  return <div className="space-y-3">
    <p role="status" className="text-sm">本次检索方式：{retrievalNames[result.retrieval]} · 返回 {result.items.length} 条</p>
    {explanations[result.semantic_status]&&<p className="text-sm text-amber-900">{explanations[result.semantic_status]}</p>}
    {result.retrieval!=="lexical"&&<p className="text-xs text-slate-600">语义索引覆盖 {result.semantic_indexed} / {result.semantic_total} 段。{result.shared_semantic_used?"已使用获授权的共享语义索引。":""}</p>}
    {result.candidate_limit_reached&&<p className="text-sm text-amber-900">已达到本次候选范围上限，可缩小知识库范围或调整查询。</p>}
    {!result.items.length&&<p role="status" className="text-sm text-slate-500">没有找到符合当前权限的匹配内容。</p>}
    <ul aria-label="语义查询结果" className="space-y-2">{result.items.map(hit=><li key={hit.base_id+":"+hit.chunk_id} className="rounded-xl bg-slate-50 p-3 text-sm">
      <p className="break-words font-medium">{hit.citation}</p><p className="whitespace-pre-wrap break-words">{hit.text}</p>
    </li>)}</ul>
  </div>
}
type Api=ReturnType<typeof createPgNativePilotApi>
type Metadata={settings:KnowledgeEmbeddingSettings;consent:KnowledgeEmbeddingConsent}
export default function PgNativeKnowledgeQueryPanel({api,bases,active,enabled,queryAllowed,settingsVersion,onExpired}:{
  api:Api;bases:PgNativeKnowledge[];active:boolean;enabled:boolean;queryAllowed:boolean;settingsVersion:number;onExpired:()=>void
}){
  const [session]=useState(()=>createKnowledgeQuerySession(api))
  const [view,setView]=useState(()=>session.snapshot())
  const [metadata,setMetadata]=useState<Metadata|null>(null),[loading,setLoading]=useState(false)
  const [selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(""),[mode,setMode]=useState<NonNullable<KnowledgeQueryRequest["mode"]>>("lexical")
  const [paid,setPaid]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const life=useRef(0),metadataRead=useRef(0)
  useEffect(()=>()=>{life.current++;metadataRead.current++;session.reset()},[session])
  const report=useCallback((err:unknown)=>{if((err as {status?:number})?.status===401){session.reset();onExpired()}else setError(semanticError(err))},[onExpired,session])
  const loadMetadata=useCallback(async()=>{
    const ticket=++metadataRead.current,epoch=life.current
    setLoading(true);setMetadata(null);setPaid(false);session.hideResults();setView(session.snapshot())
    try{
      const [settings,consent]=await Promise.all([api.getKnowledgeEmbeddingSettings(),api.getKnowledgeEmbeddingConsent()])
      if(epoch===life.current&&ticket===metadataRead.current)setMetadata({settings,consent})
    }catch(err){if(epoch===life.current&&ticket===metadataRead.current)report(err)}
    finally{if(epoch===life.current&&ticket===metadataRead.current)setLoading(false)}
  },[api,report,session])
  const recover=useCallback(async(retry=false)=>{
    if(!active||!enabled||!queryAllowed||session.snapshot().busy||!session.snapshot().requestId)return
    const epoch=life.current;setError("");setNotice("")
    try{
      const task=retry?session.retry():session.recover();setView(session.snapshot())
      const result=await task
      if(epoch===life.current&&!result.stale&&!result.found)setNotice("暂未查到回执。可手动重试同一请求，仍保留原查询和原费用确认。")
    }catch(err){if(epoch===life.current)report(err)}finally{if(epoch===life.current)setView(session.snapshot())}
  },[active,enabled,queryAllowed,report,session])
  useEffect(()=>{
    if(active&&enabled&&queryAllowed){void loadMetadata();if(session.snapshot().requestId)void recover()}
    else{metadataRead.current++;session.hideResults();setView(session.snapshot());setMetadata(null);setPaid(false);setLoading(false)}
  },[active,enabled,loadMetadata,queryAllowed,recover,session,settingsVersion])
  useEffect(()=>{
    if(!active||!enabled||!queryAllowed||!view.requestId)return
    let alive=true,timer:ReturnType<typeof setTimeout>|undefined,attempts=0
    const tick=async()=>{
      if(!alive||!queryStillRunning(session.snapshot().receipt)||attempts>=30)return
      attempts++;await recover()
      if(alive&&queryStillRunning(session.snapshot().receipt))timer=setTimeout(()=>void tick(),2000)
    }
    timer=setTimeout(()=>void tick(),2000)
    return ()=>{alive=false;if(timer)clearTimeout(timer)}
  },[active,enabled,queryAllowed,recover,session,view.requestId])
  useEffect(()=>{
    if(!active||!enabled||!queryAllowed)return
    const hide=()=>{session.hideResults();setView(session.snapshot());setPaid(false)}
    const focus=()=>{void loadMetadata();if(session.snapshot().requestId)void recover()}
    const visibility=()=>{if(document.visibilityState==="hidden")hide();else focus()}
    window.addEventListener("blur",hide);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility)
    return ()=>{window.removeEventListener("blur",hide);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility)}
  },[active,enabled,loadMetadata,queryAllowed,recover,session])
  const locked=!active||!enabled||!queryAllowed||loading||view.locked
  const unavailable=selected.filter(id=>!bases.some(base=>base.id===id))
  const canPay=metadata?.consent.profile_valid===true&&metadata.consent.query_enabled===true&&metadata.consent.profile_id!==null
  const needsPaid=mode==="semantic"||mode==="hybrid"
  function edit(){setPaid(false);setNotice("");session.hideResults();setView(session.snapshot())}
  async function submit(event:FormEvent){
    event.preventDefault()
    if(locked||!selected.length||unavailable.length||!query.trim()||query.trim().length>300||(needsPaid&&!paid)||paid&&!canPay)return
    const epoch=life.current
    const request:KnowledgeQueryRequest={request_id:crypto.randomUUID(),base_ids:[...selected],query:query.trim(),mode,limit:8}
    if(paid&&metadata?.consent.profile_id)Object.assign(request,{profile_id:metadata.consent.profile_id,profile_revision:metadata.consent.profile_revision,
      consent_revision:metadata.consent.revision,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT})
    setError("");setNotice("");setPaid(false)
    try{const task=session.start(request);setView(session.snapshot());await task}
    catch(err){if(epoch===life.current)report(err)}finally{if(epoch===life.current)setView(session.snapshot())}
  }
  const receipt=view.receipt
  return <section aria-label="语义与混合查询" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold">语义与混合查询</h2>
    <p className="text-sm leading-6 text-slate-600">查询默认使用免费关键词。语义或混合查询复用所有者索引，使用本人模型和密钥，只将查询文字发送给向量服务。</p>
    {!queryAllowed&&<p role="status" className="text-sm text-slate-500">管理员尚未开放语义查询，可继续使用知识库原有的关键词搜索。</p>}
    {!queryAllowed&&view.requestId&&<p role="status" className="text-sm text-amber-900">已保留此前查询回执，恢复权限后可核对。{view.paidIntent?"此前提交可能已产生提供商费用。":""}</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{notice}</p>}
    {loading&&<p role="status" className="text-sm text-slate-500">正在读取本人查询授权…</p>}
    {queryAllowed&&<>
      <button type="button" className={button} disabled={!active||!enabled||loading||view.busy} onClick={()=>{void loadMetadata();if(view.requestId)void recover()}}>刷新本人查询授权与结果</button>
      <form onSubmit={event=>void submit(event)} className="space-y-3">
        <fieldset disabled={locked} className="space-y-3">
          <legend className="text-sm font-semibold">选择查询范围（最多 10 个知识库）</legend>
          <div className="grid gap-2 sm:grid-cols-2">{bases.map(base=><label key={base.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(base.id)} disabled={locked||selected.length>=10&&!selected.includes(base.id)} onChange={event=>{
            const checked=event.target.checked;setSelected(current=>checked?[...current,base.id]:current.filter(id=>id!==base.id));edit()
          }}/>{base.name}</label>)}</div>
          {!bases.length&&<p className="text-sm text-slate-500">暂无本人或获授权的知识库。</p>}
          {unavailable.map(id=><label key={id} className="flex gap-2 text-sm text-amber-900"><input type="checkbox" checked disabled={locked} onChange={()=>{setSelected(current=>current.filter(value=>value!==id));edit()}}/>不可用知识库 {id}（取消选择后可继续）</label>)}
          <label className="block text-sm">查询内容<textarea required maxLength={300} rows={3} className={field} value={query} onChange={event=>{setQuery(event.target.value);edit()}}/></label>
          <label className="block text-sm">查询方式<select className={field} value={mode} onChange={event=>{setMode(event.target.value as typeof mode);edit()}}>
            <option value="lexical">关键词（免费）</option><option value="auto">自动（未确认费用时使用关键词）</option><option value="semantic">语义</option><option value="hybrid">混合</option>
          </select></label>
          {mode!=="lexical"&&<>
            <p className="text-sm text-slate-600">当前本人向量模型：{metadata?.settings.model_name||"尚未配置"}。{canPay?"已授权查询费用。":"请先在语义设置中配置模型并授权查询费用。"}</p>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={paid} disabled={locked||!canPay} onChange={event=>setPaid(event.target.checked)}/>同意仅为本次查询支付本人模型的提供商费用</label>
            {mode==="auto"&&!paid&&<p className="text-xs text-slate-500">未确认本次费用时，只执行关键词检索。</p>}
          </>}
          <button type="submit" className={button} disabled={locked||!selected.length||!!unavailable.length||!query.trim()||needsPaid&&(!paid||!canPay)}>{view.requestId?"提交新查询":"提交查询"}</button>
        </fieldset>
      </form>
      {view.requestId&&<div className="space-y-2 rounded-xl border border-slate-100 p-3 text-sm" aria-label="查询回执">
        <p className="break-all text-xs text-slate-500">查询回执：{view.requestId}</p>
        {(view.uncertain||queryStillRunning(receipt))&&<p role="status">{view.uncertain?"提交结果待确认，请先核对回执。":"查询处理中，页面只读取状态，不重复提交。"}</p>}
        {receipt?.billing_may_have_occurred&&<p className="text-amber-900">本次查询可能已产生提供商费用。</p>}
        {receipt?.status==="unknown"&&<p role="status" className="text-amber-900">提供商请求结果不明，不会自动重试。新查询仍需另行确认费用。</p>}
        {receipt?.status==="expired"&&<p role="status">本次回执已过期，旧片段不再提供。再次提交将建立新查询。</p>}
        {(receipt?.status==="unavailable"||receipt?.status==="rejected")&&<p role="status">当前权限、配置或内容已变化，原结果不再提供。</p>}
        <button type="button" className={button} disabled={!active||!enabled||view.busy} onClick={()=>void recover()}>核对查询回执</button>{" "}
        {view.canRetry&&<button type="button" className={button} disabled={view.busy} onClick={()=>void recover(true)}>重试同一查询请求</button>}
      </div>}
      {receipt?.result&&<KnowledgeSemanticResults result={receipt.result}/>}
    </>}
  </section>
}
