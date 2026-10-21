import { ArrowLeft, ShieldCheck } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { safeAgentSpecId } from "@/lib/toolSearchPrivacy"

/** A context-aware way back into the owned Agent's resource step. */
export function ReturnToAgentResources({what="资源"}:{what?:string}) {
  const [searchParams] = useSearchParams()
  const id = safeAgentSpecId(searchParams.get("returnSpec") || "")
  if (!id) return null
  return <section aria-label="返回原 Agent 资源配置"
    className="my-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary"/>正在为一个 Agent 配置{what}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        完成当前连接、授权或上传后返回原方案，重新核验资源并保存；不会自动为其他 Agent 授权。
      </p>
    </div>
    <Link to={`/agent-create?spec=${encodeURIComponent(id)}&step=3`}
      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
      <ArrowLeft className="h-4 w-4"/>返回原 Agent
    </Link>
  </section>
}
