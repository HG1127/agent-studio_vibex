import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { FolderOpen, Lock, Play, Search, Trash2, X } from "lucide-react"
import type { SavedSpecRow } from "@/pages/Home/useHome"

type SavedSpecsListProps = {
  savedList: SavedSpecRow[]
  isLoggedIn: boolean
  onOpenSaved: (row: SavedSpecRow) => void
  onDeleteSaved: (recordId: string) => void
}

function formatRowTime(isoValue: string): string {
  if (!isoValue) return ""
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function SavedSpecsList({
  savedList, isLoggedIn, onOpenSaved, onDeleteSaved,
}: SavedSpecsListProps) {
  const [search,setSearch]=useState("")
  const [deleteId,setDeleteId]=useState("")
  const filtered=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase()
    return savedList.filter(row=>!query ||
      (row.name||"").toLocaleLowerCase().includes(query) ||
      (row.spec?.goal||"").toLocaleLowerCase().includes(query))
      .sort((a,b)=>(Date.parse(b.updated)||0)-(Date.parse(a.updated)||0))
  },[savedList,search])

  if (!isLoggedIn) return <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
    <Lock className="h-5 w-5 shrink-0 text-primary" />
    登录员工账号后，你保存的 Agent 会显示在这里。
  </div>

  if (savedList.length===0) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
    <span className="flex items-center gap-2"><FolderOpen className="h-5 w-5 shrink-0 text-primary"/>还没有保存的 Agent。可以使用上方的「创建新 Agent」开始。</span>
  </div>

  return <div className="min-w-0 space-y-3">
    {savedList.length>=5 && <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="relative block w-full sm:max-w-sm">
        <span className="sr-only">搜索我的 Agent</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <input type="search" value={search} onChange={event=>setSearch(event.target.value)}
          aria-label="搜索我的 Agent" placeholder="搜索名称或目标…"
          className="min-h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/>
      </label>
      <span className="text-xs text-muted-foreground">
        {filtered.length} / {savedList.length} 个 Agent
      </span>
    </div>}
    {filtered.length===0 ? <div className="rounded-xl border border-dashed border-border bg-card px-4 py-7 text-center text-sm text-muted-foreground">
      没有找到符合条件的 Agent。
      <button type="button" onClick={()=>setSearch("")} className="ml-2 font-semibold text-primary hover:underline">
        清除搜索
      </button>
    </div> : <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {filtered.map(row=><li key={row.id} className="min-w-0 rounded-xl border border-border bg-card p-4 transition hover:border-primary/30">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-card-foreground" title={row.name||"未命名 Agent"}>
              {row.name || "未命名 Agent"}
            </p>
            <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
              {row.spec?.goal || "尚未填写明确目标"}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">更新于 {formatRowTime(row.updated)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={()=>onOpenSaved(row)}
              aria-label={`编辑方案：${row.name||"未命名 Agent"}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40 hover:bg-secondary">
              编辑方案
            </button>
            <Link to={`/agent-run?spec=${encodeURIComponent(row.id)}`}
              aria-label={`试跑 Agent：${row.name||"未命名 Agent"}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-3.5 w-3.5"/>试跑
            </Link>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-2">
          {deleteId===row.id ? <div role="group" aria-label={`确认删除 ${row.name||"Agent"}`}
            className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-destructive">确定删除此 Agent？此操作不可撤销。</span>
            <button type="button" onClick={()=>{setDeleteId("");onDeleteSaved(row.id)}}
              className="min-h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground">
              确认删除
            </button>
            <button type="button" onClick={()=>setDeleteId("")}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-secondary">
              <X className="h-3.5 w-3.5"/>取消
            </button>
          </div> : <button type="button" aria-label={`删除 ${row.name||"Agent"}`}
            onClick={()=>setDeleteId(row.id)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5"/>删除
          </button>}
        </div>
      </li>)}
    </ul>}
  </div>
}
