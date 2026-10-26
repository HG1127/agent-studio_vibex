import type { AgentSpec } from "@/pages/Home/presets"
import { Check, X } from "lucide-react"

export type AgentRevisionProposal = {name:string;spec:AgentSpec}
const describeRoles = (spec: AgentSpec) => (spec.roles || []).map(role => {
  const dependencies = role.depends_on.map(id => spec.roles?.find(item => item.id === id)?.name || id)
  return [role.name, `职责：${role.responsibility}`, `任务：${role.tasks.join("；")}`,
    `输入：${role.inputs.join("；") || "用户任务"}`, `交付：${role.deliverables.join("；")}`,
    `接收阶段：${dependencies.join("、") || "起始阶段"}`,
    `授权工具：${role.tools.join("、") || "未授权工具"}`,
    `绑定 Skills：${(role.skill_refs || []).map(ref=>`${ref.id} v${ref.version}`).join("、") || "未绑定"}`,
    `完成标准：${role.done_criteria.join("；")}`].join("\n")
}).join("\n\n") || "单助手执行"
const describeCapabilities = (spec: AgentSpec) => (spec.capability_requirements || []).map(need => {
  const roles = need.role_ids.map(id => spec.roles?.find(role => role.id === id)?.name || id)
  return [need.title, `用途：${need.purpose}`, `${need.required ? "必需" : "可选"} · ${need.access === "write" ? "包含写入或操作" : "读取与查询"}`,
    `使用角色：${roles.join("、") || "待分配"}`].join("\n")
}).join("\n\n")
export function AgentRevisionPreview({current,proposal,onApply,onDiscard}:{
  current:AgentSpec;proposal:AgentRevisionProposal;onApply:()=>void;onDiscard:()=>void
}) {
  const changes = [
    {label:"目标",before:current.goal,after:proposal.spec.goal},
    {label:"范围",before:current.task_scope,after:proposal.spec.task_scope},
    {label:"交付物",before:current.deliverables.join("\n"),after:proposal.spec.deliverables.join("\n")},
    {label:"任务步骤",before:current.task_plan.join("\n"),after:proposal.spec.task_plan.join("\n")},
    {label:"完成标准",before:current.done_criteria.join("\n"),after:proposal.spec.done_criteria.join("\n")},
    {label:"角色分工",before:describeRoles(current),after:describeRoles(proposal.spec)},
    {label:"能力需求",before:describeCapabilities(current),after:describeCapabilities(proposal.spec)},
  ].filter(row=>row.before!==row.after)
  return <section aria-label="AI 方案修改预览" className="mt-3 rounded-xl border border-primary/30 bg-card p-4">
    <h4 className="text-sm font-semibold">检查修改建议，再应用到草稿</h4>
    <p className="mt-1 text-xs text-muted-foreground">建议名称：{proposal.name} · {changes.length} 个部分有调整。原方案仍保留，应用后需要保存。</p>
    <div className="mt-3 space-y-2">
      {changes.map(row=><details key={row.label} className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium">{row.label}</summary>
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div className="min-w-0"><p className="mb-1 text-muted-foreground">当前</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/50 p-2 font-sans">{row.before||"未配置"}</pre></div>
          <div className="min-w-0"><p className="mb-1 text-primary">建议</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-primary/5 p-2 font-sans">{row.after||"未配置"}</pre></div>
        </div>
      </details>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={onApply} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"><Check className="h-4 w-4"/>应用到草稿</button>
      <button type="button" onClick={onDiscard} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-xs"><X className="h-4 w-4"/>保留当前方案</button>
    </div>
  </section>
}
