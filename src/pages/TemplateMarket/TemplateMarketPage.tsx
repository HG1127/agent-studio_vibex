import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react"
import type { useTemplateMarket } from "./useTemplateMarket"
import { SiteShell } from "@/components/site/SiteShell"
import { TmTopBar } from "@/components/template-market/TmTopBar"
import { TmLoginGate } from "@/components/template-market/TmLoginGate"
import { TmSearchBar } from "@/components/template-market/TmSearchBar"
import { TemplateCard } from "@/components/template-market/TemplateCard"
import { UseConfirmDialog } from "@/components/template-market/UseConfirmDialog"
import { PublishTemplateDialog } from "@/components/template-market/PublishTemplateDialog"
import { MyPublishesList } from "@/components/template-market/MyPublishesList"
import { TmEmpty } from "@/components/template-market/TmEmpty"

export function TemplateMarketPage(p: ReturnType<typeof useTemplateMarket>) {
  const hasFilters = Boolean(p.searchText.trim()) || p.activeCategory !== "all"
  return (
    <SiteShell>
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-background via-secondary to-card" />
      <div className="pointer-events-none fixed -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 left-0 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <TmTopBar />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20">
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">模板市场</h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              挑现成模板一键复制成自己的助手直接试跑；也可以把你调好的方案发布出来。官方内置 + 社区发布，模板持续生长。
            </p>
          </div>
        </section>

        {p.needsRhLogin && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="text-sm text-card-foreground">
              登录态已过期，请重新登录后再继续
            </span>
            <button
              type="button"
              onClick={p.handleLogin}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              重新登录
            </button>
          </div>
        )}

        {!p.isLoggedIn ? (
          <TmLoginGate onLoginClick={p.handleLogin} />
        ) : (
          <>
            {p.errorMsg && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 p-4">
                <span className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {p.errorMsg}
                </span>
                <button
                  type="button"
                  onClick={p.handleDismissError}
                  aria-label="关闭提示"
                  className="shrink-0 rounded-full p-1 text-destructive transition hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {p.noticeMsg && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-primary/10 p-4">
                <span className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {p.noticeMsg}
                </span>
                <button
                  type="button"
                  onClick={p.handleDismissNotice}
                  aria-label="关闭提示"
                  className="shrink-0 rounded-full p-1 text-primary transition hover:bg-primary/15"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <section className="mb-8 flex items-center justify-center">
              <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-md">
                <button
                  type="button"
                  onClick={() => p.setActiveTab("market")}
                  className={`rounded-full px-6 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                    p.activeTab === "market"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  逛市场
                </button>
                <button
                  type="button"
                  onClick={() => p.setActiveTab("mine")}
                  className={`rounded-full px-6 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                    p.activeTab === "mine"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  我的发布{p.myList.length > 0 ? `（${p.myList.length}）` : ""}
                </button>
              </div>
            </section>

            {p.activeTab === "market" && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                <TmSearchBar
                  searchText={p.searchText}
                  onSearchChange={p.setSearchText}
                  activeCategory={p.activeCategory}
                  onCategoryChange={p.setActiveCategory}
                  onPublishClick={p.handleOpenPublish}
                  resultCount={p.filteredMarket.length}
                />
                {p.isLoadingMarket ? (
                  <div className="flex items-center justify-center gap-2 rounded-3xl border border-border bg-card p-12 text-sm text-muted-foreground shadow-md">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    正在加载模板…
                  </div>
                ) : p.filteredMarket.length === 0 ? (
                  <TmEmpty
                    hasFilters={hasFilters}
                    onResetFilters={() => {
                      p.setSearchText("")
                      p.setActiveCategory("all")
                    }}
                    onPublishClick={p.handleOpenPublish}
                  />
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {p.filteredMarket.map((row) => (
                      <TemplateCard
                        key={row.id}
                        row={row}
                        isExpanded={p.expandedId === row.id}
                        onToggleExpand={p.handleToggleExpand}
                        onUse={p.handleRequestUse}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {p.activeTab === "mine" && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <MyPublishesList
                  myList={p.myList}
                  isLoadingMine={p.isLoadingMine}
                  busyMineId={p.busyMineId}
                  onUnpublish={p.handleUnpublish}
                  onRepublish={p.handleRepublish}
                  onDelete={p.handleDeleteMine}
                />
              </section>
            )}
          </>
        )}

        <footer className="mt-16 border-t border-border pt-8 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            模板内容是助手方案的纯配置（目标 / 任务 / 工具 / 完成条件），发布即视为同意公开该配置；作者仅以账号尾号展示。
          </p>
        </footer>
      </main>

      <UseConfirmDialog
        useTarget={p.useTarget}
        isUseBusy={p.isUseBusy}
        onConfirm={p.handleConfirmUse}
        onCancel={p.handleCancelUse}
      />
      <PublishTemplateDialog
        open={p.publishOpen}
        specList={p.specList}
        isLoadingSpecs={p.isLoadingSpecs}
        publishSpecId={p.publishSpecId}
        publishName={p.publishName}
        publishDescription={p.publishDescription}
        publishCategory={p.publishCategory}
        publishError={p.publishError}
        isPublishing={p.isPublishing}
        onSelectSpec={p.handleSelectPublishSpec}
        onNameChange={p.setPublishName}
        onDescriptionChange={p.setPublishDescription}
        onCategoryChange={p.setPublishCategory}
        onSubmit={p.handleSubmitPublish}
        onClose={p.handleClosePublish}
      />
    </div>
    </SiteShell>
  )
}
