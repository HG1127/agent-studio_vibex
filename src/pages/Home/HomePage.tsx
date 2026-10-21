import { useEffect, useState } from "react"
import { AgentDraftDrawer } from "@/components/site/AgentDraftDrawer"
import { AlertCircle, LogIn, PencilLine, Store, X } from "lucide-react"
import { Link } from "react-router-dom"
import { CreateComposer } from "@/components/home/CreateComposer"
import { AgentDraftRecoveryNotice } from "@/components/home/AgentDraftRecoveryNotice"
import { AgentCatalog } from "@/components/home/AgentCatalog"
import { SpecEditorCard } from "@/components/home/SpecEditorCard"
import { TemplateGallery } from "@/components/home/TemplateGallery"
import { WorkspaceOverview } from "@/components/home/WorkspaceOverview"
import { TopNavBar } from "@/components/home/TopNavBar"
import { SiteShell } from "@/components/site/SiteShell"
import type { useHome } from "./useHome"

export function HomePage(p: ReturnType<typeof useHome>) {
  const [localEditorOpen,setLocalEditorOpen]=useState(false)
  useEffect(()=>{
    const show=()=>setLocalEditorOpen(true)
    window.addEventListener("studio:open-current-agent-editor",show)
    return()=>window.removeEventListener("studio:open-current-agent-editor",show)
  },[])

  return (
    <SiteShell>
      <AgentDraftDrawer open={localEditorOpen} onClose={()=>setLocalEditorOpen(false)}
        title="随时调整当前 Agent 方案"
        description="此处直接编辑当前工作台草稿。修改与原页面实时同步，保存后可以试跑；未保存的草稿不会被静默覆盖。">
        {p.spec ? <SpecEditorCard
          spec={p.spec} specName={p.specName} sourceMode={p.sourceMode}
          onSpecNameChange={p.setSpecName} onTextChange={p.updateSpecText}
          onTogglePlanReview={p.togglePlanReview}
          onListItemChange={p.updateSpecListItem} onListItemAdd={p.addSpecListItem}
          onListItemRemove={p.removeSpecListItem} toolStatusOf={p.toolStatusOf}
          builtinTools={p.builtinToolOptions} connectedTools={p.connectedTools}
          connectedMarketTools={p.connectedMarketTools}
          toolAnalysis={p.toolAnalysis} toolMatchNotice={p.toolMatchNotice}
          onRematchTools={p.rematchAgentTools} knowledgeBases={p.knowledgeBases}
          onToggleKnowledgeBase={p.toggleKnowledgeBase} onToggleTool={p.handleToggleSpecTool}
          reviseInput={p.reviseInput} onReviseInputChange={p.setReviseInput}
          onRevise={p.handleRevise} isRevising={p.isRevising}
          onSave={p.handleSave} isSaving={p.isSaving} dirty={p.specDirty}
          saveConflict={p.saveConflict} onSaveAsCopy={p.handleSaveAsCopy}
          savedMsg={p.savedMsg} savedSpecId={p.savedSpecId}
          onClear={p.handleClearSpec} showClear={false}
        /> : <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          还没有待修改的 Agent。请先在工作台输入需求，或从「我的 Agent」打开已保存的方案。
        </p>}
      </AgentDraftDrawer>

      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <TopNavBar onGoMySpecs={() =>
          document.getElementById("my-specs")?.scrollIntoView({ behavior: "smooth" })}/>
      </header>

      <main data-studio-fluid-page="workbench"
        className="w-full min-w-0 px-3 pb-12 pt-1 sm:px-5 lg:px-7 2xl:px-10">
        <WorkspaceOverview agentCount={p.savedTotal}/>
        <AgentDraftRecoveryNotice draft={p.pendingDraft}
          persistError={p.draftPersistError}
          restoreNotice={p.draftRestoreNotice}
          onRestore={p.restoreDraft} onDiscard={p.discardDraft}/>

        {p.needsRhLogin && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <span className="text-sm text-foreground">创建和保存 Agent 需要先登录员工账号。</span>
            <button type="button" onClick={p.onLoginClick}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground">
              <LogIn className="h-4 w-4"/>登录
            </button>
          </div>
        )}
        {p.errorMsg && (
          <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
            <span className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0"/>{p.errorMsg}
            </span>
            <button type="button" aria-label="关闭提示" onClick={p.dismissError}
              className="shrink-0 rounded-lg p-2 text-destructive hover:bg-destructive/10">
              <X className="h-4 w-4"/>
            </button>
          </div>
        )}

        <section id="my-specs" className="scroll-mt-24 pt-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">我的 Agent</h2>
              <p className="mt-1 text-xs text-muted-foreground">按名称、目标、方案内容搜索，筛选收藏与来源；可以直接编辑或试跑。</p>
            </div>
            <Link to="/agent-create"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary/5">
              创建新 Agent
            </Link>
          </div>
          <AgentCatalog
            savedList={p.savedList}
            isLoggedIn={p.isLoggedIn}
            onOpenSaved={p.handleOpenSaved}
            onDeleteSaved={p.handleDeleteSaved}
          />
        </section>

        {p.spec && <section id="spec-editor" className="scroll-mt-24 py-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <PencilLine className="h-5 w-5 text-primary"/>编辑当前 Agent 方案
          </h2>
          <SpecEditorCard
            spec={p.spec}
            specName={p.specName}
            sourceMode={p.sourceMode}
            onSpecNameChange={p.setSpecName}
            onTextChange={p.updateSpecText}
            onTogglePlanReview={p.togglePlanReview}
            onListItemChange={p.updateSpecListItem}
            onListItemAdd={p.addSpecListItem}
            onListItemRemove={p.removeSpecListItem}
            toolStatusOf={p.toolStatusOf}
            builtinTools={p.builtinToolOptions}
            connectedTools={p.connectedTools}
            connectedMarketTools={p.connectedMarketTools}
            toolAnalysis={p.toolAnalysis}
            toolMatchNotice={p.toolMatchNotice}
            onRematchTools={p.rematchAgentTools}
            knowledgeBases={p.knowledgeBases}
          knowledgeBasesError={p.knowledgeBasesError}
          knowledgeBasesLoading={p.knowledgeBasesLoading}
          onRefreshKnowledgeBases={p.refreshKnowledgeBases}
            onToggleKnowledgeBase={p.toggleKnowledgeBase}
            onToggleTool={p.handleToggleSpecTool}
            reviseInput={p.reviseInput}
            onReviseInputChange={p.setReviseInput}
            onRevise={p.handleRevise}
            isRevising={p.isRevising}
            onSave={p.handleSave}
            dirty={p.specDirty}
            saveConflict={p.saveConflict}
            onSaveAsCopy={p.handleSaveAsCopy}
            isSaving={p.isSaving}
            savedMsg={p.savedMsg}
            savedSpecId={p.savedSpecId}
            onClear={p.handleClearSpec}
          />
        </section>}

        <section className="mt-6 grid items-start gap-4 2xl:grid-cols-2">
          <details id="hero" className="group min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-primary">
              <span>快速生成方案 <span className="ml-2 text-xs font-normal text-muted-foreground">可选 · 不经过五步引导</span></span>
              <PencilLine className="h-4 w-4 text-muted-foreground"/>
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              适合有经验的员工；也可以使用<Link to="/agent-create" className="ml-1 font-medium text-primary hover:underline">五步创建向导</Link>。
            </p>
            <div className="mt-4">
              <CreateComposer userInput={p.userInput}
                onUserInputChange={p.setUserInput}
                onCreate={p.handleCreate}
                isGenerating={p.isGenerating}/>
            </div>
          </details>
          <details id="templates" className="group min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-primary">
              <span>从模板开始 <span className="ml-2 text-xs font-normal text-muted-foreground">按需展开</span></span>
              <Store className="h-4 w-4 text-muted-foreground"/>
            </summary>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">加载后可以继续编辑，不会直接发布。</p>
              <Link to="/template-market"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary/40">
                浏览模板市场
              </Link>
            </div>
            <div className="mt-4">
              <TemplateGallery templates={p.templates} onLoadTemplate={p.handleLoadTemplate}/>
            </div>
          </details>
        </section>
      </main>
    </SiteShell>
  )
}
