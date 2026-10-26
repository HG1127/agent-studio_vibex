import {useEffect,type ReactNode} from "react"
import {SlidersHorizontal,X} from "lucide-react"

export function RunSettingsDrawer({open,onClose,children}:{
  open:boolean;onClose:()=>void;children:ReactNode
}){
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()}
    window.addEventListener("keydown",key)
    return()=>window.removeEventListener("keydown",key)
  },[open,onClose])
  return <>
    {open&&<button type="button" aria-label="关闭配置遮罩" onClick={onClose}
      className="fixed inset-0 z-[65] bg-black/45 2xl:hidden"/>}
    <aside aria-label="Agent 配置与资源" data-run-settings-drawer
      className={(open?"fixed inset-y-0 right-0 z-[70] flex w-[min(100vw,440px)] flex-col border-l border-border bg-background shadow-2xl":
        "hidden")+" min-w-0 2xl:sticky 2xl:top-20 2xl:z-auto 2xl:col-start-3 2xl:row-start-1 2xl:flex 2xl:max-h-[calc(100dvh-6rem)] 2xl:w-full 2xl:flex-col 2xl:border-0 2xl:bg-transparent 2xl:shadow-none"}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 2xl:hidden">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4"/>Agent 配置与资源</h2>
        <button type="button" onClick={onClose} aria-label="关闭配置面板"
          className="rounded-md p-2 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-5 w-5"/>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 2xl:p-0" aria-label="本次 Agent 配置内容">
        {children}
      </div>
    </aside>
  </>
}
