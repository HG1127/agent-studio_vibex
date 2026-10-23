import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { adaptHarnessData, filterRuns, HARNESS_SOURCES, isHarnessAuthFailure, runDetailHref, sourceFailure } from "../src/lib/harnessData.ts"
import { HarnessAuthError, requestHarnessSource } from "../src/lib/harnessRequest.ts"
import { searchStudioRoutes, workspaceForPath } from "../src/lib/studioNavigation.ts"

test("Harness is an employee-accessible second-level route in the run center", () => {
  assert.equal(workspaceForPath("/harness", "employee").label, "运行与验收")
  assert.equal(searchStudioRoutes("Harness", "employee")[0].to, "/harness")
})
test("refresh transport issues real bounded GETs with auth, no cache, cancellation and no owner header", async () => {
  const controller = new AbortController()
  let calls = 0
  const transport = async (url, options) => {
    calls++
    assert.equal(url, "http://isolated.test/api/agent-runs/recent?limit=20")
    assert.deepEqual(options.headers, { Authorization: "fixture-token" })
    assert.equal(options.cache, "no-store")
    assert.equal(options.signal, controller.signal)
    return { ok: true, status: 200, json: async () => ({ ok: true, items: [] }) }
  }
  for (let index = 0; index < 2; index++) await requestHarnessSource("agents", "http://isolated.test", { Authorization: "fixture-token" }, controller.signal, transport)
  assert.equal(calls, 2, "a second refresh must issue another request")
  for (const status of [401, 412]) await assert.rejects(requestHarnessSource("agents", "", {}, controller.signal, async () => ({ status })), HarnessAuthError)
  await assert.rejects(requestHarnessSource("agents", "", {}, controller.signal, async () => ({ status: 500, ok: false })), /HTTP 500/)
  await assert.rejects(requestHarnessSource("agents", "", {}, controller.signal, async () => {
    controller.abort()
    return { ok: true, status: 200, json() { throw Error("must not parse after unmount") } }
  }), { name: "AbortError" })
})

function route(file, path, app) {
  const routes = new Map()
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    routerAdd(method, url, handler) { routes.set(method + " " + url, handler) },
    onBootstrap() {}, $app: app, $os: { getenv: () => "" },
    DynamicModel: function (value) { Object.assign(this, value) },
    arrayOf() { return [] },
  }, { timeout: 1000 })
  return routes.get("GET " + path)
}
const event = () => ({ requestInfo: () => ({ headers: { x_rh_user_id: "verified-owner" }, query: { limit: "20" } }), json: (status, data) => ({ status, data }) })

test("recent adapters preserve actual run identity, type, source and bounded history", () => {
  const agents = adaptHarnessData("agents", { ok: true, items: [{ id: "a/b", spec_name: "真实 Agent", status: "failed", source: "schedule", created: "2026-10-20" , api_key: "omit" }] }).runs
  const workflows = adaptHarnessData("workflows", { ok: true, items: [{ id: "w", workflow_name: "真实流程", status: "running", created: "2026-10-19" }] }).runs
  assert.equal(agents[0].source, "schedule")
  assert.equal(runDetailHref(agents[0]), "/run-detail?run=a%2Fb")
  assert.equal(runDetailHref(workflows[0]), null)
  assert.deepEqual(filterRuns([...agents, ...workflows], "workflow", "failed"), [])
  assert.equal(filterRuns([...workflows, ...agents], "all", "all")[0].id, "a/b")
  assert.equal(JSON.stringify(agents).includes("omit"), false)
  assert.throws(() => adaptHarnessData("agents", { ok: true, items: Array(21).fill({ id: "a", status: "failed", created: "" }) }))
})
test("failed/missing fields never fabricate zero; previous snapshots remain explicitly stale", () => {
  for (const key of Object.keys(HARNESS_SOURCES)) {
    assert.throws(() => adaptHarnessData(key, { ok: true }))
    assert.throws(() => adaptHarnessData(key, { ok: false }))
  }
  const previous = { data: { metrics: [{ label: "累计运行", value: 21 }] }, loadedAt: 123, loading: true }
  assert.deepEqual(sourceFailure(previous, "HTTP 500"), { ...previous, loading: false, error: "HTTP 500" })
  assert.equal(sourceFailure({ loading: true }, "offline").data, undefined)
  assert.equal(isHarnessAuthFailure(401), true)
  assert.equal(isHarnessAuthFailure(412), true)
  assert.equal(isHarnessAuthFailure(500), false)
})
test("full owner cumulative stats are exact above 500 and fail if any count fails", () => {
  const queries = []
  const app = { db: () => ({ newQuery(sql) {
    queries.push(sql)
    assert.match(sql, /rh_user_id = \{:uid\}/)
    assert.doesNotMatch(sql, /LIMIT|OFFSET|SELECT \*/, "all-time counts must not be truncated")
    return { bind(params) {
      assert.equal(params.uid, "verified-owner")
      return { one(row) { row.total = 900 } }
    } }
  } }) }
  const handler = route("pocketbase/pb_hooks/tool_hub_api.pb.js", "/api/tool-hub/stats", app)
  const result = handler(event())
  assert.equal(result.status, 200)
  assert.equal(adaptHarnessData("stats", result.data).metrics[0].value, 1800)
  assert.equal(queries.length, 7)
  assert.equal(new Set(queries).size, 7)
  app.db = () => ({ newQuery() { throw Error("database_unavailable") } })
  assert.equal(handler(event()).status, 500)
})
test("monitor enforces owner and 100/100/500 windows and propagates query failure", () => {
  const calls = []
  const app = { findRecordsByFilter(collection, filter, order, limit, offset, params) {
    assert.equal(filter, "rh_user_id = {:uid}")
    assert.equal(params.uid, "verified-owner")
    assert.equal(order, "-created")
    calls.push([collection, limit])
    return []
  } }
  const handler = route("pocketbase/pb_hooks/tool_hub_api.pb.js", "/api/harness/monitor", app)
  const result = handler(event())
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [["agent_runs", 100], ["workflow_runs", 100], ["tool_invocations", 500]])
  assert.equal(adaptHarnessData("monitor", result.data).metrics.find(x => x.label.includes("Token")).value, 0)
  app.findRecordsByFilter = () => { throw Error("query_failed") }
  assert.equal(handler(event()).status, 500)
})
test("worker status distinguishes absent heartbeat from failed queue/SQL/heartbeat queries", () => {
  for (const fail of ["", "agent_worker_health", "agent_runs", "workflow_runs", "sql"]) {
    const app = { findRecordsByFilter(collection, filter, order, limit, offset, params) {
      if (collection === fail) throw Error("query_failed")
      if (collection !== "agent_worker_health") assert.equal(params.uid, "verified-owner")
      return []
    }, db: () => ({ newQuery: () => ({ bind(params) {
      assert.equal(params.uid, "verified-owner")
      return {
        one() { if (fail === "sql") throw Error("sql_failed") },
        all() { if (fail === "sql") throw Error("sql_failed") },
      }
    } }) }) }
    const handler = route("pocketbase/pb_hooks/background_worker.pb.js", "/api/worker/status", app)
    const result = handler(event())
    assert.equal(result.status, fail ? 500 : 200, fail)
    if (!fail) assert.equal(adaptHarnessData("worker", result.data).metrics[0].value, "未启用")
  }
})
test("Harness Worker metrics distinguish last reported component failures from live process health", () => {
  const queue = Object.fromEntries([
    "agent_running", "workflow_running", "awaiting_approval", "needs_review",
    "paused", "failed_recent", "scheduled_active", "scheduled_pending",
    "scheduled_overdue", "ready_estimate", "inflight",
  ].map(key => [key, 0]))
  const base = {
    ok: true, enabled: true, alive: true, last_seen: "2026-10-22",
    last_step_at: "", components_observed_at_ms: 1792657000000,
    components: {
      schedules: { state: "retrying", failures: 2, retry_at_ms: 1792657005000 },
      knowledge: { state: "healthy", failures: 0, retry_at_ms: 0 },
    },
    queue: { ...queue, sampled: false, sample_limit_per_kind: 100 },
  }
  const healthy = adaptHarnessData("worker", base)
  assert.equal(healthy.metrics.find(m => m.label === "Worker（共享执行器）").value, "近期有心跳")
  assert.equal(healthy.metrics.find(m => m.label === "定时调度最近报告").value, "上次报告暂不可用")
  assert.equal(healthy.metrics.find(m => m.label === "知识索引最近报告").value, "最近检查正常")
  const stale = adaptHarnessData("worker", { ...base, alive: false })
  assert.equal(stale.metrics.find(m => m.label === "定时调度最近报告").value, "未核验")
  assert.equal(stale.metrics.find(m => m.label === "知识索引最近报告").value, "未核验")
  assert.throws(() => adaptHarnessData("worker", {
    ...base, components: { ...base.components, schedules: { state: "leak-secret", failures: 1, retry_at_ms: 0 } },
  }))
})

test("recent Agent and Workflow APIs remain owner-scoped, bounded, and fail on query errors", () => {
  for (const kind of ["agent", "workflow"]) {
    let recentCalls = 0, pendingCalls = 0, sqlCounts = 0
    const getRecords = (collection, filter, order, limit, offset, params) => {
      assert.equal(params.uid, "verified-owner")
      assert.equal(limit, 20)
      assert.equal(offset, 0)
      if (kind === "agent" && filter.includes("awaiting_input")) {
        pendingCalls++
        assert.equal(collection, "agent_runs")
        assert.match(filter, /rh_user_id = \{:uid\}/)
        assert.match(filter, /awaiting_approval/)
      } else {
        recentCalls++
        assert.equal(filter, "rh_user_id = {:uid}")
      }
      return []
    }
    const app = {
      findRecordsByFilter: getRecords,
      db: () => ({ newQuery(sql) {
        sqlCounts++
        assert.match(sql, /COUNT\(\*\).*agent_runs/)
        assert.match(sql, /rh_user_id=\{:uid\}/)
        assert.match(sql, /awaiting_input/)
        return { bind(params) {
          assert.equal(params.uid, "verified-owner")
          return { one(model) { model.total = 0 } }
        } }
      } }),
    }
    const file = kind === "agent" ? "agent_runs_api" : "workflow_api"
    const handler = route("pocketbase/pb_hooks/" + file + ".pb.js",
      "/api/" + kind + "-runs/recent", app)
    const successful = handler(event())
    assert.equal(successful.status, 200, JSON.stringify(successful.data))
    assert.equal(recentCalls, 1)
    if (kind === "agent") {
      assert.equal(pendingCalls, 1)
      assert.equal(sqlCounts, 1)
      assert.equal(successful.data.pending_count, 0)
      assert.equal(successful.data.pending_items.length, 0)
    } else {
      assert.equal(pendingCalls, 0)
      assert.equal(sqlCounts, 0)
    }
    app.findRecordsByFilter = () => { throw Error("query_failed") }
    assert.equal(handler(event()).status, 500)
    if (kind === "agent") {
      app.findRecordsByFilter = getRecords
      app.db = () => ({ newQuery() { throw Error("pending_count_unavailable") } })
      assert.equal(handler(event()).status, 500,
        "A failed pending count cannot be silently reported as zero")
    }
  }
})
