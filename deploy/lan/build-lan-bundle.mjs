#!/usr/bin/env node
// Create a minimal, source-pinned release for the Ubuntu staging instance.
// No .env, pb_data, user uploads, node_modules, local binaries or PG pilot code.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const FIXED_FILES = new Set([
  "package.json",
  "src/lib/scheduleTime.js",
])
const SOURCE_PREFIXES = [
  "pocketbase/pb_hooks/",
  "pocketbase/pb_migrations/",
  "worker/",
]
const RELEASE_FILE_LIMIT = 2500
const RELEASE_BYTE_LIMIT = 180 * 1024 * 1024
const RELEASE_SINGLE_FILE_LIMIT = 32 * 1024 * 1024
const FORBIDDEN_SEGMENT = /^(?:\.git|\.env(?:\..*)?|pb_data|pb_data_backup|node_modules|secrets?|secret_files|credentials(?:\..*)?)$/i
const FORBIDDEN_EXTENSION = /\.(?:db|sqlite3?|wal|shm|key|pem|p12|pfx|exe|dll|zip|7z|rar|tgz|gz|tar|bak|backup|dump)$/i

export function validSha(sha) {
  return typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha)
}
export function validReleasePath(relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || [...relative].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false
  if (relative.startsWith("/") || /^[A-Za-z]:/.test(relative)) return false
  const chunks = relative.split("/")
  return chunks.every(chunk => Boolean(chunk) && chunk !== "." && chunk !== ".." && !FORBIDDEN_SEGMENT.test(chunk)) &&
    !FORBIDDEN_EXTENSION.test(chunks.at(-1))
}
export function allowlistedReleasePath(relative) {
  return validReleasePath(relative) && (
    relative.startsWith("dist/") ||
    FIXED_FILES.has(relative) ||
    SOURCE_PREFIXES.some(prefix => relative.startsWith(prefix))
  )
}
function hash(content) {
  return createHash("sha256").update(content).digest("hex")
}
function trackedSources(root) {
  const args = ["ls-files", "-z", "--", ...SOURCE_PREFIXES, ...FIXED_FILES]
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\0").filter(Boolean)
}
function generatedDist(root) {
  const dir = path.join(root, "dist")
  if (!fs.existsSync(path.join(dir, "index.html"))) throw Error("release_requires_built_dist")
  const queue = ["dist"]
  const paths = []
  while (queue.length) {
    const relative = queue.pop()
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = relative + "/" + entry.name
      if (!allowlistedReleasePath(child)) throw Error("unsafe_dist_path")
      if (entry.isSymbolicLink()) throw Error("release_symlinks_forbidden")
      if (entry.isDirectory()) queue.push(child)
      else if (entry.isFile()) paths.push(child)
      else throw Error("release_special_files_forbidden")
    }
  }
  return paths
}
export function buildLanBundle(root, output, expectedSha) {
  if (!validSha(expectedSha)) throw Error("invalid_full_commit_sha")
  const src = path.resolve(root)
  const dest = path.resolve(output)
  if (src === dest || dest === path.join(src, "dist") ||
    dest.startsWith(path.join(src, "dist") + path.sep) ||
    dest.startsWith(path.join(src, "pocketbase") + path.sep) ||
    dest.startsWith(path.join(src, "worker") + path.sep)) {
    throw Error("release_output_inside_runtime_source")
  }
  if (fs.existsSync(dest)) throw Error("release_output_must_not_exist")
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src, encoding: "utf8" }).trim()
  if (sha !== expectedSha) throw Error("release_sha_does_not_match_checkout")

  const tracked = trackedSources(src)
  for (const p of ["package.json", "worker/run.mjs", "src/lib/scheduleTime.js"]) {
    if (!tracked.includes(p)) throw Error("missing_tracked_release_runtime_" + p.replaceAll("/", "_"))
  }
  // Refuse to package dirty tracked runtime code; generated dist is handled separately.
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...SOURCE_PREFIXES, ...FIXED_FILES], { cwd: src })
  const inputs = [...new Set([...tracked, ...generatedDist(src)])].sort()
  if (inputs.length > RELEASE_FILE_LIMIT) throw Error("release_file_limit_exceeded")
  const manifest = []
  let bytes = 0
  for (const relative of inputs) {
    if (!allowlistedReleasePath(relative)) throw Error("release_path_not_allowlisted")
    const stat = fs.lstatSync(path.join(src, relative))
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("release_nonregular_file")
    if (stat.size > RELEASE_SINGLE_FILE_LIMIT) throw Error("release_individual_file_limit_exceeded")
    bytes += stat.size
    if (bytes > RELEASE_BYTE_LIMIT) throw Error("release_bytes_limit_exceeded")
  }
  fs.mkdirSync(dest, { recursive: false, mode: 0o755 })
  for (const relative of inputs) {
    const data = fs.readFileSync(path.join(src, relative))
    const target = path.join(dest, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 })
    fs.writeFileSync(target, data, { flag: "wx", mode: 0o644 })
    manifest.push({ path: relative, sha256: hash(data), bytes: data.length })
  }
  const release = { schema: 1, commit: sha, files: manifest }
  fs.writeFileSync(path.join(dest, "release-manifest.json"), JSON.stringify(release, null, 2) + "\n", {
    flag: "wx", mode: 0o644,
  })
  return { commit: sha, files: manifest.length, bytes }
}
function parseCli(args) {
  const found = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!["--out", "--sha"].includes(args[i]) || !args[i + 1] || found[args[i]]) throw Error("usage_out_sha")
    found[args[i]] = args[i + 1]
  }
  if (Object.keys(found).length !== 2) throw Error("usage_out_sha")
  return found
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = parseCli(process.argv.slice(2))
    const result = buildLanBundle(process.cwd(), argv["--out"], argv["--sha"])
    process.stdout.write(JSON.stringify({ status: "LAN_BUNDLE_READY", ...result }) + "\n")
  } catch (error) {
    // Do not print filesystem locations or source content in CI errors.
    process.stderr.write("lan_bundle_failed:" + String(error.message || "invalid_release").slice(0, 100) + "\n")
    process.exitCode = 1
  }
}
