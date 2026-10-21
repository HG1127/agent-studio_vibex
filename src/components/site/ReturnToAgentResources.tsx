import { ArrowRight, PanelsTopLeft, ShieldCheck } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { agentResourceReturnContext } from "@/lib/toolSearchPrivacy"

/** Explain where the editable draft lives; never present a saved copy as that draft. */
export function ReturnToAgentResources({what="资源"}:{what?:string}) {
  const [searchParams] = useSearchParams()
  const context=agentResourceReturnContext(searchParams)
  if (!context.fromAgent) return null
  return <section aria-label="继续配置 Agent"
    className="my-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary"/>正在为一个 Agent 配置{what}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        完成连接、授权或上传后，请切回原来的 Agent 标签页继续。未保存的修改仍在原标签；返回后检查并刷新连接清单，再选择工具、分配角色并保存。
      </p>
      {!context.specId && <p className="mt-1 text-xs text-muted-foreground">当前方案尚未保存，请保留原标签页。</p>}
    </div>
    <div className="flex shrink-0 flex-col items-start gap-1">
      <p className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-primary"><PanelsTopLeft className="h-4 w-4"/>在原标签继续编辑</p>
      {context.savedAgentUrl && <Link to={context.savedAgentUrl}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-secondary">
        打开已保存的 Agent <ArrowRight className="h-3.5 w-3.5"/>
      </Link>}
      {context.savedAgentUrl && <span className="text-[11px] text-muted-foreground">此入口不包含原标签中未保存的修改</span>}
    </div>
  </section>
}
