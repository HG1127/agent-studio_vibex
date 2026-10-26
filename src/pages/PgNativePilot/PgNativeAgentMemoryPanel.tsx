import {useEffect,useRef,useState,type FormEvent} from "react"
import type {createPgNativePilotApi,PgNativeAgent} from "@/lib/pgNativePilotApi"
import {createPgNativeMemorySession,emptyMemoryView} from "@/lib/pgNativeAgentMemorySession"
type Controller=ReturnType<typeof createPgNativeMemorySession>
const button="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
const field="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
export default function PgNativeAgentMemoryPanel({api,agents,active,canWrite,onExpired}:{api:ReturnType<typeof createPgNativePilotApi>;agents:PgNativeAgent[];active:boolean;canWrite:boolean;onExpired:()=>void}){
  const controller=useRef<Controller|null>(null),[view,setView]=useState(emptyMemoryView)
  const [fact,setFact]=useState(""),[confirmed,setConfirmed]=useState(false),[forgetting,setForgetting]=useState("")
  useEffect(()=>{
    const current=createPgNativeMemorySession(api,{onExpired});controller.current=current;setView(current.snapshot())
    const unsubscribe=current.subscribe(()=>setView(current.snapshot()))
    return()=>{unsubscribe();current.dispose();if(controller.current===current)controller.current=null}
  },[api,onExpired])
  useEffect(()=>{controller.current?.setActive(active);if(!active){setFact("");setConfirmed(false);setForgetting("")}},[active,api,onExpired])
  useEffect(()=>{controller.current?.setWritable(canWrite)},[canWrite,api,onExpired])
  const currentRole=agents.find(role=>role.id===view.role?.id)
  useEffect(()=>{
    if(!active||!view.role||view.busy||view.loading||view.pending)return
    if(!currentRole||currentRole.revision!==view.role.revision)void controller.current?.select(currentRole??null)
  },[active,currentRole?.id,currentRole?.revision,view.role?.id,view.role?.revision,view.busy,view.loading,view.pending])
  if(!active)return null
  const locked=view.busy||view.loading||Boolean(view.pending)
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(!confirmed)return
    await finishOperation(current=>current.remember(fact,confirmed))
  }
  const finishOperation=async(action:(current:Controller)=>Promise<void>)=>{
    const current=controller.current;if(!current)return
    await action(current)
    if(controller.current===current&&!current.snapshot().pending&&current.snapshot().notice){setFact("");setConfirmed(false)}
  }
  const forget=async(id:string)=>{
    if(forgetting!==id)return
    const current=controller.current;await current?.forget(id,true)
    if(controller.current===current)setForgetting("")
  }
  return <section aria-label="本人角色记忆" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">本人角色记忆</h3><p className="mt-1 text-sm leading-6 text-slate-500">按角色保存你的偏好和约定。忘记后会清除该条记忆文字。</p></div>
      <button type="button" className={button} disabled={!view.role||locked} onClick={()=>void controller.current?.refresh()}>刷新记忆</button></div>
    {view.error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{view.error}</p>}
    {view.notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{view.notice}</p>}
    {!canWrite&&<p role="status" className="text-sm text-amber-900">当前可查看记忆和核对已有请求，保存与忘记尚未开放。</p>}
    <label className="block text-sm font-medium">记忆所属角色<select aria-label="记忆所属角色" className={field} value={view.role?.id??""} disabled={locked} onChange={event=>{
      setFact("");setConfirmed(false);setForgetting("");void controller.current?.select(agents.find(role=>role.id===event.target.value)??null)
    }}><option value="">请选择本人角色</option>{agents.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    {view.pending&&<div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
      <p>“{view.pending.role_name}”的{view.pending.action==="remember"?"保存":"忘记"}尚未确认。原内容和请求已保留。</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={()=>void finishOperation(current=>current.confirm())}>核对原记忆请求</button>
        <button type="button" className={button} disabled={view.busy||!canWrite} onClick={()=>void finishOperation(current=>current.retrySameRequest())}>重新提交同一记忆请求</button></div>
    </div>}
    {view.role&&<>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-medium">要记住的内容<textarea aria-label="要记住的内容" rows={3} maxLength={500} className={field} value={fact} disabled={!canWrite||locked} onChange={event=>{setFact(event.target.value);setConfirmed(false)}}/></label>
        <p className="text-right text-xs text-slate-400">{fact.length} / 500</p>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" aria-label="确认保存本人角色记忆" className="mt-1.5" checked={confirmed} disabled={!canWrite||locked||!fact.trim()} onChange={event=>setConfirmed(event.target.checked)}/>确认将这条内容保存为该角色的用户指令。</label>
        <button type="submit" className={button} disabled={!canWrite||locked||!confirmed||!fact.trim()}>保存记忆</button>
      </form>
      {view.loading?<p role="status" className="text-sm text-slate-500">正在读取记忆…</p>:!view.items.length&&!view.pending&&<p className="text-sm text-slate-500">暂无记忆</p>}
      <ul className="space-y-3">{view.items.map(item=><li key={item.id} className="space-y-3 rounded-xl border border-slate-100 p-4">
        <p className="text-xs text-slate-400">用户指令 · {new Date(item.created_at).toLocaleString("zh-CN")}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.fact}</p>
        {forgetting===item.id?<div className="flex flex-wrap items-center gap-2"><span className="text-sm text-amber-900">确认忘记这条记忆？</span>
          <button type="button" className={button} disabled={!canWrite||locked} onClick={()=>void forget(item.id)}>确认忘记</button><button type="button" className={button} disabled={locked} onClick={()=>setForgetting("")}>保留记忆</button></div>:
          <button type="button" className={button} disabled={!canWrite||locked} onClick={()=>setForgetting(item.id)}>忘记这条记忆</button>}
      </li>)}</ul>
      {view.items.length===50&&<p className="text-xs text-slate-500">显示最近 50 条记忆。</p>}
    </>}
  </section>
}
