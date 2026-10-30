import {ArrowRight,Check,ClipboardCheck,Link2,PlayCircle,Settings2} from "lucide-react"
import {Link} from "react-router-dom"
import type {RunGuideAction,RunGuideResult} from "@/lib/agentRunGuidance"
import {agentResourceSetupUrl} from "@/lib/toolSearchPrivacy"
type Props={guide:RunGuideResult;specId:string;onAction:(action:RunGuideAction)=>void}
const labels=["Agent 已保存","模型与资源已核验","任务已填写","试跑记录"]
export function RunJourneyGuide({guide,specId,onAction}:Props){
  const link=guide.action==="create"?"/agent-create":
    guide.action==="connect-model"?agentResourceSetupUrl("/model-connections",specId):""
  return <section aria-label="Agent 任务执行指引" className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:px-5">
    <ol className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
      {labels.map((label,i)=><li key={label} className="flex min-w-0 items-center gap-2 rounded-lg bg-secondary/30 px-2.5 py-2">
        <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold "+
          (guide.steps[i]?"bg-primary/10 text-primary":"bg-secondary text-muted-foreground")}>
          {guide.steps[i]?<Check className="h-3.5 w-3.5"/>:i+1}
        </span><span className={"min-w-0 text-xs "+(guide.steps[i]?"font-semibold text-foreground":"text-muted-foreground")}>{label}</span>
      </li>)}
    </ol>
    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{guide.title}</p>
        <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{guide.detail}</p>
      </div>
      {guide.action==="wait"?<span role="status" className="inline-flex min-h-10 items-center rounded-lg bg-secondary px-4 text-xs font-semibold text-muted-foreground">提交中…</span>:
      link?<Link to={link} target={guide.action==="connect-model"?"_blank":undefined}
        rel={guide.action==="connect-model"?"noopener noreferrer":undefined}
        className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary">
        {guide.action==="create"?<ClipboardCheck className="h-4 w-4"/>:<Link2 className="h-4 w-4"/>}{guide.label}<ArrowRight className="h-4 w-4"/>
      </Link>:<button type="button" onClick={()=>onAction(guide.action)}
        className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary">
        {guide.action==="configure"?<Settings2 className="h-4 w-4"/>:<PlayCircle className="h-4 w-4"/>}{guide.label}<ArrowRight className="h-4 w-4"/>
      </button>}
    </div>
  </section>
}
