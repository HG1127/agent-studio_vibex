import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, Save, Trash2 } from "lucide-react"
import {
  evaluateAgentQualityChecks, normalizeAgentQualityChecks, QUALITY_CHECK_LIMIT,
  type AgentQualityCheck,
} from "@/lib/agentQualityChecks"
import type { AgentRunRow, SavedSpecRow } from "@/pages/AgentRun/useAgentRun"

type Props = {
  selectedSpec: SavedSpecRow
  activeRun: AgentRunRow | null
  saving: boolean
  error: string
  onSave: (checks: AgentQualityCheck[]) => Promise<boolean>
}
const TYPES = [
  {value:"contains",label:"结果必须包含"},
  {value:"not_contains",label:"结果不能包含"},
  {value:"json_object",label:"结果必须为 JSON 对象"},
] as const

export function AgentQualityChecklist({ selectedSpec, activeRun, saving, error, onSave }: Props) {
  const [draft,setDraft]=useState<AgentQualityCheck[]>(()=>
    normalizeAgentQualityChecks(selectedSpec.spec.quality_checks))
  const [dirty,setDirty]=useState(false)
  const [editRevision,setEditRevision]=useState(selectedSpec.updated)
  const versionChanged=selectedSpec.updated!==editRevision
  useEffect(()=>{
    if(!dirty && versionChanged){
      setDraft(normalizeAgentQualityChecks(selectedSpec.spec.quality_checks))
      setEditRevision(selectedSpec.updated)
    }
  },[selectedSpec.updated, selectedSpec.spec.quality_checks,dirty,versionChanged])
  const [message,setMessage]=useState("")
  const matchRun=activeRun?.spec_id===selectedSpec.id && activeRun.status==="succeeded"
  const saveTime=Date.parse(selectedSpec.updated||"")
  const runTime=Date.parse(activeRun?.created||"")
  const currentRevision=Number.isFinite(saveTime) && Number.isFinite(runTime) &&
    runTime>=saveTime-1000
  const verified=matchRun && currentRevision && typeof activeRun.result==="string"
  const evaluations=verified
    ? evaluateAgentQualityChecks(String(activeRun.result||""), draft)
    : []
  const stored=normalizeAgentQualityChecks(selectedSpec.spec.quality_checks)
  const draftDiffers=dirty || JSON.stringify(draft)!==JSON.stringify(stored)
  const canSave=draftDiffers && !saving && !versionChanged &&
    draft.every(item=>item.type==="json_object" || item.expected.trim().length>0)

  const update=(index:number,patch:Partial<AgentQualityCheck>)=>{
    setDraft(current=>current.map((item,i)=>i===index?{...item,...patch}:item))
    setDirty(true)
    setMessage("")
  }
  const save=async()=>{
    if(!canSave)return
    const succeeded=await onSave(draft)
    if(succeeded){
      setMessage("质量断言已保存到 Agent 方案；后续试跑会使用最新检查条件。")
      setDirty(false)
    }
  }
  return <section aria-label="可验证的运行质量断言"
    className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary"/>可核查的任务通过条件
        </h3>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
          自行设置测试断言，使用真实执行结果验证是否通过。文本包含或 JSON 合法性只能证明相应条件，不能替代事实准确率、引用证据和人工验收。
        </p>
      </div>
      <span className="rounded-lg bg-secondary px-2 py-1 text-xs text-muted-foreground">
        {draft.length}/{QUALITY_CHECK_LIMIT} 条
      </span>
    </div>
    {versionChanged && dirty && <div role="alert"
      className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      该 Agent 已在其他页面更新。为避免用旧检查条件覆盖新版本，已暂停此处保存。
      请先复制需要保留的条件，再点击下方按钮读取最新版本。
      <button type="button" onClick={()=>{
        setDraft(normalizeAgentQualityChecks(selectedSpec.spec.quality_checks))
        setDirty(false)
        setEditRevision(selectedSpec.updated)
        setMessage("已加载服务器最新检查条件，可以重新编辑并保存。")
      }} className="ml-2 font-semibold underline underline-offset-2">
        读取最新检查条件
      </button>
    </div>}
    {draft.length===0 ? <p className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
      尚未配置可自动判断的条件。可以先新增一个“必须包含”或“JSON 对象”断言；没有断言时不显示虚构的质量通过率。
    </p> : <div className="mt-4 space-y-3">
      {draft.map((item,index)=>(
        <div key={index} className="rounded-xl border border-border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1 text-xs text-muted-foreground">
              检查类型
              <select value={item.type}
                onChange={e=>update(index,{type:e.target.value as AgentQualityCheck["type"]})}
                className="mt-1.5 min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary">
                {TYPES.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" aria-label={`删除第${index+1}条质量断言`}
              onClick={()=>{setDraft(items=>items.filter((_,i)=>i!==index));setDirty(true)}}
              className="mt-4 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary">
              <Trash2 className="h-4 w-4"/>
            </button>
          </div>
          {item.type!=="json_object" && <label className="mt-3 block text-xs text-muted-foreground">
            {item.type==="contains"?"必须出现的文本":"不允许出现的文本"}
            <input value={item.expected} maxLength={200}
              onChange={e=>update(index,{expected:e.target.value})}
              placeholder="例如：风险提示 / 核心结论"
              className="mt-1.5 min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary"/>
          </label>}
          {verified && evaluations[index] && <p role="status"
            className={`mt-2 flex items-start gap-1.5 text-xs ${evaluations[index].passed?"text-primary":"text-destructive"}`}>
            {evaluations[index].passed?<CheckCircle2 className="h-4 w-4"/>:<AlertTriangle className="h-4 w-4"/>}
            {evaluations[index].passed?"通过":"未通过"} · {evaluations[index].note}
          </p>}
        </div>
      ))}
    </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <button type="button" disabled={draft.length>=QUALITY_CHECK_LIMIT}
        onClick={()=>{setDraft(current=>[...current,{type:"contains",expected:""}]);setDirty(true)}}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs hover:bg-secondary disabled:opacity-50">
        <Plus className="h-4 w-4"/>添加断言
      </button>
      <button type="button" disabled={!canSave} onClick={()=>void save()}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        <Save className="h-4 w-4"/>{saving?"保存中…":"保存检查条件"}
      </button>
    </div>
    {draftDiffers && <p className="mt-2 text-xs text-muted-foreground">
      当前检查条件尚未保存；页面上的结果仅为草稿预览，不影响实际执行或发布状态。
    </p>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {message && <p role="status" className="mt-2 text-xs text-primary">{message}</p>}
    {verified && draft.length>0 &&
      <p className="mt-3 rounded-lg bg-secondary/70 p-3 text-xs text-foreground">
        对当前显示的成功运行结果：{evaluations.filter(item=>item.passed).length} / {evaluations.length} 条断言通过。
        {draftDiffers?"（使用未保存的断言草稿）":""}
      </p>}
    {!verified && draft.length>0 && <p className="mt-3 text-xs text-muted-foreground">
      {matchRun && !currentRevision
        ? "当前成功运行早于最近一次 Agent 配置保存，不能用于最新版本验收；请重新试跑。"
        : "选择本 Agent 当前保存版本之后的一次成功运行，才能使用其真实结果进行断言验收。"}
    </p>}
  </section>
}
