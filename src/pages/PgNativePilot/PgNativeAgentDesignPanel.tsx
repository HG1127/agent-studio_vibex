import {useEffect, useRef, useState} from "react"
import {createPgNativeAgentDesignSession, emptyAgentDesignView, type AgentDesignSessionView, type PgNativeAgentDesignSession} from "../../lib/pgNativeAgentDesignSession.ts"
import type {PgNativeAgentDesignApi} from "../../lib/pgNativeAgentDesign.ts"
import {parseAgentDesignEditableFields, type AgentDesignEditableFields} from "../../../services/pg-api/src/agent-design-value-contract.ts"
export type AgentDesignModelChoice = {connection_id: string; connection_revision: number; model_id: string; label: string}
type Props = {api?: PgNativeAgentDesignApi; employeeId: string; active: boolean; available?: boolean; submissions?: boolean; saves?: boolean; models: AgentDesignModelChoice[]; sources?: {spec_id: string; name: string}[]; selectedSpecId?: string; onExpired: () => void}
type Binding = {api: PgNativeAgentDesignApi; employeeId: string; model: PgNativeAgentDesignSession}
const descriptions = [{key: "name", label: "助手名称", max: 120}, {key: "goal", label: "目标", max: 3000}, {key: "task_scope", label: "任务范围", max: 4000},
  {key: "deliverables", label: "交付物（每行一项）", max: 15029}, {key: "task_plan", label: "任务计划（每行一步）", max: 15029}, {key: "done_criteria", label: "完成标准（每行一项）", max: 15029}] as const
type Draft = Record<typeof descriptions[number]["key"], string>
function draft(fields: AgentDesignEditableFields): Draft {return Object.fromEntries(descriptions.map(({key}) => [key, Array.isArray(fields[key]) ? fields[key].join("\n") : fields[key]])) as Draft}
function fields(value: Draft) {return parseAgentDesignEditableFields({...value, ...Object.fromEntries(["deliverables", "task_plan", "done_criteria"].map(k => [k, value[k as keyof Draft].split("\n").filter(line => line.trim())]))})}
type PresentationProps = Omit<Props, "api" | "onExpired"> & {view: AgentDesignSessionView; bound: boolean; session?: PgNativeAgentDesignSession}
export function PgNativeAgentDesignPresentation({employeeId, active, available, submissions, saves, models, sources, selectedSpecId, view, bound, session}: PresentationProps) {
  const [purpose, setPurpose] = useState<"generate" | "revise">("generate"), [instruction, setInstruction] = useState(""), [selectedModel, setSelectedModel] = useState(""), [cap, setCap] = useState<4096 | 8192 | 16384>(4096)
  const [selectedSource, setSelectedSource] = useState("")
  const revisionId = selectedSpecId ?? (sources?.some(s => s.spec_id === selectedSource) ? selectedSource : undefined)
  const [edit, setEdit] = useState<Draft | null>(() => bound && active && available && view.employeeId === employeeId && view.fields ? draft(view.fields) : null), [editError, setEditError] = useState("")
  const readable = active && bound && available === true && view.active && view.available && view.employeeId === employeeId
  const resultKey = readable && view.result?.result_status === "available" ? view.result.result?.result_sha256 : undefined
  // snapshot() copies objects, so depend on field values rather than each
  // fresh object identity. This value is a UI dependency, never source authority.
  const editableValue = readable && view.fields ? JSON.stringify(view.fields) : ""
  useEffect(() => {setEdit(editableValue ? draft(parseAgentDesignEditableFields(JSON.parse(editableValue))) : null); setEditError("")}, [editableValue, resultKey, readable])
  if (!active) return null
  const locked = !readable || view.busy || Boolean(view.pending), m = models.find(v => [v.connection_id, v.connection_revision, v.model_id].join(":") === selectedModel)
  const reset = () => session?.invalidatePreview()
  return <section aria-label="自然语言设计助手" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold">设计与修改助手</h2>
    {!readable ? <p role="status">当前未开放助手设计。</p> : <>
      <p className="text-sm text-slate-600">先核对发送内容，再单独确认模型费用。生成结果经编辑后另行保存，保存后可在助手列表查看。</p>
      <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">设计方式<select aria-label="设计方式" disabled={locked} value={purpose} onChange={e => {setPurpose(e.target.value as "generate" | "revise"); reset()}} className="mt-1 block w-full rounded-lg border p-2"><option value="generate">生成新助手</option><option value="revise">修改所选助手</option></select></label>
        <label className="text-sm">设计模型<select aria-label="设计模型" disabled={locked} value={selectedModel} onChange={e => {setSelectedModel(e.target.value); reset()}} className="mt-1 block w-full rounded-lg border p-2"><option value="">请选择已连接模型</option>{models.map(v => {const key = [v.connection_id, v.connection_revision, v.model_id].join(":"); return <option key={key} value={key}>{v.label} · {v.model_id}</option>})}</select></label></div>
      {purpose === "revise" && !selectedSpecId ? <label className="block text-sm">要修改的助手<select aria-label="要修改的助手" value={selectedSource} disabled={locked} onChange={e => {setSelectedSource(e.target.value); reset()}} className="ml-2 rounded-lg border p-2"><option value="">请选择原助手</option>{sources?.map(s => <option key={s.spec_id} value={s.spec_id}>{s.name}</option>)}</select></label> : null}
      <label className="block text-sm">{purpose === "generate" ? "助手需求" : "修改要求"}<textarea aria-label="助手需求或修改要求" value={instruction} disabled={locked} maxLength={2000} rows={4} onChange={e => {setInstruction(e.target.value); reset()}} className="mt-1 block w-full rounded-lg border p-2"/></label>
      <label className="block text-sm">输出容量<select aria-label="输出容量" value={cap} disabled={locked} onChange={e => {setCap(Number(e.target.value) as typeof cap); reset()}} className="ml-2 rounded-lg border p-2"><option value={4096}>标准 · 4096</option><option value={8192}>扩展 · 8192（可能增加费用）</option><option value={16384}>完整长方案 · 16384（可能增加费用）</option></select></label>
      <button type="button" disabled={locked || !m || !instruction.trim() || purpose === "revise" && !revisionId} onClick={() => {if (!m) return; const choice = {instruction, model_binding: {connection_id: m.connection_id, connection_revision: m.connection_revision, model_id: m.model_id}, output_token_limit: cap}; if (purpose === "revise" && revisionId) void session?.previewRevision(choice, revisionId); else void session?.preview({action: "preview", purpose: "generate", ...choice, source: null})}} className="rounded-lg border px-4 py-2 disabled:opacity-40">预览发送内容</button>
      {view.preview ? <div className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="text-sm">本次设计模型：{view.preview.choice.model_binding.model_id}；输出容量：{view.preview.output_token_limit}。将发送下列需求和原方案描述：</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(view.preview.fields_sent, null, 2)}</pre>
        <button type="button" disabled={locked || !submissions || !view.submissions} onClick={() => {void session?.submit()}} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40">确认本次模型费用并{view.preview.choice.purpose === "generate" ? "生成" : "修改"}</button>{!submissions ? <p className="text-sm">当前未开放付费提交，可继续核对预览。</p> : null}</div> : null}
      {view.pending ? <div role="status" className="rounded-lg bg-amber-50 p-3"><p>操作结果尚未核对，原始请求已保留。</p><button type="button" disabled={view.busy} onClick={() => {void session?.confirmOriginal()}} className="mt-2 rounded-lg border px-3 py-2">查询原始回执</button></div> : null}
      {view.receipt ? <div className="flex flex-wrap items-center gap-2 text-sm"><p>设计状态：{view.receipt.state}</p><button type="button" disabled={view.busy} onClick={() => {void session?.readResult()}} className="rounded-lg border px-3 py-2">读取设计结果</button><button type="button" disabled={locked} onClick={() => {void session?.control("cancel")}} className="rounded-lg border px-3 py-2">取消未完成设计</button><button type="button" disabled={locked} onClick={() => {void session?.control("erase")}} className="rounded-lg border px-3 py-2">擦除设计正文</button></div> : null}
      {view.result && view.result.result_status !== "available" ? <p role="status">{({pending: "模型结果尚未返回。", unknown: "当前执行结果未知，请稍后读取。", unavailable: "结果当前不可用。", stale: "方案、模型或权限已变化，请重新预览设计。", erased: "设计正文已擦除。"} as Record<string, string>)[view.result.result_status]}</p> : null}
      {edit && resultKey ? <div className="space-y-3"><h3 className="font-medium">编辑完整方案</h3>{descriptions.map(({key, label, max}) => <label key={key} className="block text-sm">{label}<textarea aria-label={label} value={edit[key]} maxLength={max} disabled={locked} rows={key === "name" ? 1 : 4} onChange={e => {setEdit({...edit, [key]: e.target.value}); setEditError(""); reset()}} className="mt-1 block w-full rounded-lg border p-2"/></label>)}
        <p className="text-sm text-slate-600">工具能力建议：{view.result?.result?.result.tools.join("、") || "无"}。保存沿用原方案的已连接资源；新方案从空资源开始。</p>
        <button type="button" disabled={locked} onClick={() => {try {session?.editFields(fields(edit)); void session?.previewSave()} catch {setEditError("请检查名称、目标及列表长度；列表最多 30 项，每项最多 500 字。")}}} className="rounded-lg border px-4 py-2">预览保存内容</button></div> : null}
      {view.savePreview ? <div className="rounded-xl bg-slate-50 p-4"><p>将{view.savePreview.purpose === "generate" ? "创建新助手" : "更新原助手"}：{view.savePreview.candidate.name}</p><p className="my-2 text-sm">本次仅保存名称、目标、范围、交付物、计划和完成标准。</p><button type="button" disabled={locked || !saves || !view.saves} onClick={() => {void session?.save()}} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40">确认仅保存方案</button></div> : null}
      {view.saveReceipt ? <p role="status">已保存方案「{view.fields?.name ?? "助手"}」，版本 {view.saveReceipt.after_revision}。可返回助手列表查看。</p> : null}
      {view.busy ? <p role="status">正在核对本次操作…</p> : null}{view.error || editError ? <p role="alert" className="text-sm text-rose-800">{editError || view.error}</p> : null}
    </>}
  </section>
}
export default function PgNativeAgentDesignPanel(props: Props) {
  const {api, employeeId, active, available, submissions, saves, onExpired} = props
  const callbacks = useRef({api, employeeId, onExpired}); callbacks.current = {api, employeeId, onExpired}
  const [binding, setBinding] = useState<Binding | null>(null)
  const model = api && binding?.api === api && binding.employeeId === employeeId && binding.model.matchesScope(api, employeeId) ? binding.model : undefined
  useEffect(() => {
    if (!api) {setBinding(null); return}
    let session: PgNativeAgentDesignSession
    try {session = createPgNativeAgentDesignSession(api, {employeeId, onExpired: () => {if (callbacks.current.api === api && callbacks.current.employeeId === employeeId) callbacks.current.onExpired()}})} catch {setBinding(null); return}
    const publish = () => setBinding({api, employeeId, model: session}), unsubscribe = session.subscribe(publish); publish()
    return () => {unsubscribe(); session.dispose()}
  }, [api, employeeId])
  useEffect(() => {if (model) {model.setActive(active); model.setAvailability({available, submissions, saves})}}, [model, active, available, submissions, saves])
  const view = active && model ? model.snapshot() : emptyAgentDesignView(employeeId)
  return <PgNativeAgentDesignPresentation key={employeeId + ":" + String(Boolean(model))} {...props} view={view} bound={Boolean(model)} session={model}/>
}
