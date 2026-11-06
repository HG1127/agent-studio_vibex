import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Bot, ChevronDown, ChevronsLeft, ChevronsRight, Menu, Search, X,
} from "lucide-react"
import { StudioAccountMenu } from "@/components/site/StudioAccountMenu"
import { getStudioAccountInfo } from "@/lib/studioAuth"
import { workspaceForPath, workspacesForRole, type StudioRole } from "@/lib/studioNavigation"

const STORAGE_KEY = "site-nav-collapsed"
const readCollapsed = () => {
  try { return window.localStorage.getItem(STORAGE_KEY) === "1" } catch { return false }
}
const openSearch = () => window.dispatchEvent(new Event("studio:open-command-palette"))

export function SiteSidebar() {
  const pathname = useLocation().pathname
  const role: StudioRole = getStudioAccountInfo()?.role === "admin" ? "admin" : "employee"
  const groups = workspacesForRole(role)
  const active = workspaceForPath(pathname, role)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileOpener=useRef<HTMLButtonElement>(null)
  const mobileClose=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    if(!mobileOpen)return
    const previous=document.activeElement as HTMLElement|null
    const opener=mobileOpener.current
    const id=window.setTimeout(()=>mobileClose.current?.focus(),0)
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setMobileOpen(false)}
    window.addEventListener("keydown",escape)
    return ()=>{
      window.clearTimeout(id)
      window.removeEventListener("keydown",escape)
      if(previous?.isConnected)window.setTimeout(()=>previous.focus(),0)
      else window.setTimeout(()=>opener?.focus(),0)
    }
  },[mobileOpen])
  const currentGroup = expanded ?? active?.to ?? "/"

  const changeCollapse = (next: boolean) => {
    setCollapsed(next)
    try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0") }
    catch { /* Storage may be disabled in a restricted browser. */ }
  }

  return (
    <>
      <aside aria-label="Agent Studio 主导航"
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-60"}`}>
        <Link to="/" title="Agent Studio 工作台"
          className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4 focus-visible:ring-2 focus-visible:ring-primary">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5"/>
          </span>
          {!collapsed && <span className="truncate text-sm font-bold tracking-tight text-card-foreground">Agent Studio</span>}
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
          {!collapsed && <p className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-muted-foreground">工作空间</p>}
          <nav className="space-y-1" aria-label="五大工作空间">
            {groups.map(group => {
              const selected = active?.to === group.to
              const opened = !collapsed && currentGroup === group.to
              return <div key={group.to}>
                <div className={`flex items-center rounded-xl ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Link to={group.to} title={group.label}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => setExpanded(group.to)}
                    className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-primary ${collapsed?"justify-center":""}`}>
                    <group.icon className="h-5 w-5 shrink-0"/>
                    {!collapsed && <span className="truncate">{group.label}</span>}
                  </Link>
                  {!collapsed && group.children.length > 1 &&
                    <button type="button" aria-label={`${opened?"收起":"展开"}${group.label}子菜单`}
                      aria-expanded={opened}
                      onClick={() => setExpanded(currentGroup===group.to?"none":group.to)}
                      className="mr-1 grid h-9 w-8 place-items-center rounded-lg hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary">
                      <ChevronDown className={`h-4 w-4 transition-transform ${opened?"rotate-180":""}`}/>
                    </button>}
                </div>
                {opened && group.children.length > 1 &&
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3" aria-label={`${group.label}子导航`}>
                    {group.children.map(item => (
                      <Link key={item.to} to={item.to}
                        aria-current={pathname===item.to?"page":undefined}
                        className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs transition focus-visible:ring-2 focus-visible:ring-primary ${pathname===item.to?"bg-primary/10 font-semibold text-primary":"text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                        <item.icon className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>}
              </div>
            })}
          </nav>
        </div>
        <div className="border-t border-border p-2.5">
          <button type="button" onClick={openSearch} title="搜索全部功能（Ctrl+K）"
            aria-label="搜索全部功能 Ctrl+K"
            className="mb-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-2 text-xs text-muted-foreground hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary">
            <Search className="h-4 w-4 shrink-0"/>
            {!collapsed && <>搜索功能 <kbd className="ml-auto rounded border border-border px-1 text-[10px]">⌘ K</kbd></>}
          </button>
          {collapsed ?
            <button type="button" title="展开侧栏查看账号" aria-label="展开侧栏查看账号"
              className="grid min-h-10 w-full place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
              onClick={()=>changeCollapse(false)}><Bot className="h-5 w-5"/></button>
            : <StudioAccountMenu/>}
          <button type="button" onClick={()=>changeCollapse(!collapsed)}
            aria-label={collapsed?"展开侧栏":"收起侧栏"}
            className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
            {collapsed?<ChevronsRight className="h-4 w-4"/>:<><ChevronsLeft className="h-4 w-4"/>收起侧栏</>}
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden"
        aria-label="移动端工具栏">
        <button ref={mobileOpener} type="button" onClick={()=>setMobileOpen(true)}
          aria-label="打开全部导航" aria-expanded={mobileOpen}
          className="grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <Menu className="h-5 w-5"/>
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-card-foreground">
          {active?.label || "Agent Studio"}
        </span>
        <button type="button" onClick={openSearch} aria-label="搜索功能"
          className="grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary">
          <Search className="h-5 w-5"/>
        </button>
      </div>

      <nav aria-label="移动端主要工作空间"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{gridTemplateColumns:`repeat(${groups.length}, minmax(0,1fr))`}}>
        {groups.map(group=>{
          const selected=active?.to===group.to
          return <Link key={group.to} to={group.to} onClick={()=>setMobileOpen(false)}
            aria-current={selected?"page":undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-center text-[10px] focus-visible:ring-2 focus-visible:ring-primary ${selected?"font-semibold text-primary":"text-muted-foreground"}`}>
            <group.icon className="h-5 w-5 shrink-0"/>
            <span className="max-w-full truncate">{group.label}</span>
          </Link>
        })}
      </nav>

      {mobileOpen && <div className="fixed inset-0 z-[80] lg:hidden">
        <button aria-label="关闭导航遮罩" type="button" onClick={()=>setMobileOpen(false)}
          className="absolute inset-0 bg-black/35"/>
        <section role="dialog" aria-modal="true" aria-label="全部工作空间与功能"
          onKeyDown={event=>{
            if(event.key!=="Tab")return
            const enabled=Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not([disabled]),a[href],input:not([disabled])"
            )).filter(item=>item.offsetParent!==null)
            const first=enabled[0],last=enabled[enabled.length-1]
            if(event.shiftKey && document.activeElement===first){
              event.preventDefault();last?.focus()
            }else if(!event.shiftKey && document.activeElement===last){
              event.preventDefault();first?.focus()
            }
          }}
          className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col bg-card shadow-2xl">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <span className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-primary"/>全部功能</span>
            <button ref={mobileClose} type="button" aria-label="关闭全部导航" onClick={()=>setMobileOpen(false)}
              className="grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary">
              <X className="h-5 w-5"/>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {groups.map(group=>(
              <div key={group.to} className="mb-4">
                <p className="flex items-center gap-2 px-2 py-2 text-xs font-bold text-foreground">
                  <group.icon className="h-4 w-4 text-primary"/>{group.label}
                </p>
                <div className="grid gap-1">
                  {group.children.map(item=><Link key={item.to} to={item.to}
                    onClick={()=>setMobileOpen(false)}
                    aria-current={pathname===item.to?"page":undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${pathname===item.to?"bg-primary/10 font-semibold text-primary":"text-muted-foreground hover:bg-secondary"}`}>
                    <item.icon className="h-4 w-4 shrink-0"/>{item.label}
                  </Link>)}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <StudioAccountMenu/>
          </div>
        </section>
      </div>}
    </>
  )
}
