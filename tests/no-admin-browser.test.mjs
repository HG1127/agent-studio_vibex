import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const scripts = [
  "vibex-local/start-windows.ps1",
  "vibex-local/start-windows.bat",
  "vibex-local/start-linux.sh",
  "vibex-local/start-macos.sh",
]

test("all local launchers must be browser-free and never open PocketBase admin", () => {
  for (const script of scripts) {
    const text = fs.readFileSync(path.join(root, script), "utf8")
    assert.doesNotMatch(text, /https?:\/\/(?:127\.0\.0\.1|localhost):7000\/_\//i, script + " admin URL")
    assert.doesNotMatch(text, /Start-Process\s+["']https?:\/\//i, script + " browser launch")
    assert.doesNotMatch(text, /Start-Job\s+-ScriptBlock.*Start-Process/i, script + " delayed browser launch")
    assert.doesNotMatch(text, /(?:^|\n)\s*(?:xdg-open|open)\s+https?:\/\//i, script + " Unix browser launch")
    assert.doesNotMatch(text, /open_local_app|browser\.open|webbrowser\.open/i, script + " browser helper")
    if (!script.endsWith(".bat")) {
      assert.match(text, /standalone-dev\.mjs/, script + " must delegate to the independent launcher")
      assert.doesNotMatch(text, /VIBEX_APP_ID|RH_API_KEY|RH_LLM_API_KEY/,
        script + " must not depend on the original hosted account")
    }
  }
})

test("independent local proxy strips /__pb prefix without opening a browser", () => {
  const config = fs.readFileSync(path.join(root, "vibex-local/vite.local.config.ts"), "utf8")
  assert.match(config, /AGENT_STUDIO_PB_ORIGIN/)
  assert.match(config, /127\.0\.0\.1:7000/)
  assert.match(config, /rewrite:\s*\(url/)
  assert.match(config, /__pb/)
  assert.doesNotMatch(config, /\bopen\s*:\s*true/i)
  assert.doesNotMatch(config, /\/_\//)
})
test("every PocketBase integration test uses the guarded headless launcher", () => {
  const dir = path.join(root, "tests")
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".integration.mjs"))
  assert.ok(files.length >= 9)
  // The local executor's standalone MCP test does not start PocketBase at all;
  // its separate Agent-engine integration MUST use the guarded launcher.
  const pureMcpWithoutPocketBase = new Set(["local-executor.integration.mjs"])
  for (const name of files) {
    const content = fs.readFileSync(path.join(dir, name), "utf8")
    if (!pureMcpWithoutPocketBase.has(name)) {
      assert.match(content, /spawnHeadlessPocketBase\s*\(/, name + " lacks guarded boot")
    } else {
      assert.doesNotMatch(content, /\bspawnHeadlessPocketBase\b|\bpocketbase\s+serve\b/i,
        name + " must stay independent of PocketBase")
    }
    assert.doesNotMatch(content, /\bspawn\s*\(\s*(?:pb|pbBin|bin)\s*,\s*\[\s*["']serve["']/,
      name + " uses raw PocketBase serve")
  }
})

test("deprecated PocketBase onServe hook is not registered", () => {
  const hook = fs.readFileSync(path.join(root, "pocketbase/pb_hooks/headless_installer.pb.js"), "utf8")
  assert.doesNotMatch(hook, /(?:^|\n)\s*onServe\s*\(/m)
  const helper = fs.readFileSync(path.join(root, "tests/helpers/headless-pocketbase.mjs"), "utf8")
  assert.match(helper, /"superuser", "create"/)
})