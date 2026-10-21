import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const page = "src/pages/AgentCreate/AgentCreatePage.tsx"
const source = ts.createSourceFile(page, readFileSync(new URL("../" + page, import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let refreshCallback, mountEffect
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "refreshModels" &&
      node.initializer && ts.isCallExpression(node.initializer)) {
    refreshCallback = node.initializer.arguments[0]
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
    const dependencies = node.arguments[1]
    if (dependencies && ts.isArrayLiteralExpression(dependencies) &&
        dependencies.elements.some(value => ts.isIdentifier(value) && value.text === "refreshModels")) {
      mountEffect = node.arguments[0]
    }
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(refreshCallback, "the page must provide its real refreshModels callback")
assert.ok(mountEffect, "the page must provide its real model-loading lifecycle effect")

// Compile the actual page handlers into an isolated context. Only transport and
// React state setters are controlled; request ordering/cleanup is never copied.
function compileExpression(node, context) {
  const compiled = ts.transpileModule(`globalThis.extracted = ${node.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  vm.runInContext(compiled, context, { filename: page })
  const extracted = context.extracted
  delete context.extracted
  return extracted
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const response = items => ({ ok: true, json: async () => ({ items }) })
const connection = (...models) => ({ enabled: true, models })

function harness() {
  const pending = [], operations = [], writes = []
  const state = { modelState: "ready", enabledModels: 0, resourceMessage: "" }
  const setter = key => value => { writes.push({ key, value }); state[key] = value }
  const context = vm.createContext({
    modelRequest: { current: 0 },
    fetch: () => { const request = deferred(); pending.push(request); return request.promise },
    getPocketBaseUrl: () => "https://fixture.invalid", vibexAuthHeaders: () => ({}),
    setModelState: setter("modelState"), setEnabledModels: setter("enabledModels"),
    setResourceMessage: setter("resourceMessage"),
  })
  const actualRefresh = compileExpression(refreshCallback, context)
  const refresh = () => { const operation = actualRefresh(); operations.push(operation); return operation }
  context.refreshModels = refresh
  return { state, pending, operations, writes, refresh, mount: compileExpression(mountEffect, context) }
}

test("a newer empty model catalog cannot be replaced by an older successful response", async () => {
  const h = harness()
  const older = h.refresh(), newer = h.refresh()
  h.pending[1].resolve(response([]))
  await newer
  assert.equal(h.state.modelState, "ready")
  assert.equal(h.state.enabledModels, 0)
  const latest = structuredClone(h.state)
  h.pending[0].resolve(response([connection("obsolete-model")]))
  await older
  assert.deepEqual(h.state, latest, "an obsolete success must not restore a removed model")
})

test("an older failed request cannot replace the latest successful model refresh", async () => {
  const h = harness()
  const older = h.refresh(), newer = h.refresh()
  h.pending[1].resolve(response([connection("current-a", "current-b")]))
  await newer
  assert.equal(h.state.enabledModels, 2)
  assert.equal(h.state.modelState, "ready")
  const latest = structuredClone(h.state)
  h.pending[0].reject(new Error("obsolete request went offline"))
  await older
  assert.deepEqual(h.state, latest, "an obsolete failure must not turn the new catalog unavailable")
  assert.equal(h.state.resourceMessage, "")
})

test("a model response whose JSON arrives late cannot bypass the latest request check", async () => {
  const h = harness(), body = deferred(), bodyStarted = deferred()
  const older = h.refresh()
  h.pending[0].resolve({ ok: true, json: () => { bodyStarted.resolve(); return body.promise } })
  await bodyStarted.promise
  const newer = h.refresh()
  h.pending[1].resolve(response([]))
  await newer
  const latest = structuredClone(h.state)
  body.resolve({ items: [connection("obsolete-model")] })
  await older
  assert.deepEqual(h.state, latest)
  assert.equal(h.state.enabledModels, 0)
})

test("the actual page cleanup invalidates pending model success and failure without state writes", async () => {
  for (const outcome of ["success", "failure"]) {
    const h = harness()
    const cleanup = h.mount()
    await Promise.resolve()
    assert.equal(h.pending.length, 1, "the real mount effect starts the model request")
    assert.equal(typeof cleanup, "function")
    cleanup()
    const latest = structuredClone(h.state), writesAtUnmount = h.writes.length
    if (outcome === "success") h.pending[0].resolve(response([connection("late-model")]))
    else h.pending[0].reject(new Error("request failed after leaving the page"))
    await h.operations[0]
    assert.deepEqual(h.state, latest, `${outcome} after unmount cannot change page state`)
    assert.equal(h.writes.length, writesAtUnmount, `${outcome} after unmount cannot call a setter`)
  }
})
