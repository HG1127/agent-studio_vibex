import { CalendarClock, Clock3, Plus, RefreshCw, Save, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"
import { formatScheduledDate, FORM_CLASS, LABEL_CLASS, TIME_ZONES, WEEKDAYS } from "./types"
import type { useScheduledTasks } from "./useScheduledTasks"

type Props = ReturnType<typeof useScheduledTasks>

const formatInZone = (epoch: number, zone: string) => {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(epoch))
  } catch { return formatScheduledDate(epoch) }
}


export function ScheduleEditor(p: Props) {
  const f = p.form
  const set = p.setField
  const modelConnection = p.models.find(m => m.id === f.model_connection_id)
  return (
    <section id="schedule-editor" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" />{p.editingId ? "编辑计划" : "新建定时计划"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">选择执行对象、频率、开始时间和任务指令</p>
        </div>
        {p.editingId && <button type="button" onClick={p.resetForm} className="shrink-0 text-xs text-primary hover:underline">取消编辑</button>}
      </div>
      <form onSubmit={p.save} className="space-y-4">
        <label className={LABEL_CLASS}>计划名称
          <input id="schedule-plan-name" required maxLength={120} className={FORM_CLASS} value={f.name}
            onChange={e=>set("name",e.target.value)} placeholder="例如：每天早晨生成市场观察报告"/>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL_CLASS}>执行类型
            <select className={FORM_CLASS} value={f.target_kind} onChange={e=>p.setForm(prev=>({
              ...prev,target_kind:e.target.value as typeof f.target_kind,target_id:"",model_connection_id:"",model_id:"",
            }))}>
              <option value="agent">AI Agent</option><option value="workflow">可视化工作流</option>
            </select>
          </label>
          <label className={LABEL_CLASS}>执行对象
            <select className={FORM_CLASS} required value={f.target_id} onChange={e=>set("target_id",e.target.value)}>
              <option value="">选择已保存的{f.target_kind==="agent"?"助手":"工作流"}</option>
              {p.targetOptions.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        {!p.initialLoading && p.targetOptions.length===0 && <p role="status"
          className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          当前账号还没有已保存的{f.target_kind==="agent"?" Agent":"工作流"}。
          <Link to={f.target_kind==="agent"?"/agent-create":"/workflow-canvas"}
            className="ml-1 font-semibold text-primary underline-offset-2 hover:underline">
            {f.target_kind==="agent"?"先创建 Agent →":"先创建工作流 →"}
          </Link>
        </p>}
        {f.target_kind==="agent" && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL_CLASS}>模型连接
              <select className={FORM_CLASS} required value={f.model_connection_id} onChange={e=>p.setForm(prev=>({
                ...prev,model_connection_id:e.target.value,model_id:"",
              }))}>
                <option value="">选择已启用的连接</option>
                {p.models.filter(m=>m.enabled).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASS}>使用模型
              <select className={FORM_CLASS} required value={f.model_id} onChange={e=>set("model_id",e.target.value)}>
                <option value="">选择模型</option>
                {(modelConnection?.models||[]).map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          {!p.models.some(m=>m.enabled && m.models?.length) && <p role="status"
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            尚未发现可用的模型连接。定时 Agent 需要先选定启用的模型。
            <Link to="/model-connections" className="ml-1 font-semibold text-primary hover:underline">添加并测试模型 →</Link>
          </p>}
          <label className={LABEL_CLASS}>最大推理步数（1–30）
            <input className={FORM_CLASS} type="number" min={1} max={30} required
              value={f.max_steps} onChange={e=>set("max_steps",Number(e.target.value))}/>
          </label>
        </>}
        <label className={LABEL_CLASS}>每次运行的任务指令
          <textarea required rows={4} maxLength={2000} value={f.instruction}
            onChange={e=>set("instruction",e.target.value)}
            placeholder="说明任务目标、分析范围、交付物以及完成标准…" className={FORM_CLASS+" resize-y"} />
        </label>
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-primary"/>时间规则
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL_CLASS}>执行频率
              <select className={FORM_CLASS} value={f.recurrence_kind}
                onChange={e=>set("recurrence_kind",e.target.value as typeof f.recurrence_kind)}>
                <option value="once">仅一次</option><option value="interval">固定间隔</option>
                <option value="daily">每天</option><option value="weekly">每周</option>
              </select>
            </label>
            <label className={LABEL_CLASS}>时区（支持夏令时）
              <input className={FORM_CLASS} value={f.time_zone} list="scheduled-time-zones"
                onChange={e=>set("time_zone",e.target.value)} placeholder="Asia/Shanghai"/>
              <datalist id="scheduled-time-zones">
                {TIME_ZONES.map(zone=><option key={zone} value={zone}/>)}
              </datalist>
            </label>
            <label className={LABEL_CLASS}>
              {f.recurrence_kind==="once" || f.recurrence_kind==="interval"?"首次运行日期":"计划生效日期"}
              <input required type="date" className={FORM_CLASS} value={f.start_date}
                onChange={e=>set("start_date",e.target.value)}/>
            </label>
            <label className={LABEL_CLASS}>时区内执行时间
              <input required type="time" step={60} className={FORM_CLASS} value={f.local_time}
                onChange={e=>set("local_time",e.target.value)}/>
            </label>
            {f.recurrence_kind==="interval" && <label className={LABEL_CLASS}>间隔
              <select className={FORM_CLASS} value={f.interval_minutes} onChange={e=>set("interval_minutes",Number(e.target.value))}>
                <option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option>
                <option value={60}>每小时</option><option value={180}>每 3 小时</option>
                <option value={360}>每 6 小时</option><option value={1440}>每 24 小时</option>
                <option value={10080}>每 7 天</option>
              </select>
            </label>}
            {f.recurrence_kind==="weekly" && <label className={LABEL_CLASS}>每周执行日
              <select className={FORM_CLASS} value={f.weekday} onChange={e=>set("weekday",Number(e.target.value))}>
                {WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}
              </select>
            </label>}
          </div>
        </div>
        <div className="rounded-xl bg-secondary/70 p-3 text-xs leading-relaxed text-muted-foreground">
          <div className="font-medium text-card-foreground">预计下次运行</div>
          <div className={p.preview.error?"mt-1 text-destructive":"mt-1 text-sm font-semibold text-foreground"}>
            {p.preview.error || (p.preview.nextAt ? formatInZone(p.preview.nextAt, f.time_zone) : "—")}
          </div>
          {p.nextOccurrences.length > 1 && (
            <div className="mt-3 space-y-1 border-t border-border/70 pt-2">
              <div className="text-[11px] font-medium">未来 {p.nextOccurrences.length} 次预计运行（{f.time_zone}）</div>
              {p.nextOccurrences.map((stamp, index) => <p key={stamp} className="tabular-nums text-[11px]">
                第 {index + 1} 次 · {formatInZone(stamp, f.time_zone)}
              </p>)}
            </div>
          )}
          <p className="mt-1">日期和时钟时间以所选时区计算；实际触发依赖后台 Worker 在线。</p>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          定时 Agent 对非 GET 外部工具默认启用审批；未经确认不会执行敏感写入。
        </p>
        <button type="submit" disabled={p.saving || Boolean(p.preview.error)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
          {p.saving?<RefreshCw className="h-4 w-4 animate-spin"/>:p.editingId?<Save className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}
          {p.saving?"保存中…":p.editingId?"保存并更新计划":"创建定时任务"}
        </button>
      </form>
    </section>
  )
}
