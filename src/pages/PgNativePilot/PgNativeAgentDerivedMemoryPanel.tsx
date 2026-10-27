import {useEffect,useRef,useState} from "react"
import type {createPgNativePilotApi,PgNativeAgent} from "@/lib/pgNativePilotApi"
import {createPgNativeDerivedMemorySession,emptyDerivedMemoryView} from "@/lib/pgNativeAgentDerivedMemorySession"
type Controller=ReturnType<typeof createPgNativeDerivedMemorySession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
const field="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
export default function PgNativeAgentDerivedMemoryPanel({api,agents,active,canWrite,onExpired}:{api:ReturnType<typeof createPgNativePilotApi>;agents:PgNativeAgent[];active:boolean;canWrite:boolean;onExpired:()=>void}){
  const controller=useRef<Controller|null>(null),[view,setView]=useState(emptyDerivedMemoryView)
  const [confirmed,setConfirmed]=useState(false),[forgetting,setForgetting]=useState("")
  useEffect(()=>{
    const current=createPgNativeDerivedMemorySession(api,{onExpired});controller.current=current;setView(current.snapshot())
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    return()=>{unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setActive(active);if(!active){setConfirmed(false);setForgetting("")}},[active,api,onExpired])
  useEffect(()=>{controller.current?.setWritable(canWrite);setConfirmed(false)},[canWrite,api,onExpired])
  const currentRole=agents.find(role=>role.id===view.role?.id)
  useEffect(()=>{
    if(!active||!view.role||view.busy||view.loading||view.pending)return
    if(!currentRole||currentRole.revision!==view.role.revision)void controller.current?.select(currentRole??null)
  },[active,currentRole?.id,currentRole?.revision,view.role?.id,view.role?.revision,view.busy,view.loading,view.pending])
  if(!active)return null
  const locked=view.busy||view.loading||Boolean(view.pending)
  return <section aria-label="任务经验与教训" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">任务经验与教训</h3><p className="mt-1 text-sm leading-6 text-slate-500">从本人已结束的任务中核对并保存经验或教训。原始来源变化后隐藏内容，仍可忘记。</p></div>
      <button type="button" className={button} disabled={!view.role||locked} onClick={()=>{setConfirmed(false);void controller.current?.refresh()}}>刷新任务记忆</button></div>
    {view.error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{view.notice}</p>}
    {!canWrite&&<p role="status" className="text-sm text-amber-900">当前可查看与核对原请求，保存和忘记尚未开放。</p>}
    <label className="block text-sm font-medium">来源角色<select aria-label="来源角色" className={field} value={view.role?.id??""} disabled={locked} onChange={event=>{
      setConfirmed(false);setForgetting("");void controller.current?.select(agents.find(role=>role.id===event.target.value)??null)
    }}><option value="">请选择本人角色</option>{agents.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    {view.pending&&<div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
      <p>“{view.pending.role_name}”的{view.pending.action==="forget"?"忘记":"保存"}尚未确认。请核对原请求。</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={()=>void controller.current?.confirm()}>核对原任务记忆请求</button>
        <button type="button" className={button} disabled={view.busy||!canWrite} onClick={()=>void controller.current?.retrySameRequest()}>重新提交同一任务记忆请求</button></div>
    </div>}
    {view.role&&<>
      <label className="block text-sm font-medium">最近完成的来源任务<select aria-label="最近完成的来源任务" className={field} value={view.selectedRun} disabled={locked} onChange={event=>{setConfirmed(false);void controller.current?.previewRun(event.target.value)}}>
        <option value="">请选择来源任务</option>{view.runs.map(run=><option key={run.id} value={run.id}>{run.status==="succeeded"?"已完成":"失败"} · {run.label||"本人任务"}</option>)}</select></label>
      {view.loading&&<p role="status" className="text-sm text-slate-500">正在核对本人任务来源…</p>}
      {view.preview&&<div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm font-medium">{view.preview.kind==="fact"?"待保存的经验":"待保存的教训"}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{view.preview.fact}</p>
        {view.preview.tools_used&&<p className="break-words text-xs text-slate-600">当时使用的工具：{view.preview.tools_used}</p>}
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" aria-label="确认保存这份任务记忆" className="mt-1.5" checked={confirmed} disabled={!canWrite||locked} onChange={event=>setConfirmed(event.target.checked)}/>确认将以上内容保存为此角色的任务记忆。</label>
        <button type="button" className={button} disabled={!canWrite||locked||!confirmed} onClick={()=>{setConfirmed(false);void controller.current?.save(true)}}>保存这份任务记忆</button>
      </div>}
      {!view.loading&&!view.items.length&&!view.pending&&<p className="text-sm text-slate-500">暂无任务记忆</p>}
      <ul className="space-y-3">{view.items.map(item=><li key={item.id} className="space-y-3 rounded-xl border border-slate-100 p-4">
        <p className="text-xs text-slate-500">{item.kind==="fact"?"经验":"教训"} · {new Date(item.created_at).toLocaleString("zh-CN")}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.source_current?item.fact:"原任务来源已变化，内容已隐藏。你仍可忘记此记录。"}</p>
        {forgetting===item.id?<div className="flex flex-wrap items-center gap-2"><span className="text-sm text-amber-900">确认忘记这条任务记忆？</span><button type="button" className={button} disabled={!canWrite||locked} onClick={()=>{setForgetting("");void controller.current?.forget(item.id,true)}}>确认忘记任务记忆</button><button type="button" className={button} disabled={locked} onClick={()=>setForgetting("")}>保留任务记忆</button></div>:
          <button type="button" className={button} disabled={!canWrite||locked} onClick={()=>setForgetting(item.id)}>忘记这条任务记忆</button>}
      </li>)}</ul>
      {view.items.length===50&&<p className="text-xs text-slate-500">显示最近 50 条任务记忆。</p>}
    </>}
  </section>
}
