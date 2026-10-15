import { AlertCircle, Bot, LogIn, PencilLine, Save, Store, X } from "lucide-react"
import { Link } from "react-router-dom"
import { CreateComposer } from "@/components/home/CreateComposer"
import { SavedSpecsList } from "@/components/home/SavedSpecsList"
import { SpecEditorCard } from "@/components/home/SpecEditorCard"
import { TemplateGallery } from "@/components/home/TemplateGallery"
import { TopNavBar } from "@/components/home/TopNavBar"
import { SiteShell } from "@/components/site/SiteShell"
import type { useHome } from "./useHome"

const HOW_IT_WORKS = [
  { step: "1", title: "说出需求", desc: "一句自然语言描述你想要的助手，或从下方示例一键加载。", icon: Bot },
  { step: "2", title: "编辑方案", desc: "目标、交付物、工具、规划逐块可改，也可以一句话让方案跟着改。", icon: PencilLine },
  { step: "3", title: "保存备用", desc: "确认后保存进「我的助手」，之后为它配置工具并试跑。", icon: Save },
]

export function HomePage(p: ReturnType<typeof useHome>) {
  return (
    <SiteShell>
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <TopNavBar
          onGoMySpecs={() => document.getElementById("my-specs")?.scrollIntoView({ behavior: "smooth" })}
        />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4">
        <section
          id="hero"
          className="mt-4 rounded-2xl bg-gradient-to-br from-background via-secondary to-card px-5 py-4 shadow-md"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-lg font-semibold tracking-tight text-card-foreground">
              把需求说一句话，<span className="text-primary">助手方案当场生成</span>
            </h1>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              立刻得到结构化、可编辑的方案：目标、任务范围、交付物、所需工具、任务规划和完成标准，改到满意再保存。
            </p>
          </div>
          <div className="mt-4 grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
            <CreateComposer
              userInput={p.userInput}
              onUserInputChange={p.setUserInput}
              onCreate={p.handleCreate}
              isGenerating={p.isGenerating}
            />
            <aside className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">怎么运作</h2>
              <ol className="mt-4 flex flex-col gap-4">
                {HOW_IT_WORKS.map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {item.step}
                    </span>
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                        <item.icon className="h-4 w-4 text-primary" />
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        {p.needsRhLogin && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-card p-4 shadow-md">
            <span className="text-sm text-card-foreground">
              创建和保存助手需要先登录你的账号，方案与运行记录都归属你的账号。
            </span>
            <button
              type="button"
              onClick={p.onLoginClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" />
              立即登录
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

        <section id="spec-editor" className="scroll-mt-20 py-16">
          <div className="mb-6">
            <h2 className="text-3xl font-bold tracking-tight">助手方案</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              生成或加载示例后，方案会展开在这里，每个区块都可以直接编辑。
            </p>
          </div>
          {p.spec ? (
            <SpecEditorCard
              spec={p.spec}
              specName={p.specName}
              sourceMode={p.sourceMode}
              onSpecNameChange={p.setSpecName}
              onTextChange={p.updateSpecText}
              onListItemChange={p.updateSpecListItem}
              onListItemAdd={p.addSpecListItem}
              onListItemRemove={p.removeSpecListItem}
              toolStatusOf={p.toolStatusOf}
              builtinTools={p.builtinToolOptions}
              connectedTools={p.connectedTools}
              knowledgeBases={p.knowledgeBases}
              onToggleKnowledgeBase={p.toggleKnowledgeBase}
              onToggleTool={p.handleToggleSpecTool}
              reviseInput={p.reviseInput}
              onReviseInputChange={p.setReviseInput}
              onRevise={p.handleRevise}
              isRevising={p.isRevising}
              onSave={p.handleSave}
              isSaving={p.isSaving}
              savedMsg={p.savedMsg}
              savedSpecId={p.savedSpecId}
              onClear={p.handleClearSpec}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Bot className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-card-foreground">这里还是空的</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                在上方输入需求点「创建助手」，或从下面的示例模板里挑一个先看看。
              </p>
            </div>
          )}
        </section>

        <section id="templates" className="scroll-mt-20 py-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">从现成示例开始</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                三个常用助手示例，点一下即加载为可编辑方案，和生成的方案走同一套修改与保存流程。
              </p>
            </div>
            <Link
              to="/template-market"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Store className="h-4 w-4" />
              逛模板市场
            </Link>
          </div>
          <TemplateGallery templates={p.templates} onLoadTemplate={p.handleLoadTemplate} />
        </section>

        <section id="my-specs" className="scroll-mt-20 py-16">
          <div className="mb-6">
            <h2 className="text-3xl font-bold tracking-tight">我的助手</h2>
            <p className="mt-2 text-sm text-muted-foreground">保存过的方案都在这里，点开即可继续编辑。</p>
          </div>
          <SavedSpecsList
            savedList={p.savedList}
            isLoggedIn={p.isLoggedIn}
            onOpenSaved={p.handleOpenSaved}
            onDeleteSaved={p.handleDeleteSaved}
          />
        </section>
      </main>

      <footer className="mt-8 border-t border-border py-10 text-center">
        <p className="text-sm font-medium text-card-foreground">Agent Studio</p>
        <p className="mt-1 text-xs text-muted-foreground">从一句需求，到一个可运行的助手。</p>
      </footer>

    </SiteShell>
  )
}
