import { useState } from "react"
import { Copy, FolderOpen, Plus, Sparkles, Trash2 } from "lucide-react"
import type { WorkflowRow } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type WorkflowListPanelProps = {
  workflows: WorkflowRow[]
  activeWorkflowId: string
  listLoading: boolean
  handleSelectWorkflow: (wfId: string) => void
  handleCreateWorkflow: () => void
  handleDuplicateWorkflow: (wfId: string) => void
  requestDeleteWorkflow: (wfId: string) => void
  specOptions: { id: string; name: string }[]
  genFromSpecBusy: boolean
  handleGenerateFromSpec: (specId: string) => void
}

export function WorkflowListPanel({
  workflows,
  activeWorkflowId,
  listLoading,
  handleSelectWorkflow,
  handleCreateWorkflow,
  handleDuplicateWorkflow,
  requestDeleteWorkflow,
  specOptions,
  genFromSpecBusy,
  handleGenerateFromSpec,
}: WorkflowListPanelProps) {
  const [genSpecId, setGenSpecId] = useState("")
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground">我的工作流</h3>
        <button
          type="button"
          onClick={handleCreateWorkflow}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>
      {specOptions.length > 0 && (
        <div className="mt-2 rounded-xl border border-dashed border-border bg-background p-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            从助手方案生成画布
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <select
              value={genSpecId}
              onChange={(ev) => setGenSpecId(ev.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">选择助手方案</option>
              {specOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!genSpecId || genFromSpecBusy}
              onClick={() => handleGenerateFromSpec(genSpecId)}
              className="shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {genFromSpecBusy ? "生成中…" : "生成"}
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-1.5">
        {listLoading && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">正在加载…</p>
        )}
        {!listLoading && workflows.length === 0 && (
          <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            还没有工作流，点「新建」开始
          </p>
        )}
        {workflows.map((row) => {
          const isActive = row.id === activeWorkflowId
          return (
            <div
              key={row.id}
              className={`group rounded-xl border px-3 py-2 transition ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelectWorkflow(row.id)}
                className="block w-full text-left focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className={`block truncate text-sm font-medium ${isActive ? "text-primary" : "text-card-foreground"}`}>
                  {row.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {row.node_count} 个节点 · {row.updated ? row.updated.slice(0, 10) : ""} 更新
                  {row.source === "from_spec" ? " · 由助手方案生成" : ""}
                </span>
              </button>
              <div className="mt-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleDuplicateWorkflow(row.id)}
                  title="复制一份"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Copy className="h-3 w-3" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteWorkflow(row.id)}
                  title="删除"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
