import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
test("worktree optional tests resolve declared packages without rewriting a shared modules junction", {
  timeout: 60000,
}, () => {
  const modules = path.join(root, "node_modules")
  assert.ok(fs.existsSync(modules), "test dependencies must have been installed by the environment")
  const before = fs.realpathSync(modules)
  const packageBefore = fs.readFileSync(path.join(root, "package.json"))
  const lockBefore = fs.readFileSync(path.join(root, "pnpm-lock.yaml"))
  const result = spawnSync(process.execPath, ["ops/test-worktree.mjs", "probe"], {
    cwd: root, windowsHide: true, encoding: "utf8", timeout: 45000,
  })
  assert.equal(result.status, 0, String(result.stdout) + String(result.stderr))
  assert.match(result.stdout, /readonly_worktree_test_dependencies: PASS/)
  assert.equal(fs.realpathSync(modules), before,
    "test runner must leave the physical modules directory/junction unchanged")
  assert.ok(fs.readFileSync(path.join(root, "package.json")).equals(packageBefore))
  assert.ok(fs.readFileSync(path.join(root, "pnpm-lock.yaml")).equals(lockBefore))
})
