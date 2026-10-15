import { Bot, CheckCircle2, Loader2, Rocket } from "lucide-react"
import type { AgentItem } from "@/pages/Integrate/useIntegrate"

type AgentPickerCardProps = {
  agentList: AgentItem[]
  selectedAgentId: string
  isLoadingAgents: boolean
  onSelectAgent: (agentId: string) => void
}

export function AgentPickerCard({ agentList, selectedAgentId, isLoadingAgents, onSelectAgent }: AgentPickerCardProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex min-h-14 items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Bot className="h-4 w-4 text-primary" />
            选择要发布的助手
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">只列出已有发布版本的助手，对外调用锁定发布快照</p>
        </div>
        {isLoadingAgents && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {agentList.length === 0 && !isLoadingAgents ? (
        <div className="mt-2 rounded-2xl border border-dashed border-border bg-secondary/50 p-6 text-center">
          <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-card-foreground">还没有已发布的助手</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            先到「版本发布」页把助手方案发布为正式版本，这里就能选到它并生成嵌入代码与调用钥匙。
          </p>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {agentList.map((agent) => {
            const active = agent.agent_id === selectedAgentId
            return (
              <li key={agent.agent_id}>
                <button
                  type="button"
                  onClick={() => onSelectAgent(agent.agent_id)}
                  className={
                    active
                      ? "flex w-full items-center gap-3 rounded-2xl border border-primary bg-primary/5 p-3 text-left shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary"
                      : "flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
                  }
                >
                  <span
                    className={
                      active
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"
                    }
                  >
                    <Bot className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-card-foreground">{agent.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      已发布 v{agent.version_no}
                      {agent.published_at ? ` · ${String(agent.published_at).slice(0, 10)}` : ""}
                    </span>
                  </span>
                  {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
