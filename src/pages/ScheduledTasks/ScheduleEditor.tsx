import {Clock3,RefreshCw,Save,ShieldCheck} from 'lucide-react'
import {Link} from 'react-router-dom'
import {formatScheduledDate,FORM_CLASS,TIME_ZONES,WEEKDAYS} from './types'
import type {useScheduledTasks} from './useScheduledTasks'
const label='block min-w-0 text-xs font-medium text-muted-foreground'
const formatInZone=(stamp:number,zone:string)=>{
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp))}
  catch{return formatScheduledDate(stamp)}
}
export function ScheduleEditor(p:ReturnType<typeof useScheduledTasks>){
  const f=p.form,set=p.setField
  const selectedModel=p.models.find(m=>m.id===f.model_connection_id)
  return <form id="schedule-editor" onSubmit={p.save} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
      {p.error&&<p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{p.error}</p>}
      {p.optionsLoading&&<p role="status" className="text-xs text-muted-foreground">正在读取本人可使用的 Agent、工作流和模型…</p>}
      {p.optionsError&&<div role="alert" className="rounded-xl border border-destructive/20 p-3 text-xs text-destructive">{p.optionsError}<button type="button" onClick={p.refreshOptions} className="ml-2 min-h-9 font-semibold underline">重新读取资源</button></div>}
      <fieldset disabled={p.saving} className="min-w-0 space-y-5 disabled:opacity-70">
        <section aria-label="计划执行内容" className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">1 · 执行什么任务</h3>
          <label className={label}>计划名称<input id="schedule-plan-name" aria-label="计划名称" autoFocus required maxLength={120} className={FORM_CLASS} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="例如：工作日研究简报"/></label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className={label}>执行类型<select aria-label="执行类型" className={FORM_CLASS} value={f.target_kind} onChange={e=>p.setForm(previous=>({...previous,target_kind:e.target.value as typeof f.target_kind,target_id:'',model_connection_id:'',model_id:''}))}><option value="agent">AI Agent</option><option value="workflow">可视化工作流</option></select></label>
            <label className={label}>执行对象<select aria-label="执行对象" required className={FORM_CLASS} value={f.target_id} onChange={e=>set('target_id',e.target.value)}><option value="">选择已保存的{f.target_kind==='agent'?' Agent':'工作流'}</option>{f.target_id&&!p.targetOptions.some(t=>t.id===f.target_id)&&<option value={f.target_id} disabled>原对象不可用，请重新选择</option>}{p.targetOptions.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </div>
          {!p.optionsLoading&&!p.optionsError&&!p.targetOptions.length&&<p role="status" className="rounded-xl bg-secondary p-3 text-xs">还没有可用的执行对象。<Link to={f.target_kind==='agent'?'/agent-create':'/workflow-canvas'} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline">创建并保存后返回</Link><button type="button" onClick={p.refreshOptions} className="ml-2 text-primary underline">刷新资源</button></p>}
          <label className={label}>每次运行的任务指令<textarea aria-label="每次运行的任务指令" required rows={3} maxLength={2000} value={f.instruction} onChange={e=>set('instruction',e.target.value)} className={FORM_CLASS+' resize-y'} placeholder="写清每次需要完成的任务、范围与交付标准"/></label>
        </section>
        <section aria-label="计划时间设置" className="min-w-0 space-y-3 border-t border-border pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-primary"/>2 · 何时执行</h3>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className={label}>执行频率<select aria-label="执行频率" className={FORM_CLASS} value={f.recurrence_kind} onChange={e=>set('recurrence_kind',e.target.value as typeof f.recurrence_kind)}><option value="once">仅一次</option><option value="interval">固定间隔</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>
            <label className={label}>时区（支持夏令时）<input aria-label="时区" className={FORM_CLASS} required value={f.time_zone} list="scheduled-time-zones" onChange={e=>set('time_zone',e.target.value)} placeholder="Asia/Singapore"/><datalist id="scheduled-time-zones">{TIME_ZONES.map(z=><option key={z} value={z}/>)}</datalist></label>
            <label className={label}>{['once','interval'].includes(f.recurrence_kind)?'首次运行日期':'计划生效日期'}<input aria-label="计划日期" required type="date" className={FORM_CLASS} value={f.start_date} onChange={e=>set('start_date',e.target.value)}/></label>
            <label className={label}>时区内执行时间<input aria-label="时区内执行时间" required type="time" step={60} className={FORM_CLASS} value={f.local_time} onChange={e=>set('local_time',e.target.value)}/></label>
            {f.recurrence_kind==='interval'&&<label className={label}>间隔<select aria-label="执行间隔" className={FORM_CLASS} value={f.interval_minutes} onChange={e=>set('interval_minutes',Number(e.target.value))}>{[15,30,60,180,360,1440,10080].map(n=><option key={n} value={n}>每 {n<60?n+' 分钟':n<1440?n/60+' 小时':n/1440+' 天'}</option>)}</select></label>}
            {f.recurrence_kind==='weekly'&&<label className={label}>每周执行日<select aria-label="每周执行日" className={FORM_CLASS} value={f.weekday} onChange={e=>set('weekday',Number(e.target.value))}>{WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>}
          </div>
          <div aria-label="计划时间预览" className="rounded-xl border border-border bg-secondary/35 p-3 text-xs leading-6">
            <p className="font-semibold">{p.timingUnchanged?'沿用原计划节奏；仅修改名称或任务不会重新排期':'核对预计执行时间'} · {f.time_zone}</p>
            {p.preview.error?<p className="text-destructive">{p.preview.error}</p>:p.nextOccurrences.length?<div className="mt-1 grid gap-x-4 sm:grid-cols-2">{p.nextOccurrences.map((time,i)=><p key={time} className="tabular-nums">{i+1} · {formatInZone(time,f.time_zone)}</p>)}</div>:<p>没有待执行时刻；已结束的单次计划不会自动重新运行。</p>}
            <p className="mt-1 text-muted-foreground">这是时间规则预览，不是执行承诺；实际触发依赖启用状态、Worker 和资源可用性。</p>
          </div>
        </section>
        <section aria-label="计划执行边界" className="min-w-0 space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">3 · 模型与启用状态</h3>
          {f.target_kind==='agent'&&<>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className={label}>模型连接<select aria-label="模型连接" required className={FORM_CLASS} value={f.model_connection_id} onChange={e=>p.setForm(previous=>({...previous,model_connection_id:e.target.value,model_id:''}))}><option value="">选择已启用的连接</option>{f.model_connection_id&&!p.models.some(m=>m.id===f.model_connection_id&&m.enabled)&&<option value={f.model_connection_id} disabled>原连接不可用，请重新选择</option>}{p.models.filter(m=>m.enabled).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
              <label className={label}>使用模型<select aria-label="使用模型" required className={FORM_CLASS} value={f.model_id} onChange={e=>set('model_id',e.target.value)}><option value="">选择模型</option>{(selectedModel?.models||[]).map(m=><option key={m} value={m}>{m}</option>)}</select></label>
            </div>
            {!p.optionsLoading&&!p.models.some(m=>m.enabled&&m.models?.length)&&<p className="text-xs text-muted-foreground">没有可用模型。<Link to="/model-connections" target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline">配置模型</Link><button type="button" onClick={p.refreshOptions} className="ml-2 text-primary underline">刷新资源</button></p>}
            <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">高级执行上限 · {f.max_steps} 步</summary><label className={label+' mt-3'}>最大推理步数（1–30）<input aria-label="最大推理步数" className={FORM_CLASS} type="number" min={1} max={30} required value={f.max_steps} onChange={e=>set('max_steps',Number(e.target.value))}/></label></details>
          </>}
          {p.editingId?<p className="rounded-xl bg-secondary/40 p-3 text-xs">保存修改将保持此计划{p.originalTask?.enabled?'启用':'暂停'}状态。启用或暂停请使用列表中的明确操作，已开始的运行使用原快照。</p>:
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input aria-label="保存后启用计划" type="checkbox" className="mt-1" checked={f.enabled} onChange={e=>set('enabled',e.target.checked)}/><span>保存后启用计划<span className="mt-1 block text-xs leading-5 text-muted-foreground">不勾选则保存为暂停。启用后会自动调用模型或工作流，可能产生服务商费用。</span></span></label>}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>敏感外部操作仍需批准。暂停和删除计划不会取消已经开始的运行；编辑不会扩大工具或知识库权限。</p>
        </section>
      </fieldset>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-4 sm:px-7">
      <span className="text-xs text-muted-foreground">{p.dirty?'有未保存修改':'关闭不会触发任务'}</span>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={p.saving} onClick={()=>void p.closeEditor()} className="min-h-10 rounded-xl border border-border px-4 text-sm">取消</button>
        <button type="submit" disabled={p.saving||p.optionsLoading||!!p.optionsError||Boolean(p.preview.error)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-45">
          {p.saving?<RefreshCw className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{p.saving?'保存中…':p.editingId?'保存修改':f.enabled?'保存并启用计划':'保存为暂停计划'}
        </button></div>
    </footer>
  </form>
}
