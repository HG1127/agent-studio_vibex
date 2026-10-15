import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {randomBytes} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {spawnHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd(), dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-company-"))
const exe=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const secret=randomBytes(36).toString("hex")
const port=await new Promise(resolve=>{
 const s=net.createServer();s.listen(0,"127.0.0.1",()=>{
  const n=s.address().port;s.close(()=>resolve(n))
 })
})
const base="http://127.0.0.1:"+port
const processPb=spawnHeadlessPocketBase(exe,[
 "serve","--http=127.0.0.1:"+port,"--dir="+dir,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks")
],{cwd:path.join(root,"pocketbase"),env:{
 AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_BOOTSTRAP_SECRET:secret,
 AGENT_STUDIO_ALLOW_ANON:"false",AGENT_STUDIO_COMPANY_TEST_DEBUG:"yes",
}})
let logs=""
processPb.stdout.on("data",x=>logs=(logs+x).slice(-16000))
processPb.stderr.on("data",x=>logs=(logs+x).slice(-16000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function call(method,url,body,token="",headers={}){
 const response=await fetch(base+url,{method,headers:{"Content-Type":"application/json",
  ...(token?{Authorization:token}:{}),...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(14000)})
 return {status:response.status,data:await response.json().catch(()=>({}))}
}
const post=(url,body,token,headers)=>call("POST",url,body,token,headers)
const get=(url,token)=>call("GET",url,undefined,token)
async function success(method,url,body,token,code=200,headers={}){
 const r=await call(method,url,body,token,headers)
 assert.equal(r.status,code,url+": "+JSON.stringify(r.data))
 return r.data
}
try{
 let online=false
 for(let i=0;i<130;i++){
  try{if((await fetch(base+"/api/health",{signal:AbortSignal.timeout(600)})).ok){online=true;break}}catch{}
  await sleep(150)
 }
 assert.ok(online,"PocketBase startup failed")
 const lead=await success("POST","/api/studio/bootstrap",{
  email:"lead@example.test",password:"Password-A-2026-Test",display_name:"负责人"
 },"",201,{"X-Agent-Studio-Setup-Key":secret})
 const leaderId=lead.user.id
 const leaderToken=(await success("POST","/api/collections/studio_users/auth-with-password",
  {identity:"lead@example.test",password:"Password-A-2026-Test"})).token
 const employee=await success("POST","/api/studio/users",{
  email:"staff@example.test",password:"Password-B-2026-Test",
  display_name:"员工甲",role:"employee"
 },leaderToken,201)
 const workerId=employee.user.id
 const staffToken=(await success("POST","/api/collections/studio_users/auth-with-password",
  {identity:"staff@example.test",password:"Password-B-2026-Test"})).token
 assert.equal((await get("/api/studio/company/overview",staffToken)).status,403)
 const org=await success("GET","/api/studio/company/overview",undefined,leaderToken)
 assert.equal(org.scope,"company_metadata_only")
 assert.equal(org.totals.employees,2)
 assert.equal(JSON.stringify(org).includes("staff@example.test"),false)
 const spec=await success("POST","/api/agent_specs",{
  name:"内部文档助手",spec:{goal:"核对内部文档",tools:["knowledge_search"]}
 },staffToken)
 const start=await success("POST","/api/agent-runs/start",{
  spec_id:spec.id,instruction:"核对本部门文档",model:"claude-opus-4.8",
  config:{max_steps:3,tools:{knowledge_search:true}}
 },staffToken)
 const runId=start.run_id
 const sqlite=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
 try {
  sqlite.prepare("UPDATE agent_runs SET status='awaiting_approval',current_step=2,checkpoint=? WHERE id=?")
    .run(JSON.stringify({seq:2,pending_approval:{tool:"external_post",step_index:2,
      input:{url:"https://example.test/endpoint",authorization:"demo"}},
     claim_until:0,approval_decision:""}),runId)
 }finally{sqlite.close()}
 const pending=await success("GET","/api/studio/approval-delegations",undefined,staffToken)
 assert.equal(pending.pending.length,1)
 assert.equal((await post("/api/studio/approval-delegations",{
  action:"grant",run_id:runId,reviewer_id:leaderId,
  review_note:"请核对当前文档操作，并确认可以按既定流程继续执行。"
 },leaderToken)).status,404)
 await success("POST","/api/studio/approval-delegations",{
  action:"grant",run_id:runId,reviewer_id:leaderId,
  review_note:"请核对当前文档操作，并确认可以按既定流程继续执行。"
 },staffToken)
 const inbox=await success("GET","/api/studio/manager/approvals",undefined,leaderToken)
 assert.equal(inbox.items.length,1,JSON.stringify(inbox))
 const item=inbox.items[0]
 assert.match(item.fingerprint,/^[a-f0-9]{64}$/i)
 assert.doesNotMatch(item.input_preview,/demo/)
 assert.doesNotMatch(item.input_preview,/endpoint|very-private|authorization|payload|token=/i)
 assert.match(item.review_note,/请核对当前文档操作/)
 assert.equal((await post("/api/studio/approval-delegations",{
  action:"grant",run_id:runId,reviewer_id:leaderId,review_note:""
 },staffToken)).status,400,"Owner must explain the purpose of delegating")
 const request={run_id:runId,step_index:item.step_index,
  decision:"approve",fingerprint:item.fingerprint,confirm:true}
 assert.equal((await post("/api/studio/manager/decision",request,staffToken)).status,403)
 assert.equal((await post("/api/studio/manager/decision",{
  ...request,fingerprint:"0".repeat(64)
 },leaderToken)).status,409)
 await success("POST","/api/studio/approval-delegations",{
  action:"revoke",run_id:runId
 },staffToken)
 assert.equal((await post("/api/studio/manager/decision",request,leaderToken)).status,404)
 await success("POST","/api/studio/approval-delegations",{
  action:"grant",run_id:runId,reviewer_id:leaderId,
  review_note:"请核对当前文档操作，并确认可以按既定流程继续执行。"
 },staffToken)
 const decision=await success("POST","/api/studio/manager/decision",request,leaderToken)
 assert.equal(decision.reviewed_by,leaderId)
 assert.equal((await post("/api/studio/manager/decision",request,leaderToken)).status,404)
 const db=new DatabaseSync(path.join(dir,"data.db"),{readOnly:true})
 try{
  const run=db.prepare("SELECT status,checkpoint FROM agent_runs WHERE id=?").get(runId)
  assert.equal(run.status,"running")
  assert.equal(JSON.parse(run.checkpoint).approval_decision,"approve")
  const actions=db.prepare("SELECT action,owner_uid FROM agent_studio_review_audit ORDER BY occurred_ms").all()
  assert.deepEqual(actions.map(x=>x.action),["grant","revoke","grant","approve"])
  assert.ok(actions.every(x=>x.owner_uid===workerId))
 }finally{db.close()}

 // Old authorizations must NEVER roll forward to the next pending step of a
 // reused run ID, even when the owner has not explicitly revoked the grant.
 const start2=await success("POST","/api/agent-runs/start",{
  spec_id:spec.id,instruction:"第二个被审核的动作",
  model:"claude-opus-4.8",config:{max_steps:6,tools:{knowledge_search:true}}
 },staffToken)
 const run2=start2.run_id
 const initial2={seq:12,pending_approval:{tool:"external_post",step_index:2,
    input:{action:"old-draft"}},approval_decision:"",claim_until:0}
 const changed2={seq:14,pending_approval:{tool:"external_post",step_index:3,
    input:{action:"new-pending-operation"}},approval_decision:"",claim_until:0}
 const writable=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
 try{
  writable.prepare("UPDATE agent_runs SET status='awaiting_approval',current_step=2,checkpoint=? WHERE id=?")
    .run(JSON.stringify(initial2),run2)
 }finally{writable.close()}
 await success("POST","/api/studio/approval-delegations",{
  action:"grant",run_id:run2,reviewer_id:leaderId,
  review_note:"第二次审核仅限当前步骤，核对完成后决定是否继续。"
 },staffToken)
 const oldInbox=await success("GET","/api/studio/manager/approvals",undefined,leaderToken)
 const oldItem=oldInbox.items.find(x=>x.run_id===run2)
 assert.ok(oldItem)
 const newer=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
 try{
  newer.prepare("UPDATE agent_runs SET current_step=3,checkpoint=? WHERE id=?")
   .run(JSON.stringify(changed2),run2)
 }finally{newer.close()}
 const afterChange=await success("GET","/api/studio/manager/approvals",undefined,leaderToken)
 assert.equal(afterChange.items.some(x=>x.run_id===run2),false,
   "Previous permission must not authorize an updated pending step")
 const outdated=await post("/api/studio/manager/decision",{
  run_id:run2,step_index:oldItem.step_index,fingerprint:oldItem.fingerprint,
  decision:"approve",confirm:true,
 },leaderToken)
 assert.equal(outdated.status,409,"Stale manager approval must fail closed")
 const ownerPending=await success("GET","/api/studio/approval-delegations",undefined,staffToken)
 assert.equal(ownerPending.pending.find(x=>x.run_id===run2).reviewer_id,"")
 await success("POST","/api/studio/approval-delegations",{
  action:"grant",run_id:run2,reviewer_id:leaderId,
  review_note:"第二次审核仅限当前步骤，核对完成后决定是否继续。"
 },staffToken)
 const freshInbox=await success("GET","/api/studio/manager/approvals",undefined,leaderToken)
 const fresh=freshInbox.items.find(x=>x.run_id===run2)
 assert.ok(fresh)
 assert.equal(fresh.step_index,3)
 assert.notEqual(fresh.fingerprint,oldItem.fingerprint)
 const reject=await success("POST","/api/studio/manager/decision",{
  run_id:run2,step_index:fresh.step_index,fingerprint:fresh.fingerprint,
  decision:"reject",confirm:true,
 },leaderToken)
 assert.equal(reject.decision,"reject")
 const reviewed=new DatabaseSync(path.join(dir,"data.db"),{readOnly:true})
 try {
  const done=reviewed.prepare("SELECT checkpoint FROM agent_runs WHERE id=?").get(run2)
  assert.equal(JSON.parse(done.checkpoint).approval_decision,"reject")
  const actions=reviewed.prepare("SELECT action FROM agent_studio_review_audit WHERE run_id=? ORDER BY occurred_ms,rowid")
    .all(run2).map(x=>x.action)
  assert.deepEqual(actions,["grant","grant","reject"])
 }finally{reviewed.close()}
 console.log("PASS standalone manager overview, opt-in delegation, revoke, one-use decision and audit")
}catch(e){console.error("company integration failure",e);console.error("logs:",logs.slice(-6500));process.exitCode=1}
finally{
 processPb.kill()
 await sleep(350)
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
