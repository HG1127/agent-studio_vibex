import { Loader2, Megaphone, RotateCcw, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ConfirmAction } from "@/pages/VersionRelease/useVersionRelease"

type VrConfirmDialogProps = {
  confirmAction: ConfirmAction | null
  isConfirmBusy: boolean
  onConfirm: () => void
  onCancel: () => void
}

const KIND_META = {
  publish: {
    title: "确认发布这个版本？",
    icon: Megaphone,
    confirmText: "确认发布",
    confirmClass: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  restore: {
    title: "确认恢复为当前配置？",
    icon: RotateCcw,
    confirmText: "确认恢复",
    confirmClass: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  delete: {
    title: "确认删除这个草稿版本？",
    icon: Trash2,
    confirmText: "确认删除",
    confirmClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
} as const

export function VrConfirmDialog({ confirmAction, isConfirmBusy, onConfirm, onCancel }: VrConfirmDialogProps) {
  const open = Boolean(confirmAction)
  const meta = confirmAction ? KIND_META[confirmAction.kind] : KIND_META.publish
  const row = confirmAction?.row || null
  const Icon = meta.icon
  const goalText = row?.spec_snapshot?.goal || ""

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-card shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            {meta.title}
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-muted-foreground">
            {row && (
              <>
                版本 <span className="font-semibold text-primary">v{row.version_no}</span>
                {row.config_snapshot?.name ? ` · ${row.config_snapshot.name}` : ""}
                {goalText ? ` · ${goalText.slice(0, 40)}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
          {confirmAction?.kind === "publish" &&
            "发布后该版本成为当前发布版本，原已发布版本会自动归档。每个助手同一时间只有一个已发布版本。"}
          {confirmAction?.kind === "restore" &&
            "恢复会用这个版本的快照覆盖助手当前配置（版本历史保持不变），恢复后建议重新走测试 → 存版 → 发布。"}
          {confirmAction?.kind === "delete" && "删除只针对草稿版本，删除后不可找回。"}
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirmBusy}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmBusy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${meta.confirmClass}`}
          >
            {isConfirmBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {meta.confirmText}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
