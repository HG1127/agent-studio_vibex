// Real React SSR with actual Vite/React packages. No browser/network/API/DB run.
import test, {before, after} from "node:test"
import assert from "node:assert/strict"
import {createElement} from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {createServer} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {emptyTemplateMarketView} from "../src/lib/pgNativeTemplateMarketSession.ts"
import {deriveAgentTemplateMarketSnapshot} from "../services/pg-api/src/agent-template-market-result.ts"
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), id = "00000000-0000-4000-8000-000000000001", sha = "a".repeat(64)
const snapshot = deriveAgentTemplateMarketSnapshot({goal: "FULL GOAL", task_scope: "FULL SCOPE", deliverables: ["FULL DELIVERY"], task_plan: ["FULL PLAN"], done_criteria: ["FULL DONE"], tools: ["web_search"], require_plan_review: true}).snapshot
const item = (extra = {}) => ({id, name: "完整模板", description: "模板用途", category: "research", source_spec_id: "", built_in: false, public: true, use_count: 5, created: "2026-10-29T00:00:00.000Z", revision: 1, snapshot_sha256: sha, ...extra})
let server, Panel, Presentation
before(async () => {server = await createServer({configFile: false, envFile: false, root: repo, mode: "test", plugins: [react()], cacheDir: path.join(repo, ".tmp/F07-ssr-cache"),
  optimizeDeps: {noDiscovery: true, include: [], entries: []}, ssr: {optimizeDeps: {noDiscovery: true, include: [], entries: []}}, server: {middlewareMode: true, host: "127.0.0.1", hmr: false, ws: false, watch: null}})
  const m = await server.ssrLoadModule("/src/pages/PgNativePilot/PgNativeTemplateMarketPanel.tsx"); Panel = m.default; Presentation = m.PgNativeTemplateMarketPresentation})
after(async () => {await server?.close()})
const base = () => ({...emptyTemplateMarketView(id, "login-one"), active: true, available: true, writes: true})
const render = (view = base(), props = {}) => renderToStaticMarkup(createElement(Presentation, {employeeId: id, scopeKey: "login-one", active: true, available: true, writes: true, view, bound: true, onConfigureAgent() {}, ...props}))
test("default mount is off and SSR does not read API or start any effect", () => {
  const api = new Proxy({}, {get() {throw Error("SSR accessed API")}})
  const html = renderToStaticMarkup(createElement(Panel, {api, employeeId: id, scopeKey: "login-one", active: true, available: true, onExpired() {}, onConfigureAgent() {}}))
  assert.match(html, /模板市场暂未开放/); assert.doesNotMatch(html, /确认发布这个模板|确认复制为我的助手/)
  assert.equal(render(base(), {active: false}), "")
})
test("employee/API/session-generation mismatch hides all retained descriptions immediately", () => {
  const v = {...base(), detail: {item: item(), snapshot, is_mine: true, author_tail: "0001"}}
  for (const props of [{employeeId: "00000000-0000-4000-8000-000000000002"}, {scopeKey: "login-two"}, {bound: false}, {available: false}]) {
    const html = render(v, props); assert.match(html, /暂未开放/); assert.doesNotMatch(html, /FULL GOAL|FULL SCOPE|FULL DELIVERY|FULL PLAN|FULL DONE/)
  }
})
test("market/mine/category/search and failed-versus-empty state remain distinct", () => {
  const html = render({...base(), marketStatus: "ready", market: [{...item(), spec: snapshot.spec, is_mine: false, author_tail: "0001"}]})
  for (const value of ["逛市场", "我的发布", "搜索模板", "全部", "研究", "问答", "分析", "其他", "完整模板", "模板用途", "已复用 5 次"]) assert.ok(html.includes(value), value)
  const mine = render({...base(), tab: "mine", mineStatus: "ready", mine: [item({public: false})]})
  assert.match(mine, /已下架|重新上架/); assert.match(mine, /永久删除/)
  const error = render({...base(), marketStatus: "error"}); assert.match(error, /列表加载失败/); assert.doesNotMatch(error, /没有符合条件/)
  assert.match(render({...base(), marketStatus: "ready"}), /没有符合条件/)
})
test("publication shows complete safe text and an explicit initially unchecked review checkbox", () => {
  const v = {...base(), publishOpen: true, sourcesStatus: "ready", publishDraft: {sourceId: id, name: "公开模板", description: "用途", category: "research", reviewed: false},
    publishPreview: {name: "公开模板", description: "用途", snapshot, removed: {}, public_text_review_required: true, authority: false}}
  const html = render(v)
  for (const value of ["公开内容预览", "FULL GOAL", "FULL SCOPE", "FULL DELIVERY", "FULL PLAN", "FULL DONE", "网页搜索", "执行前需确认方案", "我已核查全部公开文字", "确认发布这个模板"]) assert.ok(html.includes(value), value)
  assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /type="checkbox"[^>]*checked=""/)
  assert.match(html, /disabled=""[^>]*>确认发布这个模板/)
  assert.match(render({...v, publishDraft: {...v.publishDraft, reviewed: true}}), /checked=""/)
})
test("copy confirmation leads to resource setup and never presents automatic execution", () => {
  const v = {...base(), detail: {item: item(), snapshot, is_mine: false, author_tail: "0001"}, copyName: "我的副本", usePreview: {name: "我的副本", snapshot}}
  const html = render(v); assert.match(html, /确认复制为我的助手/); assert.match(html, /不会自动运行助手/); assert.match(html, /来源资源的权限不会随模板复制/)
  const saved = render({...base(), receipt: {operation: "use", spec_id: id}, notice: "已复制"}); assert.match(saved, /配置我的模型与资源/)
  assert.doesNotMatch(saved, /立即运行|开始执行/)
})
test("unpublish/republish/delete show exact frozen content and never imply deleted content can be restored", () => {
  for (const action of ["unpublish", "republish", "delete"]) {
    const html = render({...base(), lifecycle: {action, detail: {item: item({public: action !== "republish"}), snapshot}, confirmed: false}})
    assert.match(html, /确认模板操作/); assert.match(html, /FULL PLAN/); assert.match(html, /type="checkbox"/)
    if (action === "delete") {assert.match(html, /永久删除，无法恢复/); assert.doesNotMatch(html, /恢复已删除/)}
    if (action === "republish") assert.match(html, /不会替换为原助手的最新方案/)
  }
})
test("unknown result offers original lookup and suppresses all new confirmation buttons", () => {
  const html = render({...base(), pending: {operation: "use", request_id: id}, error: "还不能确认本次操作结果"})
  assert.match(html, /查询原操作结果/); assert.doesNotMatch(html, /助手副本已保存|配置我的模型与资源|确认发布这个模板|确认复制为我的助手/)
  assert.match(html, /disabled=""[^>]*>发布我的模板/)
})
test("public prose is escaped and resource setup remains disabled in read-only mode", () => {
  const dangerous = {...snapshot, spec: {...snapshot.spec, goal: '<img src=x onerror="bad">'}}
  const html = render({...base(), detail: {item: item(), snapshot: dangerous}, copyName: "副本"}, {writes: false})
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /当前只可浏览模板/)
  assert.match(html, /disabled=""[^>]*>预览我的副本/)
})
