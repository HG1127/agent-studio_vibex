import { AlertCircle, CheckCircle2, GitBranch, X } from "lucide-react"
import { AcceptanceTestCard } from "@/components/version-release/AcceptanceTestCard"
import { PublishCard } from "@/components/version-release/PublishCard"
import { PublishRecordsTable } from "@/components/version-release/PublishRecordsTable"
import { SaveVersionCard } from "@/components/version-release/SaveVersionCard"
import { SpecSelector } from "@/components/version-release/SpecSelector"
import { VersionHistoryList } from "@/components/version-release/VersionHistoryList"
import { VrDiffPanel } from "@/components/version-release/VrDiffPanel"
import { VrConfirmDialog } from "@/components/version-release/VrConfirmDialog"
import { VrLoginGate } from "@/components/version-release/VrLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { VrTopBar } from "@/components/version-release/VrTopBar"
import type { useVersionRelease } from "./useVersionRelease"

export function VersionReleasePage(p: ReturnType<typeof useVersionRelease>) {
  const hasSpec = Boolean(p.selectedSpec)

  return (
    <SiteShell>
    <div className="relative min-h-screen bg-background text-foreground">

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md">
        <VrTopBar />
      </header>

      <main className="relative z-10 w-full min-w-0 px-3 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="release">
        <section className="mt-4 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              测试通过后存版本，<span className="text-primary">放心发布每一次改动</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              「验收测试 → 存版本 → 发布」流水线：真实跑一遍测试指令，配置快照存成版本，随时查看、恢复或发布。
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                版本快照可回退 · 发布状态自动流转
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                未测试版本会被明确标记
              </span>
            </div>
        </section>

        {!p.isLoggedIn && <VrLoginGate onLoginClick={p.onLoginClick} />}

        {p.isLoggedIn && p.needsRhLogin && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <GitBranch className="h-4 w-4 text-primary" />
              登录态已过期，请重新登录后再管理版本。
            </span>
            <button
              type="button"
              onClick={p.onLoginClick}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              重新登录
            </button>
          </div>
        )}

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

        {p.noticeMsg && (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {p.noticeMsg}
            </span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={p.dismissNotice}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-card-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {p.isLoggedIn && (
          <>
            <section className="mt-6">
              <SpecSelector
                specList={p.specList}
                isLoadingSpecs={p.isLoadingSpecs}
                selectedSpecId={p.selectedSpecId}
                onSelect={p.handleSelectSpec}
                publishedVersion={p.publishedVersion}
                formatVersionTime={p.formatVersionTime}
              />
            </section>

            <section className="py-10">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-card-foreground">发布流水线</h2>
                <span className="text-xs text-muted-foreground">测试 → 存版本 → 发布，三步走完</span>
              </div>
              <div className="grid items-stretch gap-4 lg:grid-cols-3">
                <AcceptanceTestCard
                  hasSpec={hasSpec}
                  specId={p.selectedSpecId}
                  testInstruction={p.testInstruction}
                  onInstructionChange={p.setTestInstruction}
                  testModel={p.testModel}
                  onModelChange={p.setTestModel}
                  customModels={p.customModels}
                  isCustomTestModel={p.isCustomTestModel}
                  isStartingTest={p.isStartingTest}
                  isTestLive={p.isTestLive}
                  testRun={p.testRun}
                  testPassed={p.testPassed}
                  isTestCurrentVersion={p.isTestCurrentVersion}
                  testMaxSteps={p.testMaxSteps}
                  onRunTest={p.handleRunTest}
                />
                <SaveVersionCard
                  hasSpec={hasSpec}
                  nextVersionNo={p.nextVersionNo}
                  versionNote={p.versionNote}
                  onNoteChange={p.setVersionNote}
                  isSavingVersion={p.isSavingVersion}
                  onSave={p.handleSaveVersion}
                  testPassed={p.testPassed}
                  testRunStatus={p.testRun?.status || ""}
                />
                <PublishCard
                  hasSpec={hasSpec}
                  publishedVersion={p.publishedVersion}
                  versionList={p.versionList}
                  onRequestPublish={p.requestPublish}
                  formatVersionTime={p.formatVersionTime}
                />
              </div>
            </section>

            <section className="pb-10">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
                  版本历史
                  <span className="ml-2 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    {p.versionList.length}
                  </span>
                </h2>
                <span className="text-xs text-muted-foreground">
                  {hasSpec ? p.selectedSpec?.name || "" : "未选择助手"}
                </span>
              </div>
              <VersionHistoryList
                versionList={p.versionList}
                isLoadingVersions={p.isLoadingVersions}
                expandedVersionId={p.expandedVersionId}
                onToggleExpand={p.toggleVersionExpand}
                versionStatusMeta={p.versionStatusMeta}
                formatVersionTime={p.formatVersionTime}
                onRequestRestore={p.requestRestore}
                onRequestPublish={p.requestPublish}
                onRequestDelete={p.requestDelete}
              />
            </section>

            <section className="pb-8">
              <VrDiffPanel versions={p.versionList} versionStatusMeta={p.versionStatusMeta} />
            </section>

            <section className="pb-16">
              <PublishRecordsTable
                publishRecords={p.publishRecords}
                specDisplayName={p.selectedSpec?.name || ""}
                versionStatusMeta={p.versionStatusMeta}
                formatVersionTime={p.formatVersionTime}
              />
            </section>
          </>
        )}
      </main>

      <footer className="relative z-10 mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio · 版本与发布</p>
        <p className="mt-1 text-xs text-muted-foreground">
          每次发布都有据可查，随时回退到任意历史版本。
        </p>
      </footer>

      <VrConfirmDialog
        confirmAction={p.confirmAction}
        isConfirmBusy={p.isConfirmBusy}
        onConfirm={p.handleConfirm}
        onCancel={p.cancelConfirm}
      />
    </div>
    </SiteShell>
  )
}
