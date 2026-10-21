import { Link, useSearchParams } from "react-router-dom"
import { safeAgentSpecId } from "@/lib/toolSearchPrivacy"
import { AlertTriangle, CheckCircle2, ShoppingBag, X } from "lucide-react"
import { MarketBrowser } from "@/components/plugin-market/MarketBrowser"
import { SmitheryConnectCard } from "@/components/plugin-market/SmitheryConnectCard"
import { MarketInvocationLog } from "@/components/plugin-market/MarketInvocationLog"
import { MyConnectionsBar } from "@/components/plugin-market/MyConnectionsBar"
import { PluginDetailDrawer } from "@/components/plugin-market/PluginDetailDrawer"
import { PmLoginGate } from "@/components/plugin-market/PmLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { PmTopBar } from "@/components/plugin-market/PmTopBar"
import { InvokeTestPanel } from "@/components/plugin-market/InvokeTestPanel"
import type { usePluginMarket } from "./usePluginMarket"

export function PluginMarketPage(p: ReturnType<typeof usePluginMarket>) {
  const [query]=useSearchParams()
  const returnSpec=safeAgentSpecId(query.get("returnSpec")||"")
  return (
    <SiteShell>
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <PmTopBar />
      </header>

      <main className="w-full min-w-0 px-3 pb-12 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="plugins">
        {/* hero */}
        <section className="relative border-b border-border py-4">
          <div className="relative z-10 flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              插件<span className="text-primary">市场</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              搜索插件、了解权限、完成 Smithery 托管授权并验证工具；只有通过验证的工具才会供 Agent 调用。自建 MCP、运行诊断和日志放在高级功能中。
            </p>
          </div>
          {p.isLoggedIn && (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-sm">
                  当前 Smithery 列表 <span className="font-mono text-primary">{p.smitheryItems.length}</span> 条{p.smitheryNextPage ? " · 可继续加载" : ""}
                </span>
                <span className="rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-sm">
                  我的连接 <span className="font-mono text-primary">{p.connectionRows.length}</span> 个 · 验证可用 {p.enabledConnections.length} 个
                </span>              </div>
            )}
        </section>

        {returnSpec && <section aria-label="连接完成后返回原 Agent" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold">正在为一个 Agent 连接工具</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              请先完成插件连接、OAuth 和工具发现。完成后返回原 Agent 的资源配置，核验工具并明确选择；连接成功不会自动授权所有 Agent。
            </p>
          </div>
          <Link to={`/agent-create?step=3&spec=${encodeURIComponent(returnSpec)}`}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">
            返回原 Agent 配置 →
          </Link>
        </section>}
        {p.needsRhLogin && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              登录态已过期，请重新登录后继续操作
            </p>
            <button
              type="button"
              onClick={p.onLoginClick}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              重新登录
            </button>
          </div>
        )}
        {p.errorMsg && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {p.errorMsg}
            </p>
            <button type="button" onClick={p.dismissError} className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-card-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {p.noticeMsg && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="flex items-start gap-2 text-sm text-primary">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {p.noticeMsg}
            </p>
            <button type="button" onClick={p.dismissNotice} className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-card-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!p.isLoggedIn ? (
          <PmLoginGate onLoginClick={p.onLoginClick} />
        ) : (
          <div className="space-y-6">
            <SmitheryConnectCard p={p} />
            <MyConnectionsBar
              connectionRows={p.connectionRows}
              isConnectionsLoading={p.isConnectionsLoading}
              busyConnectionId={p.busyConnectionId}
              connectedCount={p.connectedCount}
              onToggle={p.toggleConnection}
              onReprobe={p.reprobeConnection}
              onRefreshSmithery={p.refreshSmitheryConnection}
              onDelete={p.deleteConnection}
              onTryInvoke={p.startInvokeFromDrawer}
            />

            <details onToggle={event=>p.changeAdvancedOpen(event.currentTarget.open)}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-primary">
                高级功能 · MCP 公共注册表、工具试调与调用日志
                <span className="ml-2 text-xs font-normal text-muted-foreground">面向企业自建或需要手动管理的 MCP</span>
              </summary>
              <div className="mt-4 space-y-5">
            <MarketBrowser
              featuredItems={p.featuredItems}
              isFeaturedLoading={p.isFeaturedLoading}
              marketItems={p.marketItems}
              marketSearchText={p.marketSearchText}
              setMarketSearchText={p.setMarketSearchText}
              marketActiveQuery={p.marketActiveQuery}
              isMarketLoading={p.isMarketLoading}
              isMarketLoadingMore={p.isMarketLoadingMore}
              marketError={p.marketError}
              marketNextCursor={p.marketNextCursor}
              connectionByUrl={p.connectionByUrl}
              isTranslating={p.isTranslating}
              onTranslate={p.translateMarket}
              onSubmitSearch={p.submitMarketSearch}
              onLoadMore={p.loadMoreMarket}
              onRetry={p.retryMarket}
              onOpenPlugin={p.openDrawer}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <InvokeTestPanel
                enabledConnections={p.enabledConnections}
                invokeConnId={p.invokeConnId}
                invokeConn={p.invokeConn}
                invokeToolName={p.invokeToolName}
                invokeTool={p.invokeTool}
                invokeArgsText={p.invokeArgsText}
                setInvokeArgsText={p.setInvokeArgsText}
                isInvoking={p.isInvoking}
                invokeOutcome={p.invokeOutcome}
                onSelectConn={p.selectInvokeConn}
                onSelectTool={p.selectInvokeTool}
                onRunInvoke={p.runInvoke}
              />
              <MarketInvocationLog
                invokeLog={p.invokeLog}
                isLoadingLog={p.isLoadingLog}
                expandedLogId={p.expandedLogId}
                onToggleRow={p.toggleLogRow}
                invokeStatusMeta={p.invokeStatusMeta}
              />
            </div>
              </div>
            </details>
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-card/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Smithery 托管连接 + MCP 官方公共注册表；真实授权和工具发现均由服务端核验
          </p>
          <p className="text-xs text-muted-foreground">未经授权或尚无工具的连接不会标记为可使用；本地进程插件仍需单独部署</p>
        </div>
      </footer>

      <PluginDetailDrawer
        drawerPlugin={p.drawerPlugin}
        drawerConnection={p.drawerConnection}
        isProbing={p.isProbing}
        probeOutcome={p.probeOutcome}
        isConnecting={p.isConnecting}
        connectError={p.connectError}
        connectNotice={p.connectNotice}
        headerRows={p.headerRows}
        onClose={p.closeDrawer}
        onProbe={p.runProbe}
        onConnect={p.runConnect}
        onAddHeaderRow={p.addHeaderRow}
        onUpdateHeaderRow={p.updateHeaderRow}
        onRemoveHeaderRow={p.removeHeaderRow}
        onTryInvoke={p.startInvokeFromDrawer}
      />

    </div>
    </SiteShell>
  )
}
