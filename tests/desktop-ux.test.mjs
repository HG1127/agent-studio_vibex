import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8")

test("desktop home prioritizes actionable owner-scoped pending Agent tasks",()=>{
  const page=src("src/components/home/WorkspaceOverview.tsx")
  const server=src("pocketbase/pb_hooks/agent_runs_api.pb.js")
  assert.match(page,/id="waiting-runs"/)
  assert.match(page,/awaiting_input/)
  assert.match(page,/pending_count/)
  assert.match(page,/去回复/)
  assert.match(page,/去审批/)
  assert.match(page,/展开更多待办/)
  assert.match(page,/aria-expanded=\{expandedPending\}/)
  assert.match(server,/rh_user_id=\{:uid\} AND status IN \('awaiting_input','awaiting_approval'\)/)
  assert.match(server,/pending_items: pendingItems/)
  assert.doesNotMatch(server,/pendingItems\.push\(\{[^}]*instruction/s)
})

test("saved Agents offer explicit edit and direct-run actions",()=>{
  const page=src("src/components/home/SavedSpecsList.tsx")
  assert.match(page,/编辑方案/)
  assert.match(page,/aria-label=\{\`试跑 Agent：/)
  assert.match(page,/\/agent-run\?spec=/)
})

test("run configuration separates essential selections from optional advanced detail",()=>{
  const p=src("src/components/agent-run/SpecConfigPanel.tsx")
  assert.match(p,/id="run-tool-permissions"/)
  assert.match(p,/id="run-advanced-settings"/)
  assert.match(p,/调整正式方案/)
  assert.match(p,/\$\{disconnected\} 项待连接/)
  assert.match(p,/仅对本次试跑生效/)
  assert.match(p,/onEditSpec/)
})

test("running approval toggle never silently overwrites the persisted AgentSpec",()=>{
  const hook=src("src/pages/AgentRun/useAgentRun.ts")
  const match=hook.match(/const handleToggleRequireApproval = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/)
  assert.ok(match,"Temporary trial settings should be local only")
  assert.match(match[1],/setRequireApproval/)
  assert.doesNotMatch(match[1],/fetch\(|setSpecList|PATCH|agent_specs/)
  assert.match(hook,/require_approval: requireApproval/)
  assert.match(hook,/startInFlightRef\.current = true/)
  assert.match(hook,/startInFlightRef\.current = false/)
})

test("completed result first, execution trace and quality rules expand on demand",()=>{
  const page=src("src/pages/AgentRun/AgentRunPage.tsx")
  assert.ok(page.indexOf("<RunResultPanel")<page.indexOf('id="run-execution-trace"'))
  assert.match(page,/id="run-quality-checks"/)
  assert.match(page,/const finished=/)
  const launcher=src("src/components/agent-run/RunLauncher.tsx")
  assert.match(launcher,/event\.ctrlKey\|\|event\.metaKey/)
  assert.match(launcher,/event\.key==="Enter"/)
})

test("contextual editor targets selected Agent, not a stale run URL",()=>{
  const config=src("src/pages/AgentRun/AgentRunPage.tsx")
  const shell=src("src/components/site/SiteShell.tsx")
  const quick=src("src/components/site/SavedAgentQuickEditor.tsx")
  assert.match(config,/studio:open-agent-editor/)
  assert.match(config,/specId:p\.selectedSpecId/)
  assert.match(shell,/preferredSpecId=\{quickEditorSpecId\}/)
  assert.match(quick,/safeAgentSpecId\(preferredSpecId\)/)
})
