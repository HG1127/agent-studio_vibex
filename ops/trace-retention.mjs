#!/usr/bin/env node
// Operator-only, explicitly scoped trace retention. Never triggered by API or Worker.
// Dry-run by default; actual deletion requires verified snapshot and confirmation.
import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import { verifySnapshot } from "./sqlite-backup.mjs"

const ELIGIBLE =
  "rh_user_id=? AND created_ms<? AND (" +
  "(run_kind='agent' AND EXISTS (SELECT 1 FROM agent_runs r WHERE r.id=agent_studio_execution_spans.run_id " +
    "AND r.rh_user_id=agent_studio_execution_spans.rh_user_id AND r.status IN ('succeeded','failed','cancelled'))) OR " +
  "(run_kind='workflow' AND EXISTS (SELECT 1 FROM workflow_runs r WHERE r.id=agent_studio_execution_spans.run_id " +
    "AND r.rh_user_id=agent_studio_execution_spans.rh_user_id AND r.status IN ('succeeded','failed','cancelled'))))"

function connect(file, readOnly) {
  return new DatabaseSync(path.resolve(file), { readOnly: Boolean(readOnly), timeout: 5000 })
}
function eligibleCount(db, owner, cutoff) {
  const row=db.prepare("SELECT COUNT(*) AS n FROM agent_studio_execution_spans WHERE "+ELIGIBLE)
    .get(owner,cutoff)
  return Number(row.n)
}
function retentionPlan(db, opts) {
  const owner=String(opts.owner || "")
  const days=Number(opts.days ?? 90)
  const now=Number(opts.now ?? Date.now())
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(owner)) throw new Error("invalid_owner")
  if (!Number.isInteger(days)||days<30||days>3650) throw new Error("retention_days_must_be_30_to_3650")
  if (!Number.isSafeInteger(now) || now<=0) throw new Error("invalid_time")
  const cutoff=now-days*86400_000
  return {owner,days,cutoff,eligible:eligibleCount(db,owner,cutoff)}
}

async function planFromFile(source, opts) {
  const db=connect(source,true)
  try { return retentionPlan(db,opts) }
  finally { db.close() }
}

async function applyRetention(source, opts) {
  const database=path.resolve(source)
  const owner=String(opts.owner || "")
  if (opts.confirm !== "DELETE_TRACE_SPANS:"+owner) throw new Error("explicit_confirmation_required")
  const backupPath=String(opts.backup || "")
  if (!backupPath||path.resolve(backupPath)===database) throw new Error("verified_separate_backup_required")
  const verified=await verifySnapshot(backupPath)
  const manifest=JSON.parse(await fs.readFile(path.resolve(backupPath)+".manifest.json","utf8"))
  if (manifest.sourceName!==path.basename(database)) throw new Error("backup_source_name_mismatch")
  const created=new Date(manifest.createdAt).getTime()
  if (!Number.isFinite(created)||Date.now()-created>24*3600_000||created>Date.now()+60_000)
    throw new Error("verified_backup_must_be_recent")
  const limit=Number(opts.maxRows??500)
  if (!Number.isInteger(limit)||limit<1||limit>1000) throw new Error("max_rows_must_be_1_to_1000")
  const db=connect(database,false)
  try {
    db.exec("BEGIN IMMEDIATE")
    const consistentOptions={...opts,now:Number(opts.now??Date.now())}
    try {
      const plan=retentionPlan(db,consistentOptions)
      const snap=connect(backupPath,true)
      try {
        const snapPlan=retentionPlan(snap,consistentOptions)
        if (snapPlan.eligible!==plan.eligible) throw new Error("snapshot_retention_mismatch")
      } finally { snap.close() }
      const stmt=db.prepare("DELETE FROM agent_studio_execution_spans WHERE id IN " +
        "(SELECT id FROM agent_studio_execution_spans WHERE "+ELIGIBLE+" ORDER BY created_ms ASC,id ASC LIMIT ?)")
      const result=stmt.run(plan.owner,plan.cutoff,limit)
      db.exec("COMMIT")
      return {...plan,deleted:Number(result.changes),remaining:Math.max(0,plan.eligible-Number(result.changes)),
        backupVerified:verified.verified}
    } catch(err) {
      db.exec("ROLLBACK")
      throw err
    }
  } finally { db.close() }
}

function parseArgs(args) {
  const parsed={}
  for(let i=0;i<args.length;i++){
    const key=args[i]
    if(!key?.startsWith("--"))throw new Error("invalid_arguments")
    if(key==="--apply") {parsed.apply=true;continue}
    const field=key.slice(2)
    if(!["db","owner","days","max-rows","backup","confirm"].includes(field)||!args[i+1]||Object.hasOwn(parsed,field))
      throw new Error("invalid_arguments")
    parsed[field]=args[++i]
  }
  if(!parsed.db||!parsed.owner)throw new Error("database_and_owner_required")
  return parsed
}
async function main(argv) {
  const args=parseArgs(argv)
  const opts={owner:args.owner,days:Number(args.days??90),maxRows:Number(args["max-rows"]??500),
    confirm:args.confirm,backup:args.backup}
  const result=args.apply?await applyRetention(args.db,opts):await planFromFile(args.db,opts)
  process.stdout.write(JSON.stringify({ok:true,dryRun:!args.apply,...result})+"\n")
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(err=>{
    process.stderr.write("trace_retention_failed: "+String(err?.message||err)+"\n")
    process.exitCode=1
  })
}
export {retentionPlan,planFromFile,applyRetention}
