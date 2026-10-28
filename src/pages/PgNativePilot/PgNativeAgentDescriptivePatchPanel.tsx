import {useEffect, useRef, useState} from "react"
import {watchPgNativeOriginalTaskController} from "@/lib/pgNativeOwnTaskNavigation"
import {agentDescriptivePatchCanonical, agentDescriptivePatchKeys,
  type PgNativeDescriptivePatchApi, type PgNativeDescriptivePatchTarget,
  type PgNativeDescriptivePatchPreview, type PgNativeDescriptivePatchReceipt} from "@/lib/pgNativeAgentDescriptivePatch"
import {createPgNativeAgentDescriptivePatchSession, emptyAgentDescriptivePatchView,
  type PgNativeAgentDescriptivePatchSessionView} from "@/lib/pgNativeAgentDescriptivePatchSession"

type Props = {api: PgNativeDescriptivePatchApi; ownerId: string; target: PgNativeDescriptivePatchTarget | null
  available: boolean; acceptanceEnabled: boolean; active: boolean; onExpired: () => void
  onAccepted?: (receipt: PgNativeDescriptivePatchReceipt) => void}
type Controller = ReturnType<typeof createPgNativeAgentDescriptivePatchSession>
const button = "min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
const labels = {goal: "目标", task_scope: "任务范围", deliverables: "交付内容", task_plan: "任务计划", done_criteria: "完成标准"}
const matchesTarget = (view: PgNativeAgentDescriptivePatchSessionView, target: PgNativeDescriptivePatchTarget | null) => Boolean(
  target && view.target && target.review_id === view.target.review_id && target.spec_id === view.target.spec_id && target.target_run_id === view.target.target_run_id)
function Description({value}: {value: string | string[]}) {
  return typeof value === "string" ? <p className="whitespace-pre-wrap break-words">{value || "（空文本）"}</p> : value.length ?
    <ol className="list-decimal space-y-2 pl-5">{value.map((item, i) => <li key={i} className="whitespace-pre-wrap break-words">{item || "（空项）"}</li>)}</ol> : <p>（空列表）</p>
}
function Comparison({preview}: {preview: PgNativeDescriptivePatchPreview}) {
  return <section aria-label="描述补丁提供字段与实际变化" className="space-y-4">
    <p className="text-sm">模型提供 {preview.model_patch.provided_keys.length} 项 · 实际变化 {preview.changed_keys.length} 项</p>
    {agentDescriptivePatchKeys.map(key => {
      const provided = preview.model_patch.provided_keys.includes(key), changed = preview.changed_keys.includes(key)
      const value = preview.model_patch.descriptive[key], empty = provided && (value === "" || Array.isArray(value) && !value.length)
      return <section key={key} aria-label={labels[key] + "补丁对比"} className="rounded-xl border border-slate-200 p-4">
        <h4 className="font-medium">{labels[key]} · {provided ? changed ? "模型已提供 · 将修改" : "模型已提供 · 与当前值一致" : "模型未提供 · 沿用当前值"}</h4>
        {empty ? <p className="mt-2 text-sm text-amber-900">明确{typeof value === "string" ? "空文本" : "空列表"}：{changed ? "接受后清空此字段。" : "此字段保持为空。"}</p> : null}
        <div className="mt-3 grid gap-4 text-sm lg:grid-cols-3">
          <div className="min-w-0 space-y-2"><h5 className="text-xs text-slate-500">当前值</h5><Description value={preview.before.descriptive[key]}/></div>
          <div className="min-w-0 space-y-2"><h5 className="text-xs text-slate-500">模型提供</h5>{provided && value !== undefined ? <Description value={value}/> : <p>（未提供，沿用当前值）</p>}</div>
          <div className="min-w-0 space-y-2"><h5 className="text-xs text-slate-500">接受后</h5><Description value={preview.candidate.descriptive[key]}/></div>
        </div>
      </section>
    })}
  </section>
}
type PresentationProps = Pick<Props, "target" | "available" | "acceptanceEnabled" | "active"> & {
  view: PgNativeAgentDescriptivePatchSessionView; confirmed: boolean; onConfirmation: (value: boolean) => void
  onPreview: () => void; onRefresh: () => void; onAccept: () => void; onConfirmOriginal: () => void; onRetryOriginal: () => void
}
/** Pure presentation of validated session data; exported for focused static rendering. */
export function PgNativeAgentDescriptivePatchPresentation({view, target, available, acceptanceEnabled, active, confirmed,
  onConfirmation, onPreview, onRefresh, onAccept, onConfirmOriginal, onRetryOriginal}: PresentationProps) {
  const matches = matchesTarget(view, target), preview = matches ? view.preview : null, receipt = view.receipt
  const locked = view.loading || view.busy || Boolean(view.pending)
  const canAccept = available && acceptanceEnabled && view.canAccept
  if (!active || !available && !target && !view.pending && !receipt) return null
  return <section aria-label="接受模型提供的描述补丁" className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-5">
    <div><h3 className="font-semibold">接受模型提供的描述补丁</h3><p className="mt-2 text-sm leading-6 text-slate-600">仅应用模型实际提供的字段。未提供字段沿用当前值，明确空文本或空列表会清空对应字段。本页只核对这份补丁，不提供字段挑选或手动改写。</p></div>
    <p className="text-sm leading-6 text-slate-600">角色名称、模型、工具、知识库及审批权限保持原样。费用确认与配置修改分别确认；此处勾选只同意配置修改，预览和接受不会发起新的模型调用。</p>
    {view.error ? <p role="alert" className="text-sm text-rose-800">{view.error}</p> : null}
    {view.notice ? <p role="status" className="text-sm text-emerald-800">{view.notice}</p> : null}
    {!available ? <p role="status" className="text-sm text-amber-900">当前环境暂未开放新的描述补丁入口；已知原请求仍可明确核对或重交相同请求。</p> : !acceptanceEnabled ? <p role="status" className="text-sm text-amber-900">当前未开放新的配置修改，可继续预览或读取已有回执。</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={!matches || locked || !available || Boolean(receipt)} onClick={onPreview}>预览描述补丁对角色的修改</button>
      <button type="button" className={button} disabled={!matches && !receipt || locked} onClick={onRefresh}>读取已有描述补丁回执</button>
    </div>
    {view.loading ? <p role="status" className="text-sm text-slate-500">正在核对补丁来源与接受记录…</p> : null}
    {preview ? <><p className="text-xs text-slate-500">当前配置修订 {preview.before.revision} · 请分别核对模型提供字段和实际变化。</p><Comparison preview={preview}/>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" aria-label="同意应用这份描述补丁修改配置" className="mt-1.5" checked={confirmed} disabled={locked || !canAccept} onChange={event => onConfirmation(event.target.checked)}/>我已核对模型提供字段和实际变化，同意应用这份描述补丁。</label>
      <button type="button" className={button} disabled={locked || !canAccept || !confirmed} onClick={() => {if (confirmed && canAccept && !locked) onAccept()}}>确认接受描述补丁并修改配置</button>
    </> : null}
    {view.pending ? <section aria-label="待核对的原描述补丁请求" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm leading-6">
      <h4 className="font-medium">{view.pending.unknown ? "配置修改结果尚未确认" : "正在处理这次配置修改"}</h4>
      <p className="break-all text-xs">原请求编号：{view.pending.original.request_id}<br/>原意见编号：{view.pending.original.review_id}<br/>原补丁摘要：{view.pending.original.expected_patch_sha256}</p>
      <p>保留原请求和原选择。核对只查询登记结果；重交只发送同一编号、同一补丁摘要和完全相同的请求。</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={onConfirmOriginal}>核对原描述补丁请求</button><button type="button" className={button} disabled={view.busy} onClick={onRetryOriginal}>重交完全相同的描述补丁请求</button></div>
    </section> : null}
    {receipt ? <section aria-label="描述补丁配置接受回执" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-sm leading-6">
      <h4 className="font-medium">已记录独立的角色配置修改</h4><p>修订 {receipt.before.revision} → {receipt.after.revision}</p>
      <p>模型提供：{receipt.provided_keys.map(key => labels[key]).join("、")}<br/>实际变更：{receipt.changed_keys.map(key => labels[key]).join("、")}</p>
      <p className="break-all text-xs">接受请求：{receipt.request_id}<br/>原意见：{receipt.source.review_id}</p>
      <p>接受时间：<time dateTime={receipt.created_at}>{new Date(receipt.created_at).toLocaleString("zh-CN")}</time></p>
      <p>此回执记录当时提交的配置修改。删除意见正文不会回滚修改；当前配置和意见正文需分别核对。</p>
    </section> : null}
  </section>
}

export default function PgNativeAgentDescriptivePatchPanel({api, ownerId, target, available, acceptanceEnabled, active, onExpired, onAccepted}: Props) {
  const controller = useRef<Controller | null>(null), acceptedCallback = useRef(onAccepted)
  useEffect(() => {acceptedCallback.current = onAccepted}, [onAccepted])
  const [state, setState] = useState({api, ownerId, view: emptyAgentDescriptivePatchView()})
  const view = state.api === api && state.ownerId === ownerId ? state.view : emptyAgentDescriptivePatchView()
  const targetKey = target ? [target.review_id, target.spec_id, target.target_run_id].join(":") : ""
  const context = [active, available, acceptanceEnabled, targetKey].join(":"), [consent, setConsent] = useState({api, ownerId, context, value: ""})
  if (consent.api !== api || consent.ownerId !== ownerId || consent.context !== context) setConsent({api, ownerId, context, value: ""})
  const setConfirmation = (value: string) => setConsent({api, ownerId, context, value})
  useEffect(() => {
    const current = createPgNativeAgentDescriptivePatchSession(api, {onExpired, onAccepted: value => acceptedCallback.current?.(value)})
    controller.current = current
    const unsubscribe = current.subscribe(() => setState({api, ownerId, view: current.snapshot()}))
    const unwatch = watchPgNativeOriginalTaskController(api, current)
    return () => {unwatch(); unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null}
  }, [api, ownerId, onExpired])
  useEffect(() => {controller.current?.setActive(active)}, [active, api, ownerId, onExpired])
  useEffect(() => {controller.current?.setScopes({available, acceptance: acceptanceEnabled})}, [available, acceptanceEnabled, api, ownerId, onExpired])
  useEffect(() => {
    if (!active || view.pending || view.busy || !target && view.receipt) return
    void controller.current?.select(target ? {review_id: target.review_id, spec_id: target.spec_id, target_run_id: target.target_run_id} : null)
  }, [active, target, targetKey, view.pending, view.busy, view.receipt, api, ownerId, onExpired])
  const preview = matchesTarget(view, target) ? view.preview : null
  const consentScope = active && available && acceptanceEnabled && preview ? ownerId + ":" + targetKey + ":" + agentDescriptivePatchCanonical(preview) : ""
  const confirmed = Boolean(consentScope && consent.api === api && consent.ownerId === ownerId && consent.context === context && consent.value === consentScope)
  return <PgNativeAgentDescriptivePatchPresentation view={view} target={target} available={available} acceptanceEnabled={acceptanceEnabled} active={active} confirmed={confirmed}
    onConfirmation={value => setConfirmation(value ? consentScope : "")}
    onPreview={() => {setConfirmation(""); void controller.current?.prepare()}}
    onRefresh={() => {setConfirmation(""); void controller.current?.refreshReceipt()}}
    onAccept={() => {if (confirmed && view.canAccept && !view.loading && !view.busy && !view.pending) {setConfirmation(""); void controller.current?.accept(true)}}}
    onConfirmOriginal={() => void controller.current?.confirm()} onRetryOriginal={() => void controller.current?.retrySameRequest()}/>
}
