export type ScheduleRule = {
  recurrence_kind: "once" | "interval" | "daily" | "weekly"
  start_at_ms: number
  interval_minutes?: number
  time_zone?: string
  local_time?: string
  weekday?: number
}
export function validTimeZone(timeZone: string): boolean
export function zonedDateTimeToEpoch(dateText: string, timeText: string, timeZone: string): number
export function zonedDateString(ms: number, timeZone: string): string
export function nextScheduleTime(rule: ScheduleRule, afterMs: number, skipLocalDateMs?: number | null): number | null
export function scheduleDescription(rule: ScheduleRule): string
