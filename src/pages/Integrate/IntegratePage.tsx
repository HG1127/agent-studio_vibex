import { AlertCircle, Info, X } from "lucide-react"
import { AgentPickerCard } from "@/components/integrate/AgentPickerCard"
import { ApiKeysCard } from "@/components/integrate/ApiKeysCard"
import { EmbedConfigCard } from "@/components/integrate/EmbedConfigCard"
import { EmbedPreviewPanel } from "@/components/integrate/EmbedPreviewPanel"
import { EndpointDocsCard } from "@/components/integrate/EndpointDocsCard"
import { InvocationLogList } from "@/components/integrate/InvocationLogList"
import { InvocationStatsRow } from "@/components/integrate/InvocationStatsRow"
import { ItLoginGate } from "@/components/integrate/ItLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { ItTopBar } from "@/components/integrate/ItTopBar"
import { TestRunPanel } from "@/components/integrate/TestRunPanel"
import { formatLatency } from "@/pages/Integrate/useIntegrate"
import type { useIntegrate } from "./useIntegrate"

export function IntegratePage(p: ReturnType<typeof useIntegrate>) {
  return (
    <SiteShell>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <ItTopBar />
      </header>

      <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 px-4 pb-4 pt-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
            已发布 Agent 的集成与调用
          </h1>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            为已发布版本生成网页嵌入配置、API 密钥并进行在线试调；连接状态、调用结果和历史记录集中在当前工作空间。
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

      <main className="w-full min-w-0 px-3 pb-12 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="integrate">
        {p.isLoggedIn ? (
          <div className="flex flex-col gap-5">
            <InvocationStatsRow statsRow={p.statsRow} />
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[2fr_3fr]">
              <div className="flex flex-col gap-5">
                <AgentPickerCard
                  agentList={p.agentList}
                  selectedAgentId={p.selectedAgentId}
                  isLoadingAgents={p.isLoadingAgents}
                  onSelectAgent={p.selectAgent}
                />
                <EmbedConfigCard
                  hasAgent={Boolean(p.selectedAgentId)}
                  embedToken={p.embedToken}
                  embedExists={p.embedExists}
                  embedEnabled={p.embedEnabled}
                  embedTitle={p.embedTitle}
                  setEmbedTitle={p.setEmbedTitle}
                  embedPosition={p.embedPosition}
                  setEmbedPosition={p.setEmbedPosition}
                  embedAccent={p.embedAccent}
                  setEmbedAccent={p.setEmbedAccent}
                  isSavingEmbed={p.isSavingEmbed}
                  isLoadingEmbed={p.isLoadingEmbed}
                  onSaveEmbed={p.saveEmbedConfig}
                  onToggleEmbed={p.toggleEmbedEnabled}
                  embedSnippet={p.embedSnippet}
                  copiedField={p.copiedField}
                  onCopy={p.copyText}
                  accentPresets={p.accentPresets}
                  positionOptions={p.positionOptions}
                />
                <ApiKeysCard
                  hasAgent={Boolean(p.selectedAgentId)}
                  keyList={p.keyList}
                  isLoadingKeys={p.isLoadingKeys}
                  keyName={p.keyName}
                  setKeyName={p.setKeyName}
                  isCreatingKey={p.isCreatingKey}
                  onCreateKey={p.createKey}
                  onReissueKey={p.reissueKey}
                  onRevokeKey={p.revokeKey}
                  revealedKey={p.revealedKey}
                  onCloseRevealed={p.closeRevealed}
                  copiedField={p.copiedField}
                  onCopy={p.copyText}
                />
              </div>
              <div className="flex flex-col gap-5">
                <EmbedPreviewPanel
                  embedPreviewUrl={p.embedPreviewUrl}
                  embedEnabled={p.embedEnabled}
                  embedExists={p.embedExists}
                />
                <TestRunPanel
                  keyList={p.keyList}
                  testKeyId={p.testKeyId}
                  setTestId={p.setTestKeyId}
                  testInput={p.testInput}
                  setTestInput={p.setTestInput}
                  isTesting={p.isTesting}
                  testRunId={p.testRunId}
                  testRunStatus={p.testRunStatus}
                  testEvents={p.testEvents}
                  testResult={p.testResult}
                  testError={p.testError}
                  testLatency={p.testLatency}
                  onRunTest={p.runTest}
                  onResetTest={p.resetTest}
                  testEventMeta={p.testEventMeta}
                  formatLatency={formatLatency}
                />
                <EndpointDocsCard
                  apiBaseForDocs={p.apiBaseForDocs}
                  hasKey={p.keyList.some((row) => row.enabled)}
                  copiedField={p.copiedField}
                  onCopy={p.copyText}
                />
                <InvocationLogList
                  invocationList={p.invocationList}
                  isLoadingInvocations={p.isLoadingInvocations}
                  sourceFilter={p.sourceFilter}
                  applySourceFilter={p.applySourceFilter}
                  expandedInvocationId={p.expandedInvocationId}
                  toggleInvocationRow={p.toggleInvocationRow}
                  invSourceMeta={p.invSourceMeta}
                  invStatusMeta={p.invStatusMeta}
                  onRefresh={p.refreshNow}
                />
              </div>
            </div>
          </div>
        ) : (
          <ItLoginGate onLoginClick={p.onLoginClick} />
        )}
      </main>

      <footer className="border-t border-border bg-background/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Agent Studio 发布与集成 · 网页嵌入 + API 钥匙，外部调用全部真实执行并留档
          </p>
          <p className="text-xs text-muted-foreground">
            凭证只展示一次请及时保存；同一凭证每分钟最多 6 次、每天最多 200 次调用，超限会被拒绝
          </p>
        </div>
      </footer>
    </div>
    </SiteShell>
  )
}
