import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { localApi } from '@/lib/localDevices'
import { BusinessQualityStatus } from './BusinessQualityStatus'
import {BusinessArtifactCenter} from './BusinessArtifactCenter'
import {BusinessMaterials} from './BusinessMaterials'
import {BusinessMonitoring} from './BusinessMonitoring'

type BusinessCase = { case_id:string; title:string; data_space:'LIVE'|'DEMO'; questions:{question_id:string;question:string}[] }
type BusinessRecord = {record_id:string;version:number;schema_id:string;payload:Record<string,unknown>;source_refs:unknown[]}

function ClaimReview({caseId,record}:{caseId:string;record:BusinessRecord}) {
  const [rationale,setRationale]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  async function submit(decision:'accepted'|'rejected'){
    setBusy(true);setMessage('')
    try{await localApi(`/api/business/cases/${encodeURIComponent(caseId)}/reviews`,{record_id:record.record_id,record_version:record.version,decision,rationale});setMessage('已记录本员工对当前版本的人工复核；请点击重新验收。')}
    catch{setMessage('复核未保存：请检查登录、来源权限和记录版本。')}
    finally{setBusy(false)}
  }
  return <div className="mt-2 rounded border p-2">
    <p className="text-xs text-muted-foreground">人工复核：请核对原文主体、否定、上下文与时间。模型不能通过内部工具提交人工复核。</p>
    <label className="mt-2 block text-xs">复核依据<textarea className="mt-1 w-full rounded border bg-background p-2" rows={2} value={rationale} maxLength={4000} onChange={e=>setRationale(e.target.value)} /></label>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={busy||!rationale.trim()} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={()=>void submit('accepted')}>人工确认引文支持</button>
      <button type="button" disabled={busy||!rationale.trim()} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={()=>void submit('rejected')}>记录不支持</button>
    </div>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>
}

export function BusinessCaseBinding() {
  const [params,setParams]=useSearchParams(),caseId=params.get('case') || ''
  const [draftId,setDraftId]=useState(caseId),[title,setTitle]=useState(''),[questions,setQuestions]=useState('')
  const [space,setSpace]=useState<'LIVE'|'DEMO'>('DEMO'),[current,setCurrent]=useState<BusinessCase|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[records,setRecords]=useState<BusinessRecord[]>([])
  const recordRead=useRef<AbortController|null>(null)
  useEffect(()=>{
    const abort=new AbortController();setCurrent(null);setRecords([]);setDraftId(caseId);setError('');setBusy(false)
    if(caseId)void localApi<BusinessCase>(`/api/business/cases/${encodeURIComponent(caseId)}`,undefined,abort.signal)
      .then(value=>{if(!abort.signal.aborted)setCurrent(value)})
      .catch(()=>{if(!abort.signal.aborted)setError('业务任务不存在或当前员工无权读取，请检查任务 ID。')})
    return ()=>{abort.abort();recordRead.current?.abort()}
  },[caseId])
  function bind(id:string){setParams(previous=>{const next=new URLSearchParams(previous);if(id!==previous.get('case')){next.delete('question');next.delete('monitor');next.delete('check');next.delete('event')}if(id)next.set('case',id);else next.delete('case');return next},{replace:true})}
  async function create(){
    setBusy(true);setError('')
    try{const c=await localApi<BusinessCase>('/api/business/cases',{title,data_space:space,questions:questions.split('\n').map(q=>q.trim()).filter(Boolean)});bind(c.case_id)}
    catch{setError('创建未完成：请填写标题和 1–20 个问题，并检查员工登录状态。')}
    finally{setBusy(false)}
  }
  async function loadRecords(){
    recordRead.current?.abort();const abort=new AbortController();recordRead.current=abort
    setBusy(true);setError('');setRecords([])
    try{
      const schemas=['research.entity.v1','research.claim.v1','research.answer.v1','research.relation.v1']
      const results=await Promise.all(schemas.map(schema_id=>localApi<{items:BusinessRecord[]}>(`/api/business/cases/${encodeURIComponent(caseId)}/query`,{schema_id,offset:0,limit:50},abort.signal)))
      if(!abort.signal.aborted)setRecords(results.flatMap(value=>value.items))
    }catch{if(!abort.signal.aborted)setError('记录读取未完成：来源权限可能已撤销，请检查授权。')}
    finally{if(!abort.signal.aborted)setBusy(false)}
  }
  return <details open={Boolean(params.get('monitor'))} className="mt-3 rounded-xl border border-border p-3 text-sm">
    <summary className="cursor-pointer font-medium">跨运行业务任务{current ? ` · ${current.title}（${current.data_space}）` : '（可选）'}</summary>
    <p className="mt-2 text-xs text-muted-foreground">同一任务 ID 可供多次运行续查。正式记录采用受控类型、原文定位与版本；一般经验记忆不会更新这些记录。业务写入工具需在 Agent 方案中显式选择。</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <label className="flex-1">任务 ID<input aria-label="业务任务 ID" className="mt-1 w-full rounded border bg-background p-2" value={draftId} onChange={e=>setDraftId(e.target.value)} /></label>
      <button type="button" className="self-end rounded border px-3 py-2" onClick={()=>bind(draftId.trim())}>绑定任务</button>
      {caseId && <button type="button" className="self-end rounded border px-3 py-2" onClick={()=>bind('')}>解除绑定</button>}
    </div>
    {current && <div className="mt-3">
      <BusinessQualityStatus key={caseId} caseId={caseId} />
      <BusinessQualityStatus key={caseId+':relations'} caseId={caseId} validator="research.relationships.v1" />
      <label className="mt-2 block text-xs">本次补查的问题（可选）<select className="ml-2 max-w-full rounded border bg-background p-1" value={params.get('question')||''} onChange={e=>{const question=e.target.value;setParams(previous=>{const next=new URLSearchParams(previous);if(question)next.set('question',question);else next.delete('question');return next},{replace:true})}}>
        <option value="">整个任务</option>{current.questions.map(q=><option key={q.question_id} value={q.question_id}>{q.question}</option>)}
      </select></label>
      <BusinessArtifactCenter key={'artifacts:'+caseId} caseId={caseId}/>
      <BusinessMaterials key={'materials:'+caseId} caseId={caseId}/>
      <BusinessMonitoring key={'monitoring:'+caseId} caseId={caseId} initialMonitorId={params.get('monitor')||''}/>
      <ul>{current.questions.map(q=><li key={q.question_id} className="mt-1">{q.question} <code className="text-xs text-muted-foreground">{q.question_id}</code></li>)}</ul>
      <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2" onClick={()=>void loadRecords()}>读取正式记录（每类前 50 条）</button>
      {records.map(record=><details key={record.record_id} className="mt-2 rounded border p-2">
        <summary className="cursor-pointer break-all">{String(record.payload.canonical_name || record.payload.predicate || record.payload.question_id || record.schema_id)} · v{record.version} · {record.record_id}</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(record,null,2)}</pre>
        {(record.schema_id==='research.claim.v1'||record.schema_id==='research.relation.v1') && record.payload.status==='SOURCE_SUPPORTED' && <ClaimReview key={`${record.record_id}:${record.version}`} caseId={caseId} record={record} />}
      </details>)}
    </div>}
    <details className="mt-3"><summary className="cursor-pointer">新建业务任务</summary>
      <label className="mt-2 block">任务标题<input className="mt-1 w-full rounded border bg-background p-2" value={title} maxLength={300} onChange={e=>setTitle(e.target.value)} /></label>
      <label className="mt-2 block">关键问题（每行一个）<textarea className="mt-1 w-full rounded border bg-background p-2" rows={3} value={questions} onChange={e=>setQuestions(e.target.value)} /></label>
      <label className="mt-2 block">数据空间 <select className="rounded border bg-background p-1" value={space} onChange={e=>setSpace(e.target.value as 'LIVE'|'DEMO')}><option value="DEMO">DEMO · 合成验收资料</option><option value="LIVE">LIVE · 正式授权资料</option></select></label>
      <button type="button" disabled={busy||!title.trim()||!questions.trim()} className="mt-2 rounded border px-3 py-2 disabled:opacity-50" onClick={()=>void create()}>创建并绑定任务</button>
    </details>
    {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
  </details>
}
