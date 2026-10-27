import {useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {createPgNativeFeedbackSession,emptyFeedbackView} from "@/lib/pgNativeAgentFeedbackSession"
import {watchPgNativeOriginalTaskController} from "@/lib/pgNativeOwnTaskNavigation"
type Controller=ReturnType<typeof createPgNativeFeedbackSession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
const decisions={stored:"此反馈曾保存教训，可在下方核对当前内容。",not_requested:"本次仅记录反馈。",source_unavailable:"反馈已记录，原任务来源无法核对，本次教训未保存。",writes_disabled:"反馈已记录，当前未开放教训保存。",write_failed:"反馈已记录，本次教训保存失败。"}
export default function PgNativeAgentFeedbackPanel({api,runId,runStatus,active,available,submitEnabled,lessonEnabled,onExpired}:{
  api:ReturnType<typeof createPgNativePilotApi>;runId:string|null;runStatus:string;active:boolean;available:boolean;submitEnabled:boolean;lessonEnabled:boolean;onExpired:()=>void
}){
  const controller=useRef<Controller|null>(null),[view,setView]=useState(emptyFeedbackView),[opened,setOpened]=useState(available)
  const [rating,setRating]=useState<"up"|"down">("up"),[tags,setTags]=useState(""),[comment,setComment]=useState(""),[remember,setRemember]=useState(false),[confirmed,setConfirmed]=useState(false),[confirmFor,setConfirmFor]=useState("")
  useEffect(()=>{
    const current=createPgNativeFeedbackSession(api,{onExpired});controller.current=current;setView(current.snapshot())
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    const unwatch=watchPgNativeOriginalTaskController(api,current)
    return()=>{unwatch();unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setScopes({available,submit:submitEnabled,lessons:lessonEnabled});if(available)setOpened(true)},[available,submitEnabled,lessonEnabled,api,onExpired])
  useEffect(()=>{controller.current?.setActive(active)},[active,api,onExpired])
  useEffect(()=>{if(active&&available)void controller.current?.select(runId)},[active,available,runId,runStatus,api,onExpired])
  const status=view.status,scope=status?status.run_id+":"+status.revision+":"+(status.current?.feedback_sha256??""):""
  useEffect(()=>{setRating("up");setTags("");setComment("");setRemember(false);setConfirmed(false);setConfirmFor("")},[active,available,scope])
  if(!active||!available&&!opened)return null
  if(!available)return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">反馈暂不可用，刷新后可继续核对原请求。</p>
  const locked=view.loading||view.busy||Boolean(view.pending),tagValues=tags.split(/[,，]/u).map(v=>v.trim()).filter(Boolean),validTags=tagValues.length<=8&&tagValues.every(v=>v.length<=20)
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!validTags||!confirmed)return;await controller.current?.submit({rating,tags:tagValues,comment,remember_lesson:remember},true)}
  return <section aria-label="任务反馈" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">任务反馈</h3><button type="button" className={button} disabled={locked||!view.runId} onClick={()=>void controller.current?.refresh()}>刷新任务反馈</button></div>
    <p className="text-sm leading-6 text-slate-500">记录你对本次任务的评价。负反馈可另选保存为教训；提交反馈和保存教训均不会发起新的模型调用。</p>
    {view.error?<p role="alert" className="text-sm text-rose-800">{view.error}</p>:null}
    {view.notice?<p role="status" className="text-sm text-emerald-800">{view.notice}</p>:null}
    {view.loading?<p role="status" className="text-sm text-slate-500">正在核对本人反馈…</p>:null}
    {!view.runId?<p className="text-sm text-slate-500">选择本人任务后查看反馈。</p>:null}
    {status?<>
      {status.current?<div className="space-y-2 rounded-xl bg-slate-50 p-4" aria-label="当前反馈">
        {status.current.body?<><p className="font-medium">{status.current.body.rating==="up"?"满意":"需要改进"}</p><p className="text-sm text-slate-500">{status.current.body.tags.join(" · ")||"未填写标签"}</p><p className="whitespace-pre-wrap break-words text-sm">{status.current.body.comment||"未填写补充意见"}</p></>:<p className="text-sm text-amber-900">反馈正文暂无法核对，仍可删除此任务的反馈及教训。</p>}
        <p role="status" className="text-sm leading-6 text-slate-600">{status.current.lesson_result?decisions[status.current.lesson_result.decision]:"教训保存结果尚未确认，原请求不会重试保存。"}</p>
      </div>:<p className="text-sm text-slate-500">{status.state==="erased"?"此任务反馈及反馈教训已删除。":"此任务暂无反馈。"}</p>}
      {!view.canSubmit?<p role="status" className="text-sm text-amber-900">当前未开放新反馈，已有反馈仍可核对和删除。</p>:!status.source?<p role="status" className="text-sm text-slate-500">{["succeeded","failed","cancelled"].includes(runStatus)?"当前任务来源无法用于新反馈，已有内容仍可核对和删除。":"任务结束后可提交反馈。"}</p>:null}
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={locked||!view.canSubmit||!status.source} className="space-y-3">
          <legend className="sr-only">填写任务反馈</legend>
          <label className="block text-sm font-medium">任务评价<select aria-label="任务评价" className={field} value={rating} onChange={event=>{setRating(event.target.value as "up"|"down");setRemember(false);setConfirmed(false)}}><option value="up">满意</option><option value="down">需要改进</option></select></label>
          <label className="block text-sm font-medium">反馈标签<input aria-label="反馈标签" className={field} maxLength={180} value={tags} onChange={event=>{setTags(event.target.value);setConfirmed(false)}} placeholder="逗号分隔，最多 8 项，每项 20 字"/></label>
          {!validTags?<p role="alert" className="text-sm text-rose-800">最多填写 8 个标签，每项不超过 20 字。</p>:null}
          <label className="block text-sm font-medium">补充意见<textarea aria-label="反馈补充意见" className={field} rows={3} maxLength={500} value={comment} onChange={event=>{setComment(event.target.value);setConfirmed(false)}}/></label>
          {rating==="down"?<div className="space-y-1"><label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" aria-label="同时保存这条负反馈教训" checked={remember} disabled={locked||!view.canStoreLesson&&!remember} onChange={event=>{setRemember(event.target.checked);setConfirmed(false)}}/>同时保存这条负反馈教训，供我核对。</label><p className="text-xs leading-5 text-slate-500">保存前会核对原任务来源。修改反馈后，旧教训不再可用；删除反馈会删除此任务的全部反馈教训。</p></div>:null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="确认提交此反馈" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>确认提交此反馈。</label>
        </fieldset>
        <button type="submit" className={button} disabled={locked||!view.canSubmit||!status.source||!confirmed||!validTags||remember&&!view.canStoreLesson}>{status.current?"更新任务反馈":"提交任务反馈"}</button>
      </form>
      {status.current&&!view.pending?<div className="space-y-2">
        {confirmFor==="erase:"+scope?<div role="group" aria-label="确认删除任务反馈" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm"><p>删除此任务的反馈及全部反馈教训？历史确认记录会保留。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={()=>{setConfirmFor("");void controller.current?.erase(true)}}>确认删除反馈及教训</button><button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor("")}>保留反馈</button></div></div>:<button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor("erase:"+scope)}>删除此任务反馈及教训</button>}
      </div>:null}
      <div className="space-y-2"><h4 className="text-sm font-medium">反馈教训</h4>{!status.lessons.length?<p className="text-sm text-slate-500">暂无反馈教训。</p>:<ul className="space-y-3">{status.lessons.map(item=><li key={item.feedback_id} className="space-y-2 rounded-xl border border-slate-200 p-3"><p className="whitespace-pre-wrap break-words text-sm">{item.source_current?item.fact:"反馈已修改或原来源不可用，教训内容已隐藏。"}</p>
        {confirmFor==="forget:"+item.feedback_id?<div role="group" aria-label="确认忘记反馈教训" className="space-y-2 text-sm"><p>只忘记这条教训，保留任务反馈？</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={()=>{setConfirmFor("");void controller.current?.forget(item.feedback_id,true)}}>确认忘记反馈教训</button><button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor("")}>保留教训</button></div></div>:<button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor("forget:"+item.feedback_id)}>忘记这条反馈教训</button>}
      </li>)}</ul>}</div>
    </>:null}
    {view.pending?<div role="status" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-6"><p>上次反馈操作结果尚未确认，原文和原选择已保留。</p><p className="break-all text-xs">原任务编号：{view.pending.run_id}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.confirm()}>核对原反馈请求</button><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.retrySameRequest()}>重交同一反馈请求</button></div></div>:null}
  </section>
}
