import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, CircleHelp,
  ClipboardCheck, GitBranch, Play, RefreshCw, ShieldAlert, Sparkles, Wrench,
} from "lucide-react"
import { SiteShell } from "@/components/site/SiteShell"
import { CreateComposer } from "@/components/home/CreateComposer"
import { AgentDraftRecoveryNotice } from "@/components/home/AgentDraftRecoveryNotice"
import { SpecEditorCard } from "@/components/home/SpecEditorCard"
import { AgentDraftDrawer } from "@/components/site/AgentDraftDrawer"
import { useHome } from "@/pages/Home/useHome"
import { getPocketBaseUrl } from "@/lib/pb"
import { vibexAuthHeaders } from "@/lib/studioAuth"
import { evaluateAgentJourney } from "@/lib/agentCreateJourney"
import { addReturnAgentToUrl } from "@/lib/toolSearchPrivacy"

const STAGES = [
  {id:"describe",label:"描述需求",hint:"一句话明确目标"},
  {id:"plan",label:"生成方案",hint:"确认任务与完成标准"},
  {id:"connect",label:"连接资源",hint:"检查授权和知识库"},
  {id:"try",label:"试跑验证",hint:"使用真实执行结果"},
  {id:"publish",label:"发布",hint:"验收通过后发布"},
] as const

const NEED_EXAMPLES = [
  {title:"研究与报告",description:"从公开信息整理结论与证据",
    prompt:"创建一个行业研究 Agent：每周分析 AI 半导体领域的重要新闻与公司公告，核对来源，输出摘要、竞争变化、关键风险及引用链接；不使用未经授权的私人资料。"},
  {title:"知识库问答",description:"基于公司资料回答问题",
    prompt:"创建一个知识库问答 Agent：仅根据我授权的公司知识库回答员工问题，附原始段落和文档出处；资料缺失时明确说明不知道，不编造答案。"},
  {title:"日常自动化",description:"定期收集、整理和汇报",
    prompt:"创建一个工作简报 Agent：每天汇总需要关注的工作进展，生成待办清单、负责人及截止日期；涉及发送消息或修改外部系统时必须先请求批准。"},
]

type ModelState="loading"|"ready"|"unavailable"
type RecentRun={id:string;spec_id:string;status:string;created:string;instruction:string;result?:string}
function progressFromQuery(raw:string|null):number{
  const val=Number.parseInt(raw||"1",10)
  return Number.isFinite(val)?Math.max(0,Math.min(4,val-1)):0
}

export default function AgentCreateRoute() {
  const p=useHome()
  const [params,setParams]=useSearchParams()
  const step=progressFromQuery(params.get("step"))
  const [modelState,setModelState]=useState<ModelState>("loading")
  const [enabledModels,setEnabledModels]=useState(0)
  const [run,setRun]=useState<RecentRun|null>(null)
  const [runChecked,setRunChecked]=useState(false)
  const [runError,setRunError]=useState("")
  const [notice,setNotice]=useState("")
  const [resourceMessage,setResourceMessage]=useState("")
  const [localEditorOpen,setLocalEditorOpen]=useState(false)
  useEffect(()=>{
    const openEditor=()=>setLocalEditorOpen(true)
    window.addEventListener("studio:open-current-agent-editor",openEditor)
    return()=>window.removeEventListener("studio:open-current-agent-editor",openEditor)
  },[])


  const refreshModels=useCallback(async()=>{
    setModelState("loading")
    setResourceMessage("")
    try{
      const res=await fetch(getPocketBaseUrl()+"/api/model-connections",{
        headers:{...vibexAuthHeaders()},
      })
      if(!res.ok)throw new Error("模型连接状态不可用")
      const data=await res.json() as {items?:{enabled:boolean;models:string[]}[]}
      const count=(data.items||[]).filter(conn=>conn.enabled)
        .reduce((sum,conn)=>sum+(Array.isArray(conn.models)?conn.models.length:0),0)
      setEnabledModels(count)
      setModelState("ready")
    }catch{
      setModelState("unavailable")
      setResourceMessage("暂时无法读取模型连接；请检查网络后刷新。")
    }
  },[])
  useEffect(()=>{
    let cancelled=false
    void Promise.resolve().then(()=>{if(!cancelled)void refreshModels()})
    return ()=>{cancelled=true}
  },[refreshModels])
  useEffect(()=>{
    // KBs can be created in another tab after wizard initialization.
    if(step!==2)return
    void p.refreshKnowledgeBases()
  },[step,p.refreshKnowledgeBases])

  const refreshRuns=useCallback(async()=>{
    if(!p.savedSpecId)return
    setRunError("")
    try{
      const res=await fetch(getPocketBaseUrl()+"/api/agent-runs/recent?limit=20",{
        headers:{...vibexAuthHeaders()},
      })
      if(!res.ok)throw new Error("读取试跑记录失败")
      const data=await res.json() as {items?:RecentRun[]}
      const selected=(data.items||[]).filter(item=>item.spec_id===p.savedSpecId)
        .sort((a,b)=>Date.parse(b.created)-Date.parse(a.created))
      const recent=selected[0]||null
      if(recent && recent.status==="succeeded"){
        // /recent intentionally omits result. Fetch owner-scoped detail before
        // asserting that the actual output satisfies the published contract.
        const detail=await fetch(getPocketBaseUrl()+
          "/api/agent-runs/"+encodeURIComponent(recent.id)+"/detail",{
          headers:{...vibexAuthHeaders()},
        })
        if(!detail.ok)throw new Error("无法核验最近试跑的真实输出")
        const response=await detail.json() as {run?:{id:string;spec_id:string;status:string;result:string}}
        if(response.run?.id!==recent.id || response.run.spec_id!==p.savedSpecId ||
          response.run.status!=="succeeded") throw new Error("试跑详情身份或状态不一致")
        setRun({...recent,result:response.run.result})
      } else setRun(recent)
      setRunChecked(true)
    }catch{
      setRunError("无法读取最新的 Agent 试跑记录，请稍后重试。")
      setRunChecked(false)
    }
  },[p.savedSpecId])
  useEffect(()=>{
    if(step<3 || !p.savedSpecId)return
    let cancelled=false
    void Promise.resolve().then(()=>{if(!cancelled)void refreshRuns()})
    return ()=>{cancelled=true}
  },[step,p.savedSpecId,refreshRuns])

  const evaluated=useMemo(()=>evaluateAgentJourney({
    spec:p.spec,specName:p.specName,savedId:p.savedSpecId,dirty:p.specDirty,
    enabledModelCount:enabledModels,modelState,
    toolStatusOf:p.toolStatusOf,
    accessibleKnowledgeBaseIds:p.knowledgeBases.map(item=>item.id),
    run,lastSavedAt:p.lastSavedAt,
  }),[p.spec,p.specName,p.savedSpecId,p.specDirty,p.toolStatusOf,
    p.knowledgeBases,enabledModels,modelState,run,p.lastSavedAt])
  const planReady=Boolean(p.spec && p.savedSpecId && !p.specDirty &&
    evaluated.planIssues.length===0)
  const maxStep=evaluated.canPublish?4:evaluated.canTry?3:planReady?2:p.spec?1:0

  const go=(next:number)=>{
    if(next<0||next>=STAGES.length)return
    if(next>maxStep){
      setNotice("前一个步骤尚有待完成事项，请先保存方案并解决相关提示。")
      return
    }
    setNotice("")
    const updated=new URLSearchParams(params)
    updated.set("step",String(next+1))
    if(p.savedSpecId)updated.set("spec",p.savedSpecId)
    setParams(updated)
    window.scrollTo({top:0,behavior:"smooth"})
  }

  const editorProps = p.spec ? {
    spec:p.spec,specName:p.specName,sourceMode:p.sourceMode,
    onSpecNameChange:p.setSpecName,onTextChange:p.updateSpecText,
    onTogglePlanReview:p.togglePlanReview,
    onListItemChange:p.updateSpecListItem,onListItemAdd:p.addSpecListItem,
    onListItemRemove:p.removeSpecListItem,toolStatusOf:p.toolStatusOf,
    builtinTools:p.builtinToolOptions,connectedTools:p.connectedTools,
    connectedMarketTools:p.connectedMarketTools,
    toolAnalysis:p.toolAnalysis,toolMatchNotice:p.toolMatchNotice,
    onRematchTools:p.rematchAgentTools,
    knowledgeBases:p.knowledgeBases,onToggleKnowledgeBase:p.toggleKnowledgeBase,
    knowledgeBasesError:p.knowledgeBasesError,knowledgeBasesLoading:p.knowledgeBasesLoading,
    onRefreshKnowledgeBases:p.refreshKnowledgeBases,
    onToggleTool:p.handleToggleSpecTool,reviseInput:p.reviseInput,
    onReviseInputChange:p.setReviseInput,onRevise:p.handleRevise,
    isRevising:p.isRevising,onSave:p.handleSave,isSaving:p.isSaving,dirty:p.specDirty,
    savedMsg:p.savedMsg,savedSpecId:p.savedSpecId,onClear:p.handleClearSpec,
    saveConflict:p.saveConflict,onSaveAsCopy:p.handleSaveAsCopy,
  } : null

  const blockers=step<=1?evaluated.planIssues:
    step===2?[...evaluated.planIssues,...evaluated.resourceIssues]:
    [...evaluated.planIssues,...evaluated.resourceIssues,...evaluated.qualityIssues]
  const runStatus=run?.status==="succeeded"?"试跑已成功":
    run?.status==="failed"?"最近试跑失败":run?.status==="awaiting_approval"?"等待审批":
    run?.status==="awaiting_input"?"等待方案确认／补充信息":
    run?.status==="running"?"试跑进行中":
    run?"最近试跑："+run.status:"暂无试跑记录"

  return <SiteShell>
    <AgentDraftDrawer open={localEditorOpen} onClose={()=>setLocalEditorOpen(false)}
      title="随时调整 Agent 创建方案"
      description="五个创建阶段都可以打开此窗，直接修改同一份草稿。保存后再试跑；进行中的 Agent 仍使用旧快照。">
      {editorProps ? <SpecEditorCard {...editorProps} focus="all" showClear={false}/>:
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          先在第一步描述需求并生成草案，随后可以随时在这个窗口调整目标、任务步骤、工具和完成标准。
        </p>}
    </AgentDraftDrawer>
    <main data-studio-fluid-page="agent-create" className="flex min-h-0 w-full min-w-0 flex-1 flex-col px-3 pb-12 pt-4 sm:px-5 lg:px-7 2xl:px-10">
      <AgentDraftRecoveryNotice draft={p.pendingDraft}
        persistError={p.draftPersistError}
        restoreNotice={p.draftRestoreNotice}
        onRestore={p.restoreDraft} onDiscard={p.discardDraft}/>
      <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-card-foreground sm:text-2xl">
              创建一个真正可运行的 Agent
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              从描述需求开始，逐步配置并完成试跑。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {step+1} / {STAGES.length}
            </span>
            <Link to="/" className="rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
              返回工作台
            </Link>
          </div>
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-1 sm:gap-2 xl:mt-5" aria-label="Agent 创建步骤">
          {STAGES.map((stage,index)=>{
            const selected=index===step
            const canOpen=index<=maxStep
            const completed=index<maxStep
            return <li key={stage.id} className="min-w-0">
              <button type="button" onClick={()=>go(index)} disabled={!canOpen}
                aria-current={selected?"step":undefined}
                title={stage.label+" · "+stage.hint}
                className={`flex min-h-[56px] w-full items-center justify-center gap-1.5 rounded-lg border px-1 py-2 text-center transition focus-visible:ring-2 focus-visible:ring-primary sm:min-h-[62px] sm:gap-2 ${selected?"border-primary/60 bg-primary/5 text-primary":completed?"border-transparent bg-secondary/50 text-foreground hover:border-primary/30":"border-transparent bg-secondary/20 text-muted-foreground"} disabled:cursor-not-allowed`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold sm:h-7 sm:w-7 ${selected?"bg-primary text-primary-foreground":completed?"bg-primary/15 text-primary":"bg-secondary text-muted-foreground"}`}>
                  {completed?<CheckCircle2 className="h-4 w-4"/>:index+1}
                </span>
                <span className="min-w-0 text-[10px] font-semibold leading-tight sm:text-xs xl:text-sm">{stage.label}</span>
              </button>
            </li>
          })}
        </ol>
      </section>

      {(notice||p.errorMsg) && <div role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {p.errorMsg||notice}
      </div>}

      {step>0 && <section aria-label="当前阶段待完成事项"
        className="mt-3 rounded-xl border border-border bg-card px-4 py-3 xl:hidden">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary"/>当前步骤 · {STAGES[step].label}
        </h2>
        {[...new Set(blockers)].length ? <ul className="mt-2 space-y-1.5">
          {[...new Set(blockers)].slice(0,5).map((reason,index)=>
            <li key={index} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"/>
              {reason}
            </li>)}
          {[...new Set(blockers)].length>5&&<li className="text-xs text-muted-foreground">
            还有 {[...new Set(blockers)].length-5} 项待完成，完整说明可在桌面侧栏查看。
          </li>}
        </ul> : <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
          <CheckCircle2 className="h-4 w-4"/>当前阶段没有阻断项，可以继续
        </p>}
      </section>}
      <div className="mt-5 grid min-w-0 flex-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] 2xl:gap-7 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <section id="spec-editor" className="min-w-0 space-y-4 scroll-mt-28">
          {step===0 && <>
            <CreateComposer variant="focus" userInput={p.userInput} onUserInputChange={p.setUserInput}
              onCreate={p.handleCreate} isGenerating={p.isGenerating}/>
            {p.spec && <div role="status" className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary"/> 已生成可编辑方案：{p.specName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                模型生成的是初稿，需要你核对目标、执行步骤与完成条件。下一步可以直接修改。
              </p>
              <button type="button" onClick={()=>go(1)}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                进入方案编辑 <ArrowRight className="h-4 w-4"/>
              </button>
            </div>}
          </>}

          {step===1 && <>
            <h2 className="text-base font-semibold">第二步 · 审核目标、任务规划与完成标准</h2>
            {editorProps ? <SpecEditorCard {...editorProps} focus="plan"/>:
              <p className="rounded-xl border border-border bg-card p-6 text-sm">请先在第一步生成方案。</p>}
            <p className="text-xs text-muted-foreground">必须保存经过审阅的方案，才能进入资源连接步骤。</p>
          </>}

          {step===2 && <>
            <h2 className="text-base font-semibold">第三步 · 核实模型、工具和知识库访问权限</h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary"/>模型连接</p>
                <button type="button" onClick={()=>void refreshModels()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">
                  <RefreshCw className="h-3.5 w-3.5"/>刷新
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {modelState==="loading"?"正在核验当前员工的模型连接…":
                  modelState==="ready"?`已发现 ${enabledModels} 个可选模型，试跑时仍需确认具体模型。`:
                  resourceMessage}
              </p>
              <Link to={addReturnAgentToUrl("/model-connections",p.savedSpecId)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                前往资源中心配置模型 <ArrowRight className="h-4 w-4"/>
              </Link>
            </div>
            {editorProps && <SpecEditorCard {...editorProps} focus="resources"/>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to={addReturnAgentToUrl("/tool-connections",p.savedSpecId)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">
                <Wrench className="mr-2 inline h-4 w-4 text-primary"/>管理工具与授权
              </Link>
              <Link to={addReturnAgentToUrl("/knowledge-bases",p.savedSpecId)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary/40">
                <BookOpen className="mr-2 inline h-4 w-4 text-primary"/>管理知识库和资料
              </Link>
            </div>
          </>}

          {step===3 && <>
            <h2 className="text-base font-semibold">第四步 · 在真实执行引擎里试跑验证</h2>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                在试跑页为当前 Agent 选择模型，填写实际任务指令，观察执行时间线、审批与最终结果。
                这里读取后端真实运行记录，不会因为点击“已完成”而伪造通过状态。
              </p>
              {evaluated.canTry ? <Link to={`/agent-run?spec=${encodeURIComponent(p.savedSpecId)}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Play className="h-4 w-4"/> 前往试跑当前 Agent
              </Link>:<p className="mt-3 text-sm text-destructive">还有前置事项待完成，暂不能试跑。</p>}
              <div className="mt-5 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">最近一次真实试跑：{runStatus}</p>
                  <button type="button" onClick={()=>void refreshRuns()} disabled={!p.savedSpecId}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-secondary disabled:opacity-50">
                    <RefreshCw className="h-4 w-4"/>刷新试跑结果
                  </button>
                </div>
                {runError && <p role="alert" className="mt-2 text-xs text-destructive">{runError}</p>}
                {runChecked && !run && <p className="mt-2 text-xs text-muted-foreground">当前助手尚无运行记录；完成真实试跑后再返回刷新。</p>}
                {run && <p className="mt-2 text-xs text-muted-foreground">
                  运行编号 {run.id} · {run.created} · {run.instruction.slice(0,80)}
                </p>}
                {evaluated.qualityIssues.map((issue,i)=>
                  <p key={i} role="alert" className="mt-2 text-xs text-destructive">{issue}</p>)}
                {p.spec?.quality_checks?.length ? <p className="mt-2 text-xs text-muted-foreground">
                  已配置 {p.spec.quality_checks.length} 条可执行质量断言；需对当前保存版本的真实输出逐项验证。
                </p>:null}
                {evaluated.canPublish && <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4"/> 已确认该方案保存后存在成功运行记录，可以继续发布前验收。
                </p>}
              </div>
            </div>
          </>}

          {step===4 && <>
            <h2 className="text-base font-semibold">第五步 · 版本验收与发布</h2>
            <div className="rounded-xl border border-border bg-card p-5">
              {evaluated.canPublish ? <>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary"/>
                  <div>
                    <p className="font-semibold text-foreground">已具备进入发布流水线的前提</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      当前版本已保存、资源检查通过，并关联真实成功试跑。点击下一步后，仍须在版本发布页完成其独立的验收、存版本与发布确认。
                    </p>
                  </div>
                </div>
                <Link to={`/version-release?spec=${encodeURIComponent(p.savedSpecId)}`}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
                  <GitBranch className="h-4 w-4"/> 打开版本验收与发布
                </Link>
              </>:
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0"/>
                  发布仍被阻断：先保存方案、连接资源，并完成本方案的真实成功试跑。
                </p>}
            </div>
          </>}

          {step>0 && <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
            <button type="button" onClick={()=>go(step-1)} disabled={step===0}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm hover:bg-secondary disabled:opacity-40">
              <ArrowLeft className="h-4 w-4"/>返回上一步
            </button>
            {step<4 && <button type="button" disabled={step+1>maxStep}
              onClick={()=>go(step+1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
              下一步：{STAGES[step+1].label} <ArrowRight className="h-4 w-4"/>
            </button>}
          </div>}
        </section>

        <aside className="hidden h-fit min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-24 xl:block 2xl:p-5"
          aria-label={step===0 ? "任务描述示例" : "创建检查"}>
          {step===0 ? <>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary"/>
              <h2 className="text-sm font-semibold text-card-foreground">试试这些任务</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              选择一个示例自动填入左侧，然后按需要修改。
            </p>
            <div className="mt-4 space-y-2">
              {NEED_EXAMPLES.map(example => (
                <button key={example.title} type="button"
                  disabled={p.isGenerating}
                  onClick={()=>{
                    p.setUserInput(example.prompt)
                    document.getElementById("agent-requirement")?.focus()
                  }}
                  className="flex min-h-[72px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                  <span className="min-w-0">
                    <strong className="block text-sm text-card-foreground">{example.title}</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{example.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground"/>
                </button>
              ))}
            </div>
            <details className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium hover:text-foreground">怎样写出更可靠的任务？</summary>
              <p className="mt-2 leading-relaxed">最好写清目标、所需资料、结果格式和限制条件。尚不确定的内容可以留到下一步修改。</p>
            </details>
          </> : <>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary"/> 当前步骤检查
            </h2>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {p.specName || "未命名 Agent"} · {p.specDirty ? "有未保存修改" : p.savedSpecId ? "方案已保存" : "尚未保存"}
            </p>
            <div className="mt-4 space-y-2">
              {[...new Set(blockers)].length ? [...new Set(blockers)].slice(0,3).map((issue,i)=>
                <p key={i} className="flex items-start gap-2 rounded-lg bg-secondary/45 p-2.5 text-xs leading-relaxed text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"/>{issue}
                </p>):<p className="flex items-start gap-2 text-xs leading-relaxed text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0"/>当前步骤没有阻断项，可以继续
                </p>}
              {[...new Set(blockers)].length>3 && <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer py-2 hover:text-foreground">其他待完成项（{[...new Set(blockers)].length-3}）</summary>
                <ul className="mt-1 space-y-2">
                  {[...new Set(blockers)].slice(3).map((issue,i)=><li key={i}>{issue}</li>)}
                </ul>
              </details>}
            </div>
            <details className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium hover:text-foreground">
                <CircleHelp className="h-3.5 w-3.5"/> 关于验收规则
              </summary>
              <p className="mt-2 leading-relaxed">模型授权、试跑结果和最终发布均由后端验证。当前进度仅展示已检查的条件。</p>
            </details>
          </>}
        </aside>      </div>
    </main>
  </SiteShell>
}
