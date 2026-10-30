import type {ScheduleForm,ScheduleTask} from '../pages/ScheduledTasks/types'
import {nextScheduleTime,validTimeZone,zonedDateTimeToEpoch} from './scheduleTime.js'
import type {ScheduleRule} from './scheduleTime.js'

export type ScheduleState='active'|'paused'|'completed'
export function scheduleState(task:{enabled:boolean;recurrence_kind:string;next_at_ms:number}):ScheduleState{
  return task.enabled?'active':task.recurrence_kind==='once'&&task.next_at_ms===0?'completed':'paused'
}
export function scheduleTimingKey(form:ScheduleForm):string{
  return JSON.stringify([form.recurrence_kind,form.time_zone,form.start_date,form.local_time,
    form.recurrence_kind==='weekly'?form.weekday:null,form.recurrence_kind==='interval'?form.interval_minutes:null])
}
export function buildScheduleTiming(form:ScheduleForm,now=Date.now()):{rule:ScheduleRule;nextAt:number}{
  if(!validTimeZone(form.time_zone))throw Error('请输入有效的 IANA 时区，例如 Asia/Singapore')
  let anchor:number
  try{anchor=zonedDateTimeToEpoch(form.start_date,form.local_time,form.time_zone)}
  catch{throw Error('日期或当地时间无效；夏令时跳过的时刻不能执行，请调整时间')}
  const calendar=form.recurrence_kind==='daily'||form.recurrence_kind==='weekly'
  if(!calendar&&anchor<now+2000)throw Error('首次执行时间需要晚于当前时间')
  const rule:ScheduleRule={recurrence_kind:form.recurrence_kind,start_at_ms:calendar?Math.max(anchor,now+5000):anchor,
    interval_minutes:form.interval_minutes,time_zone:form.time_zone,local_time:form.local_time,weekday:form.weekday}
  const nextAt=nextScheduleTime(rule,now)
  if(nextAt===null||!Number.isSafeInteger(nextAt))throw Error('无法计算下一次执行时间')
  return {rule,nextAt}
}
export function filterSchedules(rows:readonly ScheduleTask[],query:string,status:string,kind:string):ScheduleTask[]{
  const q=query.trim().toLocaleLowerCase()
  return rows.filter(row=>(!q||(row.name+' '+row.instruction).toLocaleLowerCase().includes(q))&&
    (!status||status==='all'||scheduleState(row)===status)&&(!kind||kind==='all'||row.target_kind===kind))
}
export function schedulePage(value:string|null):number{
  return value&&/^[1-9][0-9]{0,5}$/.test(value)?Number(value):1
}
