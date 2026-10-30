import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {useSearchParams} from 'react-router-dom'
import {confirmInStudio} from '@/lib/studioDialogs'
import {getPocketBaseUrl} from '@/lib/pb'
import {decodeRhToken,vibexAuthHeaders} from '@/lib/studioAuth'
import {nextScheduleTime,zonedDateString,type ScheduleRule} from '@/lib/scheduleTime.js'
import {registerUnsavedWorkCheck} from '@/lib/unsavedNavigation'
import {buildScheduleTiming,filterSchedules,schedulePage,scheduleTimingKey} from '@/lib/scheduleWorkspace'
import {defaultScheduleForm,type ScheduleForm,type ScheduleHistory,type ScheduleTask,type Target,type TargetKind,type ModelConnection} from './types'

const MESSAGES:Record<string,string>={schedule_changed:'此计划已被其他页面修改。你的输入仍保留；请关闭后重新读取计划再编辑。',
  schedule_disabled:'计划已暂停，请确认后启用，才能立即运行。',schedule_not_found:'计划已删除或当前账号无权访问。',
  target_not_found:'执行对象已删除或不属于当前账号，请重新选择。',model_connection_required:'请选择本人已启用的模型连接。',
  model_not_enabled:'所选模型已不在连接中，请刷新资源后重新选择。',already_queued:'这一分钟已发起过运行，请查看执行记录，不要重复提交。'}
async function api(path:string,method='GET',payload?:unknown,signal?:AbortSignal):Promise<Record<string,unknown>>{
  const response=await fetch(getPocketBaseUrl()+path,{method,headers:{'Content-Type':'application/json',...vibexAuthHeaders()},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])})
  const result=await response.json().catch(()=>({})) as Record<string,unknown>
  if(response.status===401||response.status===412)throw Error('登录已失效，请重新登录后管理定时任务')
  if(!response.ok||result.error)throw Error(MESSAGES[String(result.error)]||String(result.message||result.error||'请求未完成'))
  return result
}
type Snapshot={owner:string;key:string;items:ScheduleTask[];history:ScheduleHistory[];total:number;pages:number;loaded:boolean;error:string}
type Preview={id:string;name:string;kind:string;status:string;loading:boolean;result:string;error:string;events:number}

export function useScheduledTasks(){
  const owner=decodeRhToken()?.sub||''
  const [params,setParams]=useSearchParams()
  const view=params.get('view')==='history'?'history':'plans'
  const historyFilter=params.get('id')||''
  const historyPage=schedulePage(params.get('historyPage'))
  const listPage=schedulePage(params.get('page'))
  const query=params.get('q')||''
  const filter=['active','paused','completed'].includes(params.get('status')||'')?params.get('status')!:'all'
  const kindFilter=['agent','workflow'].includes(params.get('kind')||'')?params.get('kind')!:'all'
  const changeQuery=useCallback((values:Record<string,string|number|null>)=>setParams(previous=>{
    const next=new URLSearchParams(previous)
    for(const [key,value]of Object.entries(values)){if(value===null||value==='')next.delete(key);else next.set(key,String(value))}
    return next
  },{replace:true}),[setParams])
  const showHistory=(id='')=>changeQuery({view:'history',id,historyPage:1})
  const showPlans=()=>changeQuery({view:'plans',id:null,historyPage:null})
  const key=JSON.stringify([owner,view,view==='history'?historyFilter:'',view==='history'?historyPage:1])
  const [snapshot,setSnapshot]=useState<Snapshot>({owner:'',key:'',items:[],history:[],total:0,pages:1,loaded:false,error:''})
  const items=snapshot.owner===owner?snapshot.items:[]
  const current=snapshot.owner===owner&&snapshot.key===key
  const [refreshing,setRefreshing]=useState(false),[workerAlive,setWorkerAlive]=useState<boolean|null>(null)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [form,setForm]=useState<ScheduleForm>(defaultScheduleForm),[editingId,setEditingId]=useState(''),[editorOpen,setEditorOpen]=useState(false)
  const [saving,setSaving]=useState(false),[busyId,setBusyId]=useState('')
  const [agents,setAgents]=useState<Target[]>([]),[workflows,setWorkflows]=useState<Target[]>([]),[models,setModels]=useState<ModelConnection[]>([])
  const [optionsLoading,setOptionsLoading]=useState(false),[optionsError,setOptionsError]=useState(''),[optionsRevision,setOptionsRevision]=useState(0)
  const [runPreview,setRunPreview]=useState<Preview|null>(null)
  const original=useRef<ScheduleTask|null>(null),baseline=useRef<ScheduleForm>(form),editorOwner=useRef('')
  const sequence=useRef(0),previewSequence=useRef(0),alive=useRef(true),operation=useRef(false)
  const dirty=editorOpen&&JSON.stringify(form)!==JSON.stringify(baseline.current)
  const dirtyRef=useRef(false);dirtyRef.current=dirty
  useEffect(()=>registerUnsavedWorkCheck(()=>dirtyRef.current),[])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;previewSequence.current++}},[])
  const authorized=()=>alive.current&&decodeRhToken()?.sub===owner
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(!owner)return false
    const request=++sequence.current;setRefreshing(true)
    const qs=new URLSearchParams({history_limit:'20',history_page:String(view==='history'?historyPage:1)})
    if(view==='history'&&historyFilter)qs.set('id',historyFilter)
    if(view==='plans')qs.set('include_history','0')
    const [schedule,worker]=await Promise.allSettled([api('/api/schedules?'+qs,undefined,undefined,signal),api('/api/worker/status',undefined,undefined,signal)])
    if(!alive.current||signal?.aborted||request!==sequence.current||decodeRhToken()?.sub!==owner)return false
    setWorkerAlive(worker.status==='fulfilled'?Boolean(worker.value.enabled&&worker.value.alive):null)
    let ok=false
    if(schedule.status==='fulfilled'&&Array.isArray(schedule.value.items)&&Array.isArray(schedule.value.history)&&
      Number.isSafeInteger(schedule.value.history_total)&&Number.isSafeInteger(schedule.value.history_pages)){
      setSnapshot({owner,key,items:schedule.value.items as ScheduleTask[],history:schedule.value.history as ScheduleHistory[],
        total:Number(schedule.value.history_total),pages:Math.max(1,Number(schedule.value.history_pages)),loaded:true,error:''});ok=true
    }else{
      const message=schedule.status==='rejected'?String(schedule.reason?.message||'请求失败'):'计划接口返回格式不完整'
      setSnapshot(previous=>({owner,key,items:previous.owner===owner?previous.items:[],history:[],total:0,pages:1,loaded:true,
        error:message+'。当前无法核实最新状态，不代表计划或记录已删除。'}))
    }
    setRefreshing(false);return ok
  },[owner,key,view,historyFilter,historyPage])
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal)
    return()=>{controller.abort();sequence.current++}
  },[refresh])
  useEffect(()=>{
    if(editorOpen||saving||busyId||(view==='history'&&historyPage>1))return
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh()},20000)
    return()=>window.clearInterval(timer)
  },[editorOpen,saving,busyId,view,historyPage,refresh])
  // Catalogs are required only while editing; list polling never loads them.
  useEffect(()=>{
    if(!editorOpen||!owner)return
    const controller=new AbortController();setOptionsLoading(true);setOptionsError('')
    void Promise.all([api('/api/agent_specs?perPage=200',undefined,undefined,controller.signal),
      api('/api/workflow-studio/list',undefined,undefined,controller.signal),api('/api/model-connections',undefined,undefined,controller.signal)])
      .then(([a,w,m])=>{
        if(controller.signal.aborted||decodeRhToken()?.sub!==owner)return
        if(!Array.isArray(a.items)||!Array.isArray(w.items)||!Array.isArray(m.items))throw Error('可选资源列表格式异常')
        const targets=(rows:unknown[])=>rows.flatMap(row=>{const r=row as Target;return typeof r?.id==='string'&&typeof r.name==='string'?[{id:r.id,name:r.name}]:[]})
        setAgents(targets(a.items));setWorkflows(targets(w.items));setModels(m.items as ModelConnection[])
      }).catch(e=>{if(!controller.signal.aborted)setOptionsError(String(e.message||e))})
      .finally(()=>{if(!controller.signal.aborted)setOptionsLoading(false)})
    return()=>controller.abort()
  },[editorOpen,owner,optionsRevision])
  const targetOptions=form.target_kind==='agent'?agents:workflows
  const modelOptions=models.find(m=>m.id===form.model_connection_id)?.models||[]
  const timingUnchanged=!!original.current&&scheduleTimingKey(form)===scheduleTimingKey(baseline.current)
  const preview=useMemo(()=>{
    try{
      if(editorOpen&&original.current&&timingUnchanged){
        const task=original.current
        const nextAt=task.next_at_ms> Date.now()?task.next_at_ms:nextScheduleTime(task,Date.now())
        return {rule:task as ScheduleRule,nextAt,error:'',preserved:true}
      }
      return {...buildScheduleTiming(form),error:'',preserved:false}
    }catch(e){return {rule:null,nextAt:null,error:timingUnchanged?'':String((e as Error).message),preserved:timingUnchanged}}
  },[form,editorOpen,timingUnchanged])
  const nextOccurrences=useMemo(()=>{
    if(!preview.rule||!preview.nextAt)return [] as number[]
    const result=[preview.nextAt];let after=preview.nextAt+1000
    for(let i=1;i<5;i++){const next=nextScheduleTime(preview.rule,after);if(next===null||!Number.isSafeInteger(next)||next<=after)break;result.push(next);after=next+1000}
    return result
  },[preview])
  const setField=<K extends keyof ScheduleForm>(name:K,value:ScheduleForm[K])=>setForm(previous=>({...previous,[name]:value}))
  const closeEditor=async()=>{
    if(operation.current||saving)return
    if(dirty&&!await confirmInStudio('当前计划有未保存的修改。确认放弃本次编辑？'))return
    setEditorOpen(false);setError('')
  }
  const openForm=(next:ScheduleForm,task:ScheduleTask|null)=>{
    if(operation.current)return
    baseline.current={...next};original.current=task;editorOwner.current=owner
    setForm(next);setEditingId(task?.id||'');setError('');setNotice('');setEditorOpen(true)
  }
  const newPlan=()=>openForm(defaultScheduleForm(),null)
  const edit=(task:ScheduleTask)=>openForm({name:task.name,target_kind:task.target_kind,target_id:task.target_id,
    instruction:task.instruction,recurrence_kind:task.recurrence_kind,time_zone:task.time_zone,
    start_date:zonedDateString(task.start_at_ms,task.time_zone),local_time:task.local_time,
    weekday:task.weekday,interval_minutes:task.interval_minutes,model_connection_id:task.model_connection_id,
    model_id:task.model_id,max_steps:task.max_steps,enabled:task.enabled},task)
  const duplicate=(task:ScheduleTask)=>openForm({...defaultScheduleForm(),name:(task.name+' · 副本').slice(0,120),
    target_kind:task.target_kind,target_id:task.target_id,instruction:task.instruction,
    recurrence_kind:task.recurrence_kind,time_zone:task.time_zone,start_date:zonedDateString(Date.now()+86400000,task.time_zone),
    local_time:task.local_time,weekday:task.weekday,interval_minutes:task.interval_minutes,
    model_connection_id:task.model_connection_id,model_id:task.model_id,max_steps:task.max_steps,enabled:false},null)
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(operation.current||saving||!editorOpen)return
    if(editorOwner.current!==owner||!authorized()){setError('账号已变化，请重新登录并打开计划。');return}
    if(optionsLoading||optionsError){setError('请先完成执行对象与模型资源检查。');return}
    const input={...form},existing=original.current
    if(!input.name.trim()||!input.instruction.trim()||!targetOptions.some(t=>t.id===input.target_id)){setError('请填写计划名称、任务指令并选择当前可访问的执行对象。');return}
    if(input.target_kind==='agent'&&!models.some(m=>m.id===input.model_connection_id&&m.enabled&&m.models.includes(input.model_id))){setError('请重新选择本人已启用的模型连接和模型。');return}
    const preserve=!!existing&&scheduleTimingKey(input)===scheduleTimingKey(baseline.current)
    let timing:{rule:ScheduleRule;nextAt:number}
    try{timing=preserve?{rule:existing!,nextAt:existing!.next_at_ms}:buildScheduleTiming(input)}catch(e){setError(String((e as Error).message));return}
    if(existing&&!dirty){setEditorOpen(false);setNotice('计划未发生修改，没有重新保存或改变运行节奏。');return}
    operation.current=true;setSaving(true);setError('');setNotice('')
    try{
      if(!existing&&input.enabled&&!await confirmInStudio('保存后将启用此周期计划，后台会按所选时间调用模型或工作流，可能产生费用。确认时间、时区和任务内容后继续。',{title:'保存并启用计划',confirmLabel:'确认启用'}))return
      if(!authorized())return
      const r=await api('/api/schedules/manage','POST',{action:existing?'update':'create',...(existing?{id:existing.id,expected_revision:existing.revision,preserve_timing:preserve}:{}),
        name:input.name.trim(),target_kind:input.target_kind,target_id:input.target_id,instruction:input.instruction.trim(),
        recurrence_kind:timing.rule.recurrence_kind,start_at_ms:timing.rule.start_at_ms,next_at_ms:timing.nextAt,
        interval_minutes:timing.rule.interval_minutes,time_zone:timing.rule.time_zone,local_time:timing.rule.local_time,weekday:timing.rule.weekday,
        model_connection_id:input.model_connection_id,model_id:input.model_id,max_steps:input.max_steps,
        ...(!existing?{enabled:input.enabled}:{})})
      if(!authorized())return
      setEditorOpen(false)
      setNotice(r.enabled===true?'计划保存成功，已启用。实际触发仍依赖 Worker 在线、资源可用及必要审批。':'计划保存成功，保持暂停；不会自动开始执行。')
      await refresh()
    }catch(e){if(authorized())setError(String((e as Error).message)+' 若提交结果不明，请先刷新核对，避免重复创建。')}
    finally{operation.current=false;if(alive.current)setSaving(false)}
  }
  const action=async(task:ScheduleTask,kind:'toggle'|'run_now'|'delete')=>{
    if(operation.current||snapshot.error)return
    operation.current=true;setBusyId(task.id);setError('');setNotice('')
    try{
      const message=kind==='delete'?'删除计划「'+task.name+'」？历史记录保留，已开始的运行不会因此取消。':
        kind==='run_now'?'立即运行「'+task.name+'」将额外提交一次执行，可能产生模型或外部服务费用。不会改变原定时间。':
        task.enabled?'暂停后不再创建新的定时执行；已经开始的运行不会取消。确认暂停「'+task.name+'」？':
        '启用「'+task.name+'」后将按计划执行，可能产生模型或外部服务费用。请确认资源和时间。'
      if(!await confirmInStudio(message,{confirmLabel:kind==='run_now'?'确认运行':kind==='delete'?'确认删除':task.enabled?'确认暂停':'确认启用'}))return
      if(!authorized())return
      const payload:Record<string,unknown>={action:kind,id:task.id,expected_revision:task.revision}
      if(kind==='toggle'){
        let next=0;if(!task.enabled){next=nextScheduleTime(task,Date.now())||0;if(!next)throw Error('单次时间已过期，请先编辑时间；不会重放历史任务。')}
        Object.assign(payload,{enabled:!task.enabled,next_at_ms:next})
      }
      const r=await api('/api/schedules/manage','POST',payload)
      if(!authorized())return
      await refresh()
      setNotice(kind==='delete'?'计划已删除，历史记录仍可查看。':kind==='toggle'?task.enabled?'计划已暂停，已经开始的运行不受影响。':'计划已启用；请留意 Worker 在线状态。':'已提交到调度队列（尚未执行完成）：'+String(r.run_id||''))
      if(kind==='run_now')showHistory(task.id)
    }catch(e){if(authorized())setError(String((e as Error).message))}
    finally{operation.current=false;if(alive.current)setBusyId('')}
  }
  const retryFailedLaunch=async(row:ScheduleHistory)=>{
    if(operation.current)return
    operation.current=true;setBusyId(row.id)
    try{
      if(!await confirmInStudio('仅重试尚未创建运行实例的任务启动。请先核实此前没有产生外部副作用；实际执行可能收费。'))return
      if(!authorized())return
      await api('/api/schedules/manage','POST',{action:'retry_failed_start',id:row.schedule_id,occurrence_id:row.id})
      if(authorized()){await refresh();setNotice('已请求重新排队，请查看真实执行状态。')}
    }catch(e){if(authorized())setError(String((e as Error).message))}
    finally{operation.current=false;if(alive.current)setBusyId('')}
  }
  const viewRun=async(entry:ScheduleHistory)=>{
    if(!entry.run_id)return
    const request=++previewSequence.current,task=items.find(t=>t.id===entry.schedule_id)
    const initial:Preview={id:entry.run_id,name:task?.name||'历史计划',kind:task?.target_kind||'',status:entry.status,loading:true,result:'',error:'',events:0}
    setRunPreview(initial)
    let lastError='运行实例尚未生成，或当前用户无权查看'
    const kinds:TargetKind[]=task?[task.target_kind]:['agent','workflow']
    for(const kind of kinds){
      try{
        const response=await api((kind==='agent'?'/api/agent-runs/':'/api/workflow-runs/')+encodeURIComponent(entry.run_id)+'/detail')
        if(!authorized()||request!==previewSequence.current)return
        const run=(response.run||response) as Record<string,unknown>
        setRunPreview({...initial,kind,status:String(run.status||entry.status),loading:false,result:String(run.result||''),error:String(run.error||''),events:Array.isArray(response.events)?response.events.length:0});return
      }catch(e){lastError=String((e as Error).message)}
    }
    if(authorized()&&request===previewSequence.current)setRunPreview({...initial,loading:false,error:lastError})
  }
  const closeRun=()=>{previewSequence.current++;setRunPreview(null)}
  const shown=filterSchedules(items,query,filter,kindFilter)
  const listPages=Math.max(1,Math.ceil(shown.length/10)),page=Math.min(listPage,listPages)
  return {form,setForm,setField,editingId,editorOpen,closeEditor,newPlan,edit,duplicate,save,saving,dirty,
    items,shown,page,listPages,pageItems:shown.slice((page-1)*10,page*10),query,filter,kindFilter,changeQuery,
    view,historyFilter,historyPage,showHistory,showPlans,history:current?snapshot.history:[],historyTotal:current?snapshot.total:0,historyPages:current?snapshot.pages:1,
    initialLoading:!current||!snapshot.loaded,loadError:current?snapshot.error:'',refreshing,workerAlive,
    agents,workflows,models,targetOptions,modelOptions,optionsLoading,optionsError,refreshOptions:()=>setOptionsRevision(v=>v+1),
    preview,nextOccurrences,timingUnchanged,originalTask:original.current,busyId,error,setError,notice,setNotice,refresh,action,retryFailedLaunch,
    runPreview,closeRun,viewRun}
}
