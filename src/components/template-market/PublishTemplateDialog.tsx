import { useEffect, useState } from "react"
import { Loader2, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SavedSpecRow, TemplateCategory } from "@/pages/TemplateMarket/useTemplateMarket"

type PublishTemplateDialogProps = {
  open: boolean
  specList: SavedSpecRow[]
  isLoadingSpecs: boolean
  specListError?: string
  onRetrySpecs?: () => void
  publishSpecId: string
  publishName: string
  publishDescription: string
  publishCategory: TemplateCategory
  publishError: string
  isPublishing: boolean
  onSelectSpec: (specId: string) => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCategoryChange: (value: TemplateCategory) => void
  onSubmit: () => void
  onClose: () => void
}

const PUBLISH_CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: "research", label: "研究" },
  { key: "knowledge", label: "问答" },
  { key: "data", label: "分析" },
  { key: "other", label: "其他" },
]

export function PublishTemplateDialog({
  open,
  specList,
  isLoadingSpecs,
  publishSpecId,  specListError,
  onRetrySpecs,

  publishName,
  publishDescription,
  publishCategory,
  publishError,
  isPublishing,
  onSelectSpec,
  onNameChange,
  onDescriptionChange,
  onCategoryChange,
  onSubmit,
  onClose,
}: PublishTemplateDialogProps) {
  const [reviewed,setReviewed]=useState(false)
  const selected=specList.find(row=>row.id===publishSpecId)||null
  // A refreshed source revision must be reviewed again, even if the dialog stays open.
  useEffect(()=>{setReviewed(false)},[open,publishSpecId,selected?.updated])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[min(90dvh,900px)] max-w-lg overflow-y-auto rounded-2xl border-border bg-card shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="h-4 w-4" />
            </span>
            发布我的模板
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-muted-foreground">
            公开后，任何市场使用者都可以查看并复制你的目标、任务描述、执行步骤和验收标准。私人知识库、模型密钥及自定义工具授权不会跟随模板。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="tm-publish-spec" className="text-sm font-medium text-card-foreground">
              选择我的助手方案
            </label>
            <div className="relative mt-1.5">
              <select
                id="tm-publish-spec"
                value={publishSpecId}
                onChange={(ev) => onSelectSpec(ev.target.value)}
                disabled={isLoadingSpecs}
                className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-card-foreground shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingSpecs && <option value="">正在加载方案…</option>}
                {!isLoadingSpecs && <option value="">请选择一个方案</option>}
                {specList.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            {specListError && <p role="alert"
              className="mt-2 rounded-lg border border-destructive/25 p-3 text-xs text-destructive">
              {specListError}
              <button type="button" onClick={onRetrySpecs} className="ml-2 font-semibold underline">重新加载</button>
            </p>}
            {!isLoadingSpecs && !specListError && specList.length === 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">还没有已保存的方案，先去首页创建并保存一个助手吧。</p>
            )}
          </div>
          <div>
            <label htmlFor="tm-publish-name" className="text-sm font-medium text-card-foreground">
              模板名称
            </label>
            <input
              id="tm-publish-name"
              value={publishName}
              onChange={(ev) => onNameChange(ev.target.value)}
              maxLength={40}
              placeholder="默认使用方案名，可修改"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-card-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="tm-publish-desc" className="flex items-center justify-between text-sm font-medium text-card-foreground">
              <span>
                简介 <span className="text-primary">*</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">{publishDescription.trim().length}/120</span>
            </label>
            <textarea
              id="tm-publish-desc"
              value={publishDescription}
              onChange={(ev) => onDescriptionChange(ev.target.value)}
              maxLength={120}
              rows={3}
              placeholder="必填：一句话说清这个模板能帮别人做什么"
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm leading-relaxed text-card-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-card-foreground">分类</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PUBLISH_CATEGORIES.map((cat) => {
                const isActive = publishCategory === cat.key
                return (
                  <button
                    key={cat.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onCategoryChange(cat.key)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </div>
          {selected && <section aria-label="公开模板文本内容预览" className="rounded-xl border border-border bg-secondary/40 p-3">
            <h3 className="text-xs font-semibold">发布前核对：这些任务描述将公开</h3>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs leading-relaxed">
              <p><strong>任务目标：</strong>{selected.spec?.goal||"未填写"}</p>
              <p><strong>范围：</strong>{selected.spec?.task_scope||"未填写"}</p>
              <p><strong>交付物：</strong>{(selected.spec?.deliverables||[]).join("、")||"未填写"}</p>
              <p><strong>任务步骤：</strong>{(selected.spec?.task_plan||[]).join("、")||"未填写"}</p>
              <p><strong>验收标准：</strong>{(selected.spec?.done_criteria||[]).join("、")||"未填写"}</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              服务器仅保留通用内置工具能力并清空私人知识库关联、质量样本和外部授权。
              如果上述文字本身包含公司机密、客户信息或密码，请先关闭并修改原 Agent。
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card p-2.5 text-xs leading-relaxed">
              <input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}
                className="mt-0.5 accent-primary" aria-label="确认已核查公开模板的任务文本"/>
              我已检查准备公开的任务描述，确认不含不应对外披露的信息。
            </label>
          </section>}
          {publishError && (
            <p className="rounded-xl bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">{publishError}</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPublishing || !!specListError || !publishSpecId || !publishDescription.trim() || !reviewed}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
            确认发布
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
