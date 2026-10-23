import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_WORKER_REQUEST_TIMEOUT_MS,
  MAX_WORKER_REQUEST_TIMEOUT_MS,
  MODEL_HTTP_TIMEOUT_SECONDS,
  WORKER_PROXY_MARGIN_MS,
  resolveWorkerRequestTimeout,
} from "../worker/config.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readSource = relative => fs.readFileSync(path.join(root, relative), "utf8")

test("PocketBase proxy and Agent/Workflow lease windows use the same timeout contract", () => {
  const proxy = readSource("pocketbase/pb_hooks/background_worker.pb.js")
  const agent = readSource("pocketbase/pb_hooks/agent_engine.pb.js")
  const workflow = readSource("pocketbase/pb_hooks/workflow_api.pb.js")
  const model = readSource("pocketbase/pb_hooks/modules/model_request.js")
  assert.match(model, /var MAX_TIMEOUT_SECONDS = 240/)
  assert.match(proxy, /timeout: 300,/,
    "the synchronous PocketBase proxy must outlive the 240-second provider cap")
  assert.match(agent, /MAX_TIMEOUT_SECONDS \* 1000/,
    "Agent dispatch renewal must use the provider timeout constant")
  assert.match(workflow, /MAX_TIMEOUT_SECONDS \* 1000/,
    "Workflow dispatch renewal must use the provider timeout constant")
})

test("outer Worker HTTP deadline exceeds the maximum synchronous model call", () => {
  assert.equal(MODEL_HTTP_TIMEOUT_SECONDS, 240)
  assert.ok(WORKER_PROXY_MARGIN_MS >= 60_000)
  assert.equal(DEFAULT_WORKER_REQUEST_TIMEOUT_MS, 315_000)
  assert.ok(DEFAULT_WORKER_REQUEST_TIMEOUT_MS > MODEL_HTTP_TIMEOUT_SECONDS * 1000 + WORKER_PROXY_MARGIN_MS - 1)
  assert.equal(resolveWorkerRequestTimeout(undefined), DEFAULT_WORKER_REQUEST_TIMEOUT_MS)
  assert.equal(resolveWorkerRequestTimeout("315000"), 315_000)
  assert.equal(resolveWorkerRequestTimeout("240000"), 240_000)
  assert.equal(resolveWorkerRequestTimeout("330000"), MAX_WORKER_REQUEST_TIMEOUT_MS)
  assert.equal(resolveWorkerRequestTimeout("330001"), DEFAULT_WORKER_REQUEST_TIMEOUT_MS)
  assert.equal(resolveWorkerRequestTimeout("not-a-number"), DEFAULT_WORKER_REQUEST_TIMEOUT_MS)
  assert.equal(resolveWorkerRequestTimeout("4999"), DEFAULT_WORKER_REQUEST_TIMEOUT_MS)
})
