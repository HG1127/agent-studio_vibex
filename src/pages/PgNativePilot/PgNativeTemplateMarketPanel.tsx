import {useEffect, useRef, useState} from "react"
import {agentTemplateMarketCategories, agentTemplateMarketCategoryLabels, type AgentTemplateMarketSpec} from "../../../services/pg-api/src/agent-template-market-contract.ts"
import {createPgNativeTemplateMarketSession, emptyTemplateMarketView, type TemplateMarketView, type PgNativeTemplateMarketSession} from "../../lib/pgNativeTemplateMarketSession.ts"
import type {PgNativeTemplateMarketApi} from "../../lib/pgNativeTemplateMarket.ts"

export type PgNativeTemplateMarketPanelProps = {api?: PgNativeTemplateMarketApi; employeeId: string; scopeKey: string; active: boolean; available?: boolean; writes?: boolean;
  onExpired: () => void; onChanged?: () => void; onConfigureAgent: (specId: string) => void}
type PresentationProps = Omit<PgNativeTemplateMarketPanelProps, "api" | "onExpired" | "onChanged"> & {view: TemplateMarketView; bound: boolean; session?: PgNativeTemplateMarketSession}
const button = "min-h-10 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
const primary = button + " bg-slate-900 text-white"
const input = "mt-1 block w-full min-w-0 rounded-lg border p-2 text-sm disabled:opacity-50"
const builtinLabels: Record<string, string> = {calculate: "计算器", summarize: "文本摘要", knowledge_search: "知识库检索", web_search: "网页搜索", web_fetch: "网页抓取"}

export function TemplateMarketSnapshotView({spec}: {spec: AgentTemplateMarketSpec}) {
  const lists = [{key: "deliverables", title: "交付物"}, {key: "task_plan", title: "任务计划"}, {key: "done_criteria", title: "完成条件"}] as const
  return <div className="min-w-0 space-y-3 break-words rounded-xl bg-slate-50 p-4 text-sm">
    <div><h4 className="font-medium">目标</h4><p className="whitespace-pre-wrap">{spec.goal}</p></div>
    <div><h4 className="font-medium">任务范围</h4><p className="whitespace-pre-wrap">{spec.task_scope || "未填写"}</p></div>
    {lists.map(({key, title}) => <div key={key}><h4 className="font-medium">{title}</h4>{spec[key].length ? <ul className="list-disc space-y-1 pl-5">{spec[key].map((value, index) => <li key={index} className="whitespace-pre-wrap">{value}</li>)}</ul> : <p>未填写</p>}</div>)}
    <div><h4 className="font-medium">能力提示</h4><p>{spec.tools.map(tool => builtinLabels[tool]).join("、") || "无"}</p></div>
    <p>模型、HTTP、MCP 和知识库需要使用者自行配置，来源资源的权限不会随模板复制。</p>
    {spec.require_plan_review ? <p>执行前需确认方案。</p> : null}<p>执行时保留人工审批。</p>
  </div>
}

export function PgNativeTemplateMarketPresentation(props: PresentationProps) {
  const {view, employeeId, scopeKey, active, available, writes, bound, session, onConfigureAgent} = props
  if (!active) return null
  const readable = bound && available === true && view.active && view.available && view.employeeId === employeeId && view.scopeKey === scopeKey
  const locked = !readable || view.busy || Boolean(view.pending), canWrite = readable && writes === true && view.writes
  const listStatus = view.tab === "market" ? view.marketStatus : view.mineStatus
  const actionName = view.lifecycle?.action === "delete" ? "永久删除" : view.lifecycle?.action === "republish" ? "重新上架" : "下架"
  return <section aria-label="模板市场" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">模板市场</h2>
    {!readable ? <p role="status">模板市场暂未开放。</p> : <>
      <p className="text-sm text-slate-600">浏览并复制公开的助手方案，也可以发布自己的模板供同事复用。复制后先配置自己的资源，再决定是否运行。</p>
      {!canWrite ? <p role="status" className="text-sm">当前只可浏览模板。</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="模板列表切换">
        <button type="button" className={button} aria-pressed={view.tab === "market"} disabled={view.busy} onClick={() => {void session?.selectTab("market")}}>逛市场</button>
        <button type="button" className={button} aria-pressed={view.tab === "mine"} disabled={view.busy} onClick={() => {void session?.selectTab("mine")}}>我的发布</button>
        <button type="button" className={button} disabled={locked || !canWrite} onClick={() => {void session?.openPublish()}}>发布我的模板</button>
        <button type="button" className={button} disabled={view.busy} onClick={() => {void session?.refresh()}}>刷新列表</button>
      </div>
      {view.tab === "market" ? <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={event => {event.preventDefault(); void session?.refresh()}}>
        <label className="min-w-0 text-sm">搜索模板<input className={input} type="search" maxLength={200} value={view.query.search} disabled={view.busy} onChange={event => session?.setQuery({...view.query, search: event.target.value})}/></label>
        <label className="text-sm">分类<select className={input} value={view.query.category} disabled={view.busy} onChange={event => {session?.setQuery({...view.query, category: event.target.value}); void session?.refresh()}}><option value="all">全部</option>{agentTemplateMarketCategories.map(category => <option key={category} value={category}>{agentTemplateMarketCategoryLabels[category]}</option>)}</select></label>
        <button type="submit" className={button + " self-end"} disabled={view.busy}>搜索</button>
      </form> : null}
      {listStatus === "loading" ? <p role="status">正在加载模板…</p> : listStatus === "error" ? <div role="alert"><p>模板列表加载失败，暂时无法确认当前内容。</p><button type="button" className={button + " mt-2"} disabled={view.busy} onClick={() => {void session?.refresh()}}>重新加载列表</button></div> : listStatus === "idle" ? <p role="status">请刷新列表以查看当前模板。</p> : view.tab === "market" ? view.market.length ? <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{view.market.map(row => <article key={row.id} className="min-w-0 space-y-2 break-words rounded-xl border p-4">
        <h3 className="font-medium">{row.name}</h3><p className="text-xs text-slate-500">{agentTemplateMarketCategoryLabels[row.category]} · {row.built_in ? "内置模板" : row.is_mine ? "我的发布" : "作者尾号 " + row.author_tail}</p>
        <p className="whitespace-pre-wrap text-sm">{row.description}</p><p className="text-xs">已复用 {row.use_count} 次</p>
        <button type="button" className={button} disabled={view.busy} onClick={() => {void session?.openDetail(row.id)}}>查看「{row.name}」</button>
      </article>)}</div> : <p role="status">没有符合条件的模板，可调整分类或搜索内容。</p> : view.mine.length ? <div className="space-y-3">{view.mine.map(row => <article key={row.id} className="min-w-0 space-y-2 break-words rounded-xl border p-4">
        <h3 className="font-medium">{row.name}</h3><p className="whitespace-pre-wrap text-sm">{row.description}</p><p className="text-xs">{agentTemplateMarketCategoryLabels[row.category]} · {row.public ? "已上架" : "已下架"} · 已复用 {row.use_count} 次</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={view.busy} onClick={() => {void session?.openDetail(row.id)}}>查看「{row.name}」</button>
          <button type="button" aria-label={(row.public ? "下架" : "重新上架") + "「" + row.name + "」"} className={button} disabled={locked || !canWrite} onClick={() => {void session?.openLifecycle(row.id, row.public ? "unpublish" : "republish")}}>{row.public ? "下架" : "重新上架"}</button>
          <button type="button" aria-label={"永久删除「" + row.name + "」"} className={button + " text-rose-800"} disabled={locked || !canWrite} onClick={() => {void session?.openLifecycle(row.id, "delete")}}>永久删除</button></div>
      </article>)}</div> : <p role="status">你还没有发布过模板。</p>}

      {view.publishOpen ? <section aria-label="发布模板" className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">发布我的模板</h3><button type="button" className={button} disabled={view.busy} onClick={() => session?.closePublish()}>关闭发布</button></div>
        <p className="text-sm">以下内容会公开给其他员工。请完整核查文字，避免包含个人资料、内部机密或密钥。</p>
        {view.sourcesStatus === "loading" ? <p role="status">正在加载我的方案…</p> : view.sourcesStatus === "error" ? <div role="alert"><p>我的方案加载失败。</p><button type="button" className={button} disabled={view.busy} onClick={() => {void session?.reloadSources()}}>重新加载我的方案</button></div> : view.sourcesStatus === "ready" && !view.sources.length ? <p role="status">还没有可发布的已保存方案，请先保存自己的助手。</p> : null}
        <label className="block text-sm">我的助手方案<select className={input} value={view.publishDraft.sourceId} disabled={locked || !canWrite || view.sourcesStatus !== "ready"} onChange={event => session?.setPublishDraft({sourceId: event.target.value})}><option value="">请选择已保存的方案</option>{view.sources.map(source => <option key={source.spec_id} value={source.spec_id}>{source.name}</option>)}</select></label>
        <label className="block text-sm">模板名称<input className={input} maxLength={120} value={view.publishDraft.name} disabled={locked || !canWrite} onChange={event => session?.setPublishDraft({name: event.target.value})}/></label>
        <label className="block text-sm">模板简介（必填，最多 120 字）<textarea className={input} maxLength={120} rows={3} value={view.publishDraft.description} disabled={locked || !canWrite} onChange={event => session?.setPublishDraft({description: event.target.value})}/></label>
        <label className="block text-sm">发布分类<select className={input} value={view.publishDraft.category} disabled={locked || !canWrite} onChange={event => session?.setPublishDraft({category: event.target.value})}>{agentTemplateMarketCategories.map(category => <option key={category} value={category}>{agentTemplateMarketCategoryLabels[category]}</option>)}</select></label>
        <button type="button" className={button} disabled={locked || !canWrite || view.sourcesStatus !== "ready" || !view.publishDraft.sourceId || !view.publishDraft.description.trim()} onClick={() => {void session?.previewPublish()}}>预览公开内容</button>
        {view.publishPreview ? <div className="space-y-3"><h4 className="font-medium">公开内容预览：{view.publishPreview.name}</h4><p className="whitespace-pre-wrap text-sm">{view.publishPreview.description}</p><TemplateMarketSnapshotView spec={view.publishPreview.snapshot.spec}/>
          <p className="text-sm">来源的模型连接、私有工具、知识库和检查规则不会公开，也不会授予使用者权限。</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={view.publishDraft.reviewed} disabled={locked || !canWrite} onChange={event => session?.setReviewed(event.target.checked)}/><span>我已核查全部公开文字，确认可以发布。</span></label>
          <button type="button" className={primary} disabled={locked || !canWrite || !view.publishDraft.reviewed} onClick={() => {void session?.publish()}}>确认发布这个模板</button></div> : null}
      </section> : null}

      {view.detail ? <section aria-label="模板详情" className="space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{view.detail.item.name}</h3><button type="button" className={button} disabled={view.busy} onClick={() => session?.closeDetail()}>关闭详情</button></div>
        <p className="whitespace-pre-wrap text-sm">{view.detail.item.description}</p><TemplateMarketSnapshotView spec={view.detail.snapshot.spec}/>
        {!view.detail.item.public ? <p role="status">这个模板已下架，只有你可以查看，暂时不能复制。</p> : <>
          <label className="block text-sm">副本名称<input className={input} maxLength={120} value={view.copyName} disabled={locked || !canWrite} onChange={event => session?.setCopyName(event.target.value)}/></label>
          <button type="button" className={button} disabled={locked || !canWrite} onClick={() => {void session?.previewUse()}}>预览我的副本</button>
          {view.usePreview ? <div className="space-y-2 rounded-lg bg-slate-50 p-3"><p>将创建「{view.usePreview.name}」。这会保存一份独立方案，接下来需要配置自己的模型与资源。</p><p className="text-sm">不会自动运行助手。</p><button type="button" className={primary} disabled={locked || !canWrite} onClick={() => {void session?.copy()}}>确认复制为我的助手</button></div> : null}
        </>}
      </section> : null}

      {view.lifecycle ? <section aria-label="确认模板操作" className="space-y-3 rounded-xl border p-4"><h3 className="font-medium">{actionName}「{view.lifecycle.detail.item.name}」</h3>
        <p className="text-sm">{view.lifecycle.action === "delete" ? "模板将永久删除，无法恢复。别人已经复制的助手不受影响。" : view.lifecycle.action === "republish" ? "将重新公开这份已保存的模板内容，不会替换为原助手的最新方案。" : "下架后市场不再展示，别人不能继续复制；已复制的助手不受影响。"}</p>
        <TemplateMarketSnapshotView spec={view.lifecycle.detail.snapshot.spec}/>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={view.lifecycle.confirmed} disabled={locked || !canWrite} onChange={event => session?.setLifecycleConfirmed(event.target.checked)}/><span>我确认{actionName}这个模板。</span></label>
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={locked || !canWrite || !view.lifecycle.confirmed} onClick={() => {void session?.commitLifecycle()}}>确认{actionName}</button><button type="button" className={button} disabled={view.busy} onClick={() => session?.closeLifecycle()}>取消这次操作</button></div>
      </section> : null}
      {view.pending ? <div role="status" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>本次操作结果尚未确认，已保留原操作。请查询结果，不要重复提交。</p><button type="button" className={button} disabled={view.busy} onClick={() => {void session?.recover()}}>查询原操作结果</button></div> : null}
      {view.receipt?.operation === "use" ? <div className="space-y-2 rounded-lg bg-emerald-50 p-3"><p>助手副本已保存。请使用自己的模型、工具和知识库完成配置。</p><button type="button" className={primary} disabled={view.busy} onClick={() => {if (view.receipt?.operation === "use") onConfigureAgent(view.receipt.spec_id)}}>配置我的模型与资源</button></div> : null}
      {view.notice ? <p role="status">{view.notice}</p> : null}{view.busy ? <p role="status">正在核对本次操作…</p> : null}
      {view.error ? <p role="alert" className="text-sm text-rose-800">{view.error}</p> : null}
    </>}
  </section>
}

type Binding = {api: PgNativeTemplateMarketApi; employeeId: string; scopeKey: string; model: PgNativeTemplateMarketSession}
export default function PgNativeTemplateMarketPanel(props: PgNativeTemplateMarketPanelProps) {
  const {api, employeeId, scopeKey, active, available, writes} = props
  const callbacks = useRef(props); callbacks.current = props
  const [binding, setBinding] = useState<Binding | null>(null)
  const model = api && binding?.api === api && binding.employeeId === employeeId && binding.scopeKey === scopeKey && binding.model.matchesScope(api, employeeId, scopeKey) ? binding.model : undefined
  useEffect(() => {
    if (!api) {setBinding(null); return}
    const notify = (kind: "onExpired" | "onChanged") => {const latest = callbacks.current; if (latest.api === api && latest.employeeId === employeeId && latest.scopeKey === scopeKey) latest[kind]?.()}
    let session: PgNativeTemplateMarketSession
    try {session = createPgNativeTemplateMarketSession(api, {employeeId, scopeKey, onExpired: () => notify("onExpired"), onChanged: () => notify("onChanged")})} catch {setBinding(null); return}
    const publish = () => setBinding({api, employeeId, scopeKey, model: session}), unsubscribe = session.subscribe(publish); publish()
    return () => {unsubscribe(); session.dispose()}
  }, [api, employeeId, scopeKey])
  useEffect(() => {
    if (!model) return
    model.setAvailability({available, writes}); model.setActive(active)
    if (active && available && model.snapshot().marketStatus === "idle") void model.refresh()
  }, [model, active, available, writes])
  const view = active && model ? model.snapshot() : emptyTemplateMarketView(employeeId, scopeKey)
  return <PgNativeTemplateMarketPresentation key={employeeId + ":" + scopeKey + ":" + String(Boolean(model))} {...props} view={view} bound={Boolean(model)} session={model}/>
}
