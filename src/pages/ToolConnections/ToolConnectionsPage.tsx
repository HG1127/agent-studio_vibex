import { AlertCircle, CheckCircle2, Info, Plus, ShieldCheck, Wrench, X } from "lucide-react"
import { Link } from "react-router-dom"
import { TcLoginGate } from "@/components/tool-connections/TcLoginGate"
import { SiteShell } from "@/components/site/SiteShell"
import { TcTopBar } from "@/components/tool-connections/TcTopBar"
import { ToolCard } from "@/components/tool-connections/ToolCard"
import { ToolFormCard } from "@/components/tool-connections/ToolFormCard"
import { ToolsEmpty } from "@/components/tool-connections/ToolsEmpty"
import type { useToolConnections } from "./useToolConnections"

const HOW_IT_WORKS = [
  {
    title: "填地址和参数",
    desc: "给工具起个名字、写清用途，填请求 URL、方法与请求头；POST 还能配请求体模板，用占位符接收助手的调用参数。",
  },
  {
    title: "当场真实测一次",
    desc: "保存前输入一段测试参数，由服务端代理真实调用你的接口，看状态码、延迟和响应摘要，确认能通再落库。",
  },
  {
    title: "勾进方案给助手用",
    desc: "已启用的工具出现在首页方案编辑器的工具清单里，勾选后助手试跑命中工具名时由后端代理真实调用。",
  },
]

export function ToolConnectionsPage(p: ReturnType<typeof useToolConnections>) {
  const editingRow = p.toolList.find((row) => row.id === p.editingId) || null

  return (
    <SiteShell>
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-secondary blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md">
        <TcTopBar />
      </header>

      <main className="relative z-10 w-full min-w-0 px-3 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="tools">
        <section className="mt-4 rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              把你的接口接进助手，<span className="text-primary">试跑时真实调用</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              任何 HTTP 接口都能接进来：填好地址与请求头当场测一次真实返回；已启用的工具会出现在方案编辑器里供勾选。
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
                添加工具
              </button>
              <span className="text-xs text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary"/>
                凭据仅服务端保存 · 写入型工具试调需要确认
              </span>            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 text-primary" />
              计算、总结、知识库检索为内置工具，所有助手始终可用，无需接入。
            </p>
        </section>

        {!p.isLoggedIn && <TcLoginGate onLoginClick={p.onLoginClick} />}

        {p.isLoggedIn && p.needsRhLogin && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="flex items-center gap-2 text-sm text-card-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              登录态已过期，请重新登录后再管理工具连接。
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
                  <ToolFormCard
                    formMode={p.formMode}
                    formName={p.formName}
                    formDesc={p.formDesc}
                    formUrl={p.formUrl}
                    formMethod={p.formMethod}
                    formHeaders={p.formHeaders}
                    formBody={p.formBody}
                    formTimeout={p.formTimeout}
                    testInput={p.testInput}
                    confirmFormWrite={p.confirmFormWrite}
                    onConfirmFormWriteChange={p.setConfirmFormWrite}
                    editingHeaders={editingRow?.headers || []}
                    onFormNameChange={p.setFormName}
                    onFormDescChange={p.setFormDesc}
                    onFormUrlChange={value => {p.setFormUrl(value);p.setConfirmFormWrite(false)}}
                    onFormMethodChange={method => { p.setFormMethod(method); p.setConfirmFormWrite(false) }}
                    onFormBodyChange={value => {p.setFormBody(value);p.setConfirmFormWrite(false)}}
                    onFormTimeoutChange={p.setFormTimeout}
                    onTestInputChange={value => {p.setTestInput(value);p.setConfirmFormWrite(false)}}
                    onAddHeader={p.addHeaderRow}
                    onUpdateHeader={(index, value) => {p.updateHeaderRow(index,value);p.setConfirmFormWrite(false)}}
                    onRemoveHeader={p.removeHeaderRow}
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
                    我的工具
                    <span className="ml-2 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {p.toolList.length}
                    </span>
                  </h2>
                  {!p.formOpen && (
                    <button
                      type="button"
                      onClick={p.openAddForm}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      添加工具
                    </button>
                  )}
                </div>
                {p.toolList.length === 0 ? (
                  <ToolsEmpty isLoadingList={p.isLoadingList} onAdd={p.openAddForm} />
                ) : (
                  p.toolList.map((row) => (
                    <ToolCard
                      key={row.id}
                      row={row}
                      statusMeta={p.statusMeta}
                      isBusy={p.busyId === row.id}
                      isExpanded={p.expandedId === row.id}
                      isPendingDelete={p.pendingDeleteId === row.id}
                      cardTestInput={p.expandedId === row.id ? p.cardTestInput : ""}
                      confirmCardWrite={p.expandedId === row.id && p.confirmCardWrite}
                      onConfirmCardWriteChange={p.setConfirmCardWrite}
                      cardTestResult={p.expandedId === row.id ? p.cardTestResult : null}
                      isTestingCard={p.isTestingCard && p.expandedId === row.id}
                      onCardTestInputChange={value => {p.setCardTestInput(value);p.setConfirmCardWrite(false)}}
                      onCardTest={p.handleCardTest}
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
            需要帮助？查看工具接入指引
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
          <Link to="/agent-create" className="mt-4 inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline">
            在 Agent 方案中使用工具 →
          </Link>
        </details>      </main>

      <footer className="relative z-10 mt-4 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio · 工具连接</p>
        <p className="mt-1 text-xs text-muted-foreground">
          外部工具调用由服务端代理发起，密钥永不回显明文，停用后助手立即不再命中。
        </p>
      </footer>
    </div>
    </SiteShell>
  )
}
