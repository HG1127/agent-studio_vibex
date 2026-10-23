#!/usr/bin/env node
// Read-only, reproducible test runner for Git worktrees with a shared
// node_modules junction. Never invokes pnpm install or changes the shared tree.
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

const root = process.cwd()
const mode = process.argv[2] || "probe"
const modes = {
  probe: ["--input-type=module", "-e",
    "import ExcelJS from 'exceljs'; import { chromium } from 'playwright'; if(typeof ExcelJS.Workbook!=='function'||typeof chromium.launch!=='function')process.exit(1); console.log('readonly_worktree_test_dependencies: PASS')"],
  local: ["tests/local-executor.integration.mjs"],
  agent: ["tests/local-executor-agent.integration.mjs"],
  e2e: ["ops/e2e-parallel.mjs", "--workers=2"],
  chrome: ["tests/design-workspace.chrome.mjs"],
}
if (!Object.hasOwn(modes, mode)) {
  process.stderr.write("Usage: node ops/test-worktree.mjs [probe|local|agent|e2e|chrome]\n")
  process.exitCode = 2
} else {
  const loader = path.join(root, "ops", "worktree-test-loader.mjs")
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const range = String(manifest.devDependencies?.playwright || "")
  const match = /^(?:[~^])?(\d+\.\d+\.\d+)$/.exec(range)
  if (!match) throw Error("playwright_version_not_pinned")
  // The Chrome fixture requires a concrete path, not just ESM resolution.
  const candidates = [
    path.join(root, "node_modules", "playwright", "index.mjs"),
    path.join(root, "node_modules", ".pnpm",
      "playwright@" + match[1], "node_modules", "playwright", "index.mjs"),
  ]
  const playwright = candidates.find(candidate => fs.existsSync(candidate))
  if (!playwright) throw Error("test_worktree_playwright_unavailable")
  const importFlag = "--import=" + pathToFileURL(loader).href
  const opts = [process.env.NODE_OPTIONS || "", importFlag].filter(Boolean).join(" ")
  const env = { ...process.env, NODE_OPTIONS: opts,
    AGENT_STUDIO_PLAYWRIGHT_MODULE: process.env.AGENT_STUDIO_PLAYWRIGHT_MODULE || playwright }
  const child = spawn(process.execPath, modes[mode], {
    cwd: root, env, stdio: "inherit", windowsHide: true,
  })
  child.on("error", error => {
    process.stderr.write("worktree_test_process_error: " + String(error.code || "unknown") + "\n")
    process.exitCode = 1
  })
  child.on("close", (code, signal) => {
    if (signal) process.stderr.write("worktree_test_interrupted\n")
    process.exitCode = signal ? 1 : Number(code ?? 1)
  })
}
