import { useState } from "react"
import { Cable, CheckCircle2, Lock, Play, PlugZap, RefreshCw, Trash2, TriangleAlert } from "lucide-react"
import type { ConnectionRow } from "@/pages/PluginMarket/usePluginMarket"
import { smitheryConnectionStatus, smitheryStatusLabel } from "@/lib/smitheryMarketplace"

type Props = {
  connectionRows: ConnectionRow[]
  isConnectionsLoading: boolean
  busyConnectionId: string
  connectedCount: number
  onToggle: (row: ConnectionRow) => void
  onReprobe: (row: ConnectionRow) => void
  onRefreshSmithery: (row: ConnectionRow) => void
  onDelete: (row: ConnectionRow) => void
  onTryInvoke: (row: ConnectionRow) => void
}

export function MyConnectionsBar({
  connectionRows,isConnectionsLoading,busyConnectionId,connectedCount,
  onToggle,onReprobe,onRefreshSmithery,onDelete,onTryInvoke,
}:Props){
  const [confirmDeleteId,setConfirmDeleteId]=useState("")
  const usable=connectionRows.filter(row=>row.enabled &&
    row.tool_count>0 && row.last_probe_status==="ok").length
  const needAction=connectionRows.filter(row=>!row.enabled &&
    ["auth_required","input_required","pending","needs_key","needs_refresh",
      "legacy_reconnect","needs_revoke","error"].includes(row.last_probe_status)).length
  return <section id="plugin-my-connections"
    className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Cable className="h-5 w-5 text-primary"/>我的连接
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只有授权验证成功且发现工具的连接，才会被计为可使用。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          {usable} 个可使用
        </span>
        {needAction>0 && <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">
          {needAction} 个待处理
        </span>}
      </div>
    </header>
    {isConnectionsLoading?<p className="mt-4 text-sm text-muted-foreground">正在读取连接状态…</p>:
      connectionRows.length===0?<div className="mt-4 rounded-xl border border-dashed border-border px-5 py-8 text-center">
        <PlugZap className="mx-auto h-7 w-7 text-muted-foreground"/>
        <p className="mt-2 text-sm font-semibold">尚未连接插件</p>
        <p className="mt-1 text-xs text-muted-foreground">在上方搜索插件，查看权限后完成授权和工具发现。</p>
      </div>:<ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {connectionRows.map(row=>{
          const status=smitheryConnectionStatus(row)
          const managed=row.is_smithery===true
          const verified=row.enabled && row.tool_count>0 && row.last_probe_status==="ok"
          const busy=busyConnectionId===row.id
          const action=status==="action"||status==="error"||status==="legacy"||status==="revoke"
          return <li key={row.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">{row.title||row.server_name}</h3>
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={row.url}>{row.server_name}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${verified?"bg-primary/10 text-primary":action?"bg-destructive/10 text-destructive":"bg-secondary text-muted-foreground"}`}>
                {verified?<CheckCircle2 className="mr-1 inline h-3 w-3"/>:action?<TriangleAlert className="mr-1 inline h-3 w-3"/>:null}
                {verified?"已验证可使用":smitheryStatusLabel(status)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {row.tool_count>0?`工具发现 ${row.tool_count} 个`:"尚无已验证工具"}
              {row.last_probe_status!=="ok"&&row.last_probe_msg?` · ${row.last_probe_msg}`:""}
            </p>
            {row.tool_count>0 && <div className="mt-2 flex flex-wrap gap-1">
              {(row.tools||[]).slice(0,3).map(tool=><span key={tool.name}
                className="max-w-full truncate rounded-md bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground">{tool.name}</span>)}
              {row.tool_count>3&&<span className="text-[11px] text-muted-foreground">+{row.tool_count-3}</span>}
            </div>}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <button type="button" onClick={()=>onTryInvoke(row)} disabled={!verified}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40">
                <Play className="h-3.5 w-3.5"/>试调
              </button>
              <button type="button" disabled={busy||status==="legacy"||status==="revoke"}
                onClick={()=>managed?onRefreshSmithery(row):onReprobe(row)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-secondary disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${busy?"animate-spin":""}`}/>
                {status==="revoke"?"待远端撤销":managed?"验证授权":"重新探测"}
              </button>
              <button type="button" role="switch" aria-checked={verified}
                aria-label={`启用 ${row.title||row.server_name}`}
                title={verified?"点击停用":"需先完成工具发现才可启用"}
                disabled={busy||action}
                onClick={()=>onToggle(row)}
                className={`ml-auto flex min-h-9 items-center gap-1 rounded-lg border px-2 text-xs disabled:opacity-40 ${verified?"border-primary text-primary":"border-border text-muted-foreground"}`}>
                {verified?<CheckCircle2 className="h-3.5 w-3.5"/>:<Lock className="h-3.5 w-3.5"/>}
                {verified?"启用中":"未启用"}
              </button>
              {confirmDeleteId===row.id?<div className="flex w-full items-center gap-2">
                <span className="text-xs text-destructive">确定断开？</span>
                <button type="button" disabled={busy}
                  onClick={()=>{setConfirmDeleteId("");onDelete(row)}}
                  className="min-h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground">确认</button>
                <button type="button" onClick={()=>setConfirmDeleteId("")}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs">取消</button>
              </div>:
                <button type="button" onClick={()=>setConfirmDeleteId(row.id)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg text-xs text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5"/>断开
                </button>}
            </div>
          </li>
        })}
      </ul>}
    <p className="mt-4 text-[11px] text-muted-foreground">
      {connectedCount} 条历史记录标记为启用；上方“可使用”只统计当前通过工具发现的连接。
      连接使用当前员工身份与原有工具审批策略。
    </p>
  </section>
}
