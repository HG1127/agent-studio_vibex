import {HttpError,isUuid} from "./contracts.ts"
import {safeScheduleDraftInput,type ScheduleDraftRow,type ScheduleDraftRule} from "./schedule-draft-repository.ts"
import {nextScheduleTime,zonedDateTimeToEpoch} from "../../../shared/schedule-time.mjs"
export const SCHEDULE_BACKGROUND_ACK="AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1"
export const SCHEDULE_KNOWLEDGE_ACK="AUTHORIZE_SCHEDULED_KNOWLEDGE_CHARGES_V1"
export type ScheduleExecution={instruction:string;target_revision:number;max_steps:number;anchor_at:string;expires_at:string|null;max_occurrences:number|null;
  max_auto_effects:number;allow_paid_knowledge:boolean;background_ack:typeof SCHEDULE_BACKGROUND_ACK;knowledge_charge_ack:typeof SCHEDULE_KNOWLEDGE_ACK|null}
export type ExecutionSchedule=ScheduleDraftRow&{execution:Partial<ScheduleExecution>;deleted_at:string|null}
const format="pg_schedule_execution_v2"
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max
function invalid():never{throw new HttpError(400,"invalid_schedule_activation")}
function instant(v:unknown):string{if(typeof v!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)invalid();return v}
export function executionRule(row:Pick<ExecutionSchedule,"name"|"kind"|"agent_spec_id"|"workflow_id"|"time_zone"|"recurrence">):ScheduleDraftRule{
  return safeScheduleDraftInput({name:row.name,kind:row.kind,target_id:row.agent_spec_id??row.workflow_id,time_zone:row.time_zone,rule:row.recurrence.rule}).rule
}
export function recurrenceNext(rule:ScheduleDraftRule,zone:string,anchor:string,after:number,skip:number|null=null):number|null{
  const start=rule.kind==="once"?zonedDateTimeToEpoch(rule.start_date,rule.local_time,zone):Date.parse(anchor)
  return nextScheduleTime({recurrence_kind:rule.kind,start_at_ms:start,time_zone:zone,...("local_time" in rule?{local_time:rule.local_time}:{}),
    ...(rule.kind==="interval"?{interval_minutes:rule.interval_minutes}:{}),...(rule.kind==="weekly"?{weekday:rule.weekday}:{})},after,skip)
}
export function parseScheduleActivation(raw:unknown,row:ExecutionSchedule,now=Date.now(),possibleReplay=false){
  const keys=["expected_revision","expected_target_revision","instruction","max_steps","anchor_at","expires_at","max_occurrences","max_auto_effects","background_ack","knowledge_charge_ack","request_id"]
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid();const v=raw as Record<string,unknown>
  if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||!integer(v.expected_revision,1,Number.MAX_SAFE_INTEGER)||!integer(v.expected_target_revision,1,Number.MAX_SAFE_INTEGER)||
    typeof v.instruction!=="string"||!v.instruction.trim()||v.instruction.length>1200||v.instruction.includes("\0")||!integer(v.max_steps,1,5)||row.kind==="workflow"&&v.max_steps!==1||
    !integer(v.max_auto_effects,1,10000)||v.max_occurrences!==null&&!integer(v.max_occurrences,1,1000000)||v.background_ack!==SCHEDULE_BACKGROUND_ACK||
    v.knowledge_charge_ack!==null&&v.knowledge_charge_ack!==SCHEDULE_KNOWLEDGE_ACK||!isUuid(v.request_id))invalid()
  const anchor=instant(v.anchor_at),expires=v.expires_at===null?null:instant(v.expires_at),rule=executionRule(row)
  if(!possibleReplay&&(Date.parse(anchor)>now+367*86400000||expires&&(Date.parse(expires)<=now||Date.parse(expires)>now+366*86400000)))invalid()
  let next:number|null
  try{next=recurrenceNext(rule,row.time_zone,anchor,now)}catch{throw new HttpError(400,"invalid_schedule_activation_time")}
  if(!possibleReplay&&(next===null||expires&&next>=Date.parse(expires)))throw new HttpError(409,"schedule_has_no_future_occurrence")
  const execution:ScheduleExecution={instruction:v.instruction,target_revision:Number(v.expected_target_revision),max_steps:Number(v.max_steps),anchor_at:anchor,
    expires_at:expires,max_occurrences:v.max_occurrences as number|null,max_auto_effects:Number(v.max_auto_effects),allow_paid_knowledge:v.knowledge_charge_ack===SCHEDULE_KNOWLEDGE_ACK,
    background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:v.knowledge_charge_ack as typeof SCHEDULE_KNOWLEDGE_ACK|null}
  return {revision:Number(v.expected_revision),request_id:v.request_id,execution,next:next===null?null:new Date(next).toISOString()}
}
export const scheduleExecutionFormat=format
