import test from "node:test"
import assert from "node:assert/strict"
import { nextScheduleTime, validTimeZone, zonedDateTimeToEpoch, zonedDateString } from "../src/lib/scheduleTime.js"

test("interval stays aligned with its original anchor", () => {
  const origin = Date.UTC(2026, 9, 13, 6, 0)
  const rule = { recurrence_kind: "interval", interval_minutes: 30, start_at_ms: origin }
  assert.equal(nextScheduleTime(rule, origin - 1), origin)
  assert.equal(nextScheduleTime(rule, origin), origin + 1800000)
  assert.equal(nextScheduleTime(rule, origin + 75 * 60000), origin + 90 * 60000)
  assert.throws(() => nextScheduleTime({ ...rule, interval_minutes: 1 }, origin), /invalid_interval/)
})
test("Tokyo daily and weekly honor IANA timezone", () => {
  const from = Date.UTC(2026, 9, 13, 0, 0)
  assert.equal(nextScheduleTime({
    recurrence_kind: "daily", start_at_ms: from - 1000, time_zone: "Asia/Tokyo", local_time: "10:30",
  }, from), Date.UTC(2026, 9, 13, 1, 30))
  assert.equal(nextScheduleTime({
    recurrence_kind: "weekly", start_at_ms: from - 1000, time_zone: "Asia/Tokyo", local_time: "10:30", weekday: 3,
  }, from), Date.UTC(2026, 9, 14, 1, 30))
})
test("spring DST gap skips an impossible wall-clock time", () => {
  const before = Date.UTC(2026, 2, 8, 6, 0)
  const rule = { recurrence_kind: "daily", start_at_ms: before - 1000, time_zone: "America/New_York", local_time: "02:30" }
  assert.equal(nextScheduleTime(rule, before), Date.UTC(2026, 2, 9, 6, 30))
})
test("fall DST overlap runs only once for that local calendar day", () => {
  const before = Date.UTC(2026, 10, 1, 4, 0)
  const rule = { recurrence_kind: "daily", start_at_ms: before - 1000, time_zone: "America/New_York", local_time: "01:30" }
  const first = nextScheduleTime(rule, before)
  assert.equal(first, Date.UTC(2026, 10, 1, 5, 30))
  const following = nextScheduleTime(rule, first, first)
  assert.equal(following, Date.UTC(2026, 10, 2, 6, 30))
})
test("one-time zoned datetime validates DST gaps and invalid calendar dates", () => {
  assert.equal(zonedDateTimeToEpoch("2026-10-14", "09:00", "Asia/Tokyo"), Date.UTC(2026,9,14,0,0))
  assert.equal(zonedDateString(Date.UTC(2026,9,13,20,0), "Asia/Tokyo"), "2026-10-14")
  assert.throws(() => zonedDateTimeToEpoch("2026-03-08", "02:30", "America/New_York"), /dst_local_time_missing/)
  assert.equal(zonedDateTimeToEpoch("2026-11-01","01:30","America/New_York"),Date.UTC(2026,10,1,5,30))
  assert.throws(() => zonedDateTimeToEpoch("2026-02-30", "10:00", "UTC"), /invalid_local_date/)
})
test("once, input errors, and timezone validation are fail closed", () => {
  const now = Date.UTC(2026, 9, 13, 0, 0)
  assert.equal(nextScheduleTime({ recurrence_kind: "once", start_at_ms: now+1000 }, now), now+1000)
  assert.equal(nextScheduleTime({ recurrence_kind: "once", start_at_ms: now }, now), null)
  assert.equal(validTimeZone("Asia/Tokyo"), true)
  assert.equal(validTimeZone("Invalid/Place"), false)
  assert.throws(() => nextScheduleTime({ recurrence_kind:"daily",start_at_ms:now,time_zone:"Invalid/Place",local_time:"08:00" },now),/invalid_time_zone/)
})
