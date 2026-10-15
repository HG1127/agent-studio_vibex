// Headless-only PocketBase launcher for local integration tests.
// A fresh PocketBase data directory with no superuser automatically invokes
// OS browser navigation to /_/#/pbinstall/<token> when serving for the first time.
// This helper fails closed unless given a disposable direct child of os.tmpdir().
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

const MARKER = ".agentstudio-headless-test-ready"

function assertDisposableTestDirectory(directory) {
  if (!directory) throw new Error("headless_pocketbase_requires_disposable_data_directory")
  const real = fs.realpathSync(path.resolve(directory))
  const temp = fs.realpathSync(os.tmpdir())
  if (path.dirname(real).toLowerCase() !== temp.toLowerCase() ||
      !path.basename(real).startsWith("agentstudio-") ||
      !fs.statSync(real).isDirectory()) {
    throw new Error("headless_pocketbase_refuses_persistent_or_production_database")
  }
  return real
}

export function prepareHeadlessPocketBase(binary, dataDir, options = {}) {
  const temporary = assertDisposableTestDirectory(dataDir)
  const ready = path.join(temporary, MARKER)
  if (fs.existsSync(ready)) {
    if (!fs.existsSync(path.join(temporary, "data.db"))) {
      throw new Error("headless_test_database_missing")
    }
    return temporary
  }
  if (!fs.existsSync(binary)) throw new Error("pocketbase_binary_not_found")
  // This CLI creates a random test-only superuser WITHOUT starting a server.
  // Never log the credentials or reuse a persistent/production data directory.
  const user = "ci-headless-" + randomBytes(9).toString("hex") + "@example.com"
  const pass = "T9!" + randomBytes(30).toString("base64url")
  const created = spawnSync(binary, [
    "superuser", "create", user, pass, "--dir=" + temporary,
  ], {
    cwd: options.cwd || path.dirname(binary),
    env: { ...process.env, ...options.env },
    encoding: "utf8", windowsHide: true,
    timeout: 30_000, maxBuffer: 256_000,
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (created.error || created.status !== 0 ||
      !fs.existsSync(path.join(temporary, "data.db"))) {
    // Do NOT expose the password or complete CLI stdout/stderr.
    throw new Error("headless_superuser_cli_failed_before_serve")
  }
  fs.writeFileSync(ready, "test-only\n", { flag: "wx" })
  return temporary
}

// Enforces temp SQLite, localhost listener, and the disabled-installer flag.
export function spawnHeadlessPocketBase(binary, args, options = {}) {
  if (!Array.isArray(args) || args[0] !== "serve") throw new Error("headless_serve_required")
  const dataFlag = args.find(arg => typeof arg === "string" && arg.startsWith("--dir="))
  const httpFlag = args.find(arg => typeof arg === "string" && arg.startsWith("--http="))
  const hooksFlag = args.find(arg => typeof arg === "string" && arg.startsWith("--hooksDir="))
  if (!dataFlag || !/^--http=127\.0\.0\.1:\d+$/.test(httpFlag || "") || !hooksFlag) {
    throw new Error("headless_serve_requires_temp_data_hooks_and_localhost")
  }
  prepareHeadlessPocketBase(binary, dataFlag.slice("--dir=".length), options)
  return spawn(binary, args, {
    ...options,
    windowsHide: true,
    env: {
      ...process.env,
      // Historical integration fixtures use trusted synthetic RH headers.
      // Only explicit standalone tests opt into independent auth.
      AGENT_STUDIO_AUTH_MODE: "legacy",
      AGENT_STUDIO_LEGACY_TEST_ONLY: "true",
      NODE_ENV: "test",
      ...options.env,
      AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER: "true",
    },
  })
}

// CI should wait for the disposable PocketBase process and stdio handles to
// actually close before deleting SQLite. A fixed sleep is racy on Windows.
export async function stopHeadlessPocketBase(child, timeoutMs=10000) {
  if (!child) return
  if (child.exitCode !== null) return
  let closed = false
  const completed = new Promise(resolve => {
    child.once("close", () => { closed = true; resolve() })
    child.once("error", () => { closed = true; resolve() })
  })
  try { child.kill() } catch {}
  await Promise.race([completed, new Promise(resolve => setTimeout(resolve, timeoutMs))])
  if (!closed) {
    try { child.kill("SIGKILL") } catch {}
    await Promise.race([completed, new Promise(resolve => setTimeout(resolve, 3000))])
  }
  if (!closed) throw new Error("headless_pocketbase_shutdown_timeout")
}
