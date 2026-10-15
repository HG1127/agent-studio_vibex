import { validTimeZone, zonedDateString } from "@/lib/scheduleTime.js"
import type { ScheduleRule } from "@/lib/scheduleTime.js"

export type TargetKind = "agent" | "workflow"
export type RuleKind = "once" | "interval" | "daily" | "weekly"
export type Target = { id: string; name: string }
export type ModelConnection = { id: string; name: string; enabled: boolean; models: string[] }
export type ScheduleTask = Omit<ScheduleRule, "time_zone" | "local_time" | "weekday" | "interval_minutes"> & {
  time_zone: string; local_time: string; weekday: number; interval_minutes: number;
  id: string; name: string; target_kind: TargetKind; target_id: string;
  instruction: string; model_connection_id: string; model_id: string;
  max_steps: number; next_at_ms: number; last_due_ms: number;
  revision: number; enabled: boolean; created_ms: number;
}
export type ScheduleHistory = {
  id: string; schedule_id: string; scheduled_for_ms: number;
  run_id: string; status: string; attempts: number; error: string;
}
export type ScheduleForm = {
  name: string; target_kind: TargetKind; target_id: string; instruction: string;
  recurrence_kind: RuleKind; time_zone: string; start_date: string;
  local_time: string; weekday: number; interval_minutes: number;
  model_connection_id: string; model_id: string; max_steps: number;
}
export const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
export const TIME_ZONES = [
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Singapore", "Asia/Dubai",
  "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin",
]
export const FORM_CLASS = "mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
export const LABEL_CLASS = "text-xs font-medium text-muted-foreground"
export const formatScheduledDate = (ms: number) => ms ? new Date(ms).toLocaleString("zh-CN", { year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" }) : "—"
export const scheduleHistoryLabel = (s: string) => ({
  started: "已启动", succeeded: "已完成", running: "运行中",
  failed: "失败", pending:"待调度", launching:"启动中", retryable:"等待重试",
  failed_start:"启动失败", skipped_changed:"配置已修改", skipped_overlap:"上次任务未结束",
  cancelled_schedule:"计划已停用", invalid_schedule:"时间规则无效",
  awaiting_approval:"等待人工批准", paused:"已暂停", cancelled:"已取消",
} as Record<string,string>)[s] || s

export function defaultScheduleForm(): ScheduleForm {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"
  const zone = validTimeZone(browserZone) ? browserZone : "Asia/Shanghai"
  return {
    name:"",target_kind:"agent",target_id:"",instruction:"",
    recurrence_kind:"daily",time_zone:zone,
    start_date:zonedDateString(Date.now()+86400000,zone),local_time:"09:00",
    weekday:1,interval_minutes:60,model_connection_id:"",model_id:"",max_steps:10,
  }
}
