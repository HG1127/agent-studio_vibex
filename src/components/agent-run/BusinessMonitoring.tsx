import {useEffect,useRef,useState} from 'react'
import {localApi} from '@/lib/localDevices'
import {ToolResultReader} from './ToolResultReader'
import {useSearchParams} from 'react-router-dom'
import {useMonitorHistory,type MonitorCheck,type MonitorEvent} from './useMonitorHistory'

type Entity={record_id:string;version:number;payload:{canonical_name:string;entity_type:string;identity_status:string}}
type Schedule={id:string;name:string;target_kind:string;enabled:boolean}
type Source={source_id:string;tool:string;input:Record<string,unknown>;adapter_id:string;scope_key?:string;required_markers?:string[]}
type Definition={title:string;schedule_id:string;adapter_id:string;target_entity_ids:string[];relation_types:string[];sources:Source[];model_binding?:{connection_id:string;model_id:string;provider:string};execution_budget:{model_calls:number;tool_calls:number;read_calls:number;search_calls:number;closing_model_calls:number;wall_ms:number}}
type Monitor={monitor_id:string;case_id:string;schedule_id:string;schedule_revision:number|null;revision:number;enabled:boolean;blocked:boolean;definition:Definition|null;baseline_check_id:string;current_check_id:string}
type Review={check:MonitorCheck;preview_hash:string;records:{record_id:string;version:number;payload:Record<string,unknown>;source_refs:unknown[]}[];comparison:{events:unknown[];issues:unknown[]};receipts:{source_id:string;run_id:string;result_id:string}[]}
type SourceDraft={tool:string;input:string;adapter:string;scope:string;markers:string}
const statusLabels:Record<string,string>={collecting:'正在采集',freezing:'正在冻结输入',analyzing:'正在比较',needs_review:'待员工复核',incomplete:'检查未完成',complete:'检查已完成',blocked:'来源或配置不可用',cancelled:'已跳过',superseded:'旧定义检查已停止'}
const outcomeLabels:Record<string,string>={needs_review:'需核对来源与事实',needs_resolution:'仍有冲突或缺口',baseline_initialized:'已建立基线',unchanged:'无已确认的业务变化',changes:'有已确认的变化',collection_incomplete:'采集未完成',collection_stopped:'本次检查已停止，原基线保留'}
const eventLabels:Record<string,string>={additional_role:'新增角色，未推断原职结束',role_started:'新增任职',role_ended:'有明确结束依据',conflict:'关系事实冲突',source_invalidated:'事实依据已失效',fact_corrected:'已复核事实更正'}
const button='rounded border px-2 py-1 text-xs disabled:opacity-50'
export function BusinessMonitoring({caseId,initialMonitorId=''}:{caseId:string;initialMonitorId?:string}){
  const [params,setParams]=useSearchParams()
  const [open,setOpen]=useState(Boolean(initialMonitorId)),[items,setItems]=useState<Monitor[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]),[entities,setEntities]=useState<Entity[]>([]),[selected,setSelected]=useState(initialMonitorId)
  const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [title,setTitle]=useState(''),[scheduleId,setScheduleId]=useState(''),[targets,setTargets]=useState<string[]>([]),[sources,setSources]=useState<SourceDraft[]>([{tool:'',input:'{}',adapter:'http.json-items.v1',scope:'',markers:''}])
  const [models,setModels]=useState(20),[tools,setTools]=useState(30),[minutes,setMinutes]=useState(10),[editing,setEditing]=useState<Monitor|null>(null)
  const [relationTypes,setRelationTypes]=useState(['EMPLOYMENT','BOARD','CO_WORK'])
  const [preview,setPreview]=useState<{definition:Definition;preview_hash:string;proposal:Definition}|null>(null),[review,setReview]=useState<Review|null>(null),[rationale,setRationale]=useState(''),[confirmed,setConfirmed]=useState(false)
  const submitKey=useRef(''),draftRevision=useRef(0),route=`/api/business/cases/${encodeURIComponent(caseId)}`,monitor=items.find(m=>m.monitor_id===selected)
  const history=useMonitorHistory(open&&Boolean(monitor),selected,version,selected===initialMonitorId?params.get('check')||'':'',selected===initialMonitorId?params.get('event')||'':'')
  const checks=history.checks.page?.items||[],events=history.events.page?.items||[],focusedCheck=history.focusedCheck.data,focusedEvent=history.focusedEvent.data
  useEffect(()=>{if(initialMonitorId){setSelected(initialMonitorId);setOpen(true)}},[initialMonitorId])
  useEffect(()=>{if(!open)return;const abort=new AbortController()
    void Promise.all([localApi<{items:Schedule[]}>('/api/schedules',undefined,abort.signal),localApi<{items:Entity[]}>(route+'/query',{schema_id:'research.entity.v1',limit:50},abort.signal)])
      .then(([s,e])=>{if(!abort.signal.aborted){setSchedules(s.items.filter(v=>v.target_kind==='agent'));setEntities(e.items)}}).catch(()=>{if(!abort.signal.aborted){setEntities([]);setError('无法读取当前员工的计划与实体，请检查来源权限。')}})
    return ()=>abort.abort()
  },[open,route,version])
  useEffect(()=>{if(!open)return;const abort=new AbortController()
    void Promise.all([localApi<{items:Monitor[]}>(route+'/monitors',undefined,abort.signal),initialMonitorId?localApi<Monitor>(`/api/business/monitors/${encodeURIComponent(initialMonitorId)}`,undefined,abort.signal).catch(()=>null):Promise.resolve(null)])
      .then(([r,direct])=>{if(!abort.signal.aborted){const rows=direct?.case_id===caseId&&!r.items.some(m=>m.monitor_id===direct.monitor_id)?[direct,...r.items]:r.items;setItems(rows);setSelected(id=>rows.some(m=>m.monitor_id===id)?id:initialMonitorId||rows[0]?.monitor_id||'');if(initialMonitorId&&(!direct||direct.case_id!==caseId))setError('链接中的监测不存在于当前任务或当前员工无权读取。')}}).catch(()=>{if(!abort.signal.aborted){setItems([]);setReview(null);setError('监测读取失败，请检查员工登录和权限。')}})
    return ()=>abort.abort()
  },[open,route,version,initialMonitorId,caseId])
  useEffect(()=>{setReview(null)},[selected])
  const blocked=checks.some(c=>c.status==='blocked')||focusedCheck?.status==='blocked'||history.checks.error||history.focusedCheck.error
  useEffect(()=>{if(blocked)setReview(null)},[blocked])
  const pending=[...checks,...(focusedCheck?[focusedCheck]:[])].some(c=>['collecting','freezing','analyzing'].includes(c.status))
  useEffect(()=>{if(!open||!pending)return;const timer=window.setInterval(()=>setVersion(v=>v+1),3000);return ()=>window.clearInterval(timer)},[open,pending])
  function changed(){draftRevision.current++;setPreview(null);submitKey.current=''}
  function editSource(index:number,patch:Partial<SourceDraft>){changed();setSources(values=>values.map((v,i)=>i===index?{...v,...patch}:v))}
  async function makePreview(){setBusy(true);setError('');setPreview(null)
    const revision=draftRevision.current
    try{const proposal:Definition={title,schedule_id:scheduleId,adapter_id:'research.relationship-events.v1',target_entity_ids:targets,relation_types:relationTypes,sources:sources.map((s,i)=>({source_id:'source_'+(i+1),tool:s.tool,input:JSON.parse(s.input),adapter_id:s.adapter,...(s.adapter==='http.json-items.v1'?{scope_key:s.scope}:{required_markers:s.markers.split('\n').map(s=>s.trim()).filter(Boolean)})})),execution_budget:{model_calls:models,tool_calls:tools,read_calls:tools,search_calls:0,closing_model_calls:1,wall_ms:minutes*60000}}
      const result=await localApi<{definition:Definition;preview_hash:string}>(route+'/monitors/preview',proposal);if(revision===draftRevision.current){setPreview({...result,proposal});submitKey.current=crypto.randomUUID()}
    }catch{setError('预览未通过。请选择已确认人物和本人采集计划，核对来源工具、请求参数、完整性适配器与预算。')}finally{setBusy(false)}
  }
  async function save(){if(!preview)return;setBusy(true);setError('')
    try{const result=await localApi<Monitor>(editing?`/api/business/monitors/${encodeURIComponent(editing.monitor_id)}/definition`:route+'/monitors',{definition:preview.proposal,preview_hash:preview.preview_hash,idempotency_key:submitKey.current,...(editing?{expected_revision:editing.revision}:{})});setSelected(result.monitor_id);setPreview(null);setEditing(null);submitKey.current='';setVersion(v=>v+1)}catch{setError('提交尚未确认；重试保留原请求。配置已变化时请重新预览。')}finally{setBusy(false)}
  }
  async function control(m:Monitor){setBusy(true);setError('');try{await localApi(`/api/business/monitors/${encodeURIComponent(m.monitor_id)}/control`,{enabled:!m.enabled,expected_revision:m.revision,expected_schedule_revision:m.schedule_revision,...(!m.enabled?{next_at_ms:Date.now()+5000}:{})});setVersion(v=>v+1)}catch{setError('控制未完成，请刷新查看计划或来源是否已变化。')}finally{setBusy(false)}}
  async function openReview(id:string){setBusy(true);setError('');setReview(null);setRationale('');setConfirmed(false);try{setReview(await localApi<Review>(`/api/business/monitor-checks/${encodeURIComponent(id)}/review-preview`))}catch{setError('输入、版本或权限已变化，不能复用旧复核。')}finally{setBusy(false)}}
  async function accept(){if(!review)return;setBusy(true);setError('');try{await localApi(`/api/business/monitor-checks/${encodeURIComponent(review.check.check_id)}/review`,{preview_hash:review.preview_hash,rationale});setReview(null);setVersion(v=>v+1)}catch{setError('复核未确认提交，请刷新核对当前输入与基线。')}finally{setBusy(false)}}
  async function discard(){if(!review)return;setBusy(true);setError('');try{await localApi(`/api/business/monitor-checks/${encodeURIComponent(review.check.check_id)}/discard`,{rationale});setReview(null);setVersion(v=>v+1)}catch{setError('跳过未完成，请刷新查看检查状态。')}finally{setBusy(false)}}
  function edit(m:Monitor){if(!m.definition)return;changed();setEditing(m);setTitle(m.definition.title);setScheduleId(m.schedule_id);setTargets(m.definition.target_entity_ids);setRelationTypes(m.definition.relation_types);setSources(m.definition.sources.map(s=>({tool:s.tool,input:JSON.stringify(s.input,null,2),adapter:s.adapter_id,scope:s.scope_key||'',markers:(s.required_markers||[]).join('\n')})));setModels(m.definition.execution_budget.model_calls);setTools(m.definition.execution_budget.tool_calls);setMinutes(m.definition.execution_budget.wall_ms/60000)}
  function select(id:string){setSelected(id);setParams(previous=>{const next=new URLSearchParams(previous);next.set('monitor',id);next.delete('check');next.delete('event');return next},{replace:true})}
  function locate(event:MonitorEvent){setParams(previous=>{const next=new URLSearchParams(previous);next.set('monitor',selected);next.set('check',event.check_id);next.set('event',event.event_id);return next},{replace:true})}
  function locateCheck(id:string){setParams(previous=>{const next=new URLSearchParams(previous);next.set('monitor',selected);next.set('check',id);next.delete('event');return next},{replace:true})}
  async function markRead(id:string){setBusy(true);setError('');try{await localApi(`/api/business/monitor-events/${encodeURIComponent(id)}/read`,{});setVersion(v=>v+1)}catch{setError('未读状态尚未更新。')}finally{setBusy(false)}}
  const entityName=(id:string)=>entities.find(e=>e.record_id===id)?.payload.canonical_name||id
  return <details open={open} className="mt-3 rounded border p-3" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">持续监测与语义变化</summary>
    <p className="mt-2 text-xs text-muted-foreground">关联本人已有的采集 Agent 计划。首次基线和来源变化需员工核对；相同事实保持安静。采集失败不会推进基线。事件保存在应用内。</p>
    <p className="mt-1 text-xs text-muted-foreground">暂停会停止本次未验收检查，保留已确认基线和历史依据。计划编辑后须重新预览监测范围。</p>
    <button type="button" className={button+' mt-2'} onClick={()=>{setError('');setVersion(v=>v+1)}}>刷新监测</button>
    <div className="mt-2 flex flex-wrap gap-2">{items.map(m=><button type="button" key={m.monitor_id} className={button} aria-pressed={selected===m.monitor_id} onClick={()=>select(m.monitor_id)}>{m.definition?.title||'不可读取的监测'} · {m.blocked?'来源或配置受阻':m.enabled?'已启用':'已暂停'}</button>)}</div>
    {monitor&&<div className="mt-3 rounded border p-2 text-xs">
      <p>监测版本 {monitor.revision} · {monitor.baseline_check_id?'已有固定基线':'尚无已验收基线'}</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy||(monitor.blocked&&!monitor.enabled)} className={button} onClick={()=>void control(monitor)}>{monitor.enabled?'暂停监测与计划':'启用监测与计划'}</button><button type="button" disabled={busy||!monitor.definition} className={button} onClick={()=>edit(monitor)}>修改监测定义</button></div>
      {(params.get('check')||params.get('event'))&&selected===initialMonitorId&&<section aria-label="消息定位" className="mt-3 rounded border p-2"><p className="font-medium">消息关联的历史检查与事件</p>
        {(history.focusedCheck.loading||history.focusedEvent.loading)&&<p>正在核对消息来源…</p>}
        {(history.focusedCheck.error||history.focusedEvent.error)&&<p role="alert">消息不存在、不属于当前监测或当前来源不可读取。</p>}
        {focusedEvent&&<EventCard event={focusedEvent} name={entityName} busy={busy} onRead={markRead}/>}
        {focusedCheck&&<CheckCard check={focusedCheck} busy={busy} onReview={openReview} showSources/>}
      </section>}
      <p className="mt-3 font-medium">检查历史 · 第 {history.checks.index} 页</p>
      {history.checks.error&&<p role="alert">检查历史当前不可读取，请刷新重试。</p>}
      {checks.filter(c=>c.check_id!==focusedCheck?.check_id).map(c=><CheckCard key={c.check_id} check={c} busy={busy} onReview={openReview} onLocate={locateCheck}/>)}
      <PageControls label="检查" state={history.checks}/>
      <p className="mt-3 font-medium">本页变化事件（{events.filter(e=>!e.read_ms).length} 条未读） · 第 {history.events.index} 页</p>
      {history.events.error?<p role="alert">事件当前不可读取，请刷新重试。</p>:events.length===0&&!history.events.loading&&<p className="mt-1 text-muted-foreground">本页暂无当前可读取的业务变化事件。</p>}
      {events.filter(event=>event.event_id!==focusedEvent?.event_id).map(event=><EventCard key={event.event_id} event={event} name={entityName} busy={busy} onRead={markRead} onLocate={locate}/>)}
      <PageControls label="事件" state={history.events}/>
    </div>}
    {review&&<section aria-label="监测检查复核" className="mt-3 rounded border p-3 text-xs"><p className="font-medium">核对全部声明来源、人物身份、引文与有效时间</p>
      {review.receipts.map(r=><div key={r.source_id} className="mt-2"><p>来源 {r.source_id}</p><ToolResultReader runId={r.run_id} resultId={r.result_id}/></div>)}
      {review.records.map(r=><div key={r.record_id} className="mt-2 rounded border p-2"><p>{entityName(String(r.payload.from_id))} → {entityName(String(r.payload.to_id))} · v{r.version}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({payload:r.payload,source_refs:r.source_refs},null,2)}</pre></div>)}
      <details className="mt-2"><summary>差异与待解决项</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(review.comparison,null,2)}</pre></details>
      <label className="mt-2 block">复核说明<textarea className="mt-1 w-full rounded border bg-background p-2" rows={2} maxLength={4000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
      <label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>已核对所有显示的来源范围、主体、逐字引文、版本和有效时间</label>
      <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={busy||!confirmed||!rationale.trim()} onClick={()=>void accept()}>确认本次范围与事实</button><button type="button" className={button} disabled={busy||!rationale.trim()} onClick={()=>void discard()}>跳过本次，保留原基线</button><button type="button" className={button} onClick={()=>setReview(null)}>关闭复核</button></div>
    </section>}
    <details className="mt-3"><summary>{editing?'修改监测定义（保存后需重新启用）':'新建监测定义'}</summary>
      <label className="mt-2 block text-xs">监测标题<input className="mt-1 w-full rounded border bg-background p-2" value={title} maxLength={300} onChange={e=>{changed();setTitle(e.target.value)}}/></label>
      <label className="mt-2 block text-xs">关联采集计划<select className="ml-2 max-w-full rounded border bg-background p-1" disabled={Boolean(editing)} value={scheduleId} onChange={e=>{changed();setScheduleId(e.target.value)}}><option value="">选择本人 Agent 计划</option>{schedules.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <p className="mt-1 text-xs text-muted-foreground">请先在定时任务中创建采集 Agent 计划，选择已验证模型，并为方案选择业务写入及来源工具。保存监测会暂停关联计划并建立新版本基线；历史检查与事件保留，审核后再启用。</p>
      <fieldset className="mt-2"><legend className="text-xs">关注人物（已确认身份，每类列表最多 50 条）</legend>{entities.filter(e=>e.payload.entity_type==='PERSON').map(e=><label key={e.record_id} className="mt-1 flex gap-2 text-xs"><input type="checkbox" disabled={e.payload.identity_status!=='CONFIRMED'&&!targets.includes(e.record_id)} checked={targets.includes(e.record_id)} onChange={v=>{changed();setTargets(ids=>v.target.checked?[...ids,e.record_id]:ids.filter(id=>id!==e.record_id))}}/>{e.payload.canonical_name} · {e.record_id}{e.payload.identity_status!=='CONFIRMED'?'（身份待确认）':''}</label>)}</fieldset>
      <fieldset className="mt-2"><legend className="text-xs">关系范围</legend>{[{id:'EMPLOYMENT',title:'任职'},{id:'BOARD',title:'董事会'},{id:'CO_WORK',title:'共事'}].map(t=><label key={t.id} className="mr-3 inline-flex gap-1 text-xs"><input type="checkbox" checked={relationTypes.includes(t.id)} onChange={e=>{changed();setRelationTypes(v=>e.target.checked?[...v,t.id]:v.filter(id=>id!==t.id))}}/>{t.title}</label>)}</fieldset>
      {sources.map((s,i)=><fieldset className="mt-3 rounded border p-2 text-xs" key={i}><legend>采集来源 {i+1}</legend><label className="block">来源工具名<input className="ml-2 rounded border bg-background p-1" value={s.tool} onChange={e=>editSource(i,{tool:e.target.value})}/></label><label className="mt-2 block">完整性适配器<select className="ml-2 rounded border bg-background p-1" value={s.adapter} onChange={e=>editSource(i,{adapter:e.target.value,...(e.target.value==='web.text.v1'?{tool:'web_fetch'}:{})})}><option value="http.json-items.v1">已验证 GET 接口的完整列表</option><option value="web.text.v1">单页正文及预期标记</option></select></label>
        {s.adapter==='http.json-items.v1'?<label className="mt-2 block">接口数据范围标识<input className="ml-2 rounded border bg-background p-1" value={s.scope} onChange={e=>editSource(i,{scope:e.target.value})}/></label>:<label className="mt-2 block">预期正文标记（每行一项）<textarea className="mt-1 w-full rounded border bg-background p-1" value={s.markers} onChange={e=>editSource(i,{markers:e.target.value})}/></label>}
        <label className="mt-2 block">精确请求参数 JSON<textarea className="mt-1 w-full rounded border bg-background p-1 font-mono" rows={3} value={s.input} onChange={e=>editSource(i,{input:e.target.value})}/></label>{sources.length>1&&<button type="button" className={button+' mt-1'} onClick={()=>{changed();setSources(v=>v.filter((_,n)=>n!==i))}}>移除此来源</button>}</fieldset>)}
      <button type="button" className={button+' mt-2'} disabled={sources.length>=10} onClick={()=>{changed();setSources(v=>[...v,{tool:'',input:'{}',adapter:'http.json-items.v1',scope:'',markers:''}])}}>增加来源</button>
      <div className="mt-2 flex flex-wrap gap-2 text-xs"><label>每次模型请求上限<input aria-label="监测模型请求上限" className="ml-1 w-16 rounded border bg-background p-1" type="number" min={2} max={500} value={models} onChange={e=>{changed();setModels(Number(e.target.value))}}/></label><label>工具请求上限<input className="ml-1 w-16 rounded border bg-background p-1" type="number" min={1} max={200} value={tools} onChange={e=>{changed();setTools(Number(e.target.value))}}/></label><label>每次最长分钟<input className="ml-1 w-16 rounded border bg-background p-1" type="number" min={1} max={1440} value={minutes} onChange={e=>{changed();setMinutes(Number(e.target.value))}}/></label></div>
      <button type="button" className={button+' mt-2'} disabled={busy||!title.trim()||!scheduleId||!targets.length||!relationTypes.length} onClick={()=>void makePreview()}>预览监测范围</button>{editing&&<button type="button" className={button+' ml-2'} onClick={()=>{changed();setEditing(null)}}>取消修改</button>}
      {preview&&<div className="mt-2 rounded border p-2 text-xs"><p>关注 {preview.definition.target_entity_ids.length} 位人物、{preview.definition.sources.length} 个精确来源请求；仅应用内事件。首次基线或来源变化需员工复核，未知时间与冲突保留为待解决项。</p><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({model_binding:preview.definition.model_binding,relation_types:preview.proposal.relation_types,sources:preview.proposal.sources,budget:preview.definition.execution_budget},null,2)}</pre><button type="button" className={button+' mt-2'} disabled={busy} onClick={()=>void save()}>确认范围并暂停关联计划</button></div>}
    </details>
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </details>
}

function CheckCard({check:c,busy,onReview,showSources=false,onLocate}:{check:MonitorCheck;busy:boolean;onReview:(id:string)=>Promise<void>;showSources?:boolean;onLocate?:(id:string)=>void}){
  return <article aria-label={'监测检查 '+c.check_id} className="mt-2 border-t pt-2"><p>定义版本 {c.revision} · {statusLabels[c.status]||c.status} · {outcomeLabels[c.assessment.semantic_state||'']||''} · {new Date(c.created_ms).toLocaleString()}</p><p>基线{c.assessment.baseline_advanced?'已推进':'未推进'}{c.error?' · '+c.error:''}</p>
    {c.assessment.semantic_state&&<details className="mt-1"><summary className="cursor-pointer">检查差异与依据</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(c.assessment,null,2)}</pre></details>}
    {c.run_available?<a className="underline" href={'/run-detail?run='+encodeURIComponent(c.run_id)}>查看采集运行</a>:<span className="text-muted-foreground">无可打开的采集运行记录</span>}
    {onLocate&&<button type="button" className={button+' ml-2'} onClick={()=>onLocate(c.check_id)}>打开检查依据</button>}
    {c.status==='needs_review'&&<button type="button" className={button+' ml-2'} disabled={busy} onClick={()=>void onReview(c.check_id)}>复核本次检查</button>}
    {showSources&&c.fact_set_id&&<p className="mt-1 break-all">固定事实集：{c.fact_set_id}</p>}
    {showSources&&(c.receipts||[]).map(r=><div key={r.source_id} className="mt-2"><p>历史来源 {r.source_id}</p><ToolResultReader runId={r.run_id} resultId={r.result_id}/></div>)}
  </article>
}
function EventCard({event,name,busy,onRead,onLocate}:{event:MonitorEvent;name:(id:string)=>string;busy:boolean;onRead:(id:string)=>Promise<void>;onLocate?:(event:MonitorEvent)=>void}){
  return <article aria-label={'监测事件 '+event.event_id} className="mt-2 rounded border p-2"><p>{eventLabels[event.kind]||event.kind} · {name(event.payload.fact.from_id)} → {name(event.payload.fact.to_id)}</p><p>{event.payload.fact.valid_from||'开始时间未知'} 至 {event.payload.fact.valid_to||'结束时间未知'}</p><p className="text-muted-foreground">定义版本 {event.revision} · {new Date(event.created_ms).toLocaleString()} · {event.read_ms?'已读':'未读'}</p>
    {onLocate&&<button type="button" className={button+' mt-1 mr-2'} onClick={()=>onLocate(event)}>查看事件依据</button>}
    {!event.read_ms&&<button type="button" disabled={busy} className={button+' mt-1'} onClick={()=>void onRead(event.event_id)}>标为已读</button>}
  </article>
}
function PageControls({label,state}:{label:string;state:{page:{has_more:boolean}|null;index:number;loading:boolean;previous:()=>void;first:()=>void;next:()=>void}}){
  return <div className="mt-2 flex flex-wrap gap-2" aria-label={label+'分页'}>
    {state.loading&&<span role="status">正在读取{label}…</span>}
    {state.index>1&&<><button type="button" className={button} disabled={state.loading} onClick={state.first}>返回{label}首页</button><button type="button" className={button} disabled={state.loading} onClick={state.previous}>上一页{label}</button></>}
    {state.page?.has_more&&<button type="button" className={button} disabled={state.loading} onClick={state.next}>下一页{label}</button>}
  </div>
}
