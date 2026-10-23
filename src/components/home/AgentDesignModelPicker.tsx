import { Link } from "react-router-dom"
import type { AgentDesignModelOption } from "@/lib/agentDesignModelSelection"
import { chooseAgentDesignModel } from "@/lib/agentDesignModelSelection"

type Props = {
  options: readonly AgentDesignModelOption[]
  selectedKey: string
  status: "loading" | "ready" | "unavailable"
  onSelect: (key:string) => void
  onRefresh: () => void
  busy?: boolean
}

export function AgentDesignModelPicker({
  options, selectedKey, status, onSelect, onRefresh, busy = false,
}: Props) {
  const selected = chooseAgentDesignModel(options, selectedKey)
  const statusText = status === "loading" ? "正在核验当前账号的模型连接…"
    : status === "unavailable" ? "暂时无法验证当前账号的模型连接，请刷新后重试。"
    : !options.length ? "尚无可用模型，请先连接并启用模型。"
    : selected ? "仅调用当前选定的连接与模型；不会自动改用其他模型。"
    : selectedKey ? "所选模型已失效，请重新选择授权模型。"
    : "存在多个模型，请先选择用于规划的模型（避免误用本地模拟模型）。"
  return <div className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Agent 规划模型">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-[225px] flex-1 text-xs font-semibold text-foreground">
        Agent 规划模型
        <select aria-label="Agent 规划模型" value={selected?.key || ""} disabled={!!busy || status !== "ready" || !options.length}
          onChange={event => onSelect(event.target.value)}
          className="mt-1.5 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal">
          {!selected && <option value="">请选择当前员工已授权的连接与模型</option>}
          {options.map(item => <option key={item.key} value={item.key}>{item.connectionName} · {item.modelId}</option>)}
        </select>
      </label>
      <button type="button" className="h-10 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-40"
        disabled={!!busy || status === "loading"} onClick={onRefresh}>刷新模型</button>
    </div>
    <p role="status" className="mt-2 text-xs text-muted-foreground">{statusText}
      {status === "ready" && options.length === 0 && <>
        <Link to="/model-connections" className="ml-1 font-medium text-primary underline-offset-2 hover:underline">前往模型连接</Link>
      </>}
    </p>
  </div>
}
