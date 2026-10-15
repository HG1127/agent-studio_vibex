import { CopyPlus, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CATEGORY_META, type TemplateRow } from "@/pages/TemplateMarket/useTemplateMarket"

type UseConfirmDialogProps = {
  useTarget: TemplateRow | null
  isUseBusy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function UseConfirmDialog({ useTarget, isUseBusy, onConfirm, onCancel }: UseConfirmDialogProps) {
  const open = Boolean(useTarget)
  const meta = useTarget ? CATEGORY_META[useTarget.category] || CATEGORY_META.other : null
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-card shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CopyPlus className="h-4 w-4" />
            </span>
            使用这个模板？
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-muted-foreground">
            {useTarget && (
              <>
                <span className="font-semibold text-primary">{useTarget.name}</span>
                {meta ? ` · ${meta.label}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
          确认后会把模板的方案配置复制为你名下的一个新助手方案，并直接进入试跑页；原模板与你的其他方案都不受影响。
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUseBusy}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUseBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUseBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            复制为我的方案
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
