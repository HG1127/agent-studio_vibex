import {Link,useSearchParams} from "react-router-dom"
import {Activity,ArrowUpRight,HardDrive,PlugZap,ShieldCheck,Wrench} from "lucide-react"
import {continueAgentResourceSetupUrl} from "@/lib/toolSearchPrivacy"

export type ExecutionView="connections"|"devices"|"debug"|"activity"|"monitor"
const STEPS=[
  {view:"connections" as const,label:"已接入能力",detail:"添加、维护连接",path:"/execution-connections",icon:PlugZap},
  {view:"devices" as const,label:"我的电脑",detail:"仅电脑操作需要",path:"/tool-hub?view=devices",icon:HardDrive},
  {view:"debug" as const,label:"测试工具",detail:"真实试调与审批",path:"/tool-hub?view=debug",icon:Wrench},
  {view:"activity" as const,label:"调用记录",detail:"筛选、定位失败",path:"/tool-hub?view=activity",icon:Activity},
  {view:"monitor" as const,label:"运行监控",detail:"队列与运行状态",path:"/tool-hub?view=monitor",icon:ShieldCheck},
]
/** Peer resource views, not mandatory sequential setup steps. */
export function ExecutionWorkspaceNav({active}:{active:ExecutionView}){
  const [params]=useSearchParams()
  return <nav aria-label="执行资源操作流程" className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
    {STEPS.map(step=>{
      const selected=active===step.view
      const Icon=step.icon
      return <Link key={step.view} to={continueAgentResourceSetupUrl(step.path,params)}
        aria-current={selected?"page":undefined}
        className={"group flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary "+
          (selected?"border-primary/50 bg-primary/10 shadow-sm":"border-border bg-card hover:border-primary/30 hover:bg-secondary/50")}>
        <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-lg "+(selected?"bg-primary text-primary-foreground":"bg-secondary text-primary")}>
          <Icon className="h-4 w-4"/>
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-foreground">{step.label}</strong>
          <span className="hidden text-[11px] text-muted-foreground 2xl:block">{step.detail}</span>
        </span>
        {!selected&&<ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"/>}
      </Link>
    })}
  </nav>
}
