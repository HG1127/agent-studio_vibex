import { Loader2, Play, TriangleAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { WorkflowRow } from "@/pages/WorkflowCanvas/useWorkflowCanvas"

type RunInstructionDialogProps = {
  runDialogOpen: boolean
  closeRunDialog: () => void
  runInstruction: string
  setRunInstruction: (value: string) => void
  handleRunSubmit: () => void
  isStarting: boolean
}

export function RunInstructionDialog({
  runDialogOpen,
  closeRunDialog,
  runInstruction,
  setRunInstruction,
  handleRunSubmit,
  isStarting,
}: RunInstructionDialogProps) {
  return (
    <Dialog open={runDialogOpen} onOpenChange={(open) => !open && closeRunDialog()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">运行这条工作流</DialogTitle>
          <DialogDescription>
            填写本次任务指令，它会注入到流程里的 {"{{input}}"} 变量；引擎将按连线顺序逐节点真实执行。
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="例如：帮我算一下 (12+8)*3，并把结果整理成一句话"
          value={runInstruction}
          maxLength={2000}
          onChange={(event) => setRunInstruction(event.target.value)}
        />
        <DialogFooter>
          <button
            type="button"
            onClick={closeRunDialog}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            再想想
          </button>
          <button
            type="button"
            onClick={handleRunSubmit}
            disabled={isStarting || !runInstruction.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isStarting ? "启动中…" : "开始运行"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DeleteConfirmDialogProps = {
  deleteTarget: WorkflowRow | null
  cancelDelete: () => void
  confirmDelete: () => void
}

export function DeleteConfirmDialog({ deleteTarget, cancelDelete, confirmDelete }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && cancelDelete()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-card-foreground">
            <TriangleAlert className="h-4 w-4 text-destructive" />
            删除工作流
          </DialogTitle>
          <DialogDescription>
            确定删除「{deleteTarget?.name || ""}」吗？画布内容和节点配置会一并删除，历史运行记录仍可回看。此操作不可恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={cancelDelete}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded-xl bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground shadow-md transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            确认删除
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
