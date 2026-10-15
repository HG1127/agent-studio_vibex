#!/usr/bin/env node
// Local operator-only SQLite backup and recovery rehearsal.
// Uses Node's online SQLite backup API (WAL-safe snapshot) instead of copying a live data.db.
// This file is NOT called by public VibeX routes and never changes a live source DB.
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import * as fsp from "node:fs/promises"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { backup, DatabaseSync } from "node:sqlite"

const FIXED_TABLES = [
  "agent_studio_kb_bases", "agent_studio_kb_documents", "agent_studio_kb_chunks",
  "agent_studio_schedules", "agent_studio_schedule_occurrences",
  "agent_studio_run_leases", "agent_studio_side_effects", "agent_studio_schema_migrations",
  "agent_runs", "workflow_runs", "agent_specs", "workflows",
]

async function sha256(file) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}

async function ensureRegularFile(file) {
  const stat = await fsp.lstat(file)
  if (!stat.isFile()) throw new Error("not_a_regular_file")
  return stat
}

function countsFor(db) {
  const result = {}
  const existing = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(row => row.name))
  for (const name of FIXED_TABLES) {
    if (existing.has(name)) result[name] = Number(db.prepare('SELECT COUNT(*) AS n FROM "' + name + '"').get().n)
  }
  return result
}

function inspectDb(file) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all().map(r => String(Object.values(r)[0]))
    if (integrity.length !== 1 || integrity[0] !== "ok") throw new Error("database_integrity_failed")
    return { tables: countsFor(db), integrity: "ok" }
  } finally { db.close() }
}

async function verifySnapshot(snapshot, manifestPath = snapshot + ".manifest.json") {
  const file = path.resolve(snapshot)
  const manifestFile = path.resolve(manifestPath)
  const stat = await ensureRegularFile(file)
  const manifest = JSON.parse(await fsp.readFile(manifestFile, "utf8"))
  if (manifest.format !== "agent-studio-sqlite-snapshot-v1" ||
      !/^[0-9a-f]{64}$/.test(String(manifest.sha256 || ""))) throw new Error("unsupported_manifest")
  if (stat.size !== manifest.bytes) throw new Error("backup_size_mismatch")
  if ((await sha256(file)) !== manifest.sha256) throw new Error("backup_sha256_mismatch")
  const inspection = inspectDb(file)
  assert.deepEqual(inspection.tables, manifest.tables, "backup_table_counts_mismatch")
  return { verified: true, bytes: stat.size, sha256: manifest.sha256, tableCounts: inspection.tables }
}

async function createVerifiedBackup(source, output) {
  const original = path.resolve(source)
  const destination = path.resolve(output)
  if (original === destination) throw new Error("source_equals_destination")
  const sourceStat = await ensureRegularFile(original)
  if (sourceStat.size === 0) throw new Error("empty_source")
  const outputDir = path.dirname(destination)
  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 })
  try { await fsp.lstat(destination); throw new Error("destination_exists") }
  catch (err) { if (err?.code !== "ENOENT") throw err }
  const manifestPath = destination + ".manifest.json"
  try { await fsp.lstat(manifestPath); throw new Error("manifest_exists") }
  catch (err) { if (err?.code !== "ENOENT") throw err }
  const partial = path.join(outputDir, "." + path.basename(destination) + "." + randomUUID() + ".partial")
  const pendingManifest = manifestPath + "." + randomUUID() + ".partial"
  let srcDb
  let createdDestination = false
  let createdManifest = false
  try {
    srcDb = new DatabaseSync(original, { readOnly: true })
    await backup(srcDb, partial)
    srcDb.close(); srcDb = null
    await fsp.chmod(partial, 0o600)
    const inspection = inspectDb(partial)
    const stat = await ensureRegularFile(partial)
    const manifest = {
      format: "agent-studio-sqlite-snapshot-v1",
      createdAt: new Date().toISOString(),
      sourceName: path.basename(original),
      bytes: stat.size,
      sha256: await sha256(partial),
      tables: inspection.tables,
    }
    await fsp.writeFile(pendingManifest, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" })
    // This is a point-in-time copy, not a claim that the source stayed unchanged.
    await fsp.copyFile(partial, destination, fs.constants.COPYFILE_EXCL)
    createdDestination = true
    await fsp.chmod(destination, 0o600)
    await fsp.rename(pendingManifest, manifestPath)
    createdManifest = true
    await fsp.unlink(partial)
    return await verifySnapshot(destination, manifestPath)
  } catch (err) {
    if (srcDb) srcDb.close()
    for (const file of [partial, pendingManifest]) await fsp.rm(file, { force:true }).catch(()=>{})
    // Clean up only files positively known to have been created by this invocation.
    if (createdManifest) await fsp.rm(manifestPath,{force:true}).catch(()=>{})
    if (createdDestination) await fsp.rm(destination,{force:true}).catch(()=>{})
    // Never remove a backup that existed before this operation.
    throw err
  }
}

async function restoreSnapshot(snapshot, destination, manifestPath = snapshot + ".manifest.json") {
  const source = path.resolve(snapshot)
  const output = path.resolve(destination)
  if (source === output) throw new Error("source_equals_destination")
  const verified = await verifySnapshot(source, manifestPath)
  await fsp.mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
  // Recovery is intentionally create-only. No overwrite of any existing production DB.
  let created = false
  try {
    await fsp.copyFile(source, output, fs.constants.COPYFILE_EXCL)
    created = true
    await fsp.chmod(output, 0o600)
    const restored = inspectDb(output)
    assert.deepEqual(restored.tables, verified.tableCounts)
    return { restored: true, destination: output, verified }
  } catch (err) {
    if (created) await fsp.rm(output,{force:true}).catch(()=>{})
    throw err
  }
}

function parseArgs(argv) {
  const [cmd, ...items] = argv
  const flags = {}
  for (let i=0;i<items.length;i+=2) {
    if (!items[i]?.startsWith("--") || items[i+1] === undefined) throw new Error("invalid_arguments")
    const key=items[i].slice(2)
    if (!["source","output","backup","manifest"].includes(key) || Object.hasOwn(flags,key))
      throw new Error("invalid_arguments")
    flags[key]=items[i+1]
  }
  return { cmd, flags }
}

async function main(argv) {
  const {cmd,flags}=parseArgs(argv)
  let output
  if (cmd==="backup" && flags.source && flags.output) {
    output=await createVerifiedBackup(flags.source,flags.output)
  } else if (cmd==="verify" && flags.backup) {
    output=await verifySnapshot(flags.backup,flags.manifest)
  } else if (cmd==="restore-new" && flags.backup && flags.output) {
    output=await restoreSnapshot(flags.backup,flags.output,flags.manifest)
  } else {
    throw new Error("Usage: node ops/sqlite-backup.mjs backup --source <data.db> --output <snapshot.db> | verify --backup <snapshot.db> | restore-new --backup <snapshot.db> --output <NEW-file.db>")
  }
  process.stdout.write(JSON.stringify({ ok:true, command:cmd, ...output }) + "\n")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(err => {
    process.stderr.write("database_tool_failed: " + String(err?.message || err) + "\n")
    process.exitCode = 1
  })
}

export { createVerifiedBackup, verifySnapshot, restoreSnapshot, inspectDb }
