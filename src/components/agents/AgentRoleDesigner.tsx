import { useId, useState } from "react"
import { ArrowRight, CircleAlert, Plus, Trash2, UsersRound } from "lucide-react"
import type { AgentSpec } from "@/pages/Home/presets"
import { clearOrphanedCapabilityRoles, createRoleStages, MAX_AGENT_ROLES, orphanedCapabilityRoles,
  replaceAgentRoles, restoreAgentRoles, validateAgentRoles, type AgentRole } from "@/lib/agentRoles"

type Props = { spec: AgentSpec; onChange: (next: AgentSpec) => void; disabled?: boolean }
const fieldClass = "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
// Preserve a trailing empty line while the user is typing another list item.
const lines = (text: string) => text.split("\n").slice(0, 32).map(value => value.slice(0, 1600))

export function AgentRoleDesigner({ spec, onChange, disabled = false }: Props) {
  const prefix = useId()
  const [selectedId, setSelectedId] = useState("")
  const [previousOrganization, setPreviousOrganization] = useState<AgentSpec | null>(null)
  const roles = spec.roles || []
  const active = roles.find(role => role.id === selectedId) || roles[0]
  const validation = validateAgentRoles(roles, spec.tools || [])
  const orphanedBindings = orphanedCapabilityRoles(spec)
  const canRestore = Boolean(previousOrganization?.roles?.length)
  const updateRoles = (next: AgentRole[]) => onChange(replaceAgentRoles(spec, next))
  const update = (changes: Partial<AgentRole>) => {
    if (active) updateRoles(roles.map(role => role.id === active.id ? { ...role, ...changes } : role))
  }
  const addRole = () => {
    const id = "role_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    updateRoles([...roles, { id, name: "新角色", responsibility: "", tasks: [], inputs: [], deliverables: [],
      depends_on: roles.length ? [roles[roles.length - 1].id] : [], tools: [], done_criteria: [] }])
    setSelectedId(id)
  }
  const removeRole = () => {
    if (!active) return
    // Keep dangling dependencies visible: silently rewiring a review boundary
    // would change the user's execution contract.
    updateRoles(roles.filter(role => role.id !== active.id))
    setSelectedId("")
  }
  const renderListField = (key: "tasks" | "inputs" | "deliverables" | "done_criteria", label: string, hint: string) =>
    <label className="block min-w-0" htmlFor={`${prefix}-${key}`}>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <textarea id={`${prefix}-${key}`} className={`${fieldClass} mt-1.5 resize-y`} rows={3}
        value={active[key].join("\n")} disabled={disabled}
        onChange={event => update({ [key]: lines(event.target.value) })}
        placeholder={hint} />
    </label>

  return <section aria-label="角色与任务分工" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold"><UsersRound className="h-4 w-4 text-primary" />角色与任务</h3>
        <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">简单任务由一个助手完成。复杂任务可按角色分阶段执行，前一阶段的成果会保存并交给后续角色。</p>
      </div>
      <div className="flex rounded-lg border border-border bg-secondary/50 p-1" aria-label="执行组织方式">
        <button type="button" disabled={disabled} aria-pressed={!roles.length}
          className={`min-h-9 rounded-md px-3 text-xs font-medium ${!roles.length ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => {
            if (roles.length) setPreviousOrganization(spec)
            onChange(replaceAgentRoles(spec, [], { singleAssistant: true }))
          }}>单助手</button>
        <button type="button" disabled={disabled} aria-pressed={roles.length > 0}
          className={`min-h-9 rounded-md px-3 text-xs font-medium ${roles.length ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => {
            if (roles.length) return
            if (previousOrganization?.roles?.length) {
              onChange(restoreAgentRoles(spec, previousOrganization))
              setPreviousOrganization(null)
            } else updateRoles(createRoleStages(spec))
          }}>{!roles.length && canRestore ? "恢复角色分工" : "角色分工"}</button>
      </div>
    </div>
    {orphanedBindings.length > 0 && <div role="status" aria-label="失效的能力角色关联" className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><CircleAlert className="h-4 w-4" />能力仍关联了不存在的角色</p>
      <ul className="mt-1 list-inside list-disc text-xs leading-6">{orphanedBindings.map(binding => <li key={binding.id}>{binding.title}：{binding.roleIds.join("、")}</li>)}</ul>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">清除后保留能力需求和现有工具分配，请检查该能力应由哪个角色承担。</p>
      <button type="button" disabled={disabled} onClick={() => onChange(clearOrphanedCapabilityRoles(spec))}
        className="mt-2 min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium text-primary hover:bg-secondary/50 disabled:opacity-50">清除失效角色关联</button>
    </div>}
    {!roles.length ? <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-5">
      <p className="text-sm font-medium">一个助手完成完整任务</p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">适合知识问答、单次分析和简单执行。需要分离资料研究、方案执行与审核交付时，可切换到角色分工，再调整每个阶段。</p>
      {canRestore && <p className="mt-2 text-xs leading-6 text-muted-foreground">选择「恢复角色分工」会恢复上次的角色与对应能力关联，角色工具以当前方案已选清单为限。</p>}
    </div> : <>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-semibold text-primary">分阶段角色执行 · 同一个运行，按依赖顺序推进</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">请按职责分配各角色的工具，初始模板不会自动分配。阶段交付会保存；最终角色完成后才提交最终成果。当前模式不并行启动多个独立 Agent。</p>
        {validation.valid && <ol aria-label="实际执行顺序" className="mt-2 flex flex-wrap items-center gap-2">
          {validation.orderedRoles.map((role, index) => <li key={role.id} className="flex items-center gap-2 text-xs">
            {index > 0 && <ArrowRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />}
            <span className="rounded-md border border-primary/15 bg-background px-2 py-1">{index + 1}. {role.name}</span>
          </li>)}
        </ol>}
      </div>
      {!validation.valid && <div role="status" className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
        <p className="flex items-center gap-1.5 font-semibold"><CircleAlert className="h-4 w-4" />试跑前还需补齐</p>
        <ul className="mt-1 list-inside list-disc text-xs leading-6">{validation.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
      </div>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[185px_minmax(0,1fr)]">
        <div className="space-y-2">
          {roles.map((role, index) => <button key={role.id} type="button" onClick={() => setSelectedId(role.id)}
            aria-pressed={active?.id === role.id} className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left ${active?.id === role.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 truncate text-sm font-medium">{role.name || "未命名角色"}</span>
          </button>)}
          <button type="button" disabled={disabled || roles.length >= MAX_AGENT_ROLES} onClick={addRole}
            className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-primary hover:bg-secondary/40 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />添加角色</button>
        </div>
        {active && <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
            <h4 className="text-sm font-semibold">编辑「{active.name || "未命名角色"}」</h4>
            <button type="button" disabled={disabled} onClick={removeRole} aria-label={`移除角色 ${active.name}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />移除</button>
          </div>
          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            <label className="block" htmlFor={`${prefix}-name`}><span className="text-xs font-semibold">角色名称</span>
              <input id={`${prefix}-name`} value={active.name} maxLength={100} disabled={disabled} className={`${fieldClass} mt-1.5`} onChange={e => update({ name: e.target.value })} /></label>
            <label className="block" htmlFor={`${prefix}-responsibility`}><span className="text-xs font-semibold">职责边界</span>
              <input id={`${prefix}-responsibility`} value={active.responsibility} maxLength={2000} disabled={disabled} className={`${fieldClass} mt-1.5`} onChange={e => update({ responsibility: e.target.value })} placeholder="负责什么，哪些事项交给下一角色" /></label>
            {renderListField("tasks", "负责的任务", "每行一项任务")}
            {renderListField("inputs", "需要的输入", "例如：用户需求、前序角色交付、授权资料")}
            {renderListField("deliverables", "交给下一阶段的成果", "每行一项具体交付物")}
            {renderListField("done_criteria", "完成标准", "例如：关键结论附原始来源；缺失信息单独列出")}
          </div>
          <fieldset disabled={disabled} className="mt-4">
            <legend className="text-xs font-semibold">前置角色</legend>
            <p className="mt-1 text-xs text-muted-foreground">勾选的角色交付后才能进入当前阶段；无依赖的角色也按列表顺序执行。</p>
            <div className="mt-2 flex flex-wrap gap-2">{roles.filter(role => role.id !== active.id).map(role =>
              <label key={role.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs">
                <input type="checkbox" checked={active.depends_on.includes(role.id)} onChange={e => update({ depends_on: e.target.checked ? [...active.depends_on, role.id] : active.depends_on.filter(id => id !== role.id) })} />{role.name}
              </label>)}</div>
            {active.depends_on.filter(id => !roles.some(role => role.id === id)).map(id => <button type="button" key={id}
              onClick={() => update({ depends_on: active.depends_on.filter(dep => dep !== id) })}
              className="mt-2 min-h-9 rounded-md border border-amber-300 px-2 text-xs">移除失效依赖：{id}</button>)}
          </fieldset>
          <fieldset disabled={disabled} className="mt-4 border-t border-border pt-4">
            <legend className="text-xs font-semibold">这个角色可调用的工具</legend>
            <p className="mt-1 text-xs text-muted-foreground">只能分配已加入当前方案的工具。未勾选工具时，本角色只根据输入和前序交付推理。</p>
            <div className="mt-2 flex flex-wrap gap-2">{[...new Set([...(spec.tools || []), ...active.tools])].map(tool => {
              const missing = !(spec.tools || []).includes(tool)
              return <label key={tool} className={`flex min-h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-xs ${missing ? "border-amber-300" : "border-border"}`}>
                <input type="checkbox" checked={active.tools.includes(tool)} onChange={e => update({ tools: e.target.checked ? [...active.tools, tool] : active.tools.filter(id => id !== tool) })} />
                <span className="break-all">{tool}{missing ? "（尚未加入方案）" : ""}</span>
              </label>
            })}</div>
          </fieldset>
        </div>}
      </div>
    </>}
  </section>
}
