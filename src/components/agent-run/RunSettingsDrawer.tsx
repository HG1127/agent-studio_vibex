import {useEffect,useRef,type ReactNode} from "react"
import {SlidersHorizontal,X} from "lucide-react"

/** On-demand task configuration; do not compress the live result canvas. */
export function RunSettingsDrawer({open,onClose,children}:{
  open:boolean;onClose:()=>void;children:ReactNode
}){
  const panelRef=useRef<HTMLElement>(null)
  const closeRef=useRef<HTMLButtonElement>(null)
  const onCloseRef=useRef(onClose)
  onCloseRef.current=onClose
  useEffect(()=>{
    if(!open)return
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null
    const overflow=document.body.style.overflow
    document.body.style.overflow="hidden"
    closeRef.current?.focus()
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();onCloseRef.current()}
      if(event.key!=="Tab"||!panelRef.current)return
      const elements=Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
      )).filter(element=>element.getClientRects().length>0)
      if(!elements.length)return
      const first=elements[0],last=elements[elements.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    window.addEventListener("keydown",key)
    return()=>{
      window.removeEventListener("keydown",key)
      document.body.style.overflow=overflow
      if(previous?.isConnected)previous.focus()
    }
  },[open])
  if(!open)return null
  return <div className="fixed inset-0 z-[65] flex justify-end" data-run-settings-modal>
    <button type="button" aria-label="关闭运行配置遮罩" onClick={onClose}
      className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"/>
    <aside ref={panelRef} role="dialog" aria-modal="true" aria-label="Agent 配置与资源"
      data-run-settings-drawer
      className="relative z-[70] flex h-dvh w-full max-w-[min(900px,100vw)] min-w-0 flex-col border-l border-border bg-background shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card/80 px-5 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><SlidersHorizontal className="h-5 w-5"/></span>
          <div className="min-w-0"><h2 className="text-base font-semibold">本次 Agent 配置</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">检查资源与权限 → 配置执行边界 → 返回试跑</p></div>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭配置面板"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-5 w-5"/>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5" aria-label="本次 Agent 配置内容">
        {children}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3 sm:px-7">
        <p className="max-w-sm text-xs text-muted-foreground">配置更改仅影响后续试跑，不修改正在执行任务的冻结快照。</p>
        <button type="button" onClick={onClose} className="min-h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">返回试跑</button>
      </footer>
    </aside>
  </div>
}