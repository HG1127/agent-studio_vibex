import {useCallback,useEffect,useRef,useState,type FormEvent} from "react"
import {PgNativePilotError,type createPgNativePilotApi,type PgNativeAgent,type PgNativeModelConnection,
  type PgNativeAgentReleaseChoice as Choice,type PgNativeAgentReleaseWorkspace as Workspace,type PgNativeAgentReleaseVersion as Version,
  type PgNativeAgentReleaseDetail as Detail,type PgNativeAcceptanceStatus as Acceptance} from "@/lib/pgNativePilotApi"
import {agentReleaseChoice} from "@/lib/pgNativeAgentRelease"
import {readyAutonomousModel} from "@/lib/pgNativeAutonomousAgentSession"
import {autonomousStates,autonomousButton as button,autonomousSecondary as secondary} from "./PgNativeAutonomousAgentDetail"

type Api=ReturnType<typeof createPgNativePilotApi>
type Source={expected_spec_revision:number;source_sha256:string}
type Pending={id:string;name:string;body:Choice}
type Review={kind:"publish"|"restore"|"delete_draft";version:Version;source:Source;release_revision:number}
const field="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
const statusLabel={draft:"草稿",published:"已发布",archived:"已归档"}
const source=(item:Workspace):Source=>({expected_spec_revision:item.spec_revision,source_sha256:item.source_sha256})
const when=(value:string|null)=>value?new Date(value).toLocaleString("zh-CN"):"—"
function errorText(error:unknown):string{
  if(error instanceof PgNativePilotError){
    if(error.status===401)return "登录已失效，请重新登录。"
    if(error.status===404)return "角色、版本或验收记录不可用，或不属于当前员工。"
    if(error.code==="agent_release_acceptance_unavailable"||error.code==="agent_release_untested_ack_required")return "该验收结果当前不能用于此配置。请刷新核对，或明确选择按未验收版本发布。"
    if(error.status===409)return "配置、版本或资源权限已变化，请刷新并重新核对。"
    if(error.status===403||error.status===405)return "当前环境未开放此操作，请刷新查看可用权限。"
    if(error.status===400)return "请检查任务、轮数、说明和确认选项。"
  }
  return "尚未收到操作确认。请先核对原请求的结果。"
}
function SnapshotView({item}:{item:Detail}){
  const spec=item.spec_snapshot
  return <section aria-label="完整版本配置" className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
    <h4 className="font-semibold">版本 {item.version_no} · {item.name}</h4>
    {([['goal','目标'],['task_scope','任务范围'],['deliverables','交付物'],['task_plan','任务计划'],['done_criteria','完成标准']] as const).map(([key,label])=>
      <div key={key}><p className="font-medium">{label}</p><p className="whitespace-pre-wrap break-words text-slate-600">
        {Array.isArray(spec[key])?(spec[key] as string[]).join("\n"):typeof spec[key]==="string"?spec[key]:"—"}</p></div>)}
    <details><summary className="cursor-pointer font-medium">查看完整绑定与配置（仅本人可见）</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{JSON.stringify(spec,null,2)}</pre>
    </details>
  </section>
}
export default function PgNativeAgentReleasePanel({api,agents,connections,active,canWrite,canAccept,onUpdated,onExpired,onOpenRun}:{
  api:Api;agents:PgNativeAgent[];connections:PgNativeModelConnection[];active:boolean;canWrite:boolean;canAccept:boolean;
  onUpdated:()=>Promise<void>;onExpired:()=>void;onOpenRun:(id:string)=>void
}){
  const [selected,setSelected]=useState(""),[workspace,setWorkspace]=useState<Workspace|null>(null),[loading,setLoading]=useState(false)
  const [preview,setPreview]=useState<Detail|null>(null),[review,setReview]=useState<Review|null>(null),[checked,setChecked]=useState(false),[reason,setReason]=useState("")
  const [note,setNote]=useState(""),[instruction,setInstruction]=useState(""),[rounds,setRounds]=useState(8),[modelValue,setModelValue]=useState(""),[startChecked,setStartChecked]=useState(false)
  const [runId,setRunId]=useState(""),[acceptance,setAcceptance]=useState<Acceptance|null>(null),[testLoading,setTestLoading]=useState(false),[linkTest,setLinkTest]=useState(false)
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const intent=useRef<Pending|null>(null),locked=useRef(false),epoch=useRef(0),reads=useRef(0),details=useRef(0),tests=useRef(0)
  const current=useRef(selected),activeRef=useRef(active),callbacks=useRef({onUpdated,onExpired,onOpenRun})
  current.current=selected;activeRef.current=active;callbacks.current={onUpdated,onExpired,onOpenRun}
  const report=useCallback((e:unknown)=>{setError(errorText(e));if(e instanceof PgNativePilotError&&e.status===401)callbacks.current.onExpired()},[])
  const refresh=useCallback(async()=>{
    if(!activeRef.current||!selected)return
    const scope=epoch.current,ticket=++reads.current;setLoading(true)
    try{const value=await api.getAgentReleases(selected);if(scope===epoch.current&&ticket===reads.current&&current.current===selected)setWorkspace(value)}
    catch(e){if(scope===epoch.current&&ticket===reads.current)report(e)}
    finally{if(scope===epoch.current&&ticket===reads.current)setLoading(false)}
  },[api,selected,report])
  const loadTest=useCallback(async(id:string)=>{
    if(!activeRef.current||!selected||!id)return
    const scope=epoch.current,ticket=++tests.current;setTestLoading(true)
    try{const value=await api.getAgentReleaseAcceptance(selected,id);if(scope===epoch.current&&ticket===tests.current&&current.current===selected)setAcceptance(value)}
    catch(e){if(scope===epoch.current&&ticket===tests.current){setAcceptance(null);report(e)}}
    finally{if(scope===epoch.current&&ticket===tests.current)setTestLoading(false)}
  },[api,selected,report])
  useEffect(()=>{epoch.current++;return()=>{epoch.current++;reads.current++;details.current++;tests.current++}},[api])
  useEffect(()=>{if(active&&selected)void refresh()},[active,selected,refresh])
  useEffect(()=>{if(active&&runId)void loadTest(runId)},[active,runId,loadTest])
  const choose=(id:string)=>{
    if(locked.current||intent.current)return
    reads.current++;details.current++;tests.current++;current.current=id;setSelected(id);setWorkspace(null);setPreview(null);setReview(null)
    setChecked(false);setReason("");setNote("");setRunId("");setAcceptance(null);setLinkTest(false);setModelValue("");setStartChecked(false);setError("");setNotice("")
  }
  const inspect=async(version:Version)=>{
    if(!selected||!activeRef.current)return
    const scope=epoch.current,ticket=++details.current;setPreview(null)
    try{const value=await api.getAgentReleaseVersion(selected,version.id);if(scope===epoch.current&&ticket===details.current&&current.current===selected)setPreview(value)}
    catch(e){if(scope===epoch.current&&ticket===details.current)report(e)}
  }
  const finish=async(value:Pending,result:Awaited<ReturnType<Api['changeAgentRelease']>>)=>{
    details.current++ // A late detail read must not resurrect a deleted preview.
    intent.current=null;setPending(null);setPreview(null);setReview(null);setChecked(false);setReason("");setNotice("操作已确认，已重新读取当前状态。")
    if(value.body.action==="acceptance"&&result.run_id){setRunId(result.run_id);setLinkTest(false);setStartChecked(false)}
    await refresh();await callbacks.current.onUpdated()
  }
  const perform=async(raw:Choice)=>{
    if(!workspace||!activeRef.current||!canWrite||raw.action==="acceptance"&&!canAccept||locked.current||intent.current)return
    let body:Choice;try{body=agentReleaseChoice(structuredClone(raw))}catch(e){report(e);return}
    const value={id:workspace.spec_id,name:workspace.name,body},scope=epoch.current
    intent.current=value;setPending(value);locked.current=true;setBusy(true);setError("");setNotice("")
    let confirmed=false
    try{const result=await api.changeAgentRelease(value.id,value.body);if(scope!==epoch.current)return;confirmed=true;await finish(value,result)}
    catch(e){if(scope===epoch.current){if(!confirmed&&e instanceof PgNativePilotError&&[400,403,404,405,409].includes(e.status)){intent.current=null;setPending(null)}
      report(e);if(confirmed)setError("操作已确认，刷新未完成，请手动刷新版本。")}}
    finally{if(scope===epoch.current){locked.current=false;setBusy(false)}}
  }
  const reconcile=async(resubmit=false)=>{
    const value=intent.current;if(!value||!activeRef.current||locked.current||resubmit&&(!canWrite||value.body.action==="acceptance"&&!canAccept))return
    const scope=epoch.current;locked.current=true;setBusy(true);setError("");let confirmed=false
    try{const result=await (resubmit?api.changeAgentRelease(value.id,value.body):api.confirmAgentRelease(value.id,value.body));if(scope!==epoch.current)return;confirmed=true;await finish(value,result)}
    catch(e){if(scope===epoch.current){if(resubmit&&!confirmed&&e instanceof PgNativePilotError&&[400,403,404,405,409].includes(e.status)){intent.current=null;setPending(null)}
      report(e);if(confirmed)setError("原请求已确认，刷新未完成，请手动刷新版本。")}}
    finally{if(scope===epoch.current){locked.current=false;setBusy(false)}}
  }
  const role=agents.find(a=>a.id===selected),roleModel=readyAutonomousModel(role,connections)
  const options=role?connections.flatMap(connection=>connection.models.map(model=>({binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:model},name:connection.name,connection})))
    .filter(option=>readyAutonomousModel({...role,spec:{...role.spec,model_binding:option.binding}},[option.connection])):[]
  const chosen=options.find(option=>JSON.stringify(option.binding)===modelValue),modelReady=modelValue==="role"?Boolean(roleModel):Boolean(chosen)
  const disabled=busy||loading||Boolean(pending),currentTest=Boolean(workspace&&acceptance?.test_current&&acceptance.source_sha256===workspace.source_sha256)
  const reviewVersion=review?workspace?.versions.find(v=>v.id===review.version.id):undefined
  const stale=Boolean(review&&(!workspace||!reviewVersion||reviewVersion.revision!==review.version.revision||
    review.kind!=="delete_draft"&&(review.source.expected_spec_revision!==workspace.spec_revision||review.source.source_sha256!==workspace.source_sha256)||
    review.kind==="publish"&&review.release_revision!==workspace.release_revision))
  const openReview=(kind:Review['kind'],version:Version)=>{if(!workspace||disabled)return
    setReview({kind,version,source:source(workspace),release_revision:workspace.release_revision});setChecked(false);setReason("");void inspect(version)}
  const save=(event:FormEvent)=>{event.preventDefault();if(!workspace||linkTest&&!currentTest)return
    void perform({action:"snapshot",request_id:crypto.randomUUID(),...source(workspace),note,test_run_id:linkTest&&currentTest?runId:null})}
  const start=(event:FormEvent)=>{event.preventDefault();if(!workspace||!startChecked||!modelReady)return
    void perform({action:"acceptance",request_id:crypto.randomUUID(),...source(workspace),instruction,max_steps:rounds,model_binding:modelValue==="role"?null:chosen!.binding,confirm:true})}
  const applyReview=()=>{
    if(!review||stale||!checked)return
    const selected={version_id:review.version.id,version_sha256:review.version.version_sha256,expected_version_revision:review.version.revision},request_id=crypto.randomUUID()
    if(review.kind==="restore")void perform({action:"restore",request_id,...review.source,...selected,confirm:true,reason})
    else if(review.kind==="publish")void perform({action:"publish",request_id,...review.source,...selected,expected_release_revision:review.release_revision,confirm:true,acknowledge_untested:!review.version.test_current})
    else void perform({action:"delete_draft",request_id,...selected,confirm:true})
  }
  return <section aria-label="Agent 版本与发布" className="space-y-4">
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">版本与发布</h2><p className="mt-1 text-sm text-slate-500">保存完整配置，关联验收记录，并管理发布版本。</p></div>
        <button type="button" className={secondary} disabled={!active||!selected||busy||loading} onClick={()=>{void refresh();if(runId)void loadTest(runId)}}>刷新版本</button></div>
      {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!canWrite&&<p role="status" className="text-sm text-amber-900">当前可读取版本和核对原请求，配置修改尚未开放。</p>}
      <label className="block text-sm font-medium">版本所属角色<select aria-label="版本所属角色" className={field} value={selected} disabled={busy||Boolean(pending)} onChange={e=>choose(e.target.value)}>
        <option value="">请选择本人角色</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select></label>
      {loading&&<p role="status" className="text-sm text-slate-500">正在读取版本…</p>}
      {pending&&<div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p>“{pending.name}”的上次操作尚未确认。原角色、配置版本和请求已保留。</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy} onClick={()=>void reconcile()}>核对原请求结果</button>
          <button type="button" className={secondary} disabled={busy||!canWrite||pending.body.action==="acceptance"&&!canAccept} onClick={()=>void reconcile(true)}>重新提交同一请求</button></div>
      </div>}
    </div>
    {workspace&&<>
      <section aria-label="配置验收" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">配置验收</h3><p className="text-sm leading-6 text-slate-500">为当前完整配置创建专用验收任务。每次模型调用和工具操作仍需逐步审批，可能产生相应费用。</p>
        {!canAccept&&<p className="text-sm text-amber-900">当前环境未开放新的验收运行，已有验收仍可读取。</p>}
        <form onSubmit={start} className="space-y-3"><fieldset disabled={!canWrite||!canAccept||disabled} className="space-y-3"><legend className="sr-only">新建验收字段</legend>
          <label className="block text-sm">验收任务<textarea required aria-label="验收任务" rows={3} maxLength={2000} className={field} value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">验收模型<select required aria-label="验收模型" className={field} value={modelValue} onChange={e=>{setModelValue(e.target.value);setStartChecked(false)}}>
            <option value="">请选择已测试的本人模型</option>{roleModel&&<option value="role">使用角色模型：{roleModel.name} · {role?.spec.model_binding?.model_id}</option>}
            {options.map(option=><option key={JSON.stringify(option.binding)} value={JSON.stringify(option.binding)}>{option.name} · {option.binding.model_id}</option>)}
          </select></label><label className="block text-sm">最多规划轮数<select aria-label="验收轮数" className={field} value={rounds} onChange={e=>setRounds(Number(e.target.value))}>
            {Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>{i+1} 轮</option>)}
          </select></label></div>
          <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1" checked={startChecked} onChange={e=>setStartChecked(e.target.checked)}/>我确认创建此验收任务，并逐步核对后续调用与费用。</label>
          <button type="submit" className={button} disabled={!active||!instruction.trim()||!modelReady||!startChecked}>创建验收任务</button>
        </fieldset></form>
        <label className="block text-sm">查看验收记录<select aria-label="查看验收记录" className={field} value={runId} disabled={busy} onChange={e=>{tests.current++;setRunId(e.target.value);setAcceptance(null);setLinkTest(false)}}>
          <option value="">请选择验收任务</option>{workspace.acceptance_runs.map(run=><option key={run.run_id} value={run.run_id}>{when(run.created_at)} · {autonomousStates[run.status]??run.status} · 配置 {run.spec_revision}</option>)}
        </select></label>
        {testLoading&&<p role="status" className="text-sm text-slate-500">正在核对验收来源…</p>}
        {acceptance&&<div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><p>验收状态：{autonomousStates[acceptance.status]??acceptance.status}</p>
          <p>验收模型：{connections.find(c=>c.id===acceptance.model_binding.connection_id)?.name??"历史模型连接"} · {acceptance.model_binding.model_id}</p>
          <p>{currentTest?"此验收当前可用于保存配置版本。":"此记录尚不能作为当前配置的通过证明。请核对执行、审批及资源是否仍有效。"}</p>
          <button type="button" className={secondary} onClick={()=>callbacks.current.onOpenRun(acceptance.run_id)}>查看运行与逐步审批</button>
        </div>}
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">保存完整配置版本</h3>
        <p className="text-sm text-slate-500">当前角色配置 {workspace.spec_revision}，下一个版本为 {workspace.next_version_no}。未验收的版本也可保存，并在明确确认后发布。</p>
        <form onSubmit={save} className="space-y-3"><fieldset disabled={!canWrite||disabled||testLoading} className="space-y-3"><legend className="sr-only">保存版本字段</legend>
          <label className="block text-sm">版本说明<textarea aria-label="版本说明" rows={2} maxLength={500} className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={linkTest} disabled={!currentTest&&!linkTest} onChange={e=>setLinkTest(e.target.checked)}/>关联上方当前通过的验收记录</label>
          {linkTest&&!currentTest&&<p role="status" className="text-sm text-amber-900">原验收当前不可用。取消关联后，可保存为未验收版本。</p>}
          <button type="submit" className={button} disabled={!active||linkTest&&!currentTest}>保存完整配置版本</button>
        </fieldset></form>
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">我的配置版本</h3>
        {!workspace.versions.length&&<p className="text-sm text-slate-500">暂无配置版本。</p>}
        {workspace.versions.map(version=><article key={version.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">版本 {version.version_no} · {version.name}</h4><span className="text-xs text-slate-500">{statusLabel[version.status]} · {version.test_current?"验收当前有效":version.test_passed?"曾通过验收，当前需复核":"未关联通过验收"}</span></div>
          {version.note&&<p className="whitespace-pre-wrap break-words text-sm text-slate-600">{version.note}</p>}<p className="text-xs text-slate-400">保存于 {when(version.created_at)}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy} aria-label={`查看版本 ${version.version_no}`} onClick={()=>void inspect(version)}>查看配置</button>
            <button type="button" className={secondary} disabled={!canWrite||disabled} aria-label={`恢复版本 ${version.version_no}`} onClick={()=>openReview("restore",version)}>恢复完整配置</button>
            <button type="button" className={secondary} disabled={!canWrite||disabled||version.status==="published"} aria-label={`发布版本 ${version.version_no}`} onClick={()=>openReview("publish",version)}>发布此版本</button>
            {version.status==="draft"&&<button type="button" className={secondary} disabled={!canWrite||disabled} aria-label={`删除版本 ${version.version_no}`} onClick={()=>openReview("delete_draft",version)}>删除草稿</button>}
          </div>
        </article>)}
      </section>
      {preview&&<SnapshotView item={preview}/>}
      {review&&<section aria-label="确认版本操作" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold">{review.kind==="restore"?"恢复完整配置":review.kind==="publish"?"发布版本":"删除草稿"} · 版本 {review.version.version_no}</h3>
        {stale&&<p role="alert" className="text-sm text-rose-800">当前配置或版本已变化，请关闭确认后重新选择。</p>}
        {review.kind==="restore"&&<><p className="text-sm leading-6">恢复会更新当前角色名称、描述、模型、工具和知识库绑定，并重新校验权限。恢复后请重新验收并保存新版本。</p>
          <label className="block text-sm">恢复说明<textarea aria-label="恢复说明" minLength={8} maxLength={500} rows={2} className={field} value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)}/></label></>}
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1" checked={checked} disabled={disabled||stale} onChange={e=>setChecked(e.target.checked)}/>
          {review.kind==="restore"?"我已核对目标版本，确认恢复完整配置。":review.kind==="delete_draft"?"我确认删除此草稿版本。":review.version.test_current?"我确认将此版本设为发布版本。":"此版本未取得当前有效的验收证明，我确认继续发布。"}
        </label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!active||!canWrite||disabled||stale||!checked||review.kind==="restore"&&reason.trim().length<8} onClick={applyReview}>确认版本操作</button>
          <button type="button" className={secondary} disabled={busy} onClick={()=>{setReview(null);setChecked(false);setReason("")}}>关闭确认</button></div>
      </section>}
    </>}
  </section>
}
