import {useState} from "react"
import {ArrowRight,PanelsTopLeft,RefreshCw,ShieldCheck} from "lucide-react"
import {Link,useSearchParams} from "react-router-dom"
import {agentResourceReturnContext} from "@/lib/toolSearchPrivacy"
import {createAgentResourceHandoff,notifyOtherAgentTabs} from "@/lib/agentResourceHandoff"

/** Return to the existing editor rather than replacing an unsaved draft.
 * Sending a reminder never asserts that the connection was tested or granted.
 */
export function ReturnToAgentResources({what="资源"}:{what?:string}) {
  const [searchParams]=useSearchParams()
  const context=agentResourceReturnContext(searchParams)
  const [notification,setNotification]=useState<"idle"|"sent"|"manual">("idle")
  if(!context.fromAgent)return null
  const sendReminder=()=>{
    const signal=createAgentResourceHandoff(context.specId,context.capabilityId)
    setNotification(notifyOtherAgentTabs(signal)?"sent":"manual")
  }
  return <section aria-label="继续配置 Agent"
    className="my-4 min-w-0 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary"/>完成{what}接入后 · 返回 Agent 核验
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          本页完成登记或真实测试后，回到原来的 Agent 标签页，刷新连接并重新匹配；
          然后明确分配给负责角色、保存方案、进行试跑。连接已登记不代表已授权或执行成功。
        </p>
        {!context.specId&&<p className="mt-1 text-xs text-muted-foreground">
          当前 Agent 尚未保存。请返回原标签操作，避免丢失未保存的方案和分工。
        </p>}
      </div>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
        {context.specId&&<button type="button" onClick={sendReminder}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary">
          <RefreshCw className="h-4 w-4"/>提醒原 Agent 重新核验
        </button>}
        {context.savedAgentUrl&&<Link to={context.savedAgentUrl}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-medium text-primary hover:bg-secondary">
          <PanelsTopLeft className="h-4 w-4"/>打开已保存的 Agent <ArrowRight className="h-3.5 w-3.5"/>
        </Link>}
      </div>
    </div>
    {notification!=="idle"&&<p role="status" className="mt-3 rounded-xl bg-card/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      {notification==="sent"?
        "已发出刷新提醒（不保证其他标签收到）。请切回原 Agent 标签页，点击“重新匹配工具”并核对角色授权；不会自动修改原草稿。":
        "当前浏览器无法发送跨标签提醒。请手动切回原 Agent 标签页并点击“重新匹配工具”。"}
    </p>}
    {context.savedAgentUrl&&<p className="mt-2 text-[11px] text-muted-foreground">
      “打开已保存的 Agent”只加载服务器上的已保存版本，不能替代原标签里尚未保存的修改。
    </p>}
  </section>
}
