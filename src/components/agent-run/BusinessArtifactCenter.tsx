import {useCallback,useEffect,useRef,useState} from 'react'
import {localApi} from '@/lib/localDevices'
import {getPocketBaseUrl} from '@/lib/pb'
import {vibexAuthHeaders} from '@/lib/studioAuth'

type Format='html'|'md'|'docx'|'pdf'|'xlsx'
type Job={job_id:string;type:string;status:string;error:string;progress:{schema_index:number;record_count:number};artifact:{fact_set_id?:string;report_id?:string}}
type Report={report_id:string;fact_set_id:string;template_id:string;format:Format;file_ready:boolean;manifest:{data_space:string;quality_snapshot:string}}
const states:Record<string,string>={queued:'等待 Worker',running:'处理中',succeeded:'已完成',failed:'失败',cancelled:'已取消',blocked:'来源不可用'}
const templates=[{id:'research.brief.v1',title:'简报'},{id:'research.full.v1',title:'完整报告'},{id:'research.relationships.v1',title:'关系专题'}]
const errors:Record<string,string>={report_pdf_font_missing:'PDF 字体未配置，请配置 Worker 字体后重新生成。',report_pdf_glyph_missing:'PDF 字体不包含所需字符，请更换 Worker 字体。',report_pdf_text_direction_unsupported:'该 PDF 排版暂不支持原文书写方向。',report_renderer_timeout:'文件生成超时，请检查文件长度和 Worker。'}
export function BusinessArtifactCenter({caseId}:{caseId:string}){
  const [jobs,setJobs]=useState<Job[]>([]),[reports,setReports]=useState<Report[]>([]),[factSet,setFactSet]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0)
  const [template,setTemplate]=useState('research.brief.v1')
  const submitKey=useRef(''),renderKeys=useRef<Record<string,string>>({})
  const renderJobs=useRef<Record<string,string>>({})
  const route=`/api/business/cases/${encodeURIComponent(caseId)}`
  const refresh=useCallback(()=>setVersion(v=>v+1),[])
  const pending=jobs.some(j=>j.status==='queued'||j.status==='running')
  useEffect(()=>{
    const abort=new AbortController()
    void Promise.all([localApi<{items:Job[]}>(route+'/jobs',undefined,abort.signal),localApi<{items:Report[]}>(route+'/reports',undefined,abort.signal)])
      .then(([j,r])=>{if(!abort.signal.aborted){
        for(const job of j.items)if((job.status==='failed'||job.status==='cancelled')&&renderJobs.current[job.job_id]){delete renderKeys.current[renderJobs.current[job.job_id]];delete renderJobs.current[job.job_id]}
        setJobs(j.items.filter(item=>item.type==='research.freeze.v1'||item.type==='research.report.v1'));setReports(r.items);setError('');setFactSet(current=>current||j.items.find(item=>item.type==='research.freeze.v1'&&item.artifact.fact_set_id)?.artifact.fact_set_id||r.items[0]?.fact_set_id||'')
      }})
      .catch(()=>{if(!abort.signal.aborted){setJobs([]);setReports([]);setFactSet('');setError('产物读取未完成，请检查登录和来源权限。')}})
    return ()=>abort.abort()
  },[route,version])
  useEffect(()=>{if(!pending)return;const timer=window.setInterval(refresh,2000);return ()=>window.clearInterval(timer)},[pending,refresh])
  async function submit(){
    setBusy(true);setError('')
    submitKey.current ||= crypto.randomUUID()
    try{await localApi(route+'/jobs',{type:'research.freeze.v1',idempotency_key:submitKey.current});submitKey.current='';refresh()}
    catch{setError('任务未确认提交。重试沿用同一幂等键，请检查登录、问题范围与 Worker。')}
    finally{setBusy(false)}
  }
  async function cancel(id:string){
    setBusy(true);setError('')
    try{await localApi(`/api/business/jobs/${encodeURIComponent(id)}/cancel`,{});refresh()}
    catch{setError('取消未完成，请刷新查看任务当前状态。')}
    finally{setBusy(false)}
  }
  async function render(template_id:string,format:Format){
    setBusy(true);setError('')
    const key=factSet+':'+template_id+':'+format
    renderKeys.current[key] ||= crypto.randomUUID()
    try{const result=await localApi<{job_id?:string}>(route+'/reports',{fact_set_id:factSet,template_id,format,idempotency_key:renderKeys.current[key]});if(result.job_id)renderJobs.current[result.job_id]=key;refresh()}
    catch{setError('文件未确认生成，请检查事实集与来源权限；重试沿用原幂等键。')}
    finally{setBusy(false)}
  }
  async function download(report:Report){
    setBusy(true);setError('')
    try{
      const response=await fetch(getPocketBaseUrl()+route+`/reports/${encodeURIComponent(report.report_id)}/download`,{headers:vibexAuthHeaders()})
      if(!response.ok)throw Error('download_failed')
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a')
      anchor.href=url;anchor.download=`research-${report.report_id}.${report.format}`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch{setError('下载未完成，文件或来源权限可能已失效。')}
    finally{setBusy(false)}
  }
  return <details className="mt-3 rounded border p-3">
    <summary className="cursor-pointer font-medium">事实集与报告</summary>
    <p className="mt-2 text-xs text-muted-foreground">冻结固定版本，再从同一事实集生成简报、完整报告或关系专题。办公文件由 Worker 生成，PDF 需要包含原文字符的字体。后续补查另建事实集；下载检查当前来源权限。文件生成成功与研究质量分别展示。</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={busy||pending} className="rounded border px-3 py-1 text-xs disabled:opacity-50" onClick={()=>void submit()}>冻结当前事实集</button>
      <button type="button" className="rounded border px-3 py-1 text-xs" onClick={refresh}>刷新产物</button>
    </div>
    {jobs.map(job=><div key={job.job_id} className="mt-2 text-xs">
      <span>{job.type==='research.report.v1'?'文件生成':'事实集冻结'} · {states[job.status]||job.status}{job.type==='research.freeze.v1'?` · ${job.progress.record_count} 条`:''} · <code>{job.job_id}</code>{job.error?` · ${errors[job.error]||job.error}`:''}</span>
      {(job.status==='running'||job.status==='queued')&&<button type="button" disabled={busy} className="ml-2 rounded border px-2 py-1" onClick={()=>void cancel(job.job_id)}>取消任务</button>}
    </div>)}
    <label className="mt-3 block text-xs">报告事实集<select className="ml-2 max-w-full rounded border bg-background p-1" value={factSet} onChange={e=>setFactSet(e.target.value)}>
      <option value="">请选择已冻结事实集</option>
      {[...new Set(jobs.filter(j=>j.type==='research.freeze.v1'&&j.status==='succeeded').map(j=>j.artifact.fact_set_id).concat(reports.map(r=>r.fact_set_id)).filter((id):id is string=>Boolean(id)))].map(id=><option key={id} value={id}>{id}</option>)}
    </select></label>
    <div className="mt-2 flex flex-wrap gap-2">
      {templates.flatMap(t=>(['html','md'] as const).map(format=><button key={t.id+format} type="button" disabled={busy||!factSet} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={()=>void render(t.id,format)}>生成{t.title} {format.toUpperCase()}</button>))}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="text-xs">办公文件模板<select className="ml-2 rounded border bg-background p-1" value={template} onChange={e=>setTemplate(e.target.value)}>{templates.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      {(['docx','pdf','xlsx'] as const).map(format=><button key={format} type="button" disabled={busy||!factSet} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={()=>void render(template,format)}>生成 {format.toUpperCase()}</button>)}
    </div>
    {reports.map(report=><div key={report.report_id} className="mt-2 rounded border p-2 text-xs">
      <p className="break-all">{templates.find(t=>t.id===report.template_id)?.title||report.template_id} · {report.format.toUpperCase()} · {report.manifest.data_space} · <code>{report.fact_set_id}</code></p>
      <p>{report.template_id==='research.relationships.v1'?'关系记录质量':'问题记录质量'}：{report.manifest.quality_snapshot}；自由文本报告质量：未验证。</p>
      {report.file_ready&&<button type="button" disabled={busy} className="mt-1 rounded border px-2 py-1" onClick={()=>void download(report)}>下载文件</button>}
    </div>)}
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </details>
}
