// Shared browser/Node recurrence calculations. PocketBase Goja has no Intl.
// Clock times are interpreted in the configured IANA timezone, including DST.
const MS_DAY = 86400000
const formatters = new Map()

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }))
  }
  return formatters.get(timeZone)
}

export function validTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length > 64 || !/^[A-Za-z0-9_+\/-]+$/.test(timeZone)) return false
  try {
    formatter(timeZone).format(new Date())
    return true
  } catch { return false }
}

function localParts(ms, timeZone) {
  const fields = Object.fromEntries(
    formatter(timeZone).formatToParts(new Date(ms))
      .filter(p => p.type !== "literal")
      .map(p => [p.type, Number(p.value)]),
  )
  return { y: fields.year, m: fields.month, d: fields.day, h: fields.hour, min: fields.minute }
}

function localUtc(date, hours, minutes) {
  return Date.UTC(date.y, date.m - 1, date.d, hours, minutes)
}

function possibleInstants(date, hours, minutes, timeZone) {
  // Probe both sides of timezone transitions. Ambiguous autumn times have two
  // valid instants; skipped spring times have none, so they are not fabricated.
  const localEpoch = localUtc(date, hours, minutes)
  const seen = new Set()
  for (const span of [-48, -36, -24, -12, 0, 12, 24, 36, 48]) {
    const test = localEpoch + span * 3600000
    const parts = localParts(test, timeZone)
    const offset = localUtc(parts, parts.h, parts.min) - test
    const candidate = localEpoch - offset
    const candidateParts = localParts(candidate, timeZone)
    if (candidateParts.y === date.y && candidateParts.m === date.m &&
        candidateParts.d === date.d && candidateParts.h === hours &&
        candidateParts.min === minutes) seen.add(candidate)
  }
  return [...seen].sort((a, b) => a - b)
}

export function nextScheduleTime(schedule, afterMs, skipLocalDateMs = null) {
  if (!Number.isFinite(afterMs)) throw new Error("invalid_after_time")
  const kind = String(schedule.recurrence_kind || "")
  const start = Number(schedule.start_at_ms || 0)
  if (!Number.isFinite(start) || start <= 0) throw new Error("invalid_start_at")
  if (kind === "once") return start > afterMs ? start : null
  if (kind === "interval") {
    const minutes = Number(schedule.interval_minutes)
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10080) throw new Error("invalid_interval")
    const every = minutes * 60000
    if (start > afterMs) return start
    return start + (Math.floor((afterMs - start) / every) + 1) * every
  }
  if (kind !== "daily" && kind !== "weekly") throw new Error("invalid_recurrence_kind")
  const timeZone = String(schedule.time_zone || "")
  if (!validTimeZone(timeZone)) throw new Error("invalid_time_zone")
  const localTime = String(schedule.local_time || "")
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error("invalid_local_time")
  const [hours, minutes] = localTime.split(":").map(Number)
  const dayOfWeek = Number(schedule.weekday)
  if (kind === "weekly" && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) throw new Error("invalid_weekday")
  const after = Math.max(afterMs, start - 1)
  const local = localParts(after, timeZone)
  const localDate = Date.UTC(local.y, local.m - 1, local.d)
  const skip = skipLocalDateMs == null ? null : localParts(skipLocalDateMs, timeZone)
  for (let d = 0; d < 9; d++) {
    const dateObj = new Date(localDate + d * MS_DAY)
    if (kind === "weekly" && dateObj.getUTCDay() !== dayOfWeek) continue
    const date = { y: dateObj.getUTCFullYear(), m: dateObj.getUTCMonth() + 1, d: dateObj.getUTCDate() }
    if (skip && date.y === skip.y && date.m === skip.m && date.d === skip.d) continue
    const possible = possibleInstants(date, hours, minutes, timeZone)
    const next = possible.find(x => x > afterMs && x >= start)
    if (next !== undefined) return next
  }
  throw new Error("next_schedule_time_unavailable")
}


// Convert a date and wall-clock time in an IANA timezone into a real UTC instant.
// Reject spring-forward skipped times. For ambiguous fall-back times choose the first occurrence.
export function zonedDateTimeToEpoch(dateText, timeText, timeZone) {
  if (!validTimeZone(timeZone)) throw new Error("invalid_time_zone")
  if (typeof dateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new Error("invalid_local_date")
  if (typeof timeText !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeText)) throw new Error("invalid_local_time")
  const [y, m, d] = dateText.split("-").map(Number)
  const normalized = new Date(Date.UTC(y, m - 1, d))
  if (normalized.getUTCFullYear() !== y || normalized.getUTCMonth() + 1 !== m || normalized.getUTCDate() !== d) {
    throw new Error("invalid_local_date")
  }
  const [h, min] = timeText.split(":").map(Number)
  const matches = possibleInstants({ y, m, d }, h, min, timeZone)
  if (matches.length === 0) throw new Error("dst_local_time_missing")
  return matches[0]
}

export function zonedDateString(ms, timeZone) {
  if (!validTimeZone(timeZone)) throw new Error("invalid_time_zone")
  const p = localParts(ms, timeZone)
  return [String(p.y).padStart(4, "0"), String(p.m).padStart(2, "0"), String(p.d).padStart(2, "0")].join("-")
}
export function scheduleDescription(schedule) {
  if (schedule.recurrence_kind === "once") return "单次执行"
  if (schedule.recurrence_kind === "interval") return `每 ${schedule.interval_minutes} 分钟`
  if (schedule.recurrence_kind === "daily") return `每天 ${schedule.local_time}（${schedule.time_zone}）`
  const names = ["周日","周一","周二","周三","周四","周五","周六"]
  if (schedule.recurrence_kind === "weekly") return `每${names[Number(schedule.weekday)]} ${schedule.local_time}（${schedule.time_zone}）`
  return "未知计划"
}
