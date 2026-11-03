import { useEffect, useState } from 'react'
import { localApi } from '@/lib/localDevices'

type Assessment = { delivery_completeness:string;business_quality:string;free_text_report_quality:string;data_space:string;issues:{code:string}[] }
const labels:Record<string,string>={complete:'完整',incomplete:'有缺项',blocked:'已阻断',unknown:'未确认',passed:'通过结构化验收',qualified_partial:'合格的部分成果',needs_review:'待复核',failed:'未通过',unverified:'未验证'}
export function BusinessQualityStatus({caseId,executionState,validator='research.evidence.v1'}:{caseId:string;executionState?:string;validator?:string}) {
  const relations=validator==='research.relationships.v1'
  const [assessment,setAssessment]=useState<Assessment|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0)
  useEffect(()=>{
    const abort=new AbortController();setAssessment(null);setError(false)
    void localApi<Assessment>(`/api/business/cases/${encodeURIComponent(caseId)}/quality?validator=${encodeURIComponent(validator)}`,undefined,abort.signal)
      .then(value=>{if(!abort.signal.aborted)setAssessment(value)})
      .catch(()=>{if(!abort.signal.aborted)setError(true)})
    return ()=>abort.abort()
  },[caseId,revision,validator])
  return <section className="my-3 rounded-xl border border-border bg-secondary/30 p-3 text-sm" aria-label={relations?'关系记录验收状态':'业务验收状态'}>
    <p className="font-semibold">{relations?'关系记录验收':'业务验收'}{assessment ? ` · ${assessment.data_space}` : ''}</p>
    {executionState && <p className="mt-1">运行执行：{executionState}</p>}
    {error ? <p role="alert" className="mt-1 text-destructive">当前无法验收：请检查员工权限和来源授权。</p> : assessment ? <>
      <p className="mt-1">结构化交付：{labels[assessment.delivery_completeness]||assessment.delivery_completeness}；业务质量：{labels[assessment.business_quality]||assessment.business_quality}</p>
      <p className="mt-1 text-xs text-muted-foreground">{relations?'仅检查已声明关系的端点、证据、版本和人工复核；严格人脉路径仍未认证。':'自由文本报告仍需核对。结构化记录通过，不代表模型报告或真实供应商研究质量已经通过。'}</p>
      {assessment.issues.length>0 && <details className="mt-2"><summary className="cursor-pointer">{assessment.issues.length} 项验收说明</summary><ul>{assessment.issues.map((issue,i)=><li key={i} className="mt-1 font-mono text-xs">{issue.code}</li>)}</ul></details>}
    </> : <p className="mt-1 text-muted-foreground">正在读取当前权限和事实版本…</p>}
    <button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>setRevision(n=>n+1)}>{relations?'验收关系记录':'重新验收'}</button>
  </section>
}
