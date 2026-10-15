import { useState } from "react"
import { BrainCircuit, Loader2, Trash2 } from "lucide-react"
import { memoryKindMetaOf } from "@/pages/AgentRun/useAgentRun"
import type { AgentMemoryRow } from "@/pages/AgentRun/useAgentRun"

type MemoryPanelProps = {
  memoryList: AgentMemoryRow[]
  isLoadingMemories: boolean
  memoryDeletingId: string
  hasSpec: boolean
  isLoggedIn: boolean
  onDeleteMemory: (memoryId: string) => void
}

function formatMemoryDate(created: string): string {
  if (!created) return ""
  return created.slice(0, 10)
}

// 方案记忆面板：成功运行沉淀的经验列表，支持逐条删除（两步确认）
export function MemoryPanel({
  memoryList,
  isLoadingMemories,
  memoryDeletingId,
  hasSpec,
  isLoggedIn,
  onDeleteMemory,
}: MemoryPanelProps) {
  const [confirmingId, setConfirmingId] = useState("")

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">方案记忆</h2>
        {memoryList.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {memoryList.length} 条
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        三类来源：指令里写「记住：…」会存为<span className="font-medium text-primary">用户指令</span>
        ；成功运行后自动提炼<span className="font-medium text-card-foreground">经验</span>
        ；失败运行会沉淀<span className="font-medium text-destructive/80">教训</span>
        。下次运行同一方案时，规划会按相关度参考这些记忆。
      </p>

      {!isLoggedIn && (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          登录后即可查看和管理这个方案的记忆
        </p>
      )}

      {isLoggedIn && isLoadingMemories && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          记忆加载中…
        </p>
      )}

      {isLoggedIn && !isLoadingMemories && memoryList.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          {hasSpec
            ? "这个方案还没有记忆——在任务指令里写「记住：…」、或跑完一次任务后，这里会自动沉淀用户指令、经验与教训。"
            : "先在左侧选择一个方案，这里会展示它沉淀下来的记忆。"}
        </p>
      )}

      {isLoggedIn && memoryList.length > 0 && (
        <ul className="mt-3 space-y-2">
          {memoryList.map((memoryRow) => {
            const toolNames = String(memoryRow.tools_used || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
            const factText = String(memoryRow.fact || "")
            const factShown = factText.length > 120 ? `${factText.slice(0, 120)}…` : factText
            const kindMeta = memoryKindMetaOf(String(memoryRow.kind || ""))
            return (
              <li
                key={memoryRow.id}
                className="animate-in fade-in rounded-xl border border-border bg-background p-3 duration-300"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${kindMeta.badgeClass}`}
                  >
                    {kindMeta.label}
                  </span>
                  <p className="text-sm leading-relaxed text-card-foreground">{factShown || "（无成果摘要）"}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {toolNames.map((toolName) => (
                    <span
                      key={toolName}
                      className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      {toolName}
                    </span>
                  ))}
                  {formatMemoryDate(memoryRow.created) && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatMemoryDate(memoryRow.created)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {confirmingId === memoryRow.id ? (
                    <>
                      <button
                        type="button"
                        disabled={memoryDeletingId !== ""}
                        onClick={() => {
                          void onDeleteMemory(memoryRow.id)
                          setConfirmingId("")
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {memoryDeletingId === memoryRow.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        确认删除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId("")}
                        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(memoryRow.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
