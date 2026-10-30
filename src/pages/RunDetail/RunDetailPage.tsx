import {AlertCircle,ArrowLeft,Loader2,ScrollText,X} from 'lucide-react'
import {Link} from 'react-router-dom'
import {RdActionBar} from '@/components/run-detail/RdActionBar'
import {RdLoginGate} from '@/components/run-detail/RdLoginGate'
import {RdTopBar} from '@/components/run-detail/RdTopBar'
import {SiteShell} from '@/components/site/SiteShell'
import {WorkspaceEmptyState} from '@/components/site/WorkspaceEmptyState'
import {RecentRunsList} from '@/components/run-detail/RecentRunsList'
import {RunEvalFeedbackCard} from '@/components/run-detail/RunEvalFeedbackCard'
import {RunOverviewCard} from '@/components/run-detail/RunOverviewCard'
import {RunResultCard} from '@/components/run-detail/RunResultCard'
import {FailureTriageCard} from '@/components/run-detail/FailureTriageCard'
import {RunTimelineBody} from '@/components/run-detail/RunTimelineBody'
import {RunTraceCard} from '@/components/run-detail/RunTraceCard'
import {SpecSnapshotCard} from '@/components/run-detail/SpecSnapshotCard'
import type {useRunDetail} from './useRunDetail'
export function RunDetailPage(p:ReturnType<typeof useRunDetail>){
 const showDetail=!!p.runDetail&&p.runDetail.id===p.runIdParam&&p.loadState==='ready'
 return <SiteShell>
  <header className="border-b border-border bg-background"><RdTopBar/></header>
  <main className="w-full min-w-0 space-y-4 px-3 py-4 sm:px-5 lg:px-7 2xl:px-10" data-studio-fluid-page="run-detail">
   {!p.isLoggedIn||p.needsRhLogin?<RdLoginGate onLoginClick={p.onLoginClick}/>:<>
    {p.errorMsg&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span className="flex min-w-0 items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0"/>{p.errorMsg}</span><div className="flex gap-2">{p.runIdParam&&<button type="button" className="min-h-9 px-2 underline" onClick={()=>void p.reloadDetail()}>重新加载详情</button>}<button type="button" aria-label="关闭提示" onClick={p.dismissError} className="min-h-9 px-2"><X className="h-4 w-4"/></button></div></div>}
    {p.runIdParam&&<div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={p.handleBackToRecent} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-secondary"><ArrowLeft className="h-4 w-4"/>返回运行记录</button><p className="min-w-0 truncate text-xs text-muted-foreground">运行编号：{p.runIdParam}</p></div>}
    {p.runIdParam&&p.loadState==='loading'&&<div role="status" className="flex items-center gap-2 rounded-lg border border-border px-4 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>正在加载运行详情…</div>}
    {p.loadState==='not_found'&&<WorkspaceEmptyState icon={ScrollText} title="运行不存在或无权查看" description="记录可能已删除或不属于当前账号。可从下方列表选择本人有权查看的运行。"/>}
    {!showDetail&&p.loadState!=='loading'&&<RecentRunsList archive={p.archive} stateMeta={p.runStateMeta} onSelect={p.handleSelectRecent}/>}
    {showDetail&&p.runDetail&&<>
     {(p.runDetail.status === "awaiting_input" || p.runDetail.status === "awaiting_approval")&&<section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{p.runDetail.status==='awaiting_input'?'这次任务正在等待你确认方案或补充需求':'这次任务正在等待工具调用审批'}</h2><p className="mt-1 text-xs text-muted-foreground">已完成的步骤已保存，返回原任务处理，不需要重新输入。</p></div><Link to={`/agent-run?spec=${encodeURIComponent(p.runDetail.spec_id)}&run=${encodeURIComponent(p.runDetail.id)}#agent-input-review`} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">{p.runDetail.status==='awaiting_input'?'打开人工确认并继续':'查看待审批调用'}</Link></section>}
     <section aria-label="运行档案内容" className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
      <div className="min-w-0 space-y-4">
       {!p.isLive&&<RunResultCard run={p.runDetail} isLive={p.isLive} onCopy={p.handleCopyResult} copiedFlag={p.copiedFlag}/>}
       <RunTimelineBody key={p.runDetail.id} stepGroups={p.stepGroups} hasRun isLive={p.isLive} liveEnabled={p.liveEnabled} onToggleLive={p.handleToggleLive}/>
       {p.isLive&&<RunResultCard run={p.runDetail} isLive={p.isLive} onCopy={p.handleCopyResult} copiedFlag={p.copiedFlag}/>}
       <RunTraceCard runId={p.runDetail.id} kind="agent"/>
      </div>
      <aside className="min-w-0 space-y-4">
       <RdActionBar run={p.runDetail} isLive={p.isLive} controlBusy={p.controlBusy} onControl={p.handleControl} onExport={p.handleExportReport}/>
       <RunOverviewCard run={p.runDetail} modelLabel={p.modelLabel} isAcceptanceTest={p.isAcceptanceTest} isCustomModel={p.isCustomModel} harnessLine={p.harnessLine} stateMeta={p.runStateMeta}/>
       <FailureTriageCard status={p.runDetail.status} checkpoint={p.runDetail.checkpoint}/>
       <RunEvalFeedbackCard run={p.runDetail}/>
       <SpecSnapshotCard snapshot={p.specSnapshot} run={p.runDetail}/>
      </aside>
     </section>
    </>}
   </>}
  </main>
 </SiteShell>
}
