import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowRight, CircleAlert, Globe2, Loader2, Monitor, Plug, RefreshCw, Wrench } from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { ReturnToAgentResources } from "@/components/site/ReturnToAgentResources"
import { getPocketBaseUrl } from "@/lib/pb"
import { decodeRhToken, redirectToRhLogin, vibexAuthHeaders } from "@/lib/studioAuth"
import { continueAgentResourceSetupUrl } from "@/lib/toolSearchPrivacy"
import {
  collectExecutionCapabilities, EXECUTION_CONNECTION_PRESETS, formatExecutionCheckTime,
  type ExecutionCapabilityKind,
} from "@/lib/executionCapabilities"

type Inventory = { http: unknown[]; market: unknown[]; errors: string[]; snapshotKey: string }
const FILTERS: { value: "all" | ExecutionCapabilityKind; label: string }[] = [
  { value: "all", label: "全部连接" }, { value: "browser", label: "浏览器" },
  { value: "desktop", label: "电脑软件" }, { value: "api", label: "其他 API / MCP" },
]

export function ExecutionConnectionsPage() {
  const [params] = useSearchParams()
  const requestedKind = params.get("capability")
  const [filter, setFilter] = useState<"all" | ExecutionCapabilityKind>(() =>
    requestedKind === "browser" || requestedKind === "desktop" ? requestedKind : "all")
  const [refresh, setRefresh] = useState(0)
  const [inventory, setInventory] = useState<Inventory>({ http: [], market: [], errors: [], snapshotKey: "" })
  const employeeId = decodeRhToken()?.sub || ""
  const isLoggedIn = Boolean(employeeId)
  // Never display a previous employee's results (or stale refresh results)
  // while the newly scoped inventory is loading.
  const snapshotKey = employeeId + ":" + refresh
  const inventoryLoading = isLoggedIn && inventory.snapshotKey !== snapshotKey

  useEffect(() => {
    const controller = new AbortController()
    if (!employeeId) return () => controller.abort()
    const load = async (path: string): Promise<unknown[]> => {
      const response = await fetch(getPocketBaseUrl() + path, { headers: vibexAuthHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) })
      if (!response.ok) throw new Error(response.status === 401 || response.status === 412 ? "登录已过期，请重新登录" : "暂时无法取得连接清单")
      const data: unknown = await response.json()
      if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) throw new Error("返回的连接清单格式不完整")
      return data.items
    }
    void Promise.allSettled([load("/api/tool-connections"), load("/api/market/connections")]).then(([http, market]) => {
      if (controller.signal.aborted) return
      const errors: string[] = []
      if (http.status === "rejected") errors.push("HTTP 工具：" + (http.reason instanceof Error ? http.reason.message : "读取失败"))
      if (market.status === "rejected") errors.push("MCP 连接：" + (market.reason instanceof Error ? market.reason.message : "读取失败"))
      setInventory({
        http: http.status === "fulfilled" ? http.value : [],
        market: market.status === "fulfilled" ? market.value : [], errors, snapshotKey,
      })
    })
    return () => controller.abort()
  }, [employeeId, snapshotKey])

  const capabilities = useMemo(() =>
    !isLoggedIn || inventoryLoading ? [] : collectExecutionCapabilities(inventory.http, inventory.market),
    [isLoggedIn, inventoryLoading, inventory.http, inventory.market])
  const visible = capabilities.filter(row => filter === "all" || row.kind === filter)
  const link = (path: string) => continueAgentResourceSetupUrl(path, params)

  return <SiteShell>
    <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8" data-studio-fluid-page="execution-connections">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium text-primary">工具与连接</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">浏览器与电脑工具</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            让助手使用网页交互、本地软件和业务接口。先接入实际执行器，再把它提供的具体工具分配到 Agent 任务。
          </p>
        </div>
        <button type="button" disabled={inventoryLoading || !isLoggedIn} onClick={() => setRefresh(value => value + 1)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${inventoryLoading ? "animate-spin" : ""}`} />刷新连接清单
        </button>
      </header>

      <ReturnToAgentResources what="浏览器和电脑工具" />

      <section aria-label="选择接入方式" className="my-6 grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-5">
          <Globe2 className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">浏览器执行器</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">适用于打开网页、读取页面、填写表单。可连接远程浏览器 MCP，或由你管理的浏览器服务。</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">执行器使用自己的浏览器会话；需要登录的网站须在执行器中完成账号授权。</p>
          <Link to={link("/plugin-market?tool=browser")} className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary hover:underline">
            寻找浏览器插件 <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
        <article className="rounded-xl border border-border bg-card p-5">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">电脑与办公软件</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">适用于文档转换、表格处理及已登记的软件操作。电脑侧先运行执行器，并提供后端可访问的 MCP 或 HTTP 接口。</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">软件、文件目录和动作范围在电脑侧配置。这里不提供设备心跳，已保存连接不代表电脑当前在线。</p>
          <Link to={link("/plugin-market?tool=desktop")} className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary hover:underline">
            寻找电脑工具插件 <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
        <article className="rounded-xl border border-border bg-card p-5">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">已有接口与自建连接</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">已有软件 API 可直接配置 GET / POST；已有远程 MCP 服务在插件页连接，发现实际工具后按需选择。</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">HTTP 请求由 Agent Studio 后端发出。localhost 指后端所在机器，连接其他电脑应填写后端可达的执行器地址。</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <Link to={link("/tool-connections")} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline">配置 HTTP 工具 <ArrowRight className="h-4 w-4" /></Link>
            <Link to={link("/plugin-market")} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline">连接 MCP <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </article>
      </section>

      <section aria-labelledby="local-executor-heading" className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-primary">本机受控能力 · 开发试用</p>
            <h2 id="local-executor-heading" className="mt-1 text-base font-semibold">真实浏览器与 PDF / Excel 执行器</h2>
          </div>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">默认关闭 · 必须手动启动</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          项目包含隔离的本机 MCP 执行器，可使用独立 Chromium 读取逐路径授权的本地测试网页、解析真实 PDF / XLSX 文件。
          需要填写表单时，可额外登记固定动作和可写路径；文件导出与表单提交均单独启用并经人工审批。它不会接管你的日常浏览器或整台电脑。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-xs font-semibold">1 · 限定资源</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              配置独立文件目录、精确的网页 origin + path 白名单，以及随机授权令牌；默认拒绝未登记路径。
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-xs font-semibold">2 · 手动启动执行器</p>
            <code className="mt-2 block break-all rounded border border-border bg-background px-2 py-2 text-xs">node ops/local-executor.mjs</code>
            <p className="mt-1 text-xs text-muted-foreground">必须设置 AGENT_STUDIO_LOCAL_EXECUTOR_ENABLED=1 及所需环境变量。</p>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-xs font-semibold">3 · MCP 连接与角色授权</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              用执行器输出的 MCP 地址和 Bearer 令牌创建连接。发现工具后，按角色明确分配并逐次批准调用。
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          仅限在同一台机器上能够访问执行器的开发后端；远程服务器上的 localhost 不是你个人电脑。
          PDF / Excel 文件须放入显式工作目录，所有文件和浏览器测试先在隔离数据下验收。运行条件与 Windows 启动示例见项目文档
          <code className="ml-1 break-all">docs/LOCAL_EXECUTOR_PILOT_20261022.md</code>。
        </p>
        <Link to={link("/plugin-market")} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          前往 MCP 插件连接 <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section aria-labelledby="execution-inventory-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="execution-inventory-heading" className="font-semibold">当前账号已登记的能力</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">分类根据工具名称和说明生成；可执行范围、权限和结果由实际连接决定。</p>
          </div>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{capabilities.length} 个连接</span>
        </div>
        <div role="group" aria-label="筛选执行能力" className="my-4 flex flex-wrap gap-2">
          {FILTERS.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
            className={`min-h-9 rounded-lg border px-3 text-xs font-medium transition ${filter === item.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
            {item.label} · {item.value === "all" ? capabilities.length : capabilities.filter(row => row.kind === item.value).length}
          </button>)}
        </div>
        {!isLoggedIn ? <div className="rounded-lg bg-secondary/40 p-4 text-sm">
          <p>登录后查看自己的工具连接。</p>
          <button type="button" onClick={redirectToRhLogin} className="mt-3 min-h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">登录账号</button>
        </div> : inventoryLoading ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取已保存的连接…</p> : <>
          {inventory.errors.length > 0 && <div role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><CircleAlert className="h-4 w-4" />连接清单未完整加载</p>
            {inventory.errors.map(error => <p key={error} className="mt-1 text-xs text-muted-foreground">{error}</p>)}
            <p className="mt-2 text-xs text-muted-foreground">可以刷新重试；未读取到的连接不会被标记为可用。</p>
          </div>}
          {visible.length === 0 ? <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">{inventory.errors.length ? "当前读取结果中没有匹配连接" : "还没有这类连接"}</p>
            <p className="mt-2 text-xs text-muted-foreground">从上方选择插件或自建接口；连接成功后回到原 Agent，重新匹配工具并保存。</p>
          </div> : <div className="grid gap-3 lg:grid-cols-2">
            {visible.map(row => <article key={`${row.source}:${row.id}`} className="min-w-0 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 break-words text-sm font-semibold">{row.title}</h3>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] ${row.state === "tested" || row.state === "discovered" ? "bg-primary/10 text-primary" : row.state === "failed" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{row.stateLabel}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{row.source === "http" ? `HTTP ${row.method || "接口"}` : `MCP · ${row.toolNames.length} 个已记录工具`}</p>
              {row.description && <p className="mt-3 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{row.description}</p>}
              <p className="mt-3 text-xs leading-relaxed">{row.detail}</p>
              {row.source === "http" && <p className="mt-1 text-[11px] text-muted-foreground">{formatExecutionCheckTime(row.checkedAt)}</p>}
              <Link to={link(row.source === "http" ? `/tool-connections${/^[A-Za-z0-9]{15}$/.test(row.id) ? `?connection=${row.id}` : ""}` : "/plugin-market")}
                className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-medium text-primary hover:underline">{row.source === "http" ? "查看配置与测试" : "管理 MCP 连接"}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </article>)}
          </div>}
        </>}
      </section>

      <section aria-labelledby="execution-templates-heading" className="my-6 rounded-xl border border-border bg-card p-5">
        <h2 id="execution-templates-heading" className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" />接入你自己的执行器</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">以下模板只预填工具名、用途与参数格式。服务提供者需要实现相应接口，你填入实际地址和凭据后进行真实测试。</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {EXECUTION_CONNECTION_PRESETS.map(preset => <article key={preset.id} className="min-w-0 rounded-lg bg-secondary/40 p-4">
            <h3 className="text-sm font-semibold">{preset.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{preset.contract}</p>
            <Link to={link(`/tool-connections?preset=${preset.id}`)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-primary hover:bg-background">
              填入接入模板 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </article>)}
        </div>
        <ol className="mt-5 grid list-inside list-decimal gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground lg:grid-cols-3">
          <li>在目标电脑或服务端准备执行器与授权。</li>
          <li>填写连接，测试指定动作并检查真实返回。</li>
          <li>返回 Agent 绑定具体工具，试跑时查看执行证据。</li>
        </ol>
      </section>
    </main>
  </SiteShell>
}

export default ExecutionConnectionsPage
