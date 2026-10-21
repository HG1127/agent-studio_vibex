import { AlertCircle, Info, X } from "lucide-react"
import { BuiltinToolCards } from "@/components/tool-hub/BuiltinToolCards"
import { DebugConsole } from "@/components/tool-hub/DebugConsole"
import { ExternalToolList } from "@/components/tool-hub/ExternalToolList"
import { HarnessPanel } from "@/components/tool-hub/HarnessPanel"
import { InvocationLogList } from "@/components/tool-hub/InvocationLogList"
import { ThLoginGate } from "@/components/tool-hub/ThLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { ThTopBar } from "@/components/tool-hub/ThTopBar"
import { WorkerStatusPanel } from "@/components/tool-hub/WorkerStatusPanel"
import type { useToolHub } from "./useToolHub"

export function ToolHubPage(p: ReturnType<typeof useToolHub>) {
  return (
    <SiteShell>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <ThTopBar />
      </header>

      <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 px-4 pb-4 pt-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
            工具诊断与运行记录
          </h1>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            内置和已连接工具可独立测试、查看耗时与结果；外部调用按审批规则执行，失败记录与运行环境在此排查。
          </p>
        </div>
      </section>

      {p.needsRhLogin && (
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
              登录态已过期，请重新登录后再继续
            </span>
            <button
              type="button"
              onClick={p.onLoginClick}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              重新登录
            </button>
          </div>
        </div>
      )}

      {p.errorMsg && (
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <span className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {p.errorMsg}
            </span>
            <button
              type="button"
              onClick={p.dismissError}
              className="shrink-0 rounded-full p-1 text-destructive transition hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="关闭错误提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {p.noticeMsg && (
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              {p.noticeMsg}
            </span>
            <button
              type="button"
              onClick={p.dismissNotice}
              className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="关闭提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="w-full min-w-0 px-3 pb-12 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="tool-hub">
        {p.isLoggedIn ? (
          <div className="space-y-5">
            <WorkerStatusPanel status={p.workerStatus} onRefresh={p.refreshWorkerStatus} />
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[2fr_3fr]">
            <div className="flex flex-col gap-5">
              <BuiltinToolCards
                tools={p.builtinTools}
                activeTarget={p.activeTarget}
                onOpenDebug={p.openBuiltinDebug}
              />
              <ExternalToolList
                tools={p.externalTools}
                isLoading={p.isLoadingExternal}
                activeTarget={p.activeTarget}
                onDebug={p.openExternalDebug}
              />
            </div>
            <div className="flex flex-col gap-5">
              <DebugConsole
                activeTarget={p.activeTarget}
                builtinTools={p.builtinTools}
                specOptions={p.specOptions}
                debugExpression={p.debugExpression}
                setDebugExpression={p.setDebugExpression}
                debugText={p.debugText}
                setDebugText={p.setDebugText}
                debugFocus={p.debugFocus}
                setDebugFocus={p.setDebugFocus}
                debugKeyword={p.debugKeyword}
                setDebugKeyword={p.setDebugKeyword}
                debugSpecId={p.debugSpecId}
                setDebugSpecId={p.setDebugSpecId}
                debugUrl={p.debugUrl}
                setDebugUrl={p.setDebugUrl}
                debugQuery={p.debugQuery}
                setDebugQuery={p.setDebugQuery}
                debugLimit={p.debugLimit}
                setDebugLimit={p.setDebugLimit}
                debugExternalInput={p.debugExternalInput}
                setDebugExternalInput={p.setDebugExternalInput}
                confirmExternalWrite={p.confirmExternalWrite}
                setConfirmExternalWrite={p.setConfirmExternalWrite}
                requiresWriteConfirmation={p.requiresWriteConfirmation}
                isDebugging={p.isDebugging}
                debugResult={p.debugResult}
                copiedFlag={p.copiedFlag}
                onRun={p.runDebug}
                onCopy={p.copyDebugOutput}
                onClose={p.closeDebug}
              />
              <InvocationLogList
                invocationList={p.invocationList}
                isLoading={p.isLoadingInvocations}
                invocationFilter={p.invocationFilter}
                applyInvocationFilter={p.applyInvocationFilter}
                expandedInvocationId={p.expandedInvocationId}
                toggleInvocationRow={p.toggleInvocationRow}
                sourceMeta={p.sourceMeta}
                invStatusMeta={p.invStatusMeta}
                onRefresh={p.refreshNow}
              />
              <HarnessPanel
                hubStats={p.hubStats}
                monitorData={p.monitorData}
                monitorLoading={p.monitorLoading}
                onRefreshMonitor={p.refreshMonitor}
              />
            </div>
          </div>
          </div>
        ) : (
          <ThLoginGate onLoginClick={p.onLoginClick} />
        )}
      </main>

      <footer className="border-t border-border bg-background/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Agent Studio 工具中心 · 内置五件套 + 外部工具统一试跑与调用留档
          </p>
          <p className="text-xs text-muted-foreground">
            所有调用均为真实执行，网页搜索等外部站点在预览环境可能受限，发布后可正常使用
          </p>
        </div>
      </footer>
    </div>
    </SiteShell>
  )
}
