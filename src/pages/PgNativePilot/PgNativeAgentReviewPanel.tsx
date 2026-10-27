import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeFeedbackStatus,type PgNativeModelConnection} from "@/lib/pgNativePilotApi"
import {createPgNativeAgentReviewSession,emptyAgentReviewView} from "@/lib/pgNativeAgentReviewSession"
import type {PgNativeAgentReviewPurpose,PgNativeAgentReviewSelection,PgNativeAgentReviewView} from "@/lib/pgNativeAgentReview"

type Controller=ReturnType<typeof createPgNativeAgentReviewSession>
type Props={api:ReturnType<typeof createPgNativePilotApi>;ownerId:string;specId:string|null;runId:string|null;runStatus:string;connections:PgNativeModelConnection[];active:boolean;available:boolean;submitEnabled:boolean;onExpired:()=>void}
const button="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
const primary="inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
const endpoints={openai:"https://api.openai.com/v1",anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"}
const purposeLabels={evaluate:"任务评估",optimize:"角色优化建议"}
const jobLabels={pending:"有效",cancelled:"已取消后续处理",erased:"正文已删除"}
const leaseLabels={claimed:"已领取",reserved:"已保留调用记录",paused:"已暂停",succeeded:"已完成并记录结果",failed:"生成失败",unknown:"调用结果不确定"}
const resultLabels={succeeded:"成功结果已记录",failed:"失败结果已记录",unknown:"调用结果不确定"}
const descriptiveLabels={goal:"目标",task_scope:"任务范围",deliverables:"交付物",task_plan:"任务计划",done_criteria:"完成标准"}
const outputLimits=[2048,4096,8192,16384] as const
const validModelId=/^[A-Za-z0-9._:/-]{1,120}$/

function GeneratedOpinion({review}:{review:PgNativeAgentReviewView}){
  if(!review.available||!review.result)return null
  const result=review.result
  if("score" in result)return <div aria-label="AI 任务评估结果" className="space-y-4">
    <p className="text-sm font-medium">综合评分 <span className="ml-2 text-2xl font-semibold tabular-nums text-indigo-700">{result.score}</span><span className="ml-1 text-slate-500">/ 100</span></p>
    <dl className="grid gap-3 sm:grid-cols-2">{result.dimensions.map(item=><div key={item.name} className="min-w-0 rounded-xl bg-slate-50 p-3"><dt className="text-sm font-medium">{item.name} · {item.score} / 100</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.comment}</dd></div>)}</dl>
    <div><h5 className="text-sm font-medium">改进建议</h5>{result.suggestions.length?<ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">{result.suggestions.map((item,index)=><li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul>:<p className="mt-1 text-sm text-slate-500">此结果未列出额外建议。</p>}</div>
    <p className="text-xs leading-5 text-slate-500">以上是模型意见，任务执行和审批状态请以实际任务记录为准。</p>
  </div>
  return <div aria-label="AI 角色优化建议" className="space-y-4">
    <p className="text-sm leading-6 text-slate-600">以下建议仅供阅读。需要修改角色时，请另行核对并手工修改。</p>
    {Object.entries(descriptiveLabels).map(([key,label])=>{
      const value=result.descriptive[key as keyof typeof descriptiveLabels]
      if(value===undefined)return null
      return <div key={key} className="min-w-0 space-y-1"><h5 className="text-xs font-semibold text-slate-500">{label}</h5>{typeof value==="string"?<p className="whitespace-pre-wrap break-words text-sm leading-6">{value||"未填写"}</p>:value.length?<ol className="list-decimal space-y-2 pl-5 text-sm leading-6">{value.map((item,index)=><li key={index} className="whitespace-pre-wrap break-words">{item||"空项"}</li>)}</ol>:<p className="text-sm text-slate-500">未列出项目。</p>}</div>
    })}
    <div><h5 className="text-xs font-semibold text-slate-500">工具建议说明</h5><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{result.tools_note||"未补充工具说明"}</p></div>
    <div><h5 className="text-xs font-semibold text-slate-500">建议依据</h5><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{result.rationale}</p></div>
  </div>
}

export default function PgNativeAgentReviewPanel({api,ownerId,specId,runId,runStatus,connections,active,available,submitEnabled,onExpired}:Props){
  const controller=useRef<Controller|null>(null),selectedTarget=useRef(""),selectedScope=useRef("")
  const [view,setView]=useState(emptyAgentReviewView),[opened,setOpened]=useState(false)
  const [purpose,setPurpose]=useState<PgNativeAgentReviewPurpose>("evaluate"),[connectionId,setConnectionId]=useState(""),[modelId,setModelId]=useState("")
  const [outputLimit,setOutputLimit]=useState<PgNativeAgentReviewSelection["output_token_limit"]>(2048),[selectedFeedback,setSelectedFeedback]=useState(false)
  const [feedback,setFeedback]=useState<PgNativeFeedbackStatus|null>(null),[feedbackLoading,setFeedbackLoading]=useState(false),[feedbackError,setFeedbackError]=useState("")
  const [feeConsent,setFeeConsent]=useState(""),[controlIntent,setControlIntent]=useState<{action:"cancel"|"erase";scope:string;confirmed:boolean}|null>(null),[readId,setReadId]=useState("")
  const feedbackReads=useRef({ticket:0}),pending=Boolean(view.pending),finished=["succeeded","failed","cancelled"].includes(runStatus)
  useEffect(()=>{
    const current=createPgNativeAgentReviewSession(api,{onExpired}),fence=feedbackReads.current;controller.current=current;selectedTarget.current="";selectedScope.current=""
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    return()=>{fence.ticket++;unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setScopes({available,submit:submitEnabled})},[available,submitEnabled,api,onExpired])
  useEffect(()=>{controller.current?.setActive(active&&opened)},[active,opened,api,onExpired])
  const eligible=connections.filter(item=>item.owner_user_id===ownerId&&item.enabled&&item.status==="ok"&&item.base_url===endpoints[item.provider]&&Number.isSafeInteger(item.revision)&&item.revision>=1&&item.revision<=Number.MAX_SAFE_INTEGER-2&&item.models.some(model=>validModelId.test(model)))
  const connection=eligible.find(item=>item.id===connectionId),validModel=Boolean(validModelId.test(modelId)&&connection?.models.includes(modelId)),modelScope=connection?connection.id+":"+connection.revision+":"+modelId:""
  // Invalidate before the selection effect starts a source read, so a model or
  // scope change cannot accidentally fence the replacement source request.
  useEffect(()=>{controller.current?.invalidatePreview()},[modelScope,outputLimit,active,available,submitEnabled,runId,specId,purpose,api,onExpired])
  useEffect(()=>{
    if(!active||!opened||!available){selectedScope.current="";return}
    if(pending)return
    const target=finished&&runId&&specId?{purpose,run_id:runId,spec_id:specId}:null,key=target?purpose+":"+specId+":"+runId:""
    const scope=key+":"+submitEnabled
    if(selectedScope.current===scope)return
    const changed=selectedTarget.current!==key
    selectedScope.current=scope;selectedTarget.current=key
    if(changed||!target)void controller.current?.select(target)
    else void controller.current?.refresh()
  },[active,opened,available,submitEnabled,pending,finished,runId,specId,purpose,api,onExpired])
  const invalidate=()=>{setFeeConsent("");setControlIntent(null);controller.current?.invalidatePreview()}
  const loadFeedback=useCallback(async()=>{
    const fence=feedbackReads.current,ticket=++fence.ticket,current=controller.current
    if(!current)return
    setFeedback(null);setSelectedFeedback(false);setFeeConsent("");setFeedbackError("")
    if(!active||!opened||!available||!finished||!runId||!specId||purpose!=="optimize"||pending){setFeedbackLoading(false);return}
    setFeedbackLoading(true)
    try{
      const value=await api.getAgentFeedback(runId)
      if(ticket!==fence.ticket||controller.current!==current)return
      if(value.run_id!==runId||value.spec_id!==specId)throw new Error("review_feedback_scope_changed")
      setFeedback(value)
    }catch(error){
      if(ticket!==fence.ticket||controller.current!==current)return
      if(error instanceof PgNativePilotError&&error.status===401){onExpired();return}
      setFeedbackError("当前反馈暂无法核对，请重新读取。")
    }finally{if(ticket===fence.ticket&&controller.current===current)setFeedbackLoading(false)}
  },[api,onExpired,active,opened,available,finished,runId,specId,purpose,pending])
  useEffect(()=>{
    const fence=feedbackReads.current,ticket=++fence.ticket,current=controller.current
    // Schedule the asynchronous read only while this exact setup is current;
    // StrictMode cleanup and employee/target changes cancel the queued read.
    void Promise.resolve().then(()=>{if(ticket===fence.ticket&&controller.current===current)void loadFeedback()})
    return()=>{fence.ticket++}
  },[loadFeedback])
  const targetMatches=view.target?.run_id===runId&&view.target?.spec_id===specId&&view.target?.purpose===purpose
  const currentFeedback=feedback?.run_id===runId&&feedback.spec_id===specId&&feedback.state==="active"&&feedback.current?.body?feedback.current:null
  const feedbackSources=purpose==="optimize"&&selectedFeedback&&currentFeedback&&runId?[{run_id:runId,feedback_id:currentFeedback.feedback_id,feedback_sha256:currentFeedback.feedback_sha256}]:[]
  const candidate=view.preview,choice=candidate?.choice
  const preview=targetMatches&&choice&&connection&&validModel&&choice.model_binding.connection_id===connection.id&&choice.model_binding.connection_revision===connection.revision&&choice.model_binding.model_id===modelId&&choice.output_token_limit===outputLimit&&choice.feedback_sources.length===feedbackSources.length&&choice.feedback_sources.every((item,index)=>item.feedback_id===feedbackSources[index]?.feedback_id&&item.feedback_sha256===feedbackSources[index]?.feedback_sha256&&item.run_id===feedbackSources[index]?.run_id)?candidate:null
  const previewScope=preview?preview.input_sha256+":"+preview.content_sha256+":"+preview.owner_epoch:""
  const consentScope=previewScope&&active&&available&&submitEnabled?previewScope+":"+modelScope+":"+purpose+":"+runId+":"+specId:"",feeConfirmed=Boolean(consentScope&&feeConsent===consentScope)
  if(!active||!available||!finished&&!pending)return null
  const locked=view.busy||view.loading||pending,selectionReady=targetMatches&&Boolean(view.source)&&validModel&&(purpose==="evaluate"||feedbackSources.length>0)
  const review=targetMatches?view.review:null,receipt=targetMatches?view.receipt:null
  const job=review?.execution.job_state??receipt?.state,bodyErased=review?.body_erased??receipt?.body_erased??false
  const selectedId=review?.request.request_id??receipt?.request_id??null
  const controlScope=[selectedId,job,bodyErased,review?.available,review?.execution.lease_state,review?.execution.outcome?.status,view.source?.expected_source_sha256,modelScope,outputLimit,purpose,runId,specId,previewScope,active,available,submitEnabled].join(":")
  const controlFor=controlIntent?.scope===controlScope?controlIntent.action:null,controlConfirmed=Boolean(controlFor&&controlIntent?.confirmed)
  const setControlFor=(action:"cancel"|"erase"|null)=>setControlIntent(action?{action,scope:controlScope,confirmed:false}:null)
  const setControlConfirmed=(confirmed:boolean)=>setControlIntent(previous=>previous?{...previous,confirmed}:null)
  const prepare=async(event:FormEvent)=>{
    event.preventDefault();if(locked||!selectionReady||!connection)return
    setFeeConsent("")
    await controller.current?.prepare({model_binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:modelId},output_token_limit:outputLimit,feedback_sources:feedbackSources})
  }
  const refresh=()=>{invalidate();void controller.current?.refresh();if(purpose==="optimize")void loadFeedback()}
  return <section aria-label="AI 任务评估与优化建议" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <div><h3 className="font-semibold">AI 任务评估与优化建议</h3><p className="mt-2 text-sm leading-6 text-slate-500">选择独立模型评估已结束的任务，或根据本人选定的反馈生成角色优化建议。预览后再确认本次模型费用。</p></div>
    {!opened?<button type="button" className={button} onClick={()=>setOpened(true)}>查看与准备 AI 意见</button>:<>
      {view.error?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{view.error}</p>:null}
      {view.notice?<p role="status" className="text-sm leading-6 text-emerald-800">{view.notice}</p>:null}
      {view.loading||view.busy?<p role="status" className="text-sm text-slate-500">正在核对请求与当前来源…</p>:null}
      {!submitEnabled?<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">当前未开放新意见提交。仍可核对原请求、读取已有意见、取消后续处理或删除正文。</p>:null}
      <form onSubmit={prepare} className="space-y-4">
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">选择 AI 意见来源与独立模型</legend>
          <label className="block text-sm font-medium">意见用途<select aria-label="AI 意见用途" className={field} value={purpose} onChange={event=>{invalidate();setPurpose(event.target.value as PgNativeAgentReviewPurpose);setSelectedFeedback(false)}}><option value="evaluate">任务评估</option><option value="optimize">角色优化建议</option></select></label>
          <label className="block text-sm font-medium">独立模型连接<select aria-label="AI 意见模型连接" className={field} value={connectionId} onChange={event=>{invalidate();setConnectionId(event.target.value);setModelId("")}}><option value="">请选择已测试的本人连接</option>{eligible.map(item=><option key={item.id} value={item.id}>{item.name} · {item.provider} · 版本 {item.revision}</option>)}</select></label>
          <label className="block text-sm font-medium">评审模型<select aria-label="AI 意见模型" className={field} value={modelId} disabled={locked||!connection} onChange={event=>{invalidate();setModelId(event.target.value)}}><option value="">请选择模型</option>{connection?.models.filter(item=>validModelId.test(item)).map(item=><option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block text-sm font-medium">输出上限<select aria-label="AI 意见输出上限" className={field} value={outputLimit} onChange={event=>{invalidate();setOutputLimit(Number(event.target.value) as PgNativeAgentReviewSelection["output_token_limit"])}}>{outputLimits.map(limit=><option key={limit} value={limit}>{limit.toLocaleString()} tokens</option>)}</select></label>
        </fieldset>
        {!eligible.length?<p className="text-sm leading-6 text-slate-500">请先在模型连接中配置并测试本人连接。评审模型的选择会独立保存，不会改变角色的模型绑定。</p>:<p className="text-xs leading-5 text-slate-500">本次评审模型独立于角色运行模型，不会修改角色配置。</p>}
        {purpose==="optimize"?<div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">选择本人当前反馈</h4><button type="button" className={button} disabled={locked||feedbackLoading} onClick={()=>{invalidate();void loadFeedback()}}>重新读取反馈</button></div>
          {feedbackLoading?<p role="status" className="text-sm text-slate-500">正在读取当前反馈…</p>:null}
          {feedbackError?<p role="alert" className="text-sm text-rose-800">{feedbackError}</p>:null}
          {currentFeedback?<label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1.5" aria-label="选用本次任务的当前反馈" disabled={locked||feedbackLoading} checked={selectedFeedback} onChange={event=>{invalidate();setSelectedFeedback(event.target.checked)}}/><span className="min-w-0"><span className="block font-medium">选用本次任务的当前反馈 · {currentFeedback.body!.rating==="up"?"满意":"需要改进"}</span><span className="mt-1 block whitespace-pre-wrap break-words text-slate-600">{currentFeedback.body!.comment||"未填写补充意见"}</span></span></label>:!feedbackLoading?<p className="text-sm leading-6 text-slate-500">当前没有可选用的有效反馈，请先在任务反馈中提交或核对。</p>:null}
          <p className="text-xs leading-5 text-slate-500">优化建议使用当前角色及你明确选择的反馈陈述，不发送旧任务正文。</p>
        </div>:<p className="text-xs leading-5 text-slate-500">任务评估会核对当前角色和本次任务交付来源，再准备评审输入。</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={locked||feedbackLoading||!selectionReady}>预览这次 AI 意见</button><button type="button" className={button} disabled={locked} onClick={refresh}>核对当前来源与状态</button></div>
      </form>
      {preview?<div aria-label="AI 意见安全预览" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
        <h4 className="text-sm font-semibold">确认本次{purposeLabels[purpose]}</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">所选模型</dt><dd className="break-words">{connection?.name} · {modelId}</dd></div><div><dt className="text-xs text-slate-500">当前角色版本</dt><dd>{preview.choice.expected_spec_revision}</dd></div><div><dt className="text-xs text-slate-500">输出上限</dt><dd>{preview.output_token_limit.toLocaleString()} tokens</dd></div><div><dt className="text-xs text-slate-500">已准备内容大小</dt><dd>{preview.byte_length.toLocaleString()} 字节{purpose==="optimize"?" · "+preview.choice.feedback_sources.length+" 条选定反馈":""}</dd></div></dl>
        <p className="text-sm leading-6 text-slate-600">预览尚未提交模型请求。确认后将提交本次意见，可能产生所选模型服务商的调用费用；实际金额以服务商计费为准。</p>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" aria-label="确认本次 AI 意见的模型费用" disabled={locked||!view.canSubmit||!submitEnabled} checked={feeConfirmed} onChange={event=>setFeeConsent(event.target.checked?consentScope:"")}/>我确认使用以上模型生成一次{purposeLabels[purpose]}，并同意可能产生的模型调用费用。</label>
        <button type="button" className={primary} disabled={locked||!view.canSubmit||!submitEnabled||!feeConfirmed} onClick={()=>{if(!locked&&view.canSubmit&&submitEnabled&&feeConfirmed&&preview){setFeeConsent("");void controller.current?.submit(true)}}}>确认费用并提交{purposeLabels[purpose]}</button>
      </div>:null}
      {view.pending?<div role="status" aria-label="待核对的原 AI 意见请求" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-medium">上次{view.pending.action==="submit"?"意见提交":view.pending.action==="cancel"?"取消":"正文删除"}结果尚未确认，原请求与原选择已保留。</p><p className="break-all text-xs">原任务编号：{view.pending.run_id}<br/>原请求编号：{view.pending.request_id}<br/>意见编号：{view.pending.review_id}</p>
        <p>先核对原请求。需要重交时仅发送完全相同的请求，不创建新意见。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy||view.loading} onClick={()=>void controller.current?.confirm()}>核对原请求</button><button type="button" className={button} disabled={view.busy||view.loading} onClick={()=>void controller.current?.retrySameRequest()}>重交完全相同的原请求</button></div>
      </div>:null}
      {selectedId?<div aria-label="AI 意见实际状态" className="space-y-4 rounded-xl border border-slate-200 p-4">
        <div><h4 className="text-sm font-semibold">本次意见记录</h4><p className="mt-1 break-all text-xs text-slate-500">意见编号：{selectedId}</p></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">请求控制状态</dt><dd className="mt-1">{review?jobLabels[review.execution.job_state]:receipt?"最近回执为「"+jobLabels[receipt.state]+"」，当前待核对":"尚未读取"}</dd></div><div><dt className="text-xs text-slate-500">执行记录</dt><dd className="mt-1">{!review?"执行状态待核对":review.execution.lease_state?leaseLabels[review.execution.lease_state]:"尚无领取记录"}</dd></div><div><dt className="text-xs text-slate-500">模型结果</dt><dd className="mt-1">{!review?"模型结果待核对":review.execution.outcome?resultLabels[review.execution.outcome.status]:"尚无已确认结果"}</dd></div></dl>
        <p className="text-xs leading-5 text-slate-500">回执表示请求已记录。取消、暂停或删除正文均不代表没有发生调用、没有费用或已经退款。</p>
        {review?.available?<GeneratedOpinion review={review}/>:<p role="status" className="text-sm leading-6 text-slate-600">{bodyErased?"本次意见的输入与结果正文已删除，历史请求和执行摘要保留。":!review?"结果正文尚未读取，或当前来源无法核对。请核对状态后继续。":review.execution.job_state==="cancelled"?"本次请求已取消，正文不再提供，历史执行摘要仍可核对。":review.execution.outcome?.status==="succeeded"?"已保留成功摘要，当前正文不可用。来源或身份权限变化后，需重新核对当前状态。":"当前没有可供读取的结果正文。可核对状态，结果不确定时请保留原请求继续确认。"}</p>}
        {!bodyErased&&!pending?<div className="space-y-3">
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked||job!=="pending"} onClick={()=>{setControlFor("cancel");setControlConfirmed(false)}}>取消后续处理</button><button type="button" className={button} disabled={locked||job==="erased"} onClick={()=>{setControlFor("erase");setControlConfirmed(false)}}>删除本次意见正文</button></div>
          {controlFor?<div role="group" aria-label="确认 AI 意见控制操作" className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm leading-6"><p>{controlFor==="erase"?"删除本次意见的输入与结果正文，保留请求及执行摘要。删除后无法恢复正文。":"取消这条请求的后续处理。已发出的调用和费用仍需按实际记录核对。"}</p><label className="flex items-start gap-2"><input type="checkbox" className="mt-1.5" aria-label={controlFor==="erase"?"确认删除本次 AI 意见正文":"确认取消本次 AI 意见后续处理"} disabled={locked} checked={controlConfirmed} onChange={event=>setControlConfirmed(event.target.checked)}/>我确认{controlFor==="erase"?"删除本次意见正文":"取消本次意见的后续处理"}。</label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked||!controlConfirmed} onClick={()=>{if(locked||!controlConfirmed||!controlFor)return;const action=controlFor;setControlFor(null);setControlConfirmed(false);setFeeConsent("");if(action==="erase")void controller.current?.erase(true);else void controller.current?.cancel(true)}}>{controlFor==="erase"?"确认删除正文":"确认取消后续处理"}</button><button type="button" className={button} disabled={locked} onClick={()=>{setControlFor(null);setControlConfirmed(false)}}>返回</button></div></div>:null}
        </div>:null}
      </div>:null}
      <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">读取已有的本人意见</summary><form className="mt-3 space-y-3" onSubmit={event=>{event.preventDefault();if(!locked){invalidate();void controller.current?.read(readId.trim())}}}><label className="block text-sm">本人意见编号<input className={field} aria-label="本人 AI 意见编号" autoComplete="off" spellCheck={false} required maxLength={36} pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}" value={readId} disabled={locked} onChange={event=>setReadId(event.target.value)}/></label><p className="text-xs leading-5 text-slate-500">读取时会核对当前员工、本任务、意见用途及有效来源。</p><button type="submit" className={button} disabled={locked||!readId.trim()}>读取本人意见与状态</button></form></details>
    </>}
  </section>
}
