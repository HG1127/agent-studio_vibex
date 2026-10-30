import { useMemo, useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import { ArrowRight, CircleAlert, Loader2, RefreshCw, Wrench } from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { ExecutionWorkspaceNav } from "@/components/site/ExecutionWorkspaceNav"
import { ReturnToAgentResources } from "@/components/site/ReturnToAgentResources"
import {ResourceQuickStart} from '@/components/site/ResourceQuickStart'
import {useResourceInventory} from '@/lib/useResourceInventory'
import { redirectToRhLogin } from "@/lib/studioAuth"
import { continueAgentResourceSetupUrl } from "@/lib/toolSearchPrivacy"
import {
  collectExecutionCapabilities, EXECUTION_CONNECTION_PRESETS, formatExecutionCheckTime,
  type ExecutionCapabilityKind,
} from "@/lib/executionCapabilities"

const capabilityFilter = (value: string | null): "all" | ExecutionCapabilityKind =>
  value === "browser" || value === "desktop" || value === "api" ? value : "all"
const FILTERS: { value: "all" | ExecutionCapabilityKind; label: string }[] = [
  { value: "all", label: "全部连接" }, { value: "browser", label: "浏览器" },
  { value: "desktop", label: "电脑软件" }, { value: "api", label: "其他 API / MCP" },
]

export function ExecutionConnectionsPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const requestedKind = params.get("capability")
  // React Router can reuse this screen for a new capability link. Scope any
  // manually chosen tab to the current navigation, without an effect-driven
  // state update or an extra render after each route change.
  const [manualFilter, setManualFilter] = useState<{
    routeKey: string; value: "all" | ExecutionCapabilityKind
  } | null>(null)
  const filter = manualFilter?.routeKey === location.key
    ? manualFilter.value : capabilityFilter(requestedKind)
  const {inventory,isLoggedIn,inventoryLoading,refreshing,now,refresh}=useResourceInventory()

  const capabilities = useMemo(() =>
    !isLoggedIn || inventoryLoading ? [] : collectExecutionCapabilities(inventory.http, inventory.market),
    [isLoggedIn, inventoryLoading, inventory.http, inventory.market])
  const visible = capabilities.filter(row => filter === "all" || row.kind === filter)
  const verifiedCount = capabilities.filter(row => row.state === "tested" || row.state === "discovered").length
  const failedCount = capabilities.filter(row => row.state === "failed").length
  const pairedDevices = inventory.devices.filter(device => !device.revoked)
  const observedAt = now
  const onlineDevices = pairedDevices.filter(device => Number.isFinite(Number(device.seen_ms)) &&
    Number(device.seen_ms) > 0 && observedAt >= Number(device.seen_ms) &&
    observedAt - Number(device.seen_ms) < 45000).length
  const link = (path: string) => continueAgentResourceSetupUrl(path, params)

  return <SiteShell>
    <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8" data-studio-fluid-page="execution-connections">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-medium text-primary">工具与连接</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">执行资源中心</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            管理 Agent 实际可用的工具和设备。直接进入所需视图，不必逐项完成电脑配对或监控检查。
          </p>
        </div>
        <button type="button" disabled={refreshing || !isLoggedIn} onClick={() => void refresh()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新连接清单
        </button>
      </header>

      <ReturnToAgentResources what="浏览器和电脑工具" />
      <div className="mt-5"><ExecutionWorkspaceNav active="connections" /></div>
      <p className="mt-3 text-xs text-muted-foreground">新增工具后先真实试调，再回到 Agent 选择工具与角色；只有需要操作本地电脑时，才进行设备配对。</p>

      <p role="status" className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {!isLoggedIn ? "登录后检查实际连接状态。" : inventoryLoading ? "正在检查当前账号的连接…" :
          `当前读取结果含 ${capabilities.length} 个连接；${verifiedCount} 个有历史测试或工具发现记录` +
          (failedCount ? `；${failedCount} 个需检查` : "") +
          (inventory.errors.length ? "；部分清单读取失败" : "") + "。连接记录不代表执行器当前在线。"}
      </p>

      <section aria-label="执行资源概况" className="mt-5 grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">HTTP / MCP 已登记</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{inventoryLoading || !isLoggedIn || !inventory.known.http&&!inventory.known.market ? "—" : capabilities.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">登记不代表在线或拥有工具执行权限</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">有历史测试／工具发现记录</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{inventoryLoading || !isLoggedIn || !inventory.known.http&&!inventory.known.market ? "—" : verifiedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">只表示曾完成核验，运行前仍需重新检查</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">本账号配对电脑</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{inventoryLoading || !isLoggedIn || !inventory.devicesLoaded ? "—" : pairedDevices.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {inventoryLoading ? "正在读取最近心跳…" : !inventory.devicesLoaded ? "设备状态未核验" :
              "最近 45 秒有心跳："+onlineDevices+" 台 · 页面可见时自动更新"}
          </p>
          <Link to={link("/tool-hub?view=devices")} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            查看配对与设备状态 <ArrowRight className="h-3.5 w-3.5"/>
          </Link>
        </div>
      </section>

      <ResourceQuickStart capabilities={capabilities} onlineDevices={inventoryLoading?0:onlineDevices}
        known={inventory.known}
        onConnected={()=>void refresh()}/>
      <p aria-label="资源自动更新说明" className="mb-4 text-xs text-muted-foreground">返回本页时自动刷新，页面可见时每 15 秒核对一次。只读取资源状态，不调用工具、不保存方案、不自动授权。{inventory.checkedAt>0?' 最近核对：'+new Date(inventory.checkedAt).toLocaleTimeString():''}</p>

      <section aria-labelledby="execution-inventory-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="execution-inventory-heading" className="font-semibold">当前账号已登记的能力</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">分类根据工具名称和说明生成；可执行范围、权限和结果由实际连接决定。</p>
          </div>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{capabilities.length} 个连接</span>
        </div>
        <div role="group" aria-label="筛选执行能力" className="my-4 flex flex-wrap gap-2">
          {FILTERS.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setManualFilter({routeKey:location.key,value:item.value})}
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
            <p className="mt-2 text-xs text-muted-foreground">电脑和浏览器使用上方统一连接入口；在线服务可选择插件或已有 API。连接不代表已授权执行。</p>
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

      <details className="group my-6 rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold marker:hidden sm:px-5">
          <span>高级选项：接入你自己的执行器</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">查看接口模板 ↓</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">收起 ↑</span>
        </summary>
      <section aria-labelledby="execution-templates-heading" className="border-t border-border p-5">
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
      </details>
    </main>
  </SiteShell>
}

export default ExecutionConnectionsPage
