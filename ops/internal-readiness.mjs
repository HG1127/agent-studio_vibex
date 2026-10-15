#!/usr/bin/env node
// Offline internal deployment readiness preflight (no browser or network).
// Read-only. All status values are evidence-specific and must not be confused
// with actual production deployment. Never print env secrets or worker token.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifySnapshot } from "./sqlite-backup.mjs"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const EVIDENCE_KEYS = Object.freeze([
  "trusted_gateway", "pocketbase_private", "worker_24h", "backup_restore",
  "real_model", "outbound_filter", "source_published", "two_employee_acceptance",
  "incident_owner_and_rollback",
])
const required = (id, good, message) => ({
  id, category:"configuration", status:good?"pass":"fail", detail:message,
})
function loopback(input) {
  try {
    const u=new URL(input)
    return u.protocol==="http:" && u.username==="" && u.password==="" &&
      (u.hostname==="127.0.0.1" || u.hostname==="[::1]" || u.hostname==="localhost") &&
      !u.search && !u.hash && u.pathname==="/"
  } catch { return false }
}
function workerURL(input) {
  try {
    const u=new URL(input)
    if (u.username || u.password || u.search || u.hash || u.pathname!=="/") return false
    if (u.protocol==="https:") return true
    return loopback(input)
  } catch { return false }
}
function parseUsers(input) {
  const values=String(input||"").split(",").map(x=>x.trim()).filter(Boolean)
  return values.length>=2 && values.length<=200 &&
    new Set(values).size===values.length &&
    values.every(x=>x!=="local-anon" && /^[a-zA-Z0-9_.:-]{1,120}$/.test(x))
}
// Only rejects obviously weak placeholders; this is NOT a cryptographic
// entropy measurement. Real keys must still be generated with a CSPRNG.
function notTrivialSecret(value) {
  const text=String(value||"")
  return new Set(text).size>=12 &&
    !/(.)\1{7,}/.test(text) &&
    !/(password|secret|example|changeme|123456)/i.test(text)
}
function inspectConfig(env={}) {
  const checks=[]
  checks.push(required("anonymous_disabled",env.AGENT_STUDIO_ALLOW_ANON!=="true",
    "Production must not enable shared anonymous identity"))
  checks.push(required("secrets_strict",env.AGENT_STUDIO_STRICT_SECRETS==="true",
    "Server secret writes must be protected by strict encryption mode"))
  const key=String(env.AGENT_STUDIO_SECRET_KEY||"")
  checks.push(required("aes_key_32_bytes",Buffer.byteLength(key,"utf8")===32 && notTrivialSecret(key),
    "AGENT_STUDIO_SECRET_KEY must be 32 cryptographically random bytes; reject obvious placeholders (never print it)"))
  const worker=env.AGENT_STUDIO_BACKGROUND_WORKER==="true"
  checks.push(required("worker_enabled",worker,"Background worker must be enabled on PocketBase"))
  const workerToken=String(env.AGENT_STUDIO_WORKER_TOKEN||"")
  checks.push(required("worker_token_entropy",workerToken.length>=32 && workerToken!==key &&
    notTrivialSecret(workerToken),
    "Worker token must be separate from encryption key and at least 32 non-repeated characters"))
  checks.push(required("worker_internal_loopback",
    loopback(env.AGENT_STUDIO_WORKER_INTERNAL_URL||""),
    "Worker internal endpoint must be a loopback-only HTTP URL"))
  checks.push(required("worker_client_transport",
    workerURL(env.AGENT_STUDIO_WORKER_URL||""),
    "Worker endpoint must use HTTPS for remote hosts or loopback HTTP"))
  checks.push(required("remote_http_forbidden",
    env.AGENT_STUDIO_WORKER_ALLOW_INSECURE_HTTP!=="true",
    "Do not permit plaintext worker credentials to remote endpoints"))
  checks.push(required("headless_pocketbase",
    env.AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER==="true",
    "PocketBase first-run setup must not automatically open browser"))
  checks.push(required("internal_share_whitelist",
    parseUsers(env.AGENT_STUDIO_INTERNAL_SHARE_USERS),
    "Two or more explicit employee RH IDs required; no local-anon or duplicates"))
  checks.push({
    id:"vibex_app_identity",category:"configuration",
    status:env.VIBEX_APP_ID==="app-21b2bf592c904e939083806fa411cac9"?"pass":"manual",
    detail:"Verify actual deployed VibeX app ID and source version from the platform",
  })
  return checks
}
function inspectEvidence(data,now=Date.now()) {
  const result=[]
  const reviewer=String(data?.reviewer||"").trim()
  const date=Date.parse(String(data?.reviewed_at||""))
  const fresh=reviewer.length>=3 && reviewer.length<=120 && Number.isFinite(date) &&
    date<=now+60000 && date>=now-7*86400000
  for(const id of EVIDENCE_KEYS) {
    const item=data?.checks?.[id]
    const evidence=String(item?.evidence||"").trim()
    const accepted=fresh && item?.passed===true && evidence.length>=8 &&
      evidence.length<=1000
    result.push({
      id,category:"manual_evidence",status:accepted?"attested":"manual",
      detail:accepted?"Operator reports verified evidence; not independently checked by this tool":
        "Named human reviewer, current review date, checked status and evidence required",
    })
  }
  return result
}
function summarize(config,evidence=[],snapshot) {
  const all=[...config,...evidence]
  if(snapshot) all.push(snapshot)
  const failure=all.filter(item=>item.status==="fail").length
  const manual=all.filter(item=>item.status==="manual").length
  const attested=all.filter(item=>item.status==="attested").length
  return {
    tool:"agent-studio-internal-readiness",version:"1",
    scope:"offline_no_network",production_deployed:false,
    decision:failure?"NO_GO_CONFIG":manual?"NO_GO_UNVERIFIED":"READY_FOR_OPERATOR_SIGNOFF",
    counts:{failures:failure,pending_manual:manual,operator_attestations:attested,
      passing_configuration:all.filter(item=>item.status==="pass").length},
    checks:all,
    note:"Operator attestation does not independently prove gateway security or actual deployment.",
  }
}
function parseArgs(argv) {
  const opts={}
  for(let i=0;i<argv.length;i++) {
    if(!["--evidence","--backup","--json"].includes(argv[i]))throw Error("invalid_arguments")
    if(argv[i]==="--json") {opts.json=true;continue}
    const name=argv[i].slice(2)
    if(opts[name] || !argv[i+1])throw Error("invalid_arguments")
    opts[name]=argv[++i]
  }
  return opts
}
async function assess(env,options={}) {
  const config=inspectConfig(env)
  let evidence
  if(options.evidence) {
    try {evidence=JSON.parse(readFileSync(path.resolve(options.evidence),"utf8"))}
    catch { throw Error("invalid_evidence_json") }
  }
  const manual=inspectEvidence(evidence,options.now)
  let snapshot={
    id:"verified_sqlite_snapshot",category:"data",status:"manual",
    detail:"Provide an externally protected backup manifest and isolated restore evidence",
  }
  if(options.backup) {
    try {
      await verifySnapshot(options.backup)
      snapshot={id:"verified_sqlite_snapshot",category:"data",status:"pass",
        detail:"Snapshot SHA-256, size, integrity and row counts verified locally (not a restore rehearsal)"}
    } catch {
      snapshot={id:"verified_sqlite_snapshot",category:"data",status:"fail",
        detail:"Backup failed hash/integrity/manifest validation"}
    }
  }
  return summarize(config,manual,snapshot)
}
async function main() {
  const opts=parseArgs(process.argv.slice(2))
  const report=await assess(process.env,opts)
  if(opts.json) process.stdout.write(JSON.stringify(report,null,2)+"\n")
  else {
    process.stdout.write("Agent Studio internal readiness: "+report.decision+"\n")
    for(const item of report.checks) process.stdout.write(" - "+item.id+": "+item.status+"\n")
    process.stdout.write("No browser, login, network or database modifications were performed.\n")
  }
  if(report.decision!=="READY_FOR_OPERATOR_SIGNOFF")process.exitCode=1
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(err=>{
    process.stderr.write("preflight_error: "+String(err.message||err).slice(0,120)+"\n")
    process.exitCode=2
  })
}
export {inspectConfig,inspectEvidence,parseUsers,loopback,workerURL,assess,EVIDENCE_KEYS}
