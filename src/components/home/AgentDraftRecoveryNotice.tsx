import { useEffect, useRef } from "react"
import { AlertTriangle, Clock3, RotateCcw, Trash2 } from "lucide-react"
import type { AgentEditorDraft } from "@/lib/agentEditorDraft"

type Props = {
  draft: AgentEditorDraft | null
  persistError?: boolean
  restoreNotice?: string
  onRestore: () => void
  onDiscard: () => void
}

/**
 * A recovery decision must precede editing a new draft. Otherwise a user
 * could type into the underlying editor while the old backup remains pending,
 * unintentionally losing whichever revision they intended to keep.
 */
export function AgentDraftRecoveryNotice({
  draft,persistError,restoreNotice,onRestore,onDiscard,
}:Props){
  const dialogRef=useRef<HTMLElement|null>(null)
  const restoreRef=useRef<HTMLButtonElement|null>(null)
  useEffect(()=>{
    if(!draft)return
    const previous=document.activeElement as HTMLElement|null
    const id=window.setTimeout(()=>restoreRef.current?.focus(),0)
    return ()=>{
      window.clearTimeout(id)
      if(previous?.isConnected)window.setTimeout(()=>previous.focus(),0)
    }
  },[draft])

  return <>
    {draft && <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-3 sm:p-6">
      <section ref={dialogRef} role="dialog" aria-modal="true"
        aria-label="恢复未保存的 Agent 草稿"
        onKeyDown={event=>{
          if(event.key!=="Tab")return
          const first=restoreRef.current
          const last=dialogRef.current?.querySelector<HTMLButtonElement>(
            'button[aria-label="舍弃当前临时草稿"]')
          if(event.shiftKey && document.activeElement===first){
            event.preventDefault();last?.focus()
          }else if(!event.shiftKey && document.activeElement===last){
            event.preventDefault();first?.focus()
          }
        }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <RotateCcw className="h-5 w-5"/>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">发现未保存的 Agent 草稿</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {draft.specName || (draft.spec?"未命名 Agent 方案":"未完成的任务需求")}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5"/>
              {new Date(draft.editedAt).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          草稿保存在当前浏览器标签页，最长保留 12 小时，不会自动上传服务器。
          请选择恢复继续编辑，或舍弃后创建新 Agent。恢复后仍需正式保存。
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" aria-label="舍弃当前临时草稿" onClick={onDiscard}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:bg-secondary">
            <Trash2 className="h-4 w-4"/>舍弃
          </button>
          <button ref={restoreRef} type="button" onClick={onRestore}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <RotateCcw className="h-4 w-4"/>恢复草稿
          </button>
        </div>
      </section>
    </div>}
    {persistError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0"/>
      此浏览器无法保存临时草稿，请复制当前内容并保存到服务器，避免意外丢失。
    </p>}
    {restoreNotice && <p role="status" className="mt-3 rounded-lg bg-primary/5 p-3 text-xs text-primary">
      {restoreNotice}
    </p>}
  </>
}
