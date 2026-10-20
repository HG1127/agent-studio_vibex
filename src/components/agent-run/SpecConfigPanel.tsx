import { Cpu, Network, PlugZap, SlidersHorizontal, Wrench } from "lucide-react"
import { Link } from "react-router-dom"
import type { BuiltinTool, CustomModelOption, SavedSpecRow } from "@/pages/AgentRun/useAgentRun"

type SpecConfigPanelProps = {
  specList: SavedSpecRow[]
  isLoadingSpecs: boolean
  selectedSpecId: string
  onSelectSpec: (specId: string) => void
  selectedSpec: SavedSpecRow | null
  genWfBusy: boolean
  onGenerateWorkflow: () => void
  customModels: CustomModelOption[]
  isCustomModel: boolean
  model: string
  onModelChange: (model: string) => void
  builtinTools: BuiltinTool[]
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
  genWfBusy,
  onGenerateWorkflow,
  customModels,
  isCustomModel,
  model,
  onModelChange,
  builtinTools,
  enabledTools,
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
  isLoggedIn,
  isLive,
}: SpecConfigPanelProps) {
  const specTools = selectedSpec?.spec?.tools ?? []

  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-card-foreground">运行配置</h2>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="spec-select" className="text-sm font-medium text-card-foreground">
          助手方案
        </label>
        <select
          id="spec-select"
          value={selectedSpecId}
          disabled={!isLoggedIn || isLive}
          onChange={(e) => onSelectSpec(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <option value="">{isLoadingSpecs ? "加载中…" : "选择「我的助手」里的方案"}</option>
          {specList.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        {!isLoadingSpecs && isLoggedIn && specList.length === 0 && (
          <p className="text-xs text-muted-foreground">
            还没有保存过的助手方案，请先回首页创建并保存。
          </p>
        )}
      </div>

      {selectedSpec && (
        <div className="rounded-xl bg-secondary/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">方案速览</p>
          <p className="mt-2 text-sm leading-relaxed text-card-foreground">{selectedSpec.spec.goal}</p>
          {selectedSpec.spec.task_plan.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedSpec.spec.task_plan.slice(0, 6).map((planItem, planIndex) => (
                <span
                  key={`${planItem}-${planIndex}`}
                  className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm"
                >
                  {planIndex + 1}. {planItem}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
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
        <button
          type="button"
          disabled={!selectedSpec || genWfBusy}
          onClick={onGenerateWorkflow}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Network className="h-3.5 w-3.5" />
          {genWfBusy ? "正在生成工作流…" : "生成工作流编排画布"}
        </button>
        <p className="text-xs text-muted-foreground">把当前方案一键转成工作流图，生成后跳到画布继续微调。</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
          <Wrench className="h-4 w-4 text-primary" />
          工具授权
        </p>
        <div className="flex flex-col gap-2">
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
          {specTools.map((toolName, toolIndex) => (
            <div
              key={`${toolName}-${toolIndex}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-muted-foreground">{toolName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">方案声明的能力，尚未接入真实执行</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <PlugZap className="h-3 w-3" />
                待连接
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
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
        <p className="text-xs text-muted-foreground">每一步都会调用一次模型做规划决策，步数越多费用越高。</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="max-model-calls" className="flex items-center justify-between text-sm font-medium text-card-foreground">
          <span>模型调用次数上限</span><span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{maxModelCalls} 次</span>
        </label>
        <input id="max-model-calls" type="range" min={1} max={100} step={1} value={maxModelCalls}
          disabled={isLive} onChange={(e) => onMaxModelCallsChange(Number(e.target.value))}
          className="w-full accent-primary disabled:opacity-60" />
        <p className="text-xs text-muted-foreground">服务端强制限额，包含规划、摘要与上下文压缩。此上限不是 Token 或费用硬上限。</p>
      </div>

      <div className="flex flex-col gap-2">
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

      <div className="mt-auto flex flex-col gap-2">
        <label htmlFor="stop-condition" className="text-sm font-medium text-card-foreground">
          停止条件（完成标准描述）
        </label>
        <textarea
          id="stop-condition"
          value={stopCondition}
          disabled={isLive}
          onChange={(e) => onStopConditionChange(e.target.value)}
          rows={3}
          placeholder="满足什么条件就算完成？例如：产出包含结论与数据依据的总结文本"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-card-foreground transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        />
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-card-foreground">写操作需我确认</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              推荐保持开启。外部写操作和市场插件执行前须经你批准；管理员可强制执行写入审批政策。
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
    </div>
  )
}
