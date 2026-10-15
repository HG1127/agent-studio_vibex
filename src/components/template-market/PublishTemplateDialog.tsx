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
  publishSpecId,
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
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl border-border bg-card shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="h-4 w-4" />
            </span>
            发布我的模板
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-muted-foreground">
            把你保存过的助手方案发布成公开模板。方案配置（目标 / 任务 / 工具 / 完成条件）会被复制公开，请确认里面没有隐私内容。
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
            {!isLoadingSpecs && specList.length === 0 && (
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
            disabled={isPublishing || !publishSpecId}
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
