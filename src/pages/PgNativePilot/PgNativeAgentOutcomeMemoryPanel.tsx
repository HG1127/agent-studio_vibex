import {useEffect,useRef,useState} from "react"
import type {createPgNativePilotApi} from "@/lib/pgNativePilotApi"
import {createPgNativeOutcomeMemorySession,emptyOutcomeMemoryView} from "@/lib/pgNativeAgentOutcomeMemorySession"
import {watchPgNativeOriginalTaskController} from "@/lib/pgNativeOwnTaskNavigation"
type Controller=ReturnType<typeof createPgNativeOutcomeMemorySession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
const resultText={stored:"本次任务曾保存经验或教训。请在任务经验与教训中核对当前内容或忘记；此处保留历史记录。",revoked:"本次自动保存已停止，任务结果已保留。",source_unavailable:"原任务来源已变化或无法核对，本次未自动保存。",writes_disabled:"后台未开放自动保存，任务结果已保留。",write_failed:"本次自动保存失败，任务结果已保留。可在任务经验与教训中核对。"}
export default function PgNativeAgentOutcomeMemoryPanel({api,runId,runStatus,active,available,onExpired}:{
  api:ReturnType<typeof createPgNativePilotApi>;runId:string|null;runStatus:string;active:boolean;available:boolean;onExpired:()=>void
}){
  const controller=useRef<Controller|null>(null),[view,setView]=useState(emptyOutcomeMemoryView)
  const [opened,setOpened]=useState(available),[confirmFor,setConfirmFor]=useState("")
  useEffect(()=>{
    const current=createPgNativeOutcomeMemorySession(api,{onExpired});controller.current=current;setView(current.snapshot())
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    const unwatch=watchPgNativeOriginalTaskController(api,current)
    return()=>{unwatch();unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setActive(active)},[active,api,onExpired])
  useEffect(()=>{controller.current?.setAvailable(available);if(available)setOpened(true)},[available,api,onExpired])
  useEffect(()=>{if(active&&available)void controller.current?.select(runId)},[active,available,runId,runStatus,view.pending?.request_id,api,onExpired])
  const status=view.status,scope=status?.enabled?status.run_id+":"+status.intent_sha256:""
  useEffect(()=>{setConfirmFor("")},[active,available,scope,status?.enabled&&status.stopped])
  if(!active||!available&&!opened)return null
  if(!available)return <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">自动保存暂不可用，刷新后可继续核对原请求。</p>
  const locked=view.loading||view.busy
  return <section aria-label="本次自动保存" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">本次自动保存</h3>
      <button type="button" className={button} disabled={locked||!view.runId} onClick={()=>void controller.current?.refresh()}>刷新自动保存状态</button></div>
    {view.error&&<p role="alert" className="text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="text-sm leading-6 text-emerald-800">{view.notice}</p>}
    {view.loading&&<p role="status" className="text-sm text-slate-500">核对本人任务的自动保存状态…</p>}
    {!view.runId&&<p className="text-sm text-slate-500">选择本人任务后查看其自动保存状态。</p>}
    {status?.enabled===false&&<p className="text-sm text-slate-500">此任务未选择自动保存经验或教训。</p>}
    {status?.enabled&&<>
      {status.state==="finished"&&status.result&&<p role="status" className="text-sm leading-6 text-slate-700">{resultText[status.result.decision]}</p>}
      {status.state==="unconfirmed"&&<p role="status" className="text-sm leading-6 text-amber-900">任务已结束，自动保存结果尚未确认。请核对任务记忆，避免重新执行原任务。</p>}
      {status.state==="pending"&&!status.stopped&&<p className="text-sm leading-6 text-slate-600">本次已选择自动保存，任务结束后将核对来源并保存经验或教训。</p>}
      {status.stopped&&status.state!=="finished"&&<p role="status" className="text-sm leading-6 text-slate-700">本次后续自动保存已停止，任务仍按原有审批继续。</p>}
      {!status.stopped&&status.state!=="finished"&&!view.pending&&<>
        {confirmFor===scope?<div role="group" aria-label="确认停止自动保存" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-6">
          <p>确认停止本次自动保存？任务本身仍继续，已保存内容需要单独忘记。</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={()=>{setConfirmFor("");void controller.current?.stop(true)}}>确认停止自动保存</button>
            <button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor("")}>保留自动保存</button></div>
        </div>:<button type="button" className={button} disabled={locked} onClick={()=>setConfirmFor(scope)}>停止本次自动保存</button>}
      </>}
    </>}
    {view.pending&&<div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
      <p>上次停止结果尚未确认。请核对原任务、原请求；不会重新执行任务。</p>
      <p className="break-all text-xs text-slate-500">原任务编号：{view.pending.run_id}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={()=>void controller.current?.confirm()}>核对原自动保存停止请求</button>
        <button type="button" className={button} disabled={locked} onClick={()=>void controller.current?.retrySameRequest()}>重新提交同一停止请求</button></div>
    </div>}
  </section>
}
