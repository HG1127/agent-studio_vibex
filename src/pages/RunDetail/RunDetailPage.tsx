import { AlertCircle, ArrowLeft, Compass, Loader2, ScrollText, X } from "lucide-react"
import { Link } from "react-router-dom"
import { RdActionBar } from "@/components/run-detail/RdActionBar"
import { RdLoginGate } from "@/components/run-detail/RdLoginGate"
import { RdTopBar } from "@/components/run-detail/RdTopBar"
import { SiteShell } from "@/components/site/SiteShell"
import { RecentRunsList } from "@/components/run-detail/RecentRunsList"
import { RunEvalFeedbackCard } from "@/components/run-detail/RunEvalFeedbackCard"
import { RunOverviewCard } from "@/components/run-detail/RunOverviewCard"
import { RunResultCard } from "@/components/run-detail/RunResultCard"
import { FailureTriageCard } from "@/components/run-detail/FailureTriageCard"
import { RunTimelineBody } from "@/components/run-detail/RunTimelineBody"
import { RunTraceCard } from "@/components/run-detail/RunTraceCard"
import { SpecSnapshotCard } from "@/components/run-detail/SpecSnapshotCard"
import type { useRunDetail } from "./useRunDetail"

export function RunDetailPage(p: ReturnType<typeof useRunDetail>) {
  const showNotFound = p.loadState === "not_found"
  const showEmpty = !p.runIdParam && p.loadState !== "loading"
  const showLoading = p.loadState === "loading" && !p.runDetail
  const showDetail = Boolean(p.runDetail) && p.loadState === "ready"

  return (
    <SiteShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <RdTopBar />
      </header>

      <main className="w-full min-w-0 px-3 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="run-detail">
        <section className="mt-4 rounded-2xl bg-gradient-to-br from-background via-secondary to-card px-5 py-3.5 shadow-md">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              每一次运行，<span className="text-primary">都留有完整档案</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              任务指令、所用方案与模型、逐步时间线、最终成果或失败原因、配置快照一页看全；运行未结束时实时刷新。
            </p>
          </div>
        </section>

        {!p.isLoggedIn ? (
          <RdLoginGate onLoginClick={p.onLoginClick} />
        ) : (
          <>
            {p.errorMsg && (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 p-4">
                <span className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {p.errorMsg}
                </span>
                <button
                  type="button"
                  aria-label="关闭提示"
                  onClick={p.dismissError}
                  className="shrink-0 rounded-md p-1 text-destructive transition hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {showLoading && (
              <section className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                正在加载运行档案…
              </section>
            )}

            {showNotFound && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-10">
                <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-md">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <ScrollText className="h-7 w-7" />
                  </span>
                  <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">
                    运行不存在或无权查看
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    这条运行记录可能已被删除，或者属于其他账号。运行档案按账号隔离，只有本人可以查看。
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={p.handleBackToRecent}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      看看最近的运行
                    </button>
                    <Link
                      to="/agent-run"
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium text-card-foreground transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Compass className="h-4 w-4" />
                      去试跑页
                    </Link>
                  </div>
                </div>
                <div className="mx-auto mt-6 max-w-2xl">
                  <RecentRunsList
                    items={p.recentRuns}
                    activeRunId=""
                    stateMeta={p.runStateMeta}
                    onSelect={p.handleSelectRecent}
                  />
                </div>
              </section>
            )}

            {showEmpty && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-10">
                <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-md">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Compass className="h-7 w-7" />
                  </span>
                  <h2 className="mt-5 text-2xl font-bold tracking-tight text-card-foreground">
                    还没有选中某次运行
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    去试跑页发起一次运行，或从下方最近的运行里挑一条，即可查看它的完整档案。
                  </p>
                  <div className="mt-6">
                    <Link
                      to="/agent-run"
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Compass className="h-4 w-4" />
                      去试跑页发起运行
                    </Link>
                  </div>
                </div>
                <div className="mx-auto mt-6 max-w-2xl">
                  <RecentRunsList
                    items={p.recentRuns}
                    activeRunId=""
                    stateMeta={p.runStateMeta}
                    onSelect={p.handleSelectRecent}
                  />
                </div>
              </section>
            )}

            {showDetail && p.runDetail && (
              <section className="grid items-start gap-6 py-10 lg:grid-cols-[3fr_2fr]">
                <div className="flex flex-col gap-5">
                  <RunTimelineBody
                    stepGroups={p.stepGroups}
                    hasRun
                    isLive={p.isLive}
                    liveEnabled={p.liveEnabled}
                    onToggleLive={p.handleToggleLive}
                  />
                  <RunTraceCard runId={p.runDetail.id} kind="agent" />
                  <RunResultCard
                    run={p.runDetail}
                    isLive={p.isLive}
                    onCopy={p.handleCopyResult}
                    copiedFlag={p.copiedFlag}
                  />
                </div>
                <div className="flex flex-col gap-5">
                  <RunOverviewCard
                    run={p.runDetail}
                    modelLabel={p.modelLabel}
                    isAcceptanceTest={p.isAcceptanceTest}
                    isCustomModel={p.isCustomModel}
                    harnessLine={p.harnessLine}
                    stateMeta={p.runStateMeta}
                  />
                  <RunEvalFeedbackCard run={p.runDetail} />
                  <FailureTriageCard status={p.runDetail.status} checkpoint={p.runDetail.checkpoint} />
                  <SpecSnapshotCard snapshot={p.specSnapshot} run={p.runDetail} />
                  <RdActionBar
                    run={p.runDetail}
                    isLive={p.isLive}
                    controlBusy={p.controlBusy}
                    onControl={p.handleControl}
                    onExport={p.handleExportReport}
                  />
                  <button
                    type="button"
                    onClick={p.handleBackToRecent}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回，换一条运行看看
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio</p>
        <p className="mt-1 text-xs text-muted-foreground">跑过的每一步都算数，随时回来复盘。</p>
      </footer>
    </SiteShell>
  )
}
