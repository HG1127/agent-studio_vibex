import { useState } from "react"
import { AlertCircle, ChevronDown, Cpu, ListChecks, Network, PlugZap, SlidersHorizontal, Wrench, X } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Link } from "react-router-dom"
import type { BuiltinTool, CustomModelOption, SavedSpecRow } from "@/pages/AgentRun/useAgentRun"
import type { VerifiedMarketTool } from "@/lib/marketToolSelection"
import type { AgentRunReadiness } from "@/lib/agentRunReadiness"
import { safeMarketplaceQuery } from "@/lib/toolSearchPrivacy"

type SpecConfigPanelProps = {
  specList: SavedSpecRow[]
  isLoadingSpecs: boolean
  selectedSpecId: string
  onSelectSpec: (specId: string) => void
  selectedSpec: SavedSpecRow | null
  onEditSpec: () => void
  genWfBusy: boolean
  onGenerateWorkflow: () => void
  customModels: CustomModelOption[]
  isCustomModel: boolean
  model: string
  onModelChange: (model: string) => void
  builtinTools: BuiltinTool[]
  connectedToolNames: string[]
  marketToolCount: number
  connectedMarketTools: VerifiedMarketTool[]
  runReadiness: AgentRunReadiness
  toolConnectionsLoading: boolean
  toolConnectionsError: string
  onRefreshConnections: () => void
  enabledTools: string[]
  onToggleTool: (toolId: string) => void
  maxSteps: number
  onMaxStepsChange: (value: number) => void
  maxModelCalls: number
  onMaxModelCallsChange: (value: number) => void
  maxRuntimeMinutes: number
  onMaxRuntimeMinutesChange: (value: number) => void
  stopCondition: string
  onStopConditionChange: (value: string) => void
  stopOnComplete: boolean
  onStopOnCompleteChange: (value: boolean) => void
  requireApproval: boolean
  requirePlanReview: boolean
  onTogglePlanReview: () => void
  onToggleRequireApproval: () => void
  isLoggedIn: boolean
  isLive: boolean
}

export function SpecConfigPanel({
  specList,
  isLoadingSpecs,
  selectedSpecId,
  onSelectSpec,
  selectedSpec,
  genWfBusy,  onEditSpec,

  onGenerateWorkflow,
  customModels,
  isCustomModel,
  model,
  onModelChange,
  builtinTools,
  enabledTools,
  connectedToolNames,
  marketToolCount,
  toolConnectionsLoading,
  toolConnectionsError,
  connectedMarketTools,
  runReadiness,
  onRefreshConnections,
  onToggleTool,
  maxSteps,
  onMaxStepsChange,
  maxModelCalls,
  onMaxModelCallsChange,
  maxRuntimeMinutes,
  onMaxRuntimeMinutesChange,
  stopCondition,
  onStopConditionChange,
  stopOnComplete,
  onStopOnCompleteChange,
  requireApproval,
  onToggleRequireApproval,
  requirePlanReview,
  onTogglePlanReview,
  isLoggedIn,
  isLive,
}: SpecConfigPanelProps) {
  const specTools = selectedSpec?.spec?.tools ?? []
  const selectedMarketCount = specTools.filter(name=>connectedMarketTools.some(tool=>tool.id===name)).length
  const disconnected = specTools.filter(name => !builtinTools.some(t=>t.id===name) &&
    !connectedMarketTools.some(t=>t.id===name) && !connectedToolNames.includes(name)).length

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [section, setSection] = useState("resources")
  const modelLabel = customModels.find(option => option.value === model)?.label
  const selectedBuiltinDisabled = specTools.filter(name => builtinTools.some(tool => tool.id === name) && !enabledTools.includes(name)).length
  const openSection = (next: string) => { setSection(next); setSettingsOpen(true) }

  return (
    <section aria-label="本次运行配置" className="min-w-0 rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="spec-select" className="mb-1.5 block text-xs font-semibold text-muted-foreground">本次使用的助手</label>
          <select id="spec-select" value={selectedSpecId} disabled={!isLoggedIn || isLive}
            onChange={event => onSelectSpec(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
            <option value="">{isLoadingSpecs ? "加载中…" : "选择「我的助手」里的方案"}</option>
            {specList.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          {!isLoadingSpecs && isLoggedIn && specList.length === 0 && <p className="mt-2 text-xs text-muted-foreground">
            还没有保存过的助手方案，<Link to="/agent-create" className="font-medium text-primary hover:underline">先创建一个助手 →</Link>
          </p>}
        </div>
        <div className="min-w-0 flex-[2] basis-80 self-center">
          <p className="line-clamp-2 text-sm leading-relaxed text-foreground">{selectedSpec?.spec.goal || "选好助手后，填写任务即可开始试跑。"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <button type="button" onClick={() => openSection("resources")} className="inline-flex max-w-full items-center gap-1.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Cpu className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{isCustomModel ? modelLabel || "已选择模型" : "连接运行模型"}</span>
            </button>
            <button type="button" onClick={() => openSection("resources")} className={`inline-flex items-center gap-1.5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${disconnected > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
              <Wrench className="h-3.5 w-3.5" />{toolConnectionsLoading ? "读取工具连接…" : disconnected > 0 ? `${disconnected} 项待连接` : `内置 ${enabledTools.length} 项 · 插件 ${selectedMarketCount} 项`}
            </button>
            <button type="button" onClick={() => openSection("completion")} className="inline-flex items-center gap-1.5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ListChecks className="h-3.5 w-3.5" />{requirePlanReview ? "阶段方案需确认" : "查看完成标准"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-center">
          {selectedSpec && <button type="button" onClick={onEditSpec} aria-label={`调整正式 Agent 方案：${selectedSpec.name}`}
            className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">调整正式方案</button>}
          <button type="button" aria-expanded={settingsOpen} aria-controls="run-config-content" onClick={() => setSettingsOpen(open => !open)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-foreground hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <SlidersHorizontal className="h-4 w-4" />本次设置<ChevronDown className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {selectedSpec && !isLive && runReadiness.issues.length > 0 && <section aria-label="新任务启动检查" className="border-t border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/20 sm:px-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400" />新任务启动检查</h2>
        <p className="mt-1 text-xs text-muted-foreground">{toolConnectionsLoading ? "正在核验工具连接…" : "试跑前请补齐以下配置。"}</p>
        {!toolConnectionsLoading && <>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5">{runReadiness.issues.slice(0, 4).map(issue => <li key={issue}>{issue}</li>)}</ul>
          {runReadiness.issues.length > 4 && <details className="mt-1 text-xs leading-5"><summary className="cursor-pointer text-muted-foreground">其他待补齐项（{runReadiness.issues.length - 4}）</summary><ul className="mt-1 list-inside list-disc space-y-1">{runReadiness.issues.slice(4).map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
          {toolConnectionsError && <p role="status" className="mt-2 text-xs text-muted-foreground">{toolConnectionsError}</p>}
        </>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-primary">
          <button type="button" onClick={onEditSpec} className="hover:underline">调整角色与能力需求</button>
          {runReadiness.capabilityIssues.length > 0 && <>
            <Link to="/execution-connections" target="_blank" rel="noopener noreferrer" className="hover:underline">配置电脑与浏览器</Link>
            <Link to="/tool-connections" target="_blank" rel="noopener noreferrer" className="hover:underline">管理工具连接</Link>
            <button type="button" onClick={() => openSection("resources")} className="hover:underline">检查本次工具开关</button>
            <button type="button" onClick={onRefreshConnections} disabled={toolConnectionsLoading} className="hover:underline disabled:opacity-50">重新核验连接</button>
          </>}
        </div>
      </section>}
      {selectedSpec && !isLive && runReadiness.issues.length === 0 && (disconnected > 0 || selectedBuiltinDisabled > 0 || !isCustomModel) && <div role="status" className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-5 py-2.5 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{!isCustomModel ? "请先连接并选择运行模型。" : disconnected > 0 ? `方案有 ${disconnected} 项工具待连接，相关动作需要先补齐能力。` : `方案中的 ${selectedBuiltinDisabled} 项内置工具在本次运行中已关闭。`}</span>
        <button type="button" onClick={() => openSection("resources")} className="font-semibold text-primary hover:underline">检查模型与工具 →</button>
      </div>}
      <div id="run-config-content" hidden={!settingsOpen} className="border-t border-border">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div><h2 className="text-sm font-semibold text-foreground">运行配置</h2><p className="mt-1 text-xs text-muted-foreground">仅对本次试跑生效；长期默认设置请调整正式方案并保存。</p></div>
          <button type="button" onClick={() => setSettingsOpen(false)} aria-label="收起本次运行设置" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4" /></button>
        </div>
        <Tabs value={section} onValueChange={setSection} className="p-4 sm:p-5">
          <TabsList aria-label="运行设置分类" className="h-auto max-w-full justify-start gap-1 overflow-x-auto">
            <TabsTrigger value="resources">模型与工具</TabsTrigger>
            <TabsTrigger value="completion">完成标准与确认</TabsTrigger>
            <TabsTrigger value="budget">执行预算</TabsTrigger>
            <TabsTrigger value="plan">方案步骤</TabsTrigger>
          </TabsList>
          <TabsContent value="plan" forceMount className="mt-4 data-[state=inactive]:hidden">
      {selectedSpec && (
        <div className="rounded-xl bg-secondary/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">当前保存的方案</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">{selectedSpec.spec.goal}</p>
          {selectedSpec.spec.task_plan.length > 0 && (
            <ol className="mt-3 grid gap-2 lg:grid-cols-2">
              {selectedSpec.spec.task_plan.map((planItem, planIndex) => (
                <li key={`${planItem}-${planIndex}`} className="flex items-start gap-3 rounded-lg bg-card p-3 text-sm leading-relaxed">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{planIndex + 1}</span>
                  <span>{planItem}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {!selectedSpec && <p className="text-sm text-muted-foreground">选择已保存的助手后查看完整方案。</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">将当前方案转换为可编辑的工作流画布；已创建的运行继续使用原配置快照。</p>
        <button type="button" disabled={!selectedSpec || genWfBusy} onClick={onGenerateWorkflow}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
          <Network className="h-4 w-4" />{genWfBusy ? "正在生成…" : "生成工作流画布"}
        </button>
      </div>
      </TabsContent>
      <TabsContent value="resources" forceMount className="mt-4 data-[state=inactive]:hidden">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/20 p-4">
        <label htmlFor="model-select" className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          运行引擎模型
        </label>
        <select
          id="model-select"
          value={model}
          disabled={isLive}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {customModels.length === 0 && (
            <option value="">暂无模型连接，请先到「模型连接」页添加并启用</option>
          )}
          <optgroup label="我的模型连接">
            {customModels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.hint}
              </option>
            ))}
          </optgroup>
        </select>
        {isCustomModel ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
            <PlugZap className="h-3.5 w-3.5 shrink-0" />
            使用你自己的密钥，费用由你的服务商计，不产生额外平台费用。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            想用自己的模型服务？
            <Link
              to="/model-connections"
              className="ml-1 font-medium text-primary underline-offset-4 transition hover:underline"
            >
              去添加模型连接
            </Link>
            ，启用后这里会出现「自定义」分组。
          </p>
        )}

      </div>

      <section id="run-tool-permissions" aria-label="工具与连接状态" className="min-w-0 rounded-xl border border-border bg-background p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 shrink-0 text-primary"/>
          工具与连接状态
          <span className={`ml-auto text-right text-[11px] font-medium ${disconnected>0?"text-amber-700 dark:text-amber-400":"text-muted-foreground"}`}>
            {disconnected>0 ? `${disconnected} 项待连接` : `${enabledTools.length} 项内置开启 · ${selectedMarketCount} 项市场工具`}
          </span>
        </h3>
        {disconnected>0 && <p role="status" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          有 {disconnected} 项所需工具尚未连接，请选择下方接入方式
        </p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {builtinTools.map((tool) => {
            const enabled = enabledTools.includes(tool.id)
            return (
              <div
                key={tool.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-card-foreground">{tool.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tool.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${tool.title}开关`}
                  disabled={isLive}
                  onClick={() => onToggleTool(tool.id)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
                    enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
                      enabled ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            )
          })}
          {specTools.filter(name => !builtinTools.some(tool => tool.id === name)).map((toolName, toolIndex) => (
            <div
              key={`${toolName}-${toolIndex}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-muted-foreground">{connectedMarketTools.find(tool=>tool.id===toolName)?.label || toolName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{connectedMarketTools.some(tool=>tool.id===toolName) ? "此插件工具已验证，试跑时按当前方案显式授权" : connectedToolNames.includes(toolName) ? "当前账号已启用的 HTTP 工具，试跑时按名称授权" : "当前账号未发现匹配的已启用工具"}</p>
              </div>
              {(connectedToolNames.includes(toolName) || connectedMarketTools.some(tool=>tool.id===toolName)) ? <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">已连接</span> : <div className="flex shrink-0 flex-col items-end gap-1"><span className="text-xs text-muted-foreground">待连接</span><Link to={safeMarketplaceQuery(toolName) ? `/plugin-market?tool=${encodeURIComponent(safeMarketplaceQuery(toolName))}` : "/plugin-market"} className="rounded-lg border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10">寻找插件</Link><Link to={safeMarketplaceQuery(toolName) ? `/tool-connections?tool=${encodeURIComponent(safeMarketplaceQuery(toolName))}` : "/tool-connections"} className="text-xs text-primary hover:underline">配置 HTTP 工具</Link></div>}
            </div>
          ))}
          <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">已验证插件工具：{marketToolCount} 个 · 当前方案已选 {selectedMarketCount} 个</span>
              <button type="button" onClick={onRefreshConnections} disabled={toolConnectionsLoading}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-primary disabled:opacity-50">
                {toolConnectionsLoading ? "刷新中…" : "刷新连接状态"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">只有在方案编辑页明确勾选并保存的已验证插件工具才会授权给新的 Agent 运行，实际调用前仍需人工审批；未选中或断开连接的插件不会出现在本次授权清单中。</p>
            <Link to="/plugin-market" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">查看并管理市场插件 →</Link>
          </div>
        </div>
      </section>
      </div>
      </TabsContent>
      <TabsContent value="budget" forceMount className="mt-4 data-[state=inactive]:hidden">
      <section id="run-advanced-settings" aria-label="执行规则与高级设置" className="grid items-start gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <label htmlFor="max-steps" className="flex items-center justify-between text-sm font-medium text-card-foreground">
          <span>预算上限（最大步数）</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {maxSteps} 步
          </span>
        </label>
        <input
          id="max-steps"
          type="range"
          min={1}
          max={30}
          step={1}
          value={maxSteps}
          disabled={isLive}
          onChange={(e) => onMaxStepsChange(Number(e.target.value))}
          className="w-full accent-primary disabled:opacity-60"
        />
        <p className="text-xs text-muted-foreground">步数是资源上限，不能代表任务完成比例。每一步会调用模型作规划决策。</p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <label htmlFor="max-model-calls" className="flex items-center justify-between text-sm font-medium text-card-foreground">
          <span>模型调用次数上限</span><span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{maxModelCalls} 次</span>
        </label>
        <input id="max-model-calls" type="range" min={1} max={100} step={1} value={maxModelCalls}
          disabled={isLive} onChange={(e) => onMaxModelCallsChange(Number(e.target.value))}
          className="w-full accent-primary disabled:opacity-60" />
        <p className="text-xs text-muted-foreground">服务端强制限额，包含规划、摘要与上下文压缩。此上限不是 Token 或费用硬上限。</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <label htmlFor="max-runtime-minutes" className="text-sm font-medium text-card-foreground">
          任务最长运行时间
        </label>
        <select id="max-runtime-minutes" value={maxRuntimeMinutes} disabled={isLive}
          onChange={(e) => onMaxRuntimeMinutesChange(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
          <option value={0}>不限制（沿用步数与模型调用预算）</option>
          <option value={30}>30 分钟</option>
          <option value={60}>1 小时</option>
          <option value={120}>2 小时</option>
          <option value={240}>4 小时</option>
          <option value={480}>8 小时</option>
          <option value={1440}>24 小时</option>
        </select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          从创建任务起计时，包含排队及审批等待。达到时限后，在下一次执行步骤前终止并保留已有检查点；不会强制中断正在进行的网络请求。
        </p>
      </div>

      </section>
      </TabsContent>
      <TabsContent value="completion" forceMount className="mt-4 data-[state=inactive]:hidden">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 lg:col-span-2">
        <label htmlFor="stop-condition" className="text-sm font-medium text-card-foreground">
          停止条件（完成标准描述）
        </label>
        <textarea
          id="stop-condition"
          value={stopCondition}
          disabled={isLive}
          onChange={(e) => onStopConditionChange(e.target.value)}
          rows={3}
          placeholder="满足什么条件就算完成？例如：产出包含核心结论、来源链接和风险提示的研究报告"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-card-foreground">满足完成标准即停止</p>
            <p className="mt-0.5 text-xs text-muted-foreground">开启后引擎判断达成停止条件时立即结束，不再消耗剩余步数</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={stopOnComplete}
            aria-label="满足完成标准即停止开关"
            disabled={isLive}
            onClick={() => onStopOnCompleteChange(!stopOnComplete)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
              stopOnComplete ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
                stopOnComplete ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">阶段方案先由我确认</p>
            <p className="mt-1 text-xs text-muted-foreground">
              打开后，需求方案草案必须由你批准或退回修改，之后才允许生成落地计划。
              仅对本次试跑生效；要设为助手默认规则，请使用上方「调整正式方案」并保存。
            </p>
          </div>
          <button type="button" role="switch" aria-checked={requirePlanReview}
            aria-label="阶段方案先由我确认开关"
            disabled={isLive || !isLoggedIn} onClick={onTogglePlanReview}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${requirePlanReview ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow ${requirePlanReview ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
        {requirePlanReview && maxSteps < 2 && (
          <p role="alert" className="text-xs text-destructive">开启阶段确认后至少需要 2 步预算：先送审草案，再生成后续计划。<button type="button" onClick={() => setSection("budget")} className="ml-1 font-semibold underline">调整执行预算</button></p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-card-foreground">写操作需我确认</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              本次试跑控制 HTTP 写操作审批；市场 MCP 插件始终逐次要求确认，管理员也可强制执行写操作审批。正式默认规则请在方案编辑器保存。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireApproval}
            aria-label="写操作需我确认开关"
            disabled={isLive || !isLoggedIn}
            onClick={onToggleRequireApproval}
            className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
              requireApproval ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
                requireApproval ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
        </div>
      </TabsContent>
      </Tabs>
      </div>
    </section>
  )
}
