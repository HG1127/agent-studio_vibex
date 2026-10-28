import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeFeedbackStatus,type PgNativeModelConnection} from "@/lib/pgNativePilotApi"
import {createPgNativeAgentReviewSession,emptyAgentReviewView} from "@/lib/pgNativeAgentReviewSession"
import {watchPgNativeOriginalTaskController} from "@/lib/pgNativeOwnTaskNavigation"
import type {PgNativeAgentReviewPurpose,PgNativeAgentReviewSelection,PgNativeAgentReviewView} from "@/lib/pgNativeAgentReview"
import type {PgNativeAgentReviewHistoryPage} from "@/lib/pgNativeAgentReviewHistory"
import PgNativeAgentGeneratedAcceptancePanel from "./PgNativeAgentGeneratedAcceptancePanel"
import PgNativeAgentDescriptivePatchPanel from "./PgNativeAgentDescriptivePatchPanel"
import {retainPgNativeAgentGeneratedSelection} from "@/lib/pgNativeAgentGeneratedAcceptanceSession"

type Controller=ReturnType<typeof createPgNativeAgentReviewSession>
type Props={api:ReturnType<typeof createPgNativePilotApi>;ownerId:string;specId:string|null;runId:string|null;runStatus:string;connections:PgNativeModelConnection[];active:boolean;available:boolean;submitEnabled:boolean;historyAvailable?:boolean;generatedAvailable?:boolean;generatedEnabled?:boolean;descriptivePatchAvailable?:boolean;descriptivePatchEnabled?:boolean;onAccepted?:()=>void;onExpired:()=>void}
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

function OpinionHistory({page,loading,error,selectedId,disabled,onRefresh,onOlder,onSelect}:{page:PgNativeAgentReviewHistoryPage|null;loading:boolean;error:string;selectedId:string|null;disabled:boolean;onRefresh:()=>void;onOlder:()=>void;onSelect:(id:string)=>void}){
  return <section aria-label="本人历史 AI 意见" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">本任务的 AI 意见历史</h4><button type="button" className={button} disabled={disabled||loading} onClick={onRefresh}>刷新意见历史</button></div>
    <p className="text-xs leading-5 text-slate-500">按所选任务和意见用途读取已保存的请求，每页最多 20 条。历史条目仅展示请求和正文控制状态快照，执行结果需另行读取核对。</p>
    {loading?<p role="status" className="text-sm text-slate-500">正在读取意见历史…</p>:null}
    {error?<p role="alert" className="text-sm leading-6 text-rose-800">{error}</p>:null}
    {!loading&&!error&&page&&!page.items.length?<p className="text-sm text-slate-500">本页暂无意见历史。</p>:null}
    {page?<><p className="text-xs text-slate-500">本页 {page.items.length} 条</p><ul className="space-y-2">{page.items.map(item=><li key={item.request.request_id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2"><time dateTime={item.request.created_at} className="text-xs text-slate-500">{new Date(item.request.created_at).toLocaleString("zh-CN")}</time><span className="text-xs">控制快照：{jobLabels[item.control.job_state]} · {item.control.body_erased?"正文已删除":"快照未标记擦除"}</span></div>
      <p className="break-all text-xs">意见编号：{item.request.request_id}</p><button type="button" className={button} aria-label={"读取历史意见 "+item.request.request_id} aria-pressed={selectedId===item.request.request_id} disabled={disabled||loading} onClick={()=>onSelect(item.request.request_id)}>选择并读取意见</button>
    </li>)}</ul><div className="flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={disabled||loading||!page.has_more} onClick={onOlder}>查看更早意见</button><p className="text-xs text-slate-500">{page.has_more?"可继续读取更早的一页，当前页将被替换。":"当前已到这组记录末尾。"}</p></div></>:null}
  </section>
}

function GeneratedOpinion({review,canPreviewAcceptance,canPreviewPatch=false}:{review:PgNativeAgentReviewView;canPreviewAcceptance:boolean;canPreviewPatch?:boolean}){
  if(!review.available||!review.result)return null
  const result=review.result
  if("score" in result)return <div aria-label="AI 任务评估结果" className="space-y-4">
    <p className="text-sm font-medium">综合评分 <span className="ml-2 text-2xl font-semibold tabular-nums text-indigo-700">{result.score}</span><span className="ml-1 text-slate-500">/ 100</span></p>
    <dl className="grid gap-3 sm:grid-cols-2">{result.dimensions.map(item=><div key={item.name} className="min-w-0 rounded-xl bg-slate-50 p-3"><dt className="text-sm font-medium">{item.name} · {item.score} / 100</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.comment}</dd></div>)}</dl>
    <div><h5 className="text-sm font-medium">改进建议</h5>{result.suggestions.length?<ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">{result.suggestions.map((item,index)=><li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul>:<p className="mt-1 text-sm text-slate-500">此结果未列出额外建议。</p>}</div>
    <p className="text-xs leading-5 text-slate-500">以上是模型意见，任务执行和审批状态请以实际任务记录为准。</p>
  </div>
  return <div aria-label="AI 角色优化建议" className="space-y-4">
    <p className="text-sm leading-6 text-slate-600">{canPreviewPatch?"以下是模型建议。可在下方核对模型实际提供的字段，并另行确认配置修改；未提供字段沿用当前值，模型费用确认不会自动接受建议。":canPreviewAcceptance?"以下是模型建议。完整五项描述可在下方另行预览并明确确认配置修改；模型费用确认不会自动接受建议。":"以下建议仅供阅读。需要修改角色时，请另行核对并手工修改。"}</p>
    {Object.entries(descriptiveLabels).map(([key,label])=>{
      const value=result.descriptive[key as keyof typeof descriptiveLabels]
      if(value===undefined)return null
      return <div key={key} className="min-w-0 space-y-1"><h5 className="text-xs font-semibold text-slate-500">{label}</h5>{typeof value==="string"?<p className="whitespace-pre-wrap break-words text-sm leading-6">{value||"未填写"}</p>:value.length?<ol className="list-decimal space-y-2 pl-5 text-sm leading-6">{value.map((item,index)=><li key={index} className="whitespace-pre-wrap break-words">{item||"空项"}</li>)}</ol>:<p className="text-sm text-slate-500">未列出项目。</p>}</div>
    })}
    <div><h5 className="text-xs font-semibold text-slate-500">工具建议说明</h5><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{result.tools_note||"未补充工具说明"}</p></div>
    <div><h5 className="text-xs font-semibold text-slate-500">建议依据</h5><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{result.rationale}</p></div>
  </div>
}

export default function PgNativeAgentReviewPanel({api,ownerId,specId,runId,runStatus,connections,active,available,submitEnabled,historyAvailable=false,generatedAvailable=false,generatedEnabled=false,descriptivePatchAvailable=false,descriptivePatchEnabled=false,onAccepted,onExpired}:Props){
  const controller=useRef<Controller|null>(null),selectedTarget=useRef(""),selectedScope=useRef(""),historyScope=useRef("")
  const [state,setState]=useState({api,ownerId,view:emptyAgentReviewView()}),[opened,setOpened]=useState(false)
  const view=state.api===api&&state.ownerId===ownerId?state.view:emptyAgentReviewView()
  const [patchLifetime,setPatchLifetime]=useState({api,ownerId,seen:descriptivePatchAvailable})
  const patchSeen=patchLifetime.api===api&&patchLifetime.ownerId===ownerId&&patchLifetime.seen
  if(patchLifetime.api!==api||patchLifetime.ownerId!==ownerId||descriptivePatchAvailable&&!patchSeen)setPatchLifetime({api,ownerId,seen:descriptivePatchAvailable||patchSeen})
  const [purpose,setPurpose]=useState<PgNativeAgentReviewPurpose>("evaluate"),[connectionId,setConnectionId]=useState(""),[modelId,setModelId]=useState("")
  const [selection,setSelection]=useState(()=>retainPgNativeAgentGeneratedSelection(null,{api,ownerId,specId,runId,purpose}))
  const generatedSelection=retainPgNativeAgentGeneratedSelection(selection,{api,ownerId,specId,runId,purpose})
  if(generatedSelection!==selection)setSelection(generatedSelection)
  const [outputLimit,setOutputLimit]=useState<PgNativeAgentReviewSelection["output_token_limit"]>(2048),[selectedFeedback,setSelectedFeedback]=useState(false)
  const [feedback,setFeedback]=useState<PgNativeFeedbackStatus|null>(null),[feedbackLoading,setFeedbackLoading]=useState(false),[feedbackError,setFeedbackError]=useState("")
  const [feeConsent,setFeeConsent]=useState(""),[controlIntent,setControlIntent]=useState<{action:"cancel"|"erase";scope:string;confirmed:boolean}|null>(null),[readId,setReadId]=useState("")
  const feedbackReads=useRef({ticket:0}),pending=Boolean(view.pending),finished=["succeeded","failed","cancelled"].includes(runStatus)
  useEffect(()=>{
    const current=createPgNativeAgentReviewSession(api,{onExpired}),fence=feedbackReads.current;controller.current=current;selectedTarget.current="";selectedScope.current="";historyScope.current=""
    const unsubscribe=current.subscribe(()=>{
      const next=current.snapshot();setState({api,ownerId,view:next})
      if(next.target)setSelection(previous=>retainPgNativeAgentGeneratedSelection(previous,{api,ownerId,specId:next.target!.spec_id,runId:next.target!.run_id,purpose:next.target!.purpose,reviewId:next.reviewId,request:next.selectedMetadata?.request??next.review?.request??next.receipt}))
    })
    const unwatch=watchPgNativeOriginalTaskController(api,current)
    return()=>{fence.ticket++;unwatch();unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,ownerId,onExpired])
  useEffect(()=>{controller.current?.setScopes({available,submit:submitEnabled,history:historyAvailable})},[available,submitEnabled,historyAvailable,api,ownerId,onExpired])
  useEffect(()=>{controller.current?.setActive(active&&opened)},[active,opened,api,ownerId,onExpired])
  const eligible=connections.filter(item=>item.owner_user_id===ownerId&&item.enabled&&item.status==="ok"&&item.base_url===endpoints[item.provider]&&Number.isSafeInteger(item.revision)&&item.revision>=1&&item.revision<=Number.MAX_SAFE_INTEGER-2&&item.models.some(model=>validModelId.test(model)))
  const connection=eligible.find(item=>item.id===connectionId),validModel=Boolean(validModelId.test(modelId)&&connection?.models.includes(modelId)),modelScope=connection?connection.id+":"+connection.revision+":"+modelId:""
  // Invalidate before the selection effect starts a source read, so a model or
  // scope change cannot accidentally fence the replacement source request.
  useEffect(()=>{controller.current?.invalidatePreview()},[modelScope,outputLimit,active,available,submitEnabled,historyAvailable,runId,specId,purpose,api,ownerId,onExpired])
  useEffect(()=>{
    if(!active||!opened||!available){selectedScope.current="";return}
    if(pending||view.busy)return
    const target=finished&&runId&&specId?{purpose,run_id:runId,spec_id:specId}:null,key=target?purpose+":"+specId+":"+runId:""
    // Every input that invalidates the shared read ticket must also restart
    // source admission, even when the owned target and submit scope stay put.
    const scope=key+":"+submitEnabled+":"+historyAvailable+":"+modelScope+":"+outputLimit
    if(selectedScope.current===scope)return
    const changed=selectedTarget.current!==key
    selectedScope.current=scope;selectedTarget.current=key
    if(changed||!target)void controller.current?.select(target)
    else void controller.current?.refresh()
  },[active,opened,available,submitEnabled,historyAvailable,pending,view.busy,finished,runId,specId,purpose,modelScope,outputLimit,api,ownerId,onExpired])
  const invalidate=()=>{setFeeConsent("");setControlIntent(null);controller.current?.invalidatePreview()}
  const loadFeedback=useCallback(async()=>{
    const fence=feedbackReads.current,ticket=++fence.ticket,current=controller.current
    if(!current||!ownerId)return
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
  },[api,ownerId,onExpired,active,opened,available,finished,runId,specId,purpose,pending])
  useEffect(()=>{
    const fence=feedbackReads.current,ticket=++fence.ticket,current=controller.current
    // Schedule the asynchronous read only while this exact setup is current;
    // StrictMode cleanup and employee/target changes cancel the queued read.
    void Promise.resolve().then(()=>{if(ticket===fence.ticket&&controller.current===current)void loadFeedback()})
    return()=>{fence.ticket++}
  },[loadFeedback])
  const targetMatches=view.target?.run_id===runId&&view.target?.spec_id===specId&&view.target?.purpose===purpose
  const historyTarget=targetMatches?purpose+":"+specId+":"+runId:""
  useEffect(()=>{
    if(!active||!opened||!available||!historyAvailable||!finished||!historyTarget){historyScope.current="";return}
    if(pending||view.busy)return
    if(historyScope.current===historyTarget)return
    historyScope.current=historyTarget;void controller.current?.refreshHistory()
  },[active,opened,available,historyAvailable,finished,historyTarget,pending,view.busy,api,ownerId,onExpired])
  const history=historyAvailable&&targetMatches&&view.history?.spec_id===specId&&view.history.run_id===runId&&view.history.purpose===purpose?view.history:null
  const metadata=targetMatches&&view.selectedMetadata?.request.request_id===view.reviewId&&view.selectedMetadata.request.run_id===runId&&view.selectedMetadata.request.spec_id===specId&&view.selectedMetadata.request.purpose===purpose?view.selectedMetadata:null
  const metadataScope=metadata?[metadata.request.request_id,metadata.request.request_sha256,metadata.control.job_state,metadata.control.body_erased].join(":"):""
  const currentFeedback=feedback?.run_id===runId&&feedback.spec_id===specId&&feedback.state==="active"&&feedback.current?.body?feedback.current:null
  const feedbackSources=purpose==="optimize"&&selectedFeedback&&currentFeedback&&runId?[{run_id:runId,feedback_id:currentFeedback.feedback_id,feedback_sha256:currentFeedback.feedback_sha256}]:[]
  const candidate=view.preview,choice=candidate?.choice
  const preview=targetMatches&&choice&&connection&&validModel&&choice.model_binding.connection_id===connection.id&&choice.model_binding.connection_revision===connection.revision&&choice.model_binding.model_id===modelId&&choice.output_token_limit===outputLimit&&choice.feedback_sources.length===feedbackSources.length&&choice.feedback_sources.every((item,index)=>item.feedback_id===feedbackSources[index]?.feedback_id&&item.feedback_sha256===feedbackSources[index]?.feedback_sha256&&item.run_id===feedbackSources[index]?.run_id)?candidate:null
  const previewScope=preview?preview.input_sha256+":"+preview.content_sha256+":"+preview.owner_epoch:""
  const consentScope=previewScope&&active&&available&&submitEnabled?previewScope+":"+modelScope+":"+purpose+":"+runId+":"+specId+":"+metadataScope:"",feeConfirmed=Boolean(consentScope&&feeConsent===consentScope)
  const showOpinion=active&&available&&(finished||pending)
  const locked=view.busy||view.loading||pending,selectionReady=targetMatches&&Boolean(view.source)&&validModel&&(purpose==="evaluate"||feedbackSources.length>0)
  const review=targetMatches&&view.review?.request.request_id===view.reviewId?view.review:null,receipt=targetMatches&&view.receipt?.request_id===view.reviewId?view.receipt:null
  const bodyErased=Boolean(review?.body_erased||metadata?.control.body_erased||receipt?.body_erased)
  const cancelled=review?.execution.job_state==="cancelled"||metadata?.control.job_state==="cancelled"||receipt?.state==="cancelled"
  const job=bodyErased?"erased":cancelled?"cancelled":review?.execution.job_state??metadata?.control.job_state??receipt?.state
  const selectedId=review?.request.request_id??metadata?.request.request_id??receipt?.request_id??null
  const controlScope=[selectedId,job,bodyErased,metadataScope,review?.available,review?.execution.lease_state,review?.execution.outcome?.status,view.source?.expected_source_sha256,modelScope,outputLimit,purpose,runId,specId,previewScope,active,available,submitEnabled,historyAvailable].join(":")
  const controlFor=controlIntent?.scope===controlScope?controlIntent.action:null,controlConfirmed=Boolean(controlFor&&controlIntent?.confirmed)
  const setControlFor=(action:"cancel"|"erase"|null)=>setControlIntent(action?{action,scope:controlScope,confirmed:false}:null)
  const setControlConfirmed=(confirmed:boolean)=>setControlIntent(previous=>previous?{...previous,confirmed}:null)
  const prepare=async(event:FormEvent)=>{
    event.preventDefault();if(locked||!selectionReady||!connection)return
    setFeeConsent("")
    await controller.current?.prepare({model_binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:modelId},output_token_limit:outputLimit,feedback_sources:feedbackSources})
  }
  const refresh=()=>{invalidate();void controller.current?.refresh();if(purpose==="optimize")void loadFeedback()}
  return <>{showOpinion?<section aria-label="AI 任务评估与优化建议" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <div><h3 className="font-semibold">AI 任务评估与优化建议</h3><p className="mt-2 text-sm leading-6 text-slate-500">选择独立模型评估已结束的任务，或根据本人选定的反馈生成角色优化建议。预览后再确认本次模型费用。</p></div>
    {!opened?<button type="button" className={button} onClick={()=>setOpened(true)}>查看与准备 AI 意见</button>:<>
      {view.error?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{view.error}</p>:null}
      {view.notice?<p role="status" className="text-sm leading-6 text-emerald-800">{view.notice}</p>:null}
      {view.loading||view.busy?<p role="status" className="text-sm text-slate-500">正在核对请求与当前来源…</p>:null}
      {!submitEnabled?<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">当前未开放新意见提交。仍可核对原请求、读取已有意见、取消后续处理或删除正文。</p>:null}
      {historyAvailable?<OpinionHistory page={history} loading={targetMatches&&view.historyLoading} error={targetMatches?view.historyError:""} selectedId={selectedId} disabled={!targetMatches||view.busy||pending}
        onRefresh={()=>void controller.current?.refreshHistory()} onOlder={()=>void controller.current?.loadMoreHistory()}
        onSelect={id=>{if(!targetMatches||view.pending||view.busy||view.historyLoading)return;setFeeConsent("");setControlIntent(null);void controller.current?.selectHistory(id)}}/>:null}
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
        {metadata?<section aria-label="AI 意见历史快照" className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm"><h5 className="font-medium">已选择的历史请求</h5><p className="break-all text-xs">意见编号：{metadata.request.request_id}</p><p className="text-xs text-slate-500">创建于 <time dateTime={metadata.request.created_at}>{new Date(metadata.request.created_at).toLocaleString("zh-CN")}</time></p><p>控制快照：{jobLabels[metadata.control.job_state]} · {metadata.control.body_erased?"正文已删除":"快照未标记擦除"}</p><p className="text-xs leading-5 text-slate-500">此快照保留原请求元数据，可用于明确取消或删除正文；执行状态和正文须单独核对。</p></section>:null}
        <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">请求控制状态</dt><dd className="mt-1">{review?jobLabels[job??review.execution.job_state]:metadata?"历史控制快照为「"+jobLabels[metadata.control.job_state]+"」，当前待核对":receipt?"最近回执为「"+jobLabels[receipt.state]+"」，当前待核对":"尚未读取"}</dd></div><div><dt className="text-xs text-slate-500">执行记录</dt><dd className="mt-1">{!review?"执行状态待核对":review.execution.lease_state?leaseLabels[review.execution.lease_state]:"尚无领取记录"}</dd></div><div><dt className="text-xs text-slate-500">模型结果</dt><dd className="mt-1">{!review?"模型结果待核对":review.execution.outcome?resultLabels[review.execution.outcome.status]:"尚无已确认结果"}</dd></div></dl>
        <p className="text-xs leading-5 text-slate-500">{metadata&&!receipt?"历史元数据保留原请求和控制快照，模型执行与正文可用性须另行核对。":"回执表示请求已记录。"}取消、暂停或删除正文均不代表没有发生调用、没有费用或已经退款。</p>
        {review?.available&&!bodyErased&&job==="pending"?<GeneratedOpinion review={review} canPreviewAcceptance={generatedAvailable} canPreviewPatch={descriptivePatchAvailable}/>:<p role="status" className="text-sm leading-6 text-slate-600">{bodyErased?"本次意见的输入与结果正文已删除，历史请求和执行摘要保留。":!review?metadata?"已找到原请求元数据，当前正文无法核对。仍可取消后续处理或删除正文。":"结果正文尚未读取，或当前来源无法核对。请核对状态后继续。":job==="cancelled"?"本次请求已取消，正文不再提供，历史执行摘要仍可核对。":review.execution.outcome?.status==="succeeded"?"已保留成功摘要，当前正文不可用。来源或身份权限变化后，需重新核对当前状态。":"当前没有可供读取的结果正文。可核对状态，结果不确定时请保留原请求继续确认。"}</p>}
        {!bodyErased&&!pending?<div className="space-y-3">
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked||job!=="pending"} onClick={()=>{setControlFor("cancel");setControlConfirmed(false)}}>取消后续处理</button><button type="button" className={button} disabled={locked||job==="erased"} onClick={()=>{setControlFor("erase");setControlConfirmed(false)}}>删除本次意见正文</button></div>
          {controlFor?<div role="group" aria-label="确认 AI 意见控制操作" className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm leading-6"><p>{controlFor==="erase"?"删除本次意见的输入与结果正文，保留请求及执行摘要。删除后无法恢复正文。":"取消这条请求的后续处理。已发出的调用和费用仍需按实际记录核对。"}</p><label className="flex items-start gap-2"><input type="checkbox" className="mt-1.5" aria-label={controlFor==="erase"?"确认删除本次 AI 意见正文":"确认取消本次 AI 意见后续处理"} disabled={locked} checked={controlConfirmed} onChange={event=>setControlConfirmed(event.target.checked)}/>我确认{controlFor==="erase"?"删除本次意见正文":"取消本次意见的后续处理"}。</label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked||!controlConfirmed} onClick={()=>{if(locked||!controlConfirmed||!controlFor)return;const action=controlFor;setControlFor(null);setControlConfirmed(false);setFeeConsent("");if(action==="erase")void controller.current?.erase(true);else void controller.current?.cancel(true)}}>{controlFor==="erase"?"确认删除正文":"确认取消后续处理"}</button><button type="button" className={button} disabled={locked} onClick={()=>{setControlFor(null);setControlConfirmed(false)}}>返回</button></div></div>:null}
        </div>:null}
      </div>:null}
      {!historyAvailable?<details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">读取已有的本人意见</summary><form className="mt-3 space-y-3" onSubmit={event=>{event.preventDefault();if(!locked){invalidate();void controller.current?.read(readId.trim())}}}><label className="block text-sm">本人意见编号<input className={field} aria-label="本人 AI 意见编号" autoComplete="off" spellCheck={false} required maxLength={36} pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}" value={readId} disabled={locked} onChange={event=>setReadId(event.target.value)}/></label><p className="text-xs leading-5 text-slate-500">读取时会核对当前员工、本任务、意见用途及有效来源。</p><button type="submit" className={button} disabled={locked||!readId.trim()}>读取本人意见与状态</button></form></details>:null}
    </>}
  </section>:null}
    <PgNativeAgentGeneratedAcceptancePanel api={api} ownerId={ownerId} target={generatedSelection.target} active={active&&opened} available={generatedAvailable} acceptanceEnabled={generatedEnabled&&finished&&Boolean(runId&&specId)} onAccepted={onAccepted} onExpired={onExpired}/>
    <PgNativeAgentDescriptivePatchPanel api={api} ownerId={ownerId} target={generatedSelection.target} active={active&&opened&&(descriptivePatchAvailable||patchSeen)} available={descriptivePatchAvailable} acceptanceEnabled={descriptivePatchEnabled&&finished&&Boolean(runId&&specId)} onAccepted={onAccepted} onExpired={onExpired}/>
  </>
}
