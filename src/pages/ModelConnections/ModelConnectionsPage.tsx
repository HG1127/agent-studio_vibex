import { AlertCircle, CheckCircle2, PlugZap, Plus, ShieldCheck, X } from "lucide-react"
import { Link } from "react-router-dom"
import { ConnectionCard } from "@/components/model-connections/ConnectionCard"
import { ConnectionFormCard } from "@/components/model-connections/ConnectionFormCard"
import { ConnectionsEmpty } from "@/components/model-connections/ConnectionsEmpty"
import { McLoginGate } from "@/components/model-connections/McLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { ReturnToAgentResources } from "@/components/site/ReturnToAgentResources"
import { McTopBar } from "@/components/model-connections/McTopBar"
import type { useModelConnections } from "./useModelConnections"

const HOW_IT_WORKS = [
  {
    title: "填地址和密钥",
    desc: "选接口类型（OpenAI 兼容 / Anthropic / Gemini），填 Base URL 与 API Key，密钥只保存在服务端。",
  },
  {
    title: "当场测连通",
    desc: "保存前先测试：验证地址可达、密钥有效，测出延迟并拉回可用模型清单。",
  },
  {
    title: "试跑时选用",
    desc: "已启用连接里的模型会出现在试跑页的「自定义」分组，选中即可驱动助手。",
  },
]

export function ModelConnectionsPage(p: ReturnType<typeof useModelConnections>) {
  const editingRow = p.connectionList.find((row) => row.id === p.editingId) || null

  return (
    <SiteShell>
    <div className="relative min-h-screen bg-background text-foreground">

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md">
        <McTopBar />
      </header>

      <main className="relative z-10 w-full min-w-0 px-3 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="models">
        <section className="mt-4 rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              接入你自己的模型服务，<span className="text-primary">让助手用你的密钥跑</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              支持 OpenAI 兼容、Anthropic、Gemini 三种接口：填好 Base URL 与 API Key 当场测连通、拉模型清单；启用后出现在试跑页模型选择器。
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={p.openAddForm}
                disabled={!p.isLoggedIn || p.formOpen}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                添加连接
              </button>
              <span className="text-xs text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary"/>
                凭据加密存储于服务端 · 模型费用由服务商结算
              </span>            </div>
        </section>

        <ReturnToAgentResources what="模型连接"/>
        {!p.isLoggedIn && <McLoginGate onLoginClick={p.onLoginClick} />}

        {p.isLoggedIn && p.needsRhLogin && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <PlugZap className="h-4 w-4 text-primary" />
              登录态已过期，请重新登录后再管理连接。
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
          <section className="py-5">
            <div
              className={`grid min-w-0 items-start gap-5 ${p.formOpen ? "xl:grid-cols-[minmax(310px,390px)_minmax(0,1fr)]" : "grid-cols-1"}`}
            >
              {p.formOpen && (
                <div className="lg:sticky lg:top-20">
                  <ConnectionFormCard
                    formMode={p.formMode}
                    formName={p.formName}
                    formProvider={p.formProvider}
                    formBaseUrl={p.formBaseUrl}
                    formApiKey={p.formApiKey}
                    formManualModels={p.formManualModels}
                    editingTail={editingRow?.api_key_tail || ""}
                    onFormNameChange={p.setFormName}
                    onFormProviderChange={p.setFormProvider}
                    onFormBaseUrlChange={p.setFormBaseUrl}
                    onFormApiKeyChange={p.setFormApiKey}
                    onFormManualModelsChange={p.setFormManualModels}
                    onTest={p.handleTestForm}
                    isTestingForm={p.isTestingForm}
                    formTestResult={p.formTestResult}
                    onSave={p.handleSave}
                    isSaving={p.isSaving}
                    canSubmitForm={p.canSubmitForm}
                    onClose={p.closeForm}
                  />
                </div>
              )}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
                    我的连接
                    <span className="ml-2 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {p.connectionList.length}
                    </span>
                  </h2>
                  {!p.formOpen && (
                    <button
                      type="button"
                      onClick={p.openAddForm}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      添加连接
                    </button>
                  )}
                </div>
                {p.connectionList.length === 0 ? (
                  <ConnectionsEmpty isLoadingList={p.isLoadingList} onAdd={p.openAddForm} />
                ) : (
                  p.connectionList.map((row) => (
                    <ConnectionCard
                      key={row.id}
                      row={row}
                      statusMeta={p.statusMeta}
                      isBusy={p.busyId === row.id}
                      isExpanded={p.expandedId === row.id}
                      isPendingDelete={p.pendingDeleteId === row.id}
                      onRetest={p.handleRetest}
                      onToggleEnabled={p.handleToggleEnabled}
                      onEdit={p.startEdit}
                      onRequestDelete={p.requestDelete}
                      onCancelDelete={p.cancelDelete}
                      onConfirmDelete={p.confirmDelete}
                      onToggleExpand={p.toggleExpand}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <details className="mb-8 rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
            需要帮助？查看模型接入指引
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item, itemIndex) => (
              <div key={item.title} className="rounded-xl bg-secondary/35 p-4">
                <span className="text-xs font-semibold text-primary">步骤 {itemIndex+1}</span>
                <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <Link to="/agent-run" className="mt-4 inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline">
            前往 Agent 试跑 →
          </Link>
        </details>      </main>

      <footer className="relative z-10 mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio · 模型连接</p>
        <p className="mt-1 text-xs text-muted-foreground">
          自定义模型走你自己的服务与密钥，不产生额外平台费用。
        </p>
      </footer>
    </div>
    </SiteShell>
  )
}
