#!/usr/bin/env node
// Fail-closed, standalone-only, offline launch preflight. Never starts a
// server, reads project production data, or prints passwords or token values.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const EVIDENCE_IDS=[
 "tls_gateway_verified","raw_pocketbase_private","employee_uat",
 "worker_24h_verified","restore_drill","real_model_and_egress",
 "approved_legacy_user_mapping","rollback_contact_and_owner",
]
const rule=(id,pass)=>({id,status:pass?"pass":"fail"})
const isStrong=value=>{
 const s=String(value||"")
 return s.length>=32 && new Set(s).size>=12 &&
  !/(.)\1{7,}/.test(s) && !/^(?:changeme|example|sample|password)/i.test(s)
}
const isLoopback=value=>{
 try{
  const u=new URL(String(value||""))
  return u.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname) &&
    !u.username && !u.password && !u.search && !u.hash && u.pathname==="/"
 }catch{return false}
}
const isWorkerUrl=value=>{
 try{
  const u=new URL(String(value||""))
  if(u.username||u.password||u.search||u.hash||u.pathname!=="/")return false
  return u.protocol==="https:" || isLoopback(value)
 }catch{return false}
}
function inspectStandalone(config={}){
 const env=config
 const key=String(env.AGENT_STUDIO_SECRET_KEY||"")
 const workerKey=String(env.AGENT_STUDIO_WORKER_TOKEN||"")
 const checks=[
  rule("standalone_auth",env.AGENT_STUDIO_AUTH_MODE==="standalone"),
  rule("anonymous_disabled",env.AGENT_STUDIO_ALLOW_ANON==="false"),
  rule("legacy_test_override_disabled",env.AGENT_STUDIO_LEGACY_TEST_ONLY!=="true"),
  rule("strict_secrets",env.AGENT_STUDIO_STRICT_SECRETS==="true"),
  rule("encryption_key",Buffer.byteLength(key,"utf8")===32&&isStrong(key)),
  rule("worker_token",workerKey!==key&&isStrong(workerKey)),
  rule("worker_enabled",env.AGENT_STUDIO_BACKGROUND_WORKER==="true"),
  rule("worker_private_url",isLoopback(env.AGENT_STUDIO_WORKER_INTERNAL_URL)),
  rule("worker_credential_transport",isWorkerUrl(env.AGENT_STUDIO_WORKER_URL)),
  rule("no_remote_plaintext_worker",env.AGENT_STUDIO_WORKER_ALLOW_INSECURE_HTTP!=="true"),
  rule("no_embedding_loopback_override",env.AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK!=="true"),
  rule("bootstrap_key_not_live",!env.AGENT_STUDIO_BOOTSTRAP_SECRET),
 ]
 // These configuration checks cannot prove any real network-boundary safety.
 return checks
}
function inspectAttestation(data,now=Date.now()){
 const reviewer=String(data?.reviewer||"").trim()
 const when=Date.parse(String(data?.reviewed_at||""))
 const validReviewer=reviewer.length>=3&&reviewer.length<=100
 const recent=Number.isFinite(when)&&when<=now+60000&&when>=now-7*86400000
 return EVIDENCE_IDS.map(id=>{
  const item=data?.checks?.[id]
  const evidence=String(item?.evidence||"").trim()
  const acknowledged=validReviewer&&recent&&item?.passed===true&&
    evidence.length>=12&&evidence.length<=1200
  return {id,status:acknowledged?"attested":"manual"}
 })
}
function report(config,attestation,now=Date.now()){
 const checks=inspectStandalone(config)
 const manual=inspectAttestation(attestation,now)
 const failed=checks.filter(x=>x.status==="fail").length
 const unverified=manual.filter(x=>x.status==="manual").length
 return {
  kind:"agent_studio_standalone_preflight",version:1,
  scope:"offline_only",production_deployed:false,
  status:failed?"NO_GO_CONFIG":unverified?"NO_GO_UNVERIFIED":"READY_FOR_OPERATOR_SIGNOFF",
  counts:{config_failures:failed,manual_pending:unverified,
    manual_attested:manual.length-unverified},
  checks:[...checks,...manual],
  warning:"Offline configuration checks and human attestations do not prove production security or deployment.",
 }
}
function readEnv(file){
 const content=fs.readFileSync(path.resolve(file),"utf8")
 if(Buffer.byteLength(content)>65536)throw Error("env_file_too_large")
 const result={}
 for(const line of content.split(/\r?\n/)){
  const v=line.trim()
  if(!v||v.startsWith("#"))continue
  const match=v.match(/^([A-Z][A-Z_0-9]*)=(.*)$/)
  if(!match)throw Error("invalid_env_format")
  const key=match[1]
  if(Object.prototype.hasOwnProperty.call(result,key))throw Error("duplicate_env_name")
  result[key]=match[2].replace(/^["'](.*)["']$/,"$1")
 }
 return result
}
function parseArgs(argv){
 const opts={}
 for(let i=0;i<argv.length;i++){
  const arg=argv[i]
  if(arg==="--json"){opts.json=true;continue}
  if(!["--env","--evidence"].includes(arg)||!argv[i+1]||
    String(argv[i+1]).startsWith("--")||opts[arg.slice(2)])
    throw Error("invalid_arguments")
  opts[arg.slice(2)]=argv[++i]
 }
 if(!opts.env)throw Error("provide_explicit_env_file")
 return opts
}
async function main(){
 const opts=parseArgs(process.argv.slice(2))
 const config=readEnv(opts.env)
 let evidence=null
 if(opts.evidence){
  const text=fs.readFileSync(path.resolve(opts.evidence),"utf8")
  if(Buffer.byteLength(text)>200000)throw Error("evidence_file_too_large")
  evidence=JSON.parse(text)
 }
 const r=report(config,evidence)
 if(opts.json)process.stdout.write(JSON.stringify(r,null,2)+"\n")
 else{
  process.stdout.write("Agent Studio standalone preflight: "+r.status+"\n")
  for(const item of r.checks)process.stdout.write(item.id+": "+item.status+"\n")
 }
 if(r.status!=="READY_FOR_OPERATOR_SIGNOFF")process.exitCode=1
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{
  // Do not disclose the env path or its contents on failure.
  process.stderr.write("standalone_preflight_error:"+String(err.message||"failed").slice(0,110)+"\n")
  process.exitCode=2
 })
}
export {inspectStandalone,inspectAttestation,report,readEnv,parseArgs,EVIDENCE_IDS,BASE}
