import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Check, CircleAlert, ExternalLink, Monitor, Plug, RefreshCw, Search, Sparkles } from "lucide-react"
import type { AgentSpec, ConnectedToolOption } from "@/pages/Home/presets"
import type { ToolResolution } from "@/lib/agentToolMatcher"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import { bindAgentCapability, buildAgentCapabilityPlan, type CapabilityCandidate, type CapabilityPlanRow } from "@/lib/agentCapabilityPlan"
import { addReturnAgentToUrl } from "@/lib/toolSearchPrivacy"
import { AgentToolAutoConnect } from "./AgentToolAutoConnect"

type Props = {
  spec: AgentSpec
  onChange: (next: AgentSpec) => void
  analysis: ToolResolution | null
  connections: ConnectedToolOption[]
  marketTools: VerifiedMarketTool[]
  returnSpecId?: string
  notice: string
  onRematch: () => void
}
const STATES = {
  selected: {label: "已选用", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"},
  available: {label: "有候选 · 待选择", className: "bg-primary/10 text-primary"},
  needs_test: {label: "需要测试连接", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"},
  missing: {label: "需要连接", className: "bg-secondary text-muted-foreground"},
}

export function AgentCapabilityPlanner(p: Props) {
  const rows = useMemo(() => buildAgentCapabilityPlan(p.spec, p.analysis, p.connections, p.marketTools),
    [p.spec, p.analysis, p.connections, p.marketTools])
  const select = (need: CapabilityPlanRow, id: string) => {
    if (!need.candidates.some(candidate => candidate.id === id)) return
    p.onChange(bindAgentCapability(p.spec,need.id,id,p.analysis,p.connections,p.marketTools))
  }
  const requiredPending = rows.filter(row => row.required && row.state !== "selected").length
  const missingAnalysis = rows.filter(row => row.state === "missing").map(row => ({
    name: row.title, searchTerm: row.searchTerm, reason: row.purpose,
  }))
  const discoveryAnalysis = p.analysis ? {...p.analysis, gaps: missingAnalysis} : {
    resolvedTools: [], safeAutoBindings: [], recommendations: [], gaps: missingAnalysis,
  }
  return <section aria-label="Harness 能力规划" className="min-w-0 space-y-4 xl:col-span-2">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary"/>任务需要什么能力</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            从任务与角色反推工具需求，优先使用已有连接。市场候选需要完成连接和测试；电脑与浏览器操作需要对应执行工具。
          </p>
        </div>
        <button type="button" onClick={p.onRematch} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 text-xs font-semibold text-primary">
          <RefreshCw className="h-3.5 w-3.5"/>重新匹配工具
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span><strong className="text-foreground">{rows.length}</strong> 项能力需求</span>
        <span><strong className="text-foreground">{rows.filter(row => row.state === "selected").length}</strong> 项已选用</span>
        <span className={requiredPending ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
          {requiredPending ? `${requiredPending} 项必需能力待处理` : "必需能力已配置；试跑检验实际调用"}
        </span>
      </div>
      {p.notice && <p role="status" className="mt-2 text-xs text-primary">{p.notice}</p>}
    </div>
    {rows.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      当前方案未声明外部能力。可直接由模型完成文本任务，或通过下方方案调整补充所需资料与操作。
    </p>}
    <div className="space-y-3">
      {rows.map(row => {
        const state = STATES[row.state]
        const execution = row.kind === "browser" || row.kind === "desktop"
        const connectUrl = addReturnAgentToUrl(execution ? "/execution-connections" : "/tool-connections", p.returnSpecId || "")
        const marketUrl = addReturnAgentToUrl(row.searchTerm ? `/plugin-market?tool=${encodeURIComponent(row.searchTerm)}` : "/plugin-market", p.returnSpecId || "")
        const mappedCandidates = row.candidates.filter(tool=>!tool.needsMapping)
        const newCandidates = row.candidates.filter(tool=>tool.needsMapping)
        const candidateButton = (tool:CapabilityCandidate) => <button key={tool.id} type="button" onClick={() => select(row, tool.id)}
          aria-pressed={tool.selected}
          className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${tool.selected ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/40"}`}>
          {tool.selected ? <Check className="h-3.5 w-3.5 shrink-0"/> : <Plug className="h-3.5 w-3.5 shrink-0"/>}
          <span className="min-w-0 break-words">
            <span className="block">{tool.label} · {tool.source === "builtin" ? "内置" : tool.tested ? "最近测试通过" : "尚未通过测试"}{tool.needsMapping ? " · 选用并绑定" : ""}</span>
            {tool.needsMapping && tool.description && <span className="mt-1 block max-w-xl text-[11px] leading-relaxed text-muted-foreground">{tool.description.slice(0,220)}</span>}
          </span>
        </button>
        return <article key={row.id} className="min-w-0 rounded-xl border border-border bg-background/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {row.state === "selected" ? <Check className="h-4 w-4 text-emerald-600"/> : <CircleAlert className="h-4 w-4 text-muted-foreground"/>}
                {row.title}<span className="text-[11px] font-normal text-muted-foreground">{row.required ? "必需" : "可选"} · {row.access === "write" ? "包含操作或写入" : "读取 / 分析"}</span>
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.purpose || "用于完成当前任务的交付要求"}</p>
              {row.roleNames.length > 0 && <p className="mt-1 text-xs text-muted-foreground">负责角色：{row.roleNames.join("、")}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${state.className}`}>{state.label}</span>
          </div>
          {mappedCandidates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{mappedCandidates.map(candidateButton)}</div>}
          {newCandidates.length > 0 && <details className="mt-3 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium text-primary">绑定已有连接（{newCandidates.length}）</summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">请确认工具说明符合任务。选用后只会分配给这项能力指定的角色，实际调用仍按运行审批执行。</p>
            <div className="mt-3 flex flex-wrap gap-2">{newCandidates.map(candidateButton)}</div>
          </details>}
          {row.state !== "selected" && <div className="mt-3 flex flex-wrap items-center gap-3">
            {row.state === "needs_test" && <p className="w-full text-xs text-amber-700 dark:text-amber-300">连接已经登记，请先测试。选择工具不等于执行环境已经就绪。</p>}
            <Link to={marketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Search className="h-3.5 w-3.5"/>寻找市场插件<ExternalLink className="h-3 w-3"/>
            </Link>
            <Link to={connectUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              {execution ? <Monitor className="h-3.5 w-3.5"/> : <Plug className="h-3.5 w-3.5"/>}{execution ? "配置执行环境" : "自定义 API / MCP 接入"}
            </Link>
          </div>}
        </article>
      })}
    </div>
    {missingAnalysis.length > 0 && <AgentToolAutoConnect analysis={discoveryAnalysis}
      returnSpecId={p.returnSpecId}/>}
    <p className="text-xs leading-relaxed text-muted-foreground">“已选用”表示方案绑定；运行时仍会核验账号权限、工具健康和审批。连接页在新标签打开，返回后重新匹配即可更新当前方案。</p>
  </section>
}
