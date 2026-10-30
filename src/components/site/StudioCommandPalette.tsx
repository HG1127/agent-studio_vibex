import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Command, Search, X } from "lucide-react"
import { getStudioAccountInfo } from "@/lib/studioAuth"
import { searchStudioRoutes } from "@/lib/studioNavigation"
import { shouldNavigateFromUnsavedWorkAsync } from "@/lib/unsavedNavigation"
import {confirmInStudio} from "@/lib/studioDialogs"

export function StudioCommandPalette() {
  const navigate=useNavigate()
  const role=getStudioAccountInfo()?.role==="admin"?"admin":"employee"
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState("")
  const [highlight,setHighlight]=useState(0)
  const inputRef=useRef<HTMLInputElement>(null)
  const lastFocus=useRef<HTMLElement|null>(null)
  const close=useCallback(()=>{
    setOpen(false)
    const previous=lastFocus.current
    if(previous?.isConnected)window.setTimeout(()=>previous.focus(),0)
  },[])
  const results=searchStudioRoutes(query,role)

  useEffect(()=>{
    const hotkey=(event:KeyboardEvent)=>{
      if ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==="k") {
        event.preventDefault()
        if(open){close()} else {
          lastFocus.current=document.activeElement as HTMLElement|null
          setOpen(true)
        }
      }
      if(event.key==="Escape" && open)close()
    }
    const openFromButton=()=>{
      lastFocus.current=document.activeElement as HTMLElement|null
      setOpen(true)
    }
    window.addEventListener("keydown",hotkey)
    window.addEventListener("studio:open-command-palette",openFromButton)
    return ()=>{
      window.removeEventListener("keydown",hotkey)
      window.removeEventListener("studio:open-command-palette",openFromButton)
    }
  },[open,close])
  useEffect(()=>{
    if(!open)return
    const id=window.setTimeout(()=>inputRef.current?.focus(),0)
    return ()=>window.clearTimeout(id)
  },[open])
  const navigateTo=async(to:string)=>{
    const from=window.location.pathname+window.location.search
    if (!await shouldNavigateFromUnsavedWorkAsync(from,to,message=>confirmInStudio(message))) return
    close()
    setQuery("")
    setHighlight(0)
    navigate(to)
  }
  if(!open)return null
  return <div className="fixed inset-0 z-[100] flex justify-center px-3 pt-[9vh] sm:pt-[15vh]" role="presentation">
    <button type="button" aria-label="关闭功能搜索" onClick={close}
      className="absolute inset-0 bg-black/45"/>
    <section role="dialog" aria-modal="true" aria-label="搜索 Agent Studio 功能"
      onKeyDown={event=>{
        if(event.key!=="Tab")return
        const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),a[href]"
        ))
        const first=focusable[0],last=focusable[focusable.length-1]
        if(event.shiftKey && document.activeElement===first){
          event.preventDefault();last?.focus()
        }else if(!event.shiftKey && document.activeElement===last){
          event.preventDefault();first?.focus()
        }
      }}
      className="relative z-10 flex h-fit max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Search className="h-5 w-5 shrink-0 text-primary"/>
        <input ref={inputRef} type="search" role="combobox" aria-label="搜索页面和功能"
          aria-expanded={true} aria-controls="studio-command-results"
          placeholder="搜索 Agent、工作流、模型、知识库、审批…"
          value={query}
          onChange={event=>{setQuery(event.target.value);setHighlight(0)}}
          onKeyDown={event=>{
            if(event.key==="ArrowDown"){event.preventDefault();setHighlight(v=>Math.min(results.length-1,v+1))}
            if(event.key==="ArrowUp"){event.preventDefault();setHighlight(v=>Math.max(0,v-1))}
            if(event.key==="Enter" && results[highlight]){
              event.preventDefault()
              navigateTo(results[highlight].to)
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"/>
        <button type="button" onClick={close} aria-label="关闭搜索"
          className="grid h-10 w-10 place-items-center rounded-lg hover:bg-secondary">
          <X className="h-4 w-4"/>
        </button>
      </div>
      <div id="studio-command-results" role="listbox" aria-label="搜索结果"
        className="min-h-0 max-h-96 overflow-y-auto p-2">
        {results.length ? results.map((item,i)=>(
          <button key={item.to} type="button" role="option" aria-selected={i===highlight}
            onMouseEnter={()=>setHighlight(i)} onClick={()=>navigateTo(item.to)}
            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-primary ${i===highlight?"bg-primary/10 text-primary":"text-foreground hover:bg-secondary"}`}>
            <item.icon className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="text-xs text-muted-foreground">打开</span>
          </button>
        )):<p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的功能，可尝试「模型」「Agent」「工作流」等关键词。</p>}
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Command className="h-3 w-3"/> Ctrl / ⌘ + K 打开</span>
        <span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span>
      </div>
    </section>
  </div>
}
