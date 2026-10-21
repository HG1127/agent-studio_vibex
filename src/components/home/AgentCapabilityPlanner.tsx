import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Check, ChevronDown, CircleAlert, ExternalLink, Monitor, Pencil, Plug, Plus, RefreshCw, Search, Sparkles, Trash2, Undo2, Users } from "lucide-react"
import type { AgentSpec, ConnectedToolOption } from "@/pages/Home/presets"
import type { ToolResolution } from "@/lib/agentToolMatcher"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import { addAgentCapability, bindAgentCapability, buildAgentCapabilityPlan, MAX_AGENT_CAPABILITIES,
  removeAgentCapability, restoreAgentCapability, updateAgentCapability,
  type CapabilityCandidate, type CapabilityKind, type CapabilityPlanRow,
  type CapabilityRequirementChanges, type RemovedAgentCapability } from "@/lib/agentCapabilityPlan"
import { agentResourceSetupUrl, safeCapabilityId } from "@/lib/toolSearchPrivacy"
import { AgentToolAutoConnect } from "./AgentToolAutoConnect"

type Props = {
  spec: AgentSpec
  onChange: (next: AgentSpec) => void
  analysis: ToolResolution | null
  connections: ConnectedToolOption[]
  marketTools: VerifiedMarketTool[]
  returnSpecId?: string
  editorContextKey?: string | number
  active?: boolean
  notice: string
  onRematch: () => void
}
const STATES = {
  selected: {label: "已选用", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"},
  available: {label: "有候选 · 待选择", className: "bg-primary/10 text-primary"},
  needs_test: {label: "需要测试连接", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"},
  needs_role: {label: "需要分配角色", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"},
  missing: {label: "需要连接", className: "bg-secondary text-muted-foreground"},
}
const KINDS: {value: CapabilityKind; label: string}[] = [
  {value: "web_search", label: "公开资料检索"}, {value: "web_fetch", label: "网页正文读取"},
  {value: "knowledge", label: "知识库检索"}, {value: "calculate", label: "数值计算"},
  {value: "text", label: "文本整理"}, {value: "document", label: "文档与表格"},
  {value: "browser", label: "浏览器操作"}, {value: "desktop", label: "电脑软件操作"},
  {value: "integration", label: "业务系统 / API"}, {value: "custom", label: "其他能力"},
]
const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"

/** A new Agent context must not inherit another draft's uncommitted editor or undo. */
export function AgentCapabilityPlanner(p: Props) {
  return <CapabilityPlannerWorkspace key={p.editorContextKey ?? p.returnSpecId ?? "draft"} {...p}/>
}

function CapabilityRequirementEditor({row, onApply, onCancel, onDelete}: {
  row: CapabilityPlanRow
  onApply: (changes: CapabilityRequirementChanges) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(row.title)
  const [purpose, setPurpose] = useState(row.purpose)
  const [kind, setKind] = useState(row.kind)
  const [access, setAccess] = useState(row.access)
  const [required, setRequired] = useState(row.required)
  return <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/20 p-3" aria-label="编辑能力需求">
    <label className="block text-xs font-medium">能力名称
      <input className={inputClass} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：读取已登录页面中的订单"/>
    </label>
    <label className="block text-xs font-medium">用途与具体动作
      <textarea className={`${inputClass} min-h-20 resize-y`} maxLength={600} value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="说明读取什么、执行什么动作，以及交付什么结果"/>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-medium">能力类别
        <select className={inputClass} value={kind} onChange={event => setKind(event.target.value as CapabilityKind)}>
          {KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium">操作范围
        <select className={inputClass} value={access} onChange={event => setAccess(event.target.value as "read" | "write")}>
          <option value="read">读取 / 分析</option><option value="write">包含操作或写入</option>
        </select>
      </label>
    </div>
    <label className="flex min-h-9 items-center gap-2 text-xs">
      <input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} className="h-4 w-4 accent-primary"/>
      必需能力：未配置完成时阻止试跑
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">修改用途或操作后会重新核验工具匹配。操作范围描述任务意图，实际调用仍按工具权限与运行审批执行。</p>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!title.trim()} onClick={() => onApply({title, purpose, kind, access, required})}
        className="min-h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">应用需求修改</button>
      <button type="button" onClick={onCancel} className="min-h-9 rounded-lg border border-border px-3 text-xs">取消</button>
      <button type="button" onClick={onDelete} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/5">
        <Trash2 className="h-3.5 w-3.5"/>删除需求
      </button>
    </div>
  </div>
}

function CapabilityPlannerWorkspace(p: Props) {
  const [params] = useSearchParams()
  const focusCapability = safeCapabilityId(params.get("focusCapability") || "")
  const focused = useRef("")
  const workspaceRef = useRef<HTMLElement>(null)
  const [editingId, setEditingId] = useState("")
  const [lastRemoved, setLastRemoved] = useState<RemovedAgentCapability | null>(null)
  const [localNotice, setLocalNotice] = useState("")
  const rows = useMemo(() => buildAgentCapabilityPlan(p.spec, p.analysis, p.connections, p.marketTools),
    [p.spec, p.analysis, p.connections, p.marketTools])
  useEffect(() => {
    if (p.active === false || !focusCapability || focused.current === focusCapability) return
    const workspace = workspaceRef.current
    if (!workspace || !workspace.getClientRects().length || workspace.closest('[hidden], [inert], [aria-hidden="true"]')) return
    const card = workspace.querySelector<HTMLElement>(`[data-capability-id="${focusCapability}"]`)
    focused.current = focusCapability
    if (card) { card.scrollIntoView({block: "nearest"}); card.focus({preventScroll: true}) }
    else setLocalNotice("原能力需求已不在当前清单中，请查看下面的当前配置。")
  }, [focusCapability, p.active])
  const roles = p.spec.roles || []
  const select = (need: CapabilityPlanRow, id: string) => {
    const next = bindAgentCapability(p.spec, need.id, id, p.analysis, p.connections, p.marketTools)
    if (next !== p.spec) p.onChange(next)
  }
  const edit = (id: string, changes: CapabilityRequirementChanges) => {
    p.onChange(updateAgentCapability(p.spec, id, changes, p.analysis))
  }
  const add = () => {
    const id = `capability_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const next = addAgentCapability(p.spec, {id, title: "新能力", purpose: "", kind: "custom", access: "read",
      required: true, role_ids: [], search_terms: [], suggested_tool_ids: []}, p.analysis)
    if (next === p.spec) return
    p.onChange(next); setEditingId(id); setLocalNotice("")
  }
  const remove = (id: string) => {
    const result = removeAgentCapability(p.spec, id, p.analysis)
    if (!result.removed) return
    p.onChange(result.spec); setLastRemoved(result.removed); setEditingId(""); setLocalNotice("")
  }
  const undo = () => {
    if (!lastRemoved) return
    const next = restoreAgentCapability(p.spec, lastRemoved, p.analysis)
    if (next === p.spec) { setLocalNotice("清单已满或已有同一需求，请先调整清单后再撤销。"); return }
    p.onChange(next); setLastRemoved(null); setLocalNotice("已恢复删除的需求，当前其他修改保持不变。")
  }
  const requiredPending = rows.filter(row => row.required && row.state !== "selected").length
  const missingAnalysis = rows.filter(row => row.state === "missing").map(row => ({
    name: row.title, searchTerm: row.searchTerm, reason: row.purpose,
  }))
  const discoveryAnalysis = p.analysis ? {...p.analysis, gaps: missingAnalysis} : {
    resolvedTools: [], safeAutoBindings: [], recommendations: [], gaps: missingAnalysis,
  }
  return <section ref={workspaceRef} aria-label="Harness 能力规划" className="min-w-0 space-y-4 xl:col-span-2">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary"/>任务需要什么能力</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            确认需求，分配负责角色，再选用已有工具。缺少能力时接入插件、API 或执行环境，测试后回到此处刷新。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={rows.length >= MAX_AGENT_CAPABILITIES} onClick={add}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium disabled:opacity-50">
            <Plus className="h-3.5 w-3.5"/>添加能力
          </button>
          <button type="button" onClick={p.onRematch} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 text-xs font-semibold text-primary">
            <RefreshCw className="h-3.5 w-3.5"/>重新匹配工具
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span><strong className="text-foreground">{rows.length}</strong> / {MAX_AGENT_CAPABILITIES} 项能力需求</span>
        <span><strong className="text-foreground">{rows.filter(row => row.state === "selected").length}</strong> 项已选用</span>
        <span className={requiredPending ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
          {requiredPending ? `${requiredPending} 项必需能力待处理` : rows.length ? "必需能力已配置；试跑检验实际调用" : "尚未声明能力需求"}
        </span>
      </div>
      {p.notice && <p role="status" className="mt-2 text-xs text-primary">{p.notice}</p>}
      {localNotice && <p role="status" className="mt-2 text-xs text-primary">{localNotice}</p>}
    </div>
    {lastRemoved && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-2 text-xs">
      <span>已删除“{lastRemoved.requirement.title}”。既有工具权限保留。</span>
      <button type="button" onClick={undo} className="inline-flex min-h-9 items-center gap-1.5 font-medium text-primary"><Undo2 className="h-3.5 w-3.5"/>撤销删除</button>
    </div>}
    {rows.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm leading-relaxed text-muted-foreground">
      当前清单为空。可直接由模型完成文本任务，或点击“添加能力”补充需要的工具。刷新连接不会重新添加你已删除的需求。
    </p>}
    <div className="space-y-3">
      {rows.map(row => {
        const state = STATES[row.state]
        const execution = row.kind === "browser" || row.kind === "desktop"
        const connectUrl = agentResourceSetupUrl(execution ? "/execution-connections" : "/tool-connections", p.returnSpecId || "", row.id)
        const marketUrl = agentResourceSetupUrl(row.searchTerm ? `/plugin-market?tool=${encodeURIComponent(row.searchTerm)}` : "/plugin-market", p.returnSpecId || "", row.id)
        const httpTestUrl = agentResourceSetupUrl("/tool-connections", p.returnSpecId || "", row.id)
        const marketManageUrl = agentResourceSetupUrl("/plugin-market", p.returnSpecId || "", row.id)
        const mappedCandidates = row.candidates.filter(tool => !tool.needsMapping)
        const newCandidates = row.candidates.filter(tool => tool.needsMapping)
        const unknownRoles = row.role_ids.filter(id => !roles.some(role => role.id === id))
        const candidateButton = (tool: CapabilityCandidate) => {
          const needsRoleChoice = roles.length > 0 && (unknownRoles.length > 0 ||
            (!row.role_ids.length && !(tool.roleAssigned && p.spec.tools.includes(tool.id))))
          return <button key={tool.id} type="button" onClick={() => select(row, tool.id)}
            aria-pressed={tool.selected} disabled={needsRoleChoice || tool.selected}
            title={needsRoleChoice ? "请先选择负责角色，再选用并分配工具" : undefined}
            className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs disabled:cursor-default ${tool.selected ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/40 disabled:opacity-50"}`}>
            {tool.selected ? <Check className="h-3.5 w-3.5 shrink-0"/> : <Plug className="h-3.5 w-3.5 shrink-0"/>}
            <span className="min-w-0 break-words">
              <span className="block font-medium">{tool.label} · {tool.selected ? "已选用" : roles.length ? "选用并分配" : "选用工具"}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{tool.source === "builtin" ? "内置工具" : tool.tested ? "最近测试通过" : "尚未通过测试"}{needsRoleChoice ? " · 先选择负责角色" : ""}</span>
              {tool.needsMapping && tool.description && <span className="mt-1 block max-w-xl text-[11px] leading-relaxed text-muted-foreground">{tool.description.slice(0, 220)}</span>}
            </span>
          </button>
        }
        return <article key={row.id} data-capability-id={row.id} tabIndex={-1} aria-label={`能力需求：${row.title}`}
          className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-background/60 p-4 focus:outline-none focus:ring-2 focus:ring-primary/30">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {row.state === "selected" ? <Check className="h-4 w-4 text-emerald-600"/> : <CircleAlert className="h-4 w-4 text-muted-foreground"/>}
                {row.title}<span className="text-[11px] font-normal text-muted-foreground">{row.required ? "必需" : "可选"} · {row.access === "write" ? "包含操作或写入" : "读取 / 分析"}</span>
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.purpose || "请补充用途和需要完成的具体动作"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${state.className}`}>{state.label}</span>
              <button type="button" aria-expanded={editingId === row.id} onClick={() => setEditingId(editingId === row.id ? "" : row.id)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Pencil className="h-3.5 w-3.5"/>编辑需求<ChevronDown className={`h-3 w-3 ${editingId === row.id ? "rotate-180" : ""}`}/>
              </button>
            </div>
          </div>
          {editingId === row.id && <CapabilityRequirementEditor
            key={JSON.stringify([row.id, row.title, row.purpose, row.kind, row.access, row.required])} row={row}
            onApply={changes => { edit(row.id, changes); setEditingId("") }} onCancel={() => setEditingId("")} onDelete={() => remove(row.id)}/>}
          {(roles.length > 0 || unknownRoles.length > 0) && <fieldset className="mt-3 rounded-lg bg-secondary/30 px-3 pb-3 pt-2">
            <legend className="px-1 text-xs font-medium"><Users className="mr-1 inline h-3.5 w-3.5"/>负责角色</legend>
            {row.state === "needs_role" && <p className="mb-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              {row.role_ids.length && !unknownRoles.length ? "负责角色已确定，点击下方工具的“选用并分配”完成授权。" : "已有工具可用，请先在此选择负责角色，再选用并分配工具。"}
            </p>}
            <div className="flex flex-wrap gap-2">
              {roles.map(role => <label key={role.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs ${row.role_ids.includes(role.id) ? "border-primary/30 bg-primary/5 text-primary" : "border-border bg-background"}`}>
                <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={row.role_ids.includes(role.id)}
                  onChange={event => edit(row.id, {role_ids: event.target.checked ? [...row.role_ids, role.id] : row.role_ids.filter(id => id !== role.id)})}/>{role.name}
              </label>)}
            </div>
            {unknownRoles.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">原负责角色已不存在。
              <button type="button" onClick={() => edit(row.id, {role_ids: row.role_ids.filter(id => !unknownRoles.includes(id))})} className="ml-2 min-h-8 font-medium underline">清理失效角色</button>
            </p>}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">选择角色只调整分工；点击“选用并分配”才向所选角色分配工具。已有权限保留。</p>
          </fieldset>}
          {mappedCandidates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{mappedCandidates.map(candidateButton)}</div>}
          {newCandidates.length > 0 && <details className="mt-3 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium text-primary">选用已有连接（{newCandidates.length}）</summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">请确认工具说明符合这项需求。匹配建议不代表授权，实际调用仍按运行审批执行。</p>
            <div className="mt-3 flex flex-wrap gap-2">{newCandidates.map(candidateButton)}</div>
          </details>}
          {row.state === "needs_test" && <p className="mt-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">连接已经登记，请完成测试，并确认已选用和分配。选用工具不等于执行环境已经就绪。</p>}
          {row.state === "missing" && <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link to={marketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Search className="h-3.5 w-3.5"/>寻找市场插件<ExternalLink className="h-3 w-3"/>
            </Link>
            <Link to={connectUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              {execution ? <Monitor className="h-3.5 w-3.5"/> : <Plug className="h-3.5 w-3.5"/>}{execution ? "配置执行环境" : "自定义 API / MCP 接入"}
            </Link>
          </div>}
          {row.candidates.some(tool => tool.source !== "builtin") && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {row.candidates.some(tool => tool.source === "http") && <Link to={httpTestUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">查看 / 测试连接<ExternalLink className="h-3 w-3"/></Link>}
            {row.candidates.some(tool => tool.source === "market") && <Link to={marketManageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">管理 / 测试 MCP 连接<ExternalLink className="h-3 w-3"/></Link>}
          </div>}
        </article>
      })}
    </div>
    {missingAnalysis.length > 0 && <AgentToolAutoConnect analysis={discoveryAnalysis} returnSpecId={p.returnSpecId}/>}
    <p className="text-xs leading-relaxed text-muted-foreground">“已选用”表示方案绑定；运行时仍会核验账号权限、工具健康和审批。接入页在新标签打开，原草稿保留在本标签；完成后回到这里点击“重新匹配工具”。</p>
  </section>
}
