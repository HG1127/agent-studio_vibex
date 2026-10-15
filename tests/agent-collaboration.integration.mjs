// Agent collaboration integration: isolated signed employee sessions.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {randomBytes} from "node:crypto"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"
const root=process.cwd()
const exe=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-collaboration-"))
const port=await new Promise(resolve=>{
 const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const n=s.address().port;s.close(()=>resolve(n))})
})
const key=randomBytes(32).toString("hex")
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(exe,[
 "serve","--http=127.0.0.1:"+port,"--dir="+tmp,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),env:{
 AGENT_STUDIO_AUTH_MODE:"standalone",
 AGENT_STUDIO_ALLOW_ANON:"false",AGENT_STUDIO_BOOTSTRAP_SECRET:key,
}})
let logs=""
server.stdout.on("data",x=>logs=(logs+x).slice(-12000))
server.stderr.on("data",x=>logs=(logs+x).slice(-12000))
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function request(method,route,body,token,extra={}){
 const res=await fetch(origin+route,{
  method,headers:{"Content-Type":"application/json",
   ...(token?{Authorization:token}:{}),...extra},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(14000),
 })
 return {status:res.status,data:await res.json().catch(()=>({}))}
}
async function ok(method,route,body,token,expected=200,extra={}){
 const x=await request(method,route,body,token,extra)
 assert.equal(x.status,expected,route+" "+JSON.stringify(x.data))
 return x.data
}
try{
 let live=false
 for(let i=0;i<120;i++){
  try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){live=true;break}}catch{}
  await pause(130)
 }
 assert.equal(live,true,logs.slice(-1000))
 await ok("POST","/api/studio/bootstrap",{
  email:"lead@example.test",display_name:"发起者",password:"Password-A-2026-Test",
 },undefined,201,{"X-Agent-Studio-Setup-Key":key})
 const admin=(await ok("POST","/api/collections/studio_users/auth-with-password",
  {identity:"lead@example.test",password:"Password-A-2026-Test"})).token
 async function employee(email){
  const created=await ok("POST","/api/studio/users",{
   email,display_name:"团队成员",password:"Employee-Test-Password-2026",role:"employee",
  },admin,201)
  const login=await ok("POST","/api/collections/studio_users/auth-with-password",{
   identity:email,password:"Employee-Test-Password-2026",
  })
  return {id:created.user.id,token:login.token}
 }
 const editor=await employee("editor@example.test")
 const viewer=await employee("viewer@example.test")
 const outsider=await employee("outside@example.test")
 const initial={goal:"研究公开财务报表",task_scope:"研究公开数据",
  deliverables:["报告"],task_plan:["收集","审查"],done_criteria:["有来源"],
  tools:["knowledge_search"],knowledge_base_ids:["saved-reference"],model_options:{language:"zh"}}
 const spec=await ok("POST","/api/agent_specs",{
  name:"团队研究Agent",spec:initial,
 },admin)
 const ownerList=await ok("GET","/api/studio/agent-collab/list",undefined,admin)
 assert.ok(ownerList.items.some(x=>x.id===spec.id&&x.role==="owner"))
 assert.equal((await ok("GET","/api/studio/agent-collab/list",undefined,editor.token))
  .items.some(x=>x.id===spec.id),false)
 assert.equal((await request("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)).status,404)
 await ok("POST","/api/studio/agent-collab/grant",{
  action:"grant",spec_id:spec.id,recipient_email:"editor@example.test",role:"editor",
 },admin)
 await ok("POST","/api/studio/agent-collab/grant",{
  action:"grant",spec_id:spec.id,recipient_email:"viewer@example.test",role:"viewer",
 },admin)
 const editorList=await ok("GET","/api/studio/agent-collab/list",undefined,editor.token)
 assert.ok(editorList.items.some(x=>x.id===spec.id&&x.role==="editor"&&x.owner_name))
 const viewerList=await ok("GET","/api/studio/agent-collab/list",undefined,viewer.token)
 assert.ok(viewerList.items.some(x=>x.id===spec.id&&x.role==="viewer"))
 assert.equal((await ok("GET","/api/studio/agent-collab/list",undefined,outsider.token))
  .items.some(x=>x.id===spec.id),false)

 const editorDetail=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)
 assert.equal(editorDetail.role,"editor")
 assert.equal(editorDetail.current.goal,initial.goal)
 assert.equal(editorDetail.current.tools,undefined)
 assert.equal(editorDetail.current.model_options,undefined)
 assert.equal((await request("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:editorDetail.base_hash,
  proposed:{...editorDetail.current,goal:"viewer-edit"},
  comment:"只读不能提交修改",
 },viewer.token)).status,404)
 const edited={...editorDetail.current,goal:"研究现金流及利润改善"}
 assert.equal((await request("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:editorDetail.base_hash,
  proposed:{...edited,tools:["other"]},comment:"不能加工具",
 },editor.token)).status,400)
 const draft=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:editorDetail.base_hash,
  proposed:edited,comment:"新增现金流质量分析，建议调整目标。",
 },editor.token)
 assert.equal(draft.status,"pending")
 assert.equal((await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draft.id,decision:"accept",confirm:true,
 },editor.token)).status,404)
 await ok("PATCH","/api/agent_specs/"+spec.id,{
  spec:{...initial,goal:"所有者刚调整研究目标"},
 },admin)
 const conflict=await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draft.id,decision:"accept",confirm:true,
 },admin)
 assert.equal(conflict.status,409)
 assert.equal((await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draft.id,decision:"reject",confirm:true,
 },admin)).status,409,"Owner edit must automatically retire pending stale proposal")
 const current=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)
 const fresh=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:current.base_hash,
  proposed:{...current.current,goal:"季度现金流深度研究"},
  comment:"更新季度现金流研究步骤与输出。",
 },editor.token)
 await ok("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:fresh.id,decision:"accept",confirm:true,
 },admin)
 const result=await ok("GET","/api/agent_specs/"+spec.id,undefined,admin)
 const liveSpec=typeof result.spec==="string"?JSON.parse(result.spec):result.spec
 assert.equal(liveSpec.goal,"季度现金流深度研究")
 assert.deepEqual(liveSpec.tools,initial.tools)
 assert.deepEqual(liveSpec.knowledge_base_ids,initial.knowledge_base_ids)
 assert.deepEqual(liveSpec.model_options,initial.model_options)
 assert.equal((await request("GET","/api/agent_specs/"+spec.id,undefined,editor.token)).status,404)
 // Two editors can propose from one version but the second proposal must
 // be rejected by optimistic concurrency after the first is accepted.
 await ok("POST","/api/studio/agent-collab/grant",{
  action:"grant",spec_id:spec.id,recipient_email:"viewer@example.test",role:"editor",
 },admin)
 const sameVersionA=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)
 const sameVersionB=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,viewer.token)
 assert.equal(sameVersionA.base_hash,sameVersionB.base_hash)
 const draftA=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:sameVersionA.base_hash,
  proposed:{...sameVersionA.current,goal:"本季度现金流审查模板A"},
  comment:"编辑者一更新今年的审查要点。",
 },editor.token)
 const draftB=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:sameVersionB.base_hash,
  proposed:{...sameVersionB.current,goal:"本季度现金流审查模板B"},
  comment:"编辑者二尝试另一版本的要点。",
 },viewer.token)
 await ok("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draftA.id,decision:"accept",confirm:true,
 },admin)
 const compare=await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draftB.id,decision:"accept",confirm:true,
 },admin)
 assert.equal(compare.status,409,"simultaneous proposals must not overwrite one another")
 await ok("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:draftB.id,decision:"reject",confirm:true,
 },admin)
 // An owner changing a protected tool field invalidates an older text-only
 // proposal too; otherwise a stale review could apply to new side effects.
 const beforeProtected=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)
 const protectedDraft=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:beforeProtected.base_hash,
  proposed:{...beforeProtected.current,goal:"更改研究阶段的讨论提案"},
  comment:"仅就方案流程和文本内容作出调整。",
 },editor.token)
 const protectedSnapshot=await ok("GET","/api/agent_specs/"+spec.id,undefined,admin)
 const oldProtected=typeof protectedSnapshot.spec==="string"?
  JSON.parse(protectedSnapshot.spec):protectedSnapshot.spec
 await ok("PATCH","/api/agent_specs/"+spec.id,{
  spec:{...oldProtected,tools:["knowledge_search","internal_tool_v2"]},
 },admin)
 const protectedConflict=await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:protectedDraft.id,decision:"accept",confirm:true,
 },admin)
 assert.equal(protectedConflict.status,409,"protected settings must participate in version hash")
 assert.equal((await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:protectedDraft.id,decision:"reject",confirm:true,
 },admin)).status,409,"Protected Owner updates must also cancel stale drafts")
 // A pending proposal must be cancelled immediately when its author loses
 // Editor permission; the owner cannot apply it after the revoke.
 const beforeRevoke=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)
 const revokedProposal=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:beforeRevoke.base_hash,
  proposed:{...beforeRevoke.current,goal:"已被撤销权限的草稿"},
  comment:"在撤销协作编辑权限前提交的草稿",
 },editor.token)
 assert.equal(revokedProposal.status,"pending")
 await ok("POST","/api/studio/agent-collab/grant",{
  action:"revoke",spec_id:spec.id,member_id:editor.id,
 },admin)
 const afterRevoke=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,admin)
 assert.equal(afterRevoke.proposals.find(x=>x.id===revokedProposal.id)?.status,"rejected",
  "Revoked editor's pending proposal must be cancelled")
 assert.equal((await request("POST","/api/studio/agent-collab/review",{
   spec_id:spec.id,proposal_id:revokedProposal.id,decision:"accept",confirm:true,
 },admin)).status,409)

 assert.equal((await request("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,editor.token)).status,404)
 assert.equal((await request("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,outsider.token)).status,404)
 // Owner PATCH writes safe direct-edit history in the same transaction,
 // even when the protected tool config also changes.
 const ownerHistory=await ok("GET",
  "/api/studio/agent-collab/versions?spec_id="+spec.id,undefined,admin)
 const directRows=ownerHistory.items.filter(x=>x.entry_type==="direct")
 assert.ok(directRows.length>=4,"Each of two direct Owner updates saves before/after snapshots")
 assert.ok(directRows.some(x=>x.kind==="before_accept"))
 assert.ok(directRows.some(x=>x.kind==="accepted"))
 assert.ok(directRows.every(x=>!JSON.stringify(x).includes("internal_tool_v2")))
 const updatePage=await ok("GET",
  "/api/studio/agent-collab/detail?spec_id="+spec.id,undefined,admin)
 const stalePatch=await request("PATCH","/api/agent_specs/"+spec.id,{
  spec:{...initial,goal:"不允许使用旧版本覆盖"},expected_current_hash:"0".repeat(64),
 },admin)
 assert.equal(stalePatch.status,409)
 assert.equal(stalePatch.data.error,"collab_version_conflict")
 // Name-only changes do not create redundant text snapshots.
 await ok("PATCH","/api/agent_specs/"+spec.id,{
  name:"团队研究 Agent（独立所有者改名）",
  expected_current_hash:updatePage.base_hash,
 },admin)
 const afterRename=await ok("GET",
  "/api/studio/agent-collab/versions?spec_id="+spec.id,undefined,admin)
 assert.equal(afterRename.items.length,ownerHistory.items.length)
 // Only an owner may inspect safe historical snapshots and perform CAS rollback.
 // Direct edits outside the collaboration module are not retrospectively
 // snapshotted; approved edits have before/after safe revisions.
 assert.equal((await request("GET","/api/studio/agent-collab/versions?spec_id="+spec.id,
  undefined,viewer.token)).status,404)
 assert.equal((await request("GET","/api/studio/agent-collab/versions?spec_id="+spec.id,
  undefined,outsider.token)).status,404)
 const history=await ok("GET","/api/studio/agent-collab/versions?spec_id="+spec.id,
  undefined,admin)
 assert.ok(history.items.length>=4,JSON.stringify(history))
 assert.ok(history.items.some(x=>x.kind==="before_accept"))
 assert.ok(history.items.some(x=>x.kind==="accepted"))
 assert.ok(history.items.every(x=>x.safe&&typeof x.safe.goal==="string"))
 assert.doesNotMatch(JSON.stringify(history.items),/saved-reference|internal_tool_v2|model_options|knowledge_base_ids|"tools"/)
 const originalHistory=history.items.find(x=>x.kind==="before_accept"&&
   x.safe.goal==="所有者刚调整研究目标")
 assert.ok(originalHistory,"must preserve the previous approved descriptive fields")
 const beforeRestore=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,admin)
 const restoredFromOtherAccount=await request("POST","/api/studio/agent-collab/restore",{
  spec_id:spec.id,revision_id:originalHistory.id,
  expected_current_hash:beforeRestore.base_hash,
  reason:"不允许非所有者恢复协作历史记录。",confirm:true,
 },viewer.token)
 assert.equal(restoredFromOtherAccount.status,404)
 assert.equal((await request("POST","/api/studio/agent-collab/restore",{
  spec_id:spec.id,revision_id:originalHistory.id,
  expected_current_hash:beforeRestore.base_hash,
  reason:"不允许未确认的恢复操作执行。",confirm:false,
 },admin)).status,400)
 assert.equal((await request("POST","/api/studio/agent-collab/restore",{
  spec_id:spec.id,revision_id:originalHistory.id,
  expected_current_hash:"0".repeat(64),
  reason:"过期页面的旧版本必须拒绝覆盖更新。",confirm:true,
 },admin)).status,409)
 // A pending draft created before rollback must be explicitly cancelled, even
 // if the rollback results in a spec hash previously seen by that author.
 const beforeRoll=await ok("GET","/api/studio/agent-collab/detail?spec_id="+spec.id,
  undefined,viewer.token)
 const pendingAtRestore=await ok("POST","/api/studio/agent-collab/propose",{
  spec_id:spec.id,base_hash:beforeRoll.base_hash,
  proposed:{...beforeRoll.current,goal:"回滚前尚未审批的草稿不得重新生效"},
  comment:"验证恢复后不能采纳旧编辑方案。",
 },viewer.token)
 const rollback=await ok("POST","/api/studio/agent-collab/restore",{
  spec_id:spec.id,revision_id:originalHistory.id,
  expected_current_hash:beforeRestore.base_hash,
  reason:"恢复到首个已审核的研究范围，以复核方案文字。",confirm:true,
 },admin)
 assert.equal(rollback.pending_drafts_rejected,true)
 assert.equal(rollback.current.goal,"所有者刚调整研究目标")
 const protectedAfter=await ok("GET","/api/agent_specs/"+spec.id,undefined,admin)
 const actualSpec=typeof protectedAfter.spec==="string"?
   JSON.parse(protectedAfter.spec):protectedAfter.spec
 assert.equal(actualSpec.goal,"所有者刚调整研究目标")
 assert.deepEqual(actualSpec.tools,["knowledge_search","internal_tool_v2"])
 assert.deepEqual(actualSpec.knowledge_base_ids,initial.knowledge_base_ids)
 assert.deepEqual(actualSpec.model_options,initial.model_options)
 assert.equal((await request("POST","/api/studio/agent-collab/review",{
  spec_id:spec.id,proposal_id:pendingAtRestore.id,decision:"accept",confirm:true,
 },admin)).status,409)
 assert.equal((await request("POST","/api/studio/agent-collab/restore",{
  spec_id:spec.id,revision_id:originalHistory.id,
  expected_current_hash:rollback.current_hash,
  reason:"相同版本无须重复恢复并写入数据。",confirm:true,
 },admin)).status,409)
 const updatedHistory=await ok("GET","/api/studio/agent-collab/versions?spec_id="+spec.id,
  undefined,admin)
 assert.ok(updatedHistory.items.some(x=>x.kind==="before_restore"))
 assert.ok(updatedHistory.items.some(x=>x.kind==="restored"&&
   x.source_revision_id===originalHistory.id))
 const collabDb=new (await import("node:sqlite")).DatabaseSync(
   path.join(tmp,"data.db"),{readOnly:true})
 try{
   const safeRows=collabDb.prepare(
    "SELECT kind,safe_spec_json FROM agent_studio_spec_revisions WHERE spec_id=?"
   ).all(spec.id)
   assert.ok(safeRows.length>=6)
   assert.ok(safeRows.every(x=>!String(x.safe_spec_json).includes("model_options")))
   const audits=collabDb.prepare(
    "SELECT COUNT(*) AS n FROM agent_studio_spec_collab_audit WHERE spec_id=? AND action='restore'"
   ).get(spec.id)
   assert.equal(audits.n,1)
 }finally{collabDb.close()}
 console.log("PASS Agent collaboration: granted roles, safe revisions, owner review, CAS conflict, revoke")
}catch(err){
 console.error("agent collaboration failure",err)
 console.error("server logs",logs.slice(-2500))
 process.exitCode=1
}finally{
 await stopHeadlessPocketBase(server)
 await pause(100)
 fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:220})
}
