import { AlertCircle, CheckCircle2, PlugZap, Plus, ShieldCheck, X, Zap } from "lucide-react"
import { Link } from "react-router-dom"
import { ConnectionCard } from "@/components/model-connections/ConnectionCard"
import { ConnectionFormCard } from "@/components/model-connections/ConnectionFormCard"
import { ConnectionsEmpty } from "@/components/model-connections/ConnectionsEmpty"
import { McLoginGate } from "@/components/model-connections/McLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
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

const NATIVE_HOW_IT_WORKS=[
  {title:'保存本人配置',desc:'保存只写入本人配置和加密密钥，不测试连接、不调用模型。'},
  {title:'明确测试后保存',desc:'开放草稿测试时，可查询官方服务商模型列表；会使用密钥，可能产生费用。测试不会保存或生成内容。'},
  {title:'明确选择后使用',desc:'模型 ID 由你配置；保存或测试均不会启动 Agent，也不会设为默认模型。'},
]
export function ModelConnectionsPage(p: ReturnType<typeof useModelConnections>) {
  const editingRow = p.connectionList.find((row) => row.id === p.editingId) || null

  return (
    <SiteShell>
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-secondary blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md">
        <McTopBar />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4">
        <section className="mt-4 rounded-2xl bg-gradient-to-br from-background via-secondary to-card px-5 py-3.5 shadow-md">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              接入你自己的模型服务，<span className="text-primary">让助手用你的密钥跑</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {p.nativeMode?'支持 OpenAI 兼容、Anthropic、Gemini。保存本人配置后，再明确选择是否测试已保存的服务商连接；不会自动选择默认模型。':'支持 OpenAI 兼容、Anthropic、Gemini 三种接口：填好 Base URL 与 API Key 当场测连通、拉模型清单；启用后出现在试跑页模型选择器。'}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={p.openAddForm}
                disabled={!p.isLoggedIn || p.formOpen || p.nativeMode&&p.writeBlocked&&!p.nativePending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 hover:shadow-xl hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                添加连接
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                密钥只存服务端 · 界面只显示 ••••尾4位
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <Zap className="h-3.5 w-3.5 text-primary" />
                使用你自己的密钥，费用由你的服务商计
              </span>
            </div>
        </section>

        {!p.isLoggedIn && !p.nativeUnavailable && <McLoginGate onLoginClick={p.onLoginClick} />}

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

        {p.isLoggedIn && !p.nativeUnavailable && (
          <section className="py-10">
            <div
              className={`grid items-start gap-6 ${p.formOpen ? "lg:grid-cols-[2fr_3fr]" : "grid-cols-1"}`}
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
                    nativeMode={p.nativeMode} canTest={p.formProbeEnabled} nativePending={p.nativePending}
                    saveActionLabel={p.saveActionLabel} probeNotice={p.probeNotice}
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
                      disabled={p.nativeMode&&p.writeBlocked&&!p.nativePending}
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
                      nativeMode={p.nativeMode} canMutate={!p.writeBlocked} canProbe={p.probeEnabled}
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

        <section className="pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {(p.nativeMode?NATIVE_HOW_IT_WORKS:HOW_IT_WORKS).map((item, itemIndex) => (
              <div
                key={item.title}
                className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-md"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {itemIndex + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-card-foreground">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            想现在就试试？
            <Link
              to="/agent-run"
              className="ml-1 font-medium text-primary underline-offset-4 transition hover:underline"
            >
              去助手配置与试跑页
            </Link>
            选择自定义模型运行。
          </p>
        </section>
      </main>

      <footer className="relative z-10 mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio · 模型连接</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.nativeMode?'保存配置不会访问服务商；主动测试或运行可能产生费用。':'自定义模型走你自己的服务与密钥，不产生额外平台费用。'}
        </p>
      </footer>
    </div>
    </SiteShell>
  )
}
