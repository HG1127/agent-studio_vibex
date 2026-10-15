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
  return (
    <SiteShell>
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/60 to-card text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <PmTopBar />
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-20">
        {/* hero */}
        <section className="relative overflow-hidden py-4">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              插件<span className="text-primary">市场</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              填一次 Smithery API Key 即可浏览并一键连接插件（简介自动翻成中文）；也支持直连自建 / 内部 MCP 服务。连接后的工具自动进入助手可调用工具集，可在线试调并留档。
            </p>
          </div>
          {p.isLoggedIn && (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-md">
                  已收录插件 <span className="font-mono text-primary">{p.marketItems.length}</span> 条{p.marketNextCursor ? "（可继续加载更多）" : ""}
                </span>
                <span className="rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-md">
                  我的连接 <span className="font-mono text-primary">{p.connectionRows.length}</span> 个 · 启用 {p.connectedCount} 个
                </span>
                <span className="rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-card-foreground shadow-md">
                  市场调用留档 <span className="font-mono text-primary">{p.invokeLog.length}</span> 条
                </span>
              </div>
            )}
        </section>

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
              onDelete={p.deleteConnection}
              onTryInvoke={p.startInvokeFromDrawer}
            />

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
        )}
      </main>

      <footer className="border-t border-border bg-card/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            插件市场 · 数据实时代理自 MCP 官方注册表，连接与调用均为真实远程请求
          </p>
          <p className="text-xs text-muted-foreground">仅本地进程类插件暂不支持连接，页内会如实标注</p>
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
