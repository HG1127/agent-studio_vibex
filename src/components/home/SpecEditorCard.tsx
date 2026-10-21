import { useId, useState, type ReactNode } from "react"
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
  UsersRound,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AgentSpec, ConnectedToolOption, ListField } from "@/pages/Home/useHome"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import type { ToolResolution } from "@/lib/agentToolMatcher"
import { safeMarketplaceQuery, addReturnAgentToUrl } from "@/lib/toolSearchPrivacy"
import { AgentCapabilityPlanner } from "@/components/home/AgentCapabilityPlanner"
import { AgentRoleDesigner } from "@/components/agents/AgentRoleDesigner"
import { AgentRevisionPreview, type AgentRevisionProposal } from "./AgentRevisionPreview"

type SpecEditorCardProps = {
  spec: AgentSpec
  onSpecChange: (next: AgentSpec) => void
  specName: string
  sourceMode: "create" | "template"
  onSpecNameChange: (value: string) => void
  onTextChange: (field: "goal" | "task_scope", value: string) => void
  onTogglePlanReview: (enabled: boolean) => void
  onListItemChange: (field: ListField, index: number, value: string) => void
  onListItemAdd: (field: ListField) => void
  onListItemRemove: (field: ListField, index: number) => void
  toolStatusOf: (toolName: string) => "ready" | "pending"
  builtinTools: { id: string; title: string; desc: string }[]
  connectedTools: ConnectedToolOption[]
  connectedMarketTools: VerifiedMarketTool[]
  toolAnalysis: ToolResolution | null
  toolMatchNotice: string
  onRematchTools: () => void
  knowledgeBases: { id: string; name: string; document_count: number }[]
  knowledgeBasesError?: string
  knowledgeBasesLoading?: boolean
  onRefreshKnowledgeBases?: () => void
  onToggleKnowledgeBase: (id: string, checked: boolean) => void
  onToggleTool: (toolName: string, checked: boolean) => void
  reviseInput: string
  onReviseInputChange: (value: string) => void
  onRevise: () => void
  isRevising: boolean
  revisionProposal?: AgentRevisionProposal | null
  onApplyRevision?: () => void
  onDiscardRevision?: () => void
  onSave: () => void
  dirty?: boolean
  saveConflict?: boolean
  onSaveAsCopy?: () => void
  isSaving: boolean
  savedMsg: string
  savedSpecId?: string
  focus?: "all" | "plan" | "resources"
  onClear: () => void
  showClear?: boolean
  compactActions?: boolean
}

function SectionBlock({ title, icon, children, featured = false }: {
  title: string; icon: ReactNode; children: ReactNode; featured?: boolean
}) {
  return (
    <div className={`flex h-full min-w-0 flex-col rounded-xl border border-border p-4 ${featured
      ? "bg-card xl:col-span-2"
      : "bg-background/50"}`}>
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
  connectedMarketTools,
  onToggleTool,
  onRemovePending,
  returnSpecId,
}: {
  spec: AgentSpec
  toolStatusOf: (toolName: string) => "ready" | "pending"
  builtinTools: { id: string; title: string; desc: string }[]
  connectedTools: { name: string; description: string }[]
  connectedMarketTools: VerifiedMarketTool[]
  onToggleTool: (toolName: string, checked: boolean) => void
  onRemovePending: (toolName: string) => void
  returnSpecId?: string
}) {
  const specTools = spec.tools.map((item) => item.trim()).filter((item) => item !== "")
  const isChecked = (toolName: string) => specTools.includes(toolName.trim())
  const pendingTools = specTools.filter((toolName) => toolStatusOf(toolName) === "pending")
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          内置能力 · 无需新增连接
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
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            已验证的市场插件工具 · 按需授权
          </p>
          <Link to="/plugin-market" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">管理插件（新标签）→</Link>
        </div>
        {connectedMarketTools.length > 0
          ? <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {connectedMarketTools.map(tool=><ToolToggleRow key={tool.id}
              label={tool.label} desc={tool.description}
              checked={isChecked(tool.id)}
              onToggle={value=>onToggleTool(tool.id,value)} />)}
          </div>
          : <p className="rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
              还没有经过验证并启用的插件工具。连接插件并通过工具发现后，具体可选工具会出现在这里。
            </p>}
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
                <Link to={addReturnAgentToUrl(safeMarketplaceQuery(toolName) ? `/plugin-market?tool=${encodeURIComponent(safeMarketplaceQuery(toolName))}` : "/plugin-market",returnSpecId||"")} target="_blank" rel="noopener noreferrer" className="rounded-md border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10">寻找插件</Link>
                <Link to={safeMarketplaceQuery(toolName) ? `/tool-connections?tool=${encodeURIComponent(safeMarketplaceQuery(toolName))}` : "/tool-connections"} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">自定义连接</Link>
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
        勾选后将工具的真实标识写入方案。内置和已启用 HTTP 工具可按授权调用；市场插件执行前仍需人工审批。选定具体插件工具后，本 Agent 将只获得这些已验证的插件工具。
      </p>
    </div>
  )
}

export function SpecEditorCard(p: SpecEditorCardProps) {
  const [selectedTab, setSelectedTab] = useState("goal")
  const tabId = useId()
  const tabs = [
    {id:"goal",label:"目标与交付",icon:Target},
    {id:"roles",label:"角色与任务",icon:UsersRound},
    ...(p.focus === "plan" ? [] : [{id:"resources",label:"工具与资料",icon:Wrench}]),
    {id:"criteria",label:"完成标准",icon:Flag},
  ]
  const activeTab = p.focus === "resources" ? "resources" :
    tabs.some(tab=>tab.id===selectedTab) ? selectedTab : "goal"
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/25 px-4 py-4 sm:px-6">
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
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {p.sourceMode === "template" ? "模板方案" : "Agent 设计工作台"}
              <span className="ml-2">{p.dirty ? "有未保存修改" : p.savedSpecId ? "已保存" : "草稿"}</span>
            </span>
          </div>
        </div>
        {p.showClear !== false && <Button
          type="button" variant="ghost" size="sm" onClick={p.onClear}
          className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive">
          <X className="mr-1 h-4 w-4" />清空
        </Button>}
      </div>

      {p.focus !== "resources" && <div role="tablist" aria-label="Agent 方案设计模块"
        className="flex flex-wrap gap-1 border-b border-border bg-background/60 px-3 py-2 sm:px-5">
        {tabs.map((tab,index)=><button key={tab.id} type="button" role="tab"
          id={`${tabId}-tab-${tab.id}`} aria-controls={`${tabId}-panel-${tab.id}`}
          aria-selected={activeTab===tab.id} tabIndex={activeTab===tab.id?0:-1}
          onClick={()=>setSelectedTab(tab.id)}
          onKeyDown={event=>{
            if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return
            event.preventDefault()
            const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:
              (index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length
            setSelectedTab(tabs[next].id)
            document.getElementById(`${tabId}-tab-${tabs[next].id}`)?.focus()
          }}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition sm:text-sm ${activeTab===tab.id?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
          <tab.icon className="h-4 w-4"/>{tab.label}
          {tab.id==="roles"&&Boolean(p.spec.roles?.length)&&<span className="rounded-full bg-primary/10 px-1.5 text-[10px]">{p.spec.roles?.length}</span>}
        </button>)}
      </div>}

      <div role={p.focus === "resources"?undefined:"tabpanel"}
        id={`${tabId}-panel-${activeTab}`} aria-labelledby={p.focus === "resources"?undefined:`${tabId}-tab-${activeTab}`}
        className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-2">
        {activeTab === "goal" && (<>
        <SectionBlock title="目标 · 优先确认" featured icon={<Target className="h-4 w-4" />}>
          <Textarea
            rows={4}
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
        </>)}
        {activeTab === "resources" && (<>
        <AgentCapabilityPlanner spec={p.spec} onChange={p.onSpecChange}
          analysis={p.toolAnalysis} connections={p.connectedTools} marketTools={p.connectedMarketTools}
          returnSpecId={p.savedSpecId} notice={p.toolMatchNotice}
          onRematch={p.onRematchTools}/>
        <SectionBlock title="手动选择工具" icon={<Wrench className="h-4 w-4" />}>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">查看内置工具和已有连接 · {p.spec.tools.length} 项已加入方案</summary>
            <div className="mt-3">
          <ToolPickerBlock
            spec={p.spec}
            toolStatusOf={p.toolStatusOf}
            builtinTools={p.builtinTools}
            connectedTools={p.connectedTools}
            connectedMarketTools={p.connectedMarketTools}
            onToggleTool={p.onToggleTool}
            returnSpecId={p.savedSpecId}
            onRemovePending={(toolName) => p.onToggleTool(toolName, false)}
          />
            </div>
          </details>
        </SectionBlock>
        <SectionBlock title="关联知识库" icon={<BookOpen className="h-4 w-4" />}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              选中后 Agent 可检索你的专属资料，并按片段出处引用。
            </p>
            {p.onRefreshKnowledgeBases && <button type="button"
              aria-label="刷新知识库列表" disabled={p.knowledgeBasesLoading}
              onClick={p.onRefreshKnowledgeBases}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-secondary disabled:opacity-50">
              {p.knowledgeBasesLoading?"同步中…":"刷新"}
            </button>}
          </div>
          {p.knowledgeBasesError && <p role="alert"
            className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            {p.knowledgeBasesError}
          </p>}
          {p.knowledgeBases.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              {p.knowledgeBasesLoading?"正在读取已授权知识库…":"尚无已授权知识库。"}<Link to={addReturnAgentToUrl("/knowledge-bases",p.savedSpecId||"")} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">创建并上传资料 →</Link>
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
          <Link to={addReturnAgentToUrl("/knowledge-bases",p.savedSpecId||"")} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            管理知识库 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionBlock>
        </>)}
        {activeTab === "roles" && (<>
        <div className="xl:col-span-2"><AgentRoleDesigner spec={p.spec} onChange={p.onSpecChange}/></div>
        <SectionBlock title="任务规划 · 执行步骤" featured icon={<Route className="h-4 w-4" />}>
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
        </>)}
        {activeTab === "criteria" && (<>
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 xl:col-span-2">
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={Boolean(p.spec.require_plan_review)}
              onChange={event => p.onTogglePlanReview(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-primary"/>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">阶段方案需我确认后才继续</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                适用于需求落地、研究计划和多阶段交付：先展示方案草案，等待批准或提出修改意见；
                确认后再完成后续计划。不同于外部写操作的权限审批。
              </span>
            </span>
          </label>
        </div>
        <SectionBlock title="完成标准 · 如何验收" featured icon={<Flag className="h-4 w-4" />}>
          <ListRows
            field="done_criteria"
            items={p.spec.done_criteria}
            onChange={p.onListItemChange}
            onAdd={p.onListItemAdd}
            onRemove={p.onListItemRemove}
            addLabel="添加标准"
          />
        </SectionBlock>
        </>)}
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-6">
        {p.saveConflict && <div role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">服务器版本已更新，未覆盖你的草稿</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              可以另存为独立 Agent，之后再对比最新的正式版本；原 Agent 保持不变。
            </p>
          </div>
          {p.onSaveAsCopy && <button type="button" onClick={p.onSaveAsCopy} disabled={p.isSaving}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">
            另存为新 Agent
          </button>}
        </div>}
        {!p.compactActions && <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            请核对目标、执行步骤和完成标准，保存后再进行资源配置与试跑。
          </p>
          <Button type="button" onClick={p.onSave}
            disabled={p.isSaving || (Boolean(p.savedSpecId) && p.dirty===false && !p.saveConflict)}
            className="h-11 w-full rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:w-auto">
            {p.isSaving ? <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin"/>保存中…
            </> : p.savedSpecId && p.dirty===false && !p.saveConflict ? <>
              <Save className="mr-2 h-4 w-4"/>已保存
            </> : <>
              <Save className="mr-2 h-4 w-4"/>保存到我的助手
            </>}
          </Button>
        </div>}
        <section aria-label="随时调整方案" className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <h3 className="text-xs font-semibold text-foreground">
            <Wand2 className="mr-1 inline h-3.5 w-3.5 text-primary"/>让 AI 帮我调整方案
          </h3>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input value={p.reviseInput}
              onChange={(e)=>p.onReviseInputChange(e.target.value)}
              onKeyDown={(e)=>{
                if(e.key==="Enter" && !p.isRevising && p.reviseInput.trim())p.onRevise()
              }}
              aria-label="方案修改要求"
              placeholder="例如：增加事实核验角色，或改用我已连接的工具"
              className="h-11 min-w-0 flex-1 rounded-lg border-border bg-card text-sm"/>
            <Button type="button" variant="outline" onClick={p.onRevise}
              disabled={p.isRevising || !p.reviseInput.trim()}
              className="h-11 shrink-0 rounded-lg border-primary/40 px-4 text-primary hover:bg-primary/10">
              {p.isRevising?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:
                <Wand2 className="mr-2 h-4 w-4"/>}
              {p.isRevising?"修订中…":"生成修改预览"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            AI 修订会使用你已连接的模型，可能产生费用；请检查修订结果后保存。
          </p>
          {p.revisionProposal && p.onApplyRevision && p.onDiscardRevision &&
            <AgentRevisionPreview current={p.spec} proposal={p.revisionProposal}
              onApply={p.onApplyRevision} onDiscard={p.onDiscardRevision}/>}
        </section>
        {!p.compactActions && p.savedMsg && (
          <p role="status" className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0"/>
            {p.savedMsg}
            {p.focus !== "plan" && p.focus !== "resources" && p.savedSpecId && (
              <Link to={`/agent-run?spec=${encodeURIComponent(p.savedSpecId)}`}
                className="ml-1 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                前往试跑 <ArrowRight className="h-3.5 w-3.5"/>
              </Link>
            )}
          </p>
        )}
      </div>    </div>
  )
}
