/**
 * Cross-workspace navigation protection for unsaved edits.
 *
 * Strictly client-side UX: callers still rely on their own draft backup and
 * server-side version checks. No global mutable record or secret is stored.
 */
const dirtyChecks = new Set<() => boolean>()
const MESSAGE = "当前页面有尚未保存的修改。离开后可在此浏览器尝试恢复临时草稿，但不能保证全部操作均已保存。确定离开吗？"

export function registerUnsavedWorkCheck(check: () => boolean): () => void {
  dirtyChecks.add(check)
  return () => { dirtyChecks.delete(check) }
}

export function hasUnsavedWork(): boolean {
  for (const check of dirtyChecks) {
    try { if (check()) return true } catch { /* invalid hook must not block navigation */ }
  }
  return false
}

function routePathname(value: string): string {
  try {
    return new URL(value, "http://agent-studio.local").pathname
  } catch {
    return value.split("?")[0]?.split("#")[0] || "/"
  }
}

/**
 * Distinguish a wizard STEP from switching the edited document.
 * Changing ?step= is harmless; changing ?spec= or ?wf= can point at another
 * saved Agent/Workflow and must ask before the current edits are discarded.
 */
export function isSameEditorRoute(current: string, next: string): boolean {
  if (routePathname(current) !== routePathname(next)) return false
  const pathname = routePathname(current)
  if (!["/agent-create","/workflow-canvas","/"].includes(pathname)) return true
  try {
    const from = new URL(current,"http://agent-studio.local")
    const to = new URL(next,"http://agent-studio.local")
    const key = pathname === "/workflow-canvas" ? "wf" : "spec"
    return (from.searchParams.get(key) || "") === (to.searchParams.get(key) || "")
  } catch {
    return current === next
  }
}

/** Only safe, bounded history offsets are reversible. */
export function recoverHistoryOffset(from: unknown, to: unknown): number | null {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null
  const offset = (from as number) - (to as number)
  return offset && Math.abs(offset) <= 100 ? offset : null
}

type RenderedHistory = { path: string; index: number | null }
let renderedHistory: RenderedHistory = { path: "", index: null }
let uninstallHistoryGuard: (() => void) | null = null

/** Called only after React Router has actually rendered a successful route. */
export function recordRenderedStudioRoute(path: string, index: unknown): void {
  renderedHistory = {
    path,
    index: Number.isSafeInteger(index) ? Number(index) : null,
  }
}

/**
 * Install before BrowserRouter subscribes to popstate. BrowserRouter may
 * otherwise update React before a page-level handler can cancel navigation.
 * Only same-document entries with valid React Router indexes are reversible.
 */
export function installUnsavedHistoryGuard(
  win: Window,
  ask: (message: string) => boolean,
): () => void {
  if (uninstallHistoryGuard) return uninstallHistoryGuard
  let reversing = false
  let reverseClear: number | null = null
  const resetReverse = () => {
    reversing = false
    if (reverseClear !== null) win.clearTimeout(reverseClear)
    reverseClear = null
  }
  const onPopState = (event: PopStateEvent) => {
    if (reversing) {
      resetReverse()
      event.stopImmediatePropagation()
      return
    }
    const previous = renderedHistory
    const offset = recoverHistoryOffset(previous.index, event.state?.idx)
    if (offset === null) return
    if (shouldNavigateFromUnsavedWork(
      previous.path, win.location.pathname + win.location.search, ask,
    )) return
    event.stopImmediatePropagation()
    reversing = true
    win.history.go(offset)
    // Reset the suppression flag if the reverse traversal cannot complete.
    reverseClear = win.setTimeout(resetReverse, 1500)
  }
  win.addEventListener("popstate", onPopState, true)
  const cleanup = () => {
    win.removeEventListener("popstate", onPopState, true)
    resetReverse()
    if (uninstallHistoryGuard === cleanup) uninstallHistoryGuard = null
  }
  uninstallHistoryGuard = cleanup
  return cleanup
}

export function shouldNavigateFromUnsavedWork(
  current: string,
  next: string,
  ask: (message: string) => boolean,
): boolean {
  if (!next || isSameEditorRoute(current, next) || !hasUnsavedWork()) return true
  return ask(MESSAGE)
}

/**
 * Capture native same-origin anchor clicks before React Router's delegated
 * listeners. Do not intercept external URLs, downloads, new tabs, hash jumps
 * or modified clicks. Browser history is guarded separately in SiteShell.
 */
export function protectInternalLinkClick(
  event: MouseEvent,
  currentHref: string,
  ask: (message: string) => boolean,
): boolean {
  if (event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return true
  const target=event.target
  if (!(target instanceof Element)) return true
  const anchor=target.closest<HTMLAnchorElement>("a[href]")
  if (!anchor || anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")) return true
  try {
    const current=new URL(currentHref)
    const next=new URL(anchor.href,current)
    if (next.origin!==current.origin) return true
    const from=current.pathname+current.search
    const to=next.pathname+next.search
    if (shouldNavigateFromUnsavedWork(from,to,ask)) return true
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return false
  } catch { return true }
}
