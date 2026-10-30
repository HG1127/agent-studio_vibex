import {Link,useSearchParams} from "react-router-dom"
import {Activity,AlertCircle,ArrowRight,Info,RefreshCw,Settings2,X} from "lucide-react"
import {LocalDevicesPanel} from "@/components/tool-hub/LocalDevicesPanel"
import {BuiltinToolCards} from "@/components/tool-hub/BuiltinToolCards"
import {DebugConsole} from "@/components/tool-hub/DebugConsole"
import {ExternalToolList} from "@/components/tool-hub/ExternalToolList"
import {HarnessPanel} from "@/components/tool-hub/HarnessPanel"
import {InvocationLogList} from "@/components/tool-hub/InvocationLogList"
import {ThLoginGate} from "@/components/tool-hub/ThLoginGate"
import {WorkerStatusPanel} from "@/components/tool-hub/WorkerStatusPanel"
import {SiteShell} from "@/components/site/SiteShell"
import {ExecutionWorkspaceNav,type ExecutionView} from "@/components/site/ExecutionWorkspaceNav"
import {resolveToolHubView} from "@/lib/toolHubView"
import {ReturnToAgentResources} from "@/components/site/ReturnToAgentResources"
import {continueAgentResourceSetupUrl,agentResourceReturnContext} from "@/lib/toolSearchPrivacy"
import type {useToolHub} from "./useToolHub"

const HEADINGS:Record<Exclude<ExecutionView,"connections">,{title:string,description:string}>={
  devices:{title:"电脑与浏览器",description:"连接一次，在这里查看状态、快速检查并选择设备使用，无需另配 MCP 或 HTTP 接口。"},
  debug:{title:"验证工具是否可执行",description:"从现有工具选择一项开展有边界的试调，读取真实返回；涉及写入仍须人工明确同意。"},
  activity:{title:"调用记录与故障定位",description:"按工具、状态及来源筛选真实调用；展开详情查看入参摘要、耗时、错误码和执行线索。"},
  monitor:{title:"运行状态与治理监控",description:"查看 Worker 心跳、队列和近期执行聚合，区分实时状态与统计窗口。"},
}

export function ToolHubPage(p:ReturnType<typeof useToolHub>){
  const [params]=useSearchParams()
  const path=(to:string)=>continueAgentResourceSetupUrl(to,params)
  const returnSpec=agentResourceReturnContext(params).specId
  const runPath=returnSpec?'/agent-run?spec='+encodeURIComponent(returnSpec):'/agent-run'
  const view=resolveToolHubView(params.get("view"))
  return <SiteShell>
    <main data-studio-fluid-page="tool-hub" className="w-full min-w-0 space-y-5 px-4 pb-14 pt-6 lg:px-8 2xl:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">工具与连接 / 执行资源中心</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{HEADINGS[view].title}</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{HEADINGS[view].description}</p>
        </div>
        {view!=="devices"&&<button type="button" onClick={p.refreshNow} disabled={!p.isLoggedIn}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-semibold transition hover:border-primary/30 hover:bg-secondary disabled:opacity-50">
          <RefreshCw className="h-4 w-4"/>刷新当前视图
        </button>}
      </header>
      <ExecutionWorkspaceNav active={view}/>
      <ReturnToAgentResources what="工具、电脑与执行日志"/>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-4 w-4 text-primary"/>接入真实能力 → 必要时配对电脑 → 受控试调 → 核对调用证据 → 处理运行异常
        </span>
        {view==="activity" ? <Link to={path("/tool-hub?view=monitor")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">查看运行监控 <ArrowRight className="h-3.5 w-3.5"/></Link>
          : <Link to={path("/tool-hub?view=activity")} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">查看调用记录 <ArrowRight className="h-3.5 w-3.5"/></Link>}
      </div>

      {p.needsRhLogin&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
        <AlertCircle className="h-4 w-4 text-destructive"/>当前登录态已过期，请重新登录验证权限。
        <button type="button" onClick={p.onLoginClick} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">重新登录</button>
      </div>}
      {p.errorMsg&&<div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
        <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0"/>{p.errorMsg}</span>
        <button type="button" aria-label="关闭错误提示" onClick={p.dismissError} className="rounded-lg p-1 hover:bg-destructive/10"><X className="h-4 w-4"/></button>
      </div>}
      {p.noticeMsg&&<div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground"><Info className="h-4 w-4 shrink-0 text-primary"/>{p.noticeMsg}</span>
        <button type="button" aria-label="关闭提示" onClick={p.dismissNotice} className="rounded-lg p-1 hover:bg-secondary"><X className="h-4 w-4"/></button>
      </div>}

      {!p.isLoggedIn ? <ThLoginGate onLoginClick={p.onLoginClick}/>:
        view==="devices" ? <div className="space-y-4">
          <LocalDevicesPanel/>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-sm text-muted-foreground">连接和快速检查在上方完成。选择已保存的 Agent 后，明确选用这台设备；不会自动执行任务。</p>
            <Link to={runPath} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">选择设备并试跑 <ArrowRight className="h-4 w-4"/></Link>
          </div>
        </div>:
        view==="debug" ? <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(270px,0.75fr)_minmax(0,1.5fr)]">
          <div className="min-w-0 space-y-5">
            <BuiltinToolCards tools={p.builtinTools} activeTarget={p.activeTarget} onOpenDebug={p.openBuiltinDebug}/>
            <ExternalToolList tools={p.externalTools} isLoading={p.isLoadingExternal} activeTarget={p.activeTarget} onDebug={p.openExternalDebug}/>
          </div>
          <div className="min-w-0 space-y-5">
            <DebugConsole
              activeTarget={p.activeTarget} builtinTools={p.builtinTools} specOptions={p.specOptions}
              debugExpression={p.debugExpression} setDebugExpression={p.setDebugExpression}
              debugText={p.debugText} setDebugText={p.setDebugText}
              debugFocus={p.debugFocus} setDebugFocus={p.setDebugFocus}
              debugKeyword={p.debugKeyword} setDebugKeyword={p.setDebugKeyword}
              debugSpecId={p.debugSpecId} setDebugSpecId={p.setDebugSpecId}
              debugUrl={p.debugUrl} setDebugUrl={p.setDebugUrl}
              debugQuery={p.debugQuery} setDebugQuery={p.setDebugQuery}
              debugLimit={p.debugLimit} setDebugLimit={p.setDebugLimit}
              debugExternalInput={p.debugExternalInput} setDebugExternalInput={p.setDebugExternalInput}
              confirmExternalWrite={p.confirmExternalWrite} setConfirmExternalWrite={p.setConfirmExternalWrite}
              requiresWriteConfirmation={p.requiresWriteConfirmation}
              isDebugging={p.isDebugging} debugResult={p.debugResult}
              copiedFlag={p.copiedFlag} onRun={p.runDebug} onCopy={p.copyDebugOutput} onClose={p.closeDebug}/>
            <Link to={path("/tool-hub?view=activity")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10">
              查看本次或历史工具调用记录 <ArrowRight className="h-4 w-4"/>
            </Link>
          </div>
        </div>:
        view==="activity" ? <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-xl border border-border bg-card px-4 py-3 text-sm">累计调用 <strong className="ml-1 tabular-nums">{p.hubStats?.invocation_count??"—"}</strong></span>
            <span className="rounded-xl border border-border bg-card px-4 py-3 text-sm">成功 <strong className="ml-1 tabular-nums">{p.hubStats?.success_count??"—"}</strong></span>
            <span className="rounded-xl border border-border bg-card px-4 py-3 text-sm">失败 <strong className="ml-1 tabular-nums">{p.hubStats?.failed_count??"—"}</strong></span>
          </div>
          <InvocationLogList
            invocationList={p.invocationList} isLoading={p.isLoadingInvocations}
            invocationFilter={p.invocationFilter} applyInvocationFilter={p.applyInvocationFilter}
            invocationPage={p.invocationPage} invocationTotal={p.invocationTotal} invocationPages={p.invocationPages}
            invocationError={p.invocationError} invocationSearch={p.invocationSearch}
            invocationStatus={p.invocationStatus} invocationSource={p.invocationSource}
            invocationRunId={p.invocationRunId} clearInvocationRunId={p.clearInvocationRunId}
            changeInvocationPage={p.changeInvocationPage} changeInvocationSearch={p.changeInvocationSearch}
            changeInvocationStatus={p.changeInvocationStatus} changeInvocationSource={p.changeInvocationSource}
            expandedInvocationId={p.expandedInvocationId} toggleInvocationRow={p.toggleInvocationRow}
            sourceMeta={p.sourceMeta} invStatusMeta={p.invStatusMeta} onRefresh={p.refreshNow}
          />
        </div>:
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
          <WorkerStatusPanel status={p.workerStatus} onRefresh={p.refreshWorkerStatus}/>
          <HarnessPanel hubStats={p.hubStats} monitorData={p.monitorData}
            monitorLoading={p.monitorLoading} onRefreshMonitor={p.refreshMonitor}/>
          <Link to="/harness" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-primary hover:bg-secondary xl:col-span-2">
            <Settings2 className="h-4 w-4"/>查看完整运行历史、治理来源与详细指标 <ArrowRight className="h-4 w-4"/>
          </Link>
        </div>}
    </main>
  </SiteShell>
}
