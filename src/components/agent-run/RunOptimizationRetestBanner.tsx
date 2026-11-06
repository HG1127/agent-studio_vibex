import { ArrowRight, GitCompareArrows, RefreshCw, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"
import type { RecoverableOptimization } from "@/pages/AgentRun/useAgentRun"

type Props={
  candidate:RecoverableOptimization|null
  linked:boolean
  error:string
  onRestore:()=>void
  onUnlink:()=>void
  onRetry:()=>void
}
const labels:Record<string,string>={
  goal:"目标",task_scope:"任务范围",deliverables:"交付物",
  task_plan:"执行步骤",done_criteria:"完成标准",tools:"工具",
  knowledge_base_ids:"知识库",require_plan_review:"人工方案审核",
  require_approval:"写入审批",
}

export function RunOptimizationRetestBanner({
  candidate,linked,error,onRestore,onUnlink,onRetry,
}:Props){
  if(!candidate&&!error)return null
  if(!candidate)return <div role="status"
    className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
    <p>{error}</p>
    <button type="button" onClick={onRetry}
      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold text-primary hover:bg-secondary">
      <RefreshCw className="h-3.5 w-3.5"/>重新核验
    </button>
  </div>

  return <section aria-label="恢复已保存的反馈优化试跑"
    className="rounded-xl border border-primary/20 bg-primary/[0.025] p-4">
    <div className="flex flex-wrap items-start gap-3">
      <GitCompareArrows className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="text-sm font-semibold">当前 Agent 有已确认的反馈改进版本</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            已核对服务器完整方案，当前配置仍与这条接受修改的记录一致。
            你可以明确选择把下一次试跑关联到这条反馈；不会在此处自动调用模型。
          </p>
        </div>
        <p className="break-words text-xs text-muted-foreground">
          变更内容：{candidate.changed_keys.map(key=>labels[key]||key).join("、")||"字段已更改"}
          <span className="ml-2">修订编号：{candidate.accepted_revision_id}</span>
        </p>
        {!candidate.feedback_unchanged&&<p role="status"
          className="text-xs font-medium text-amber-700 dark:text-amber-400">
          原用户反馈在接受修改后发生变化。此处关联的是当时的反馈哈希，而不是当前反馈文本。
        </p>}
        <div className="flex flex-wrap items-center gap-2">
          {linked ? <>
            <span role="status" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary">
              <ShieldCheck className="h-4 w-4"/>下一次运行将记录这条优化关联
            </span>
            <button type="button" onClick={onUnlink}
              className="min-h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary">
              不关联本次运行
            </button>
          </> : <button type="button" onClick={onRestore}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/5">
            将下一次试跑关联到此版本 <ArrowRight className="h-3.5 w-3.5"/>
          </button>}
          <Link to={"/run-detail?run="+encodeURIComponent(candidate.source_run_id)}
            className="inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline">
            查看触发反馈的原始运行
          </Link>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          修改 Agent 配置后，后端会拒绝旧版本关联。真正试跑仍需填写任务并点击「运行」。
        </p>
      </div>
    </div>
  </section>
}
