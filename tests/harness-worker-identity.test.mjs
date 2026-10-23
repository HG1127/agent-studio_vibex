import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const moduleRef = { exports: {} }
vm.runInNewContext(
  fs.readFileSync("pocketbase/pb_hooks/modules/harness_worker_identity.js", "utf8"),
  { module: moduleRef }, { timeout: 1000 },
)
const { resolve } = moduleRef.exports
const token = "EXACT-TEST-WORKER-SERVER-ONLY-SECRET-123"
const instanceA = "w-" + "a".repeat(24)

test("Worker lease attribution requires a verified internal token and explicit valid instance", () => {
  const real = { "X-Agent-Studio-Worker-Token": token, "X-Agent-Studio-Worker-Instance": instanceA }
  assert.equal(resolve(real, token, true), instanceA)
  assert.equal(resolve({ "x_agent_studio_worker_token": token,
    "x_agent_studio_worker_instance": instanceA }, token, true), instanceA)
  assert.equal(resolve({ "X-Agent-Studio-Worker-Instance": instanceA }, token, true), "",
    "a browser-supplied worker ID alone cannot impersonate a lease owner")
  assert.equal(resolve({ ...real, "X-Agent-Studio-Worker-Token": "wrong" }, token, true), "")
  assert.equal(resolve(real, "short", true), "")
  assert.equal(resolve(real, token, false), "")
  assert.equal(resolve({ "X-Agent-Studio-Worker-Token": token }, token, true), "main",
    "older verified Workers remain attributable")
  for (const bad of ["my-computer", "w-xyz", "w-" + "0".repeat(100)]) {
    assert.equal(resolve({ ...real, "X-Agent-Studio-Worker-Instance": bad }, token, true), "")
  }
})
