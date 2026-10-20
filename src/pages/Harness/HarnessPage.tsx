import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { SiteShell } from "@/components/site/SiteShell"
import { redirectToRhLogin } from "@/lib/studioAuth"
import { filterRuns, HARNESS_SOURCES, runDetailHref, type SourceKey, type SourceState } from "@/lib/harnessData"
import { useHarness } from "./useHarness"

function SourcePanel({ sourceKey, state, children }: { sourceKey: SourceKey; state: SourceState; children?: ReactNode }) {
  return <section aria-busy={state.loading} className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 className="font-semibold">{HARNESS_SOURCES[sourceKey].label}</h2>
    <p className="break-all text-xs text-muted-foreground">来源：GET {HARNESS_SOURCES[sourceKey].path}</p>
    <p role="status" className="text-xs text-muted-foreground">{state.loading ? "正在加载… " : ""}{state.loadedAt ? `${state.loading || state.error ? "旧数据 · " : "快照 · "}${new Date(state.loadedAt).toLocaleString()}` : "尚未加载成功"}</p>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}。{state.data ? "以下保留上次快照，请刷新重试。" : "无法提供此来源数据，请刷新重试。"}</p>}
    {state.data && <>
      {state.data.note && <p className="text-xs leading-relaxed text-muted-foreground">{state.data.note}</p>}
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{state.data.metrics.map(metric => <div key={metric.label} className="min-w-0 rounded-xl bg-secondary/40 p-3">
        <dt className="text-xs text-muted-foreground">{metric.label}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{metric.value}</dd>
      </div>)}</dl>
    </>}
    {children}
  </section>
}

export default function HarnessPage() {
  const { sources, authRequired, refresh, loading } = useHarness()
  const [kind, setKind] = useState("all")
  const [status, setStatus] = useState("all")
  const runs = [...(sources.agents.data?.runs || []), ...(sources.workflows.data?.runs || [])]
  const shown = filterRuns(runs, kind, status)
  return <SiteShell><main className="w-full min-w-0 space-y-5 p-3 sm:p-5 lg:p-7">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">运行中心 / Harness</p><h1 className="mt-1 text-2xl font-semibold">Harness 运行与治理</h1>
        <p className="mt-2 text-sm text-muted-foreground">本人运行与治理快照 · 只读 · 手动刷新，不自动轮询</p></div>
      <button type="button" disabled={loading || authRequired} onClick={() => void refresh()} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{loading ? "刷新中…" : "刷新全部来源"}</button>
    </header>
    {authRequired ? <section role="alert" className="rounded-xl border border-border p-5"><p>登录态失效或身份前置条件未满足（401 / 412）。已清除页面快照并停止请求，请重新验证员工账号。</p><button type="button" onClick={redirectToRhLogin} className="mt-3 underline">前往登录</button></section> : <>
      <SourcePanel sourceKey="worker" state={sources.worker} />
      <div className="space-y-2"><p className="text-sm text-muted-foreground">监控窗口：本人最近创建的最多 100 条 Agent + 100 条 Workflow；工具聚合取最近 500 次调用，仅列调用量前 12 个工具。不是今日或近 7 日全量。Token 按字符数 / 4 估算，不代表计费或费用。</p>
        <SourcePanel sourceKey="monitor" state={sources.monitor}>
          {sources.monitor.data?.tools && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="py-2 text-left font-medium">窗口内工具调用聚合</caption><thead><tr>{["工具", "调用", "成功", "失败", "重试", "平均延迟 ms"].map(label => <th scope="col" key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead>
            <tbody>{sources.monitor.data.tools.map(tool => <tr key={tool.tool_name} className="border-t border-border"><th scope="row" className="break-all p-2">{tool.tool_name}</th>{[tool.calls, tool.success, tool.failed, tool.retried, tool.avg_latency_ms].map((value, index) => <td key={index} className="p-2 tabular-nums">{value}</td>)}</tr>)}</tbody></table>{sources.monitor.data.tools.length === 0 && <p className="p-2 text-sm">此窗口暂无工具调用。</p>}</div>}
        </SourcePanel></div>
      <SourcePanel sourceKey="stats" state={sources.stats}><p className="text-xs text-muted-foreground">全量本人累计统计，与近期监控窗口口径不同；运行数与工具调用数分别计数。</p></SourcePanel>
      <div className="grid gap-4 md:grid-cols-2"><SourcePanel sourceKey="agents" state={sources.agents} /><SourcePanel sourceKey="workflows" state={sources.workflows} /></div>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">最近运行历史</h2><p className="text-xs text-muted-foreground">每类最多 20 条，按创建时间排序；筛选仅作用于已加载历史。各来源加载情况见上方；Workflow 已核实支持本人跨工作流历史，但现有编排页不支持运行详情直达。</p>
        <div className="flex flex-wrap gap-3"><label className="text-sm">类型 <select value={kind} onChange={event => setKind(event.target.value)} className="rounded-lg border border-border bg-background p-2"><option value="all">全部类型</option><option value="agent">Agent</option><option value="workflow">Workflow</option></select></label>
          <label className="text-sm">状态 <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-border bg-background p-2"><option value="all">全部状态</option>{Array.from(new Set([...runs.map(run => run.status), ...(status === "all" ? [] : [status])])).sort().map(value => <option key={value} value={value}>{value || "未知状态"}</option>)}</select></label></div>
        <ul className="divide-y divide-border">{shown.map(run => <li key={`${run.kind}:${run.id}`} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-all font-medium">{run.name}</p><p className="break-all text-xs text-muted-foreground">{run.kind} · {run.status || "未知状态"} · {run.created}<br/>运行 ID：{run.id}{run.source ? ` · 来源线索：${run.source}` : " · 来源未提供"}</p></div>
          {runDetailHref(run) ? <Link className="self-center text-primary underline" to={runDetailHref(run)!}>查看运行详情</Link> : <Link className="self-center text-primary underline" to="/workflow-canvas">打开工作流编排</Link>}</li>)}</ul>
        {shown.length === 0 && <p role="status" className="text-sm text-muted-foreground">{sources.agents.data || sources.workflows.data ? "已加载历史中没有匹配记录。" : "历史尚未可用，不能判断是否为空。"}</p>}
      </section>
      <aside className="space-y-2 rounded-xl border border-border p-4 text-sm"><h2 className="font-semibold">治理与来源入口</h2><p className="text-muted-foreground">近 7 日失败分类暂不支持：现有 recent 接口未提供结构化 failure_diagnostic，也不覆盖完整 7 日。人工核查项应由有权限人员核实实际外部结果后安全处理，避免重复执行。</p><div className="flex flex-wrap gap-4"><Link className="text-primary underline" to="/tool-hub">工具调用与诊断线索</Link><Link className="text-primary underline" to="/scheduled-tasks">本人定时任务与历史</Link><Link className="text-primary underline" to="/run-detail">Agent 执行记录与审批</Link></div></aside>
    </>}
  </main></SiteShell>
}
