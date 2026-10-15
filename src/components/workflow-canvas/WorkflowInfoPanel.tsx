import { Layers, Save, ShieldCheck } from "lucide-react"

type WorkflowInfoPanelProps = {
  flowName: string
  setFlowName: (value: string) => void
  flowDesc: string
  setFlowDesc: (value: string) => void
  dirtyFlag: boolean
  savingFlow: boolean
  lastSavedAt: string
  handleSaveWorkflow: () => void
  nodeCount: number
  edgeCount: number
  requireApproval: boolean
  toggleRequireApproval: () => void
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"

export function WorkflowInfoPanel({
  flowName,
  setFlowName,
  flowDesc,
  setFlowDesc,
  dirtyFlag,
  savingFlow,
  lastSavedAt,
  handleSaveWorkflow,
  nodeCount,
  edgeCount,
  requireApproval,
  toggleRequireApproval,
}: WorkflowInfoPanelProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground">工作流信息</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            dirtyFlag ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          {dirtyFlag ? "有未保存改动" : lastSavedAt ? `已保存 ${lastSavedAt}` : "已保存"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="wf-info-name">
            名称
          </label>
          <input
            id="wf-info-name"
            className={FIELD_CLASS}
            value={flowName}
            maxLength={60}
            onChange={(event) => setFlowName(event.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="wf-info-desc">
            描述（也是知识库检索节点的语料之一）
          </label>
          <textarea
            id="wf-info-desc"
            className={`${FIELD_CLASS} min-h-20 font-sans`}
            placeholder="这条工作流做什么？"
            value={flowDesc}
            maxLength={500}
            onChange={(event) => setFlowDesc(event.target.value)}
          />
        </div>
        <div className="rounded-xl border border-border bg-background px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-card-foreground">
              <ShieldCheck className={`h-3.5 w-3.5 ${requireApproval ? "text-primary" : "text-muted-foreground"}`} />
              写操作需我确认
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={requireApproval}
              aria-label="写操作需我确认"
              onClick={toggleRequireApproval}
              className={`relative h-5 w-9 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary ${
                requireApproval ? "bg-primary" : "bg-muted-foreground/40"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform ${
                  requireApproval ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            开启后，调用写操作接口（非 GET）的工具节点会在运行中暂停，等你在画布上批准。
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveWorkflow}
          disabled={savingFlow || !dirtyFlag}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {savingFlow ? "保存中…" : "保存工作流"}
        </button>
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" />
          {nodeCount} 个节点 · {edgeCount} 条连线
        </div>
      </div>
    </div>
  )
}
