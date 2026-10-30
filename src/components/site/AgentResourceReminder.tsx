import {useState} from "react"
import {AlertCircle,RefreshCw,X} from "lucide-react"
import type {AgentResourceHandoff,AgentResourceReviewResult} from "@/lib/agentResourceHandoff"
type Props={
  reminder:AgentResourceHandoff|null
  capabilityName?:string
  onRecheck:()=>Promise<AgentResourceReviewResult|void>|AgentResourceReviewResult|void
  onDismiss:()=>void
  onLocate?:()=>void
  busy?:boolean
}
export function AgentResourceReminder({reminder,capabilityName,onRecheck,onDismiss,onLocate,busy=false}:Props){
  const [checking,setChecking]=useState(false)
  const [outcome,setOutcome]=useState<"idle"|"requested"|"failed">("idle")
  const [detail,setDetail]=useState("")
  if(!reminder)return null
  const recheck=async()=>{
    if(checking||busy)return
    setChecking(true);setOutcome("idle");setDetail("")
    try{
      const result=await onRecheck()
      if(result && !result.listsChecked){
        setOutcome("failed")
        setDetail(result.detail)
      }else{
        setOutcome("requested")
        setDetail(result?.detail||"资源重新核验已请求，请核对工具健康、角色分配及保存状态。")
      }
    }catch{
      setOutcome("failed")
      setDetail("本次核验请求异常，请检查连接状态并重试。")
    }finally{setChecking(false)}
  }
  return <section aria-label="Agent 资源重新核验提醒"
    className="my-3 flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary"/>资源配置页请求重新核验
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {capabilityName?"关联能力："+capabilityName+"。":""}
        另一标签可能修改了连接或工具状态；请主动读取当前账号的真实资源并核对候选工具。
        此提醒不代表接入或测试成功，不会覆盖草稿、自动保存、扩大角色权限或启动任务。
      </p>
      {outcome!=="idle"&&<p role="status" className={"mt-2 flex items-center gap-1 text-xs "+
        (outcome==="failed"?"text-destructive":"text-muted-foreground")}>
        {detail}
      </p>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button type="button" disabled={checking||busy} onClick={()=>void recheck()}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        <RefreshCw className={"h-4 w-4 "+(checking?"animate-spin":"")}/>{checking?"正在核验…":"刷新并重新匹配"}
      </button>
      {onLocate&&<button type="button" onClick={onLocate}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-primary/30 bg-background px-3 text-xs font-semibold text-primary hover:bg-primary/5">
        查看相关能力
      </button>}
      <button type="button" onClick={()=>{setOutcome("idle");setDetail("");onDismiss()}} aria-label="稍后处理资源提醒"
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground hover:bg-secondary">
        <X className="h-3.5 w-3.5"/>稍后
      </button>
    </div>
    {outcome==="failed"&&<AlertCircle aria-label="部分资源未完成核验" className="h-4 w-4 shrink-0 text-destructive"/>}
  </section>
}
