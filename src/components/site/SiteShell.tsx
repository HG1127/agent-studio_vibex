import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { SiteSidebar } from "@/components/site/SiteSidebar"
import { SectionTabs } from "@/components/site/SectionTabs"
const SavedAgentQuickEditor=lazy(()=>import("@/components/site/SavedAgentQuickEditor").then(m=>({default:m.SavedAgentQuickEditor})))
import { PencilLine } from "lucide-react"
import { StudioCommandPalette } from "@/components/site/StudioCommandPalette"
import {
  protectInternalLinkClick, recordRenderedStudioRoute,
} from "@/lib/unsavedNavigation"

type SiteShellProps = {
  children: ReactNode
}

export function SiteShell({ children }: SiteShellProps) {
  const location = useLocation()
  const [quickEditorOpen,setQuickEditorOpen] = useState(false)
  const [quickEditorSpecId,setQuickEditorSpecId] = useState("")
  const localDraftRoute = location.pathname === "/" || location.pathname === "/agent-create"
  const openEditor=useCallback((targetId="")=>{
    if(localDraftRoute){
      window.dispatchEvent(new Event("studio:open-current-agent-editor"))
    } else {
      setQuickEditorSpecId(targetId)
      setQuickEditorOpen(true)
    }
  },[localDraftRoute])
  useEffect(()=>{
    const openSpecific=(event:Event)=>{
      const id=String((event as CustomEvent<{specId?:string}>).detail?.specId||"")
      openEditor(id)
    }
    window.addEventListener("studio:open-agent-editor",openSpecific)
    return()=>window.removeEventListener("studio:open-agent-editor",openSpecific)
  },[openEditor])
  useEffect(()=>{
    const shortcut=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==="e"){
        event.preventDefault()
        openEditor()
      }
    }
    window.addEventListener("keydown",shortcut)
    return()=>window.removeEventListener("keydown",shortcut)
  },[openEditor])

  useLayoutEffect(() => {
    recordRenderedStudioRoute(
      location.pathname + location.search, window.history.state?.idx,
    )
  }, [location.pathname, location.search, location.key])
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      protectInternalLinkClick(event, window.location.href, message => window.confirm(message))
    }
    document.addEventListener("click", guard, true)
    return () => document.removeEventListener("click", guard, true)
  }, [])
  return (
    <div data-deployment-channel="ci-verified" data-auto-deploy-smoke="20261021-v2" className="flex min-h-screen bg-background text-foreground">
      <SiteSidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] pt-14 lg:pb-0 lg:pt-0">
        <SectionTabs />
        {children}
      </div>
      <button type="button" aria-label="随时调整 Agent 方案"
        title="随时调整 Agent 方案并保存后试跑 · Ctrl/⌘+Shift+E"
        onClick={()=>openEditor()}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:bottom-4 lg:right-4 lg:bg-card lg:text-primary lg:shadow-sm lg:hover:bg-secondary">
        <PencilLine className="h-4 w-4"/>调整 Agent 方案
      </button>
      {!localDraftRoute && quickEditorOpen && <Suspense fallback={<p role="status" className="sr-only">正在打开 Agent 编辑窗口…</p>}>
        <SavedAgentQuickEditor open={quickEditorOpen} preferredSpecId={quickEditorSpecId}
          onClose={()=>setQuickEditorOpen(false)}/>
      </Suspense>}
      <StudioCommandPalette />
    </div>
  )
}
