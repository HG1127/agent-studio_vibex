import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {localApi} from '@/lib/localDevices'
import {BusinessQualityStatus} from '@/components/agent-run/BusinessQualityStatus'
import {ResearchReplanPanel} from './ResearchReplanPanel'
const states:Record<string,string>={running:'运行中',paused:'已暂停',succeeded:'已结束',failed:'失败',cancelled:'已取消',launching:'正在创建子运行',done:'已交付',partial:'部分交付',awaiting_review:'等待人工复核',awaiting_approval:'等待工具审批',awaiting_input:'等待补充信息',not_created:'尚未创建',reused:'已复用',reuse_pending:'准备复用',deferred:'本次保留缺口'}
type Detail={status:string;recovery:{latest_run_id:string;revision:number;limits:{model_calls:number;tool_calls:number};usage:{model_intents:number;tool_intents:number}};profile:{case_id:string;stages:{node_id:string;title:string;max_steps:number;budget:{model_calls:number;tool_calls:number}}[]};stages:{stage_id:string;child_run_id:string;state:string;child_status:string;artifact:{free_text_quality?:string;gaps?:{code:string}[]}}[];budgets:{scope:string;limits:{model_calls:number;tool_calls:number};usage:{model_intents:number;tool_intents:number}}[]}
export function ResearchStagesPanel({runId,updated,onChanged,onOpen}:{runId:string;updated:string;onChanged:()=>void;onOpen:(id:string)=>void}){
  const [value,setValue]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  useEffect(()=>{
    const abort=new AbortController();setValue(null);setError('')
    void localApi<Detail>(`/api/workflow-runs/${encodeURIComponent(runId)}/research`,undefined,abort.signal).then(v=>{if(!abort.signal.aborted)setValue(v)}).catch(()=>{if(!abort.signal.aborted)setError('阶段信息当前不可读取，请检查登录和来源权限。')})
    return ()=>abort.abort()
  },[runId,updated,revision])
  async function control(action:'pause'|'resume'|'cancel'){
    setBusy(true);setError('')
    try{await localApi(`/api/workflow-runs/${encodeURIComponent(runId)}/${action}`,{});setRevision(r=>r+1);onChanged()}catch{setError('操作未完成，请刷新并检查当前任务状态。')}finally{setBusy(false)}
  }
  return <section className="rounded-2xl border bg-card p-4 text-sm" aria-label="研究阶段">
    <h2 className="font-semibold">研究阶段</h2>
    {value&&<>
      <p className="mt-2 break-all text-xs">父任务：{states[value.status]||value.status} · <Link className="underline" to={`/agent-run?case=${encodeURIComponent(value.profile.case_id)}`}>正式记录与人工复核</Link></p>
      <div className="mt-2 flex gap-2">{(value.status==='running'||value.status==='paused')&&<><button disabled={busy} className="rounded border px-2 py-1" onClick={()=>void control(value.status==='paused'?'resume':'pause')}>{value.status==='paused'?'恢复研究':'暂停研究'}</button><button disabled={busy} className="rounded border px-2 py-1" onClick={()=>void control('cancel')}>取消研究</button></>}</div>
      {value.profile.stages.map(def=>{const s=value.stages.find(item=>item.stage_id===def.node_id);return <div key={def.node_id} className="mt-3 rounded border p-2">
        <p>{def.title} · {s?(states[s.state]||s.state):'等待依赖'}{s?` · 子运行 ${states[s.child_status]||s.child_status}`:''}</p>
        <p className="my-1 text-xs text-muted-foreground">最多 {def.max_steps} 步 · 模型额度 {def.budget.model_calls} · 工具额度 {def.budget.tool_calls}</p>
        {s?.child_run_id&&<Link className="text-xs underline" to={`/agent-run?run=${encodeURIComponent(s.child_run_id)}&case=${encodeURIComponent(value.profile.case_id)}`}>查看子运行、审批与完整结果</Link>}
        {s?.artifact.gaps?.map(g=><p key={g.code} className="mt-1 text-xs">{g.code==='semantic_review_required'?'等待员工复核证据是否支持结论':'阶段未通过所选验收，已保留部分产物。'}</p>)}
        {s?.artifact.free_text_quality&&<p className="mt-1 text-xs text-muted-foreground">自由文本质量未认证</p>}
      </div>})}
      <BusinessQualityStatus caseId={value.profile.case_id} executionState={states[value.status]||value.status}/>
      <p className="mt-3 text-xs text-muted-foreground">预算统计请求意图；不代表实际费用。</p>
      {value.budgets.map(b=><p key={b.scope} className="mt-1 break-all text-xs">{b.scope}：模型 {b.usage.model_intents}/{b.limits.model_calls} · 工具 {b.usage.tool_intents}/{b.limits.tool_calls}</p>)}
      <p className="mt-2 text-xs">累计研究额度 · 模型 {value.recovery.usage.model_intents}/{value.recovery.limits.model_calls} · 工具 {value.recovery.usage.tool_intents}/{value.recovery.limits.tool_calls} · 执行版本 {value.recovery.revision}</p>
      {value.recovery.latest_run_id!==runId?<button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>onOpen(value.recovery.latest_run_id)}>查看最新补查版本</button>:['succeeded','failed','cancelled'].includes(value.status)&&<ResearchReplanPanel key={runId} runId={runId} caseId={value.profile.case_id} onStarted={onOpen}/>}
    </>}
    {error&&<p role="alert" className="mt-2 text-destructive">{error}</p>}
  </section>
}
