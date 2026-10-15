import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Flag,
  ListChecks,
  Loader2,
  Package,
  Plus,
  Route,
  Save,
  Target,
  Wand2,
  Wrench,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AgentSpec, ListField } from "@/pages/Home/useHome"

type SpecEditorCardProps = {
  spec: AgentSpec
  specName: string
  sourceMode: "create" | "template"
  onSpecNameChange: (value: string) => void
  onTextChange: (field: "goal" | "task_scope", value: string) => void
  onListItemChange: (field: ListField, index: number, value: string) => void
  onListItemAdd: (field: ListField) => void
  onListItemRemove: (field: ListField, index: number) => void
  toolStatusOf: (toolName: string) => "ready" | "pending"
  builtinTools: { id: string; title: string; desc: string }[]
  connectedTools: { name: string; description: string }[]
  knowledgeBases: { id: string; name: string; document_count: number }[]
  onToggleKnowledgeBase: (id: string, checked: boolean) => void
  onToggleTool: (toolName: string, checked: boolean) => void
  reviseInput: string
  onReviseInputChange: (value: string) => void
  onRevise: () => void
  isRevising: boolean
  onSave: () => void
  isSaving: boolean
  savedMsg: string
  savedSpecId?: string
  onClear: () => void
}

function SectionBlock({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-background/60 p-4">
      <div className="mb-3 flex min-h-6 items-center gap-2 text-sm font-semibold text-card-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

type ListRowsProps = {
  field: ListField
  items: string[]
  numbered?: boolean
  onChange: (field: ListField, index: number, value: string) => void
  onAdd: (field: ListField) => void
  onRemove: (field: ListField, index: number) => void
  renderSuffix?: (item: string) => ReactNode
  addLabel: string
}

function ListRows({ field, items, numbered, onChange, onAdd, onRemove, renderSuffix, addLabel }: ListRowsProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={`${field}-${index}`} className="flex items-center gap-2">
          {numbered && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
          )}
          <Input
            value={item}
            onChange={(e) => onChange(field, index, e.target.value)}
            className="h-9 rounded-lg border-border bg-card text-sm focus-visible:ring-primary"
          />
          {renderSuffix?.(item)}
          <button
            type="button"
            aria-label="删除这一项"
            onClick={() => onRemove(field, index)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onAdd(field)}
        className="mt-1 inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  )
}

function ToolToggleRow({
  label,
  desc,
  checked,
  onToggle,
}: {
  label: string
  desc: string
  checked: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onToggle(!checked)}
      className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-primary ${
        checked
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border bg-background/60 hover:border-primary/30"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-sm font-medium ${checked ? "text-primary" : "text-card-foreground"}`}>
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  )
}

function ToolPickerBlock({
  spec,
  toolStatusOf,
  builtinTools,
  connectedTools,
  onToggleTool,
  onRemovePending,
}: {
  spec: AgentSpec
  toolStatusOf: (toolName: string) => "ready" | "pending"
  builtinTools: { id: string; title: string; desc: string }[]
  connectedTools: { name: string; description: string }[]
  onToggleTool: (toolName: string, checked: boolean) => void
  onRemovePending: (toolName: string) => void
}) {
  const specTools = spec.tools.map((item) => item.trim()).filter((item) => item !== "")
  const isChecked = (toolName: string) => specTools.includes(toolName.trim())
  const pendingTools = specTools.filter((toolName) => toolStatusOf(toolName) === "pending")
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          内置工具 · 始终可用
        </p>
        <div className="flex flex-col gap-1.5">
          {builtinTools.map((tool) => (
            <ToolToggleRow
              key={tool.id}
              label={tool.title}
              desc={tool.desc}
              checked={isChecked(tool.id)}
              onToggle={(next) => onToggleTool(tool.id, next)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          已连接外部工具
        </p>
        {connectedTools.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {connectedTools.map((tool) => (
              <ToolToggleRow
                key={tool.name}
                label={tool.name}
                desc={tool.description || "外部 HTTP 工具"}
                checked={isChecked(tool.name)}
                onToggle={(next) => onToggleTool(tool.name, next)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
            还没有已启用的外部工具，
            <Link
              to="/tool-connections"
              className="ml-1 font-medium text-primary underline-offset-4 transition hover:underline"
            >
              去工具连接页接入
            </Link>
            ，接入后这里就能勾选。
          </p>
        )}
      </div>
      {pendingTools.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            待连接（暂不可勾选）
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pendingTools.map((toolName) => (
              <span
                key={toolName}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {toolName}
                <button
                  type="button"
                  aria-label={`从方案里移除 ${toolName}`}
                  onClick={() => onRemovePending(toolName)}
                  className="rounded-md p-0.5 transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        勾选结果会写进方案的所需工具清单；助手试跑时按工具名命中：内置工具直接执行，已连接工具由服务端代理真实调用。
      </p>
    </div>
  )
}

export function SpecEditorCard(p: SpecEditorCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/60 px-6 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Wand2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Input
              value={p.specName}
              onChange={(e) => p.onSpecNameChange(e.target.value)}
              aria-label="助手名称"
              className="h-8 w-full max-w-xs border-0 bg-transparent p-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            />
            <span className="mt-0.5 inline-block rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
              {p.sourceMode === "template" ? "来自示例模板" : "由我的需求生成"} · 各区块文字可直接编辑
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={p.onClear}
          className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
        >
          <X className="mr-1 h-4 w-4" />
          清空
        </Button>
      </div>

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <SectionBlock title="目标" icon={<Target className="h-4 w-4" />}>
          <Textarea
            rows={3}
            value={p.spec.goal}
            onChange={(e) => p.onTextChange("goal", e.target.value)}
            className="resize-none rounded-lg border-border bg-card text-sm focus-visible:ring-primary"
          />
        </SectionBlock>
        <SectionBlock title="任务范围" icon={<ListChecks className="h-4 w-4" />}>
          <Textarea
            rows={3}
            value={p.spec.task_scope}
            onChange={(e) => p.onTextChange("task_scope", e.target.value)}
            className="resize-none rounded-lg border-border bg-card text-sm focus-visible:ring-primary"
          />
        </SectionBlock>
        <SectionBlock title="交付物" icon={<Package className="h-4 w-4" />}>
          <ListRows
            field="deliverables"
            items={p.spec.deliverables}
            onChange={p.onListItemChange}
            onAdd={p.onListItemAdd}
            onRemove={p.onListItemRemove}
            addLabel="添加交付物"
          />
        </SectionBlock>
        <SectionBlock title="所需工具" icon={<Wrench className="h-4 w-4" />}>
          <ToolPickerBlock
            spec={p.spec}
            toolStatusOf={p.toolStatusOf}
            builtinTools={p.builtinTools}
            connectedTools={p.connectedTools}
            onToggleTool={p.onToggleTool}
            onRemovePending={(toolName) => p.onToggleTool(toolName, false)}
          />
        </SectionBlock>
        <SectionBlock title="关联知识库" icon={<BookOpen className="h-4 w-4" />}>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">选中后 Agent 可检索你的专属资料，并按片段出处引用。</p>
          {p.knowledgeBases.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              尚无知识库。<Link to="/knowledge-bases" className="text-primary hover:underline">创建并上传资料 →</Link>
            </p>
          ) : (
            <div className="max-h-40 space-y-2 overflow-auto">
              {p.knowledgeBases.map(base => <label key={base.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-xs hover:bg-secondary">
                <input type="checkbox" checked={(p.spec.knowledge_base_ids || []).includes(base.id)}
                  onChange={event => p.onToggleKnowledgeBase(base.id, event.target.checked)} className="accent-primary" />
                <span className="min-w-0 flex-1 truncate">{base.name}</span>
                <span className="text-muted-foreground">{base.document_count} 份</span>
              </label>)}
            </div>
          )}
          <Link to="/knowledge-bases" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            管理知识库 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionBlock>
        <SectionBlock title="任务规划" icon={<Route className="h-4 w-4" />}>
          <ListRows
            field="task_plan"
            items={p.spec.task_plan}
            numbered
            onChange={p.onListItemChange}
            onAdd={p.onListItemAdd}
            onRemove={p.onListItemRemove}
            addLabel="添加步骤"
          />
        </SectionBlock>
        <SectionBlock title="完成标准" icon={<Flag className="h-4 w-4" />}>
          <ListRows
            field="done_criteria"
            items={p.spec.done_criteria}
            onChange={p.onListItemChange}
            onAdd={p.onListItemAdd}
            onRemove={p.onListItemRemove}
            addLabel="添加标准"
          />
        </SectionBlock>
      </div>

      <div className="border-t border-border px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={p.reviseInput}
            onChange={(e) => p.onReviseInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !p.isRevising) p.onRevise()
            }}
            placeholder={'一句话提修改要求，例如：把交付物改成 PPT 大纲，规划里加一步先跟我确认方向'}
            className="h-11 flex-1 rounded-xl border-border bg-background text-sm focus-visible:ring-primary"
          />
          <Button
            type="button"
            variant="outline"
            onClick={p.onRevise}
            disabled={p.isRevising || !p.reviseInput.trim()}
            className="h-11 shrink-0 rounded-xl border-primary px-5 text-primary transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {p.isRevising ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                修订中…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                一句话修改
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={p.onSave}
            disabled={p.isSaving}
            className="h-11 shrink-0 rounded-xl bg-primary px-5 text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
          >
            {p.isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存到我的助手
              </>
            )}
          </Button>
        </div>
        {p.savedMsg && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {p.savedMsg}
            {p.savedSpecId && (
              <Link
                to={`/agent-run?spec=${encodeURIComponent(p.savedSpecId)}`}
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-md transition hover:scale-105 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
              >
                去配置和试跑
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
