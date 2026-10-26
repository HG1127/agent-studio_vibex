// One-use internal Agent template sharing through authenticated, owner-scoped APIs.
// Real temporary PocketBase SQLite; does not launch any browser or admin UI.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
const root=process.cwd()
const pb=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb),"PocketBase binary required")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-template-sharing-"))
const port=Number(process.env.PB_TEMPLATE_TEST_PORT||7411)
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(pb,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false",AGENT_STUDIO_INTERNAL_SHARE_USERS:"A,B,C"}})
let log=""
server.stdout.on("data",x=>{log=(log+x).slice(-12000)})
server.stderr.on("data",x=>{log=(log+x).slice(-12000)})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function request(method,route,owner,body) {
 const headers={"Content-Type":"application/json"}
 if(owner) headers["X-Rh-User-Id"]=owner
 const resp=await fetch(origin+route,{method,headers,
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)})
 return {status:resp.status,data:await resp.json().catch(()=>({}))}
}
async function expect(method,route,owner,body,status=200){
 const result=await request(method,route,owner,body)
 assert.equal(result.status,status,method+" "+route+" "+JSON.stringify(result.data))
 return result.data
}
const endpoint="/api/internal/templates"
try {
 let ready=false
 for(let i=0;i<130;i++){
  if(server.exitCode!==null)break
  try {if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(650)})).ok){ready=true;break}}catch{}
  await sleep(160)
 }
 assert.ok(ready,"PocketBase did not become ready "+log.slice(-2200))
 await expect("GET",endpoint,"",undefined,401)
 await expect("POST",endpoint,"",{action:"create"},401)
 await expect("POST",endpoint,"B",{action:"create",spec_id:"abcdefghijklmno"},404)
 await expect("GET",endpoint,"D",undefined,403)
 await expect("POST",endpoint,"D",{action:"preview",spec_id:"abcdefghijklmno"},403)

 const sequence=["research","documents","analysis","review","delivery"]
 const sourceRoles=sequence.map((id,index)=>({
   id,name:id,responsibility:"执行并交接独立任务："+id,
   tasks:["执行阶段："+id],inputs:["授权资料"],
   deliverables:["有来源的阶段成果："+id],
   depends_on:index?[sequence[index-1]]:[],
   tools:index===0?["EXTERNAL_PRIVATE_TOOL"]:["calculate"],
   done_criteria:["完成核验："+id],
   skill_refs:index===0?[{id:"pvtSkill0000001",version:1,hash:"f".repeat(64)}]:[],
 }))
 const sourceNeeds=[
   {id:"research_need",title:"检索公开资料",purpose:"取得公开证据",
     kind:"browser",access:"read",required:true,role_ids:["research"],
     search_terms:["public company"],suggested_tool_ids:["owner_private_tool"]},
   {id:"delivery_need",title:"审批后交付",purpose:"只允许本人授权",
     kind:"integration",access:"write",required:true,role_ids:["delivery"],
     search_terms:["email"],suggested_tool_ids:["owner_private_sender"]},
 ]
 const source=await expect("POST","/api/agent_specs","A",{
  name:"内部研究助手",
  spec:{
    goal:"研究市场机会；共享者需确认没有敏感信息",
    task_scope:"覆盖公开信息",
    deliverables:["摘要报告"],tools:["calculate","knowledge_search","EXTERNAL_PRIVATE_TOOL"],
    task_plan:["检索","汇总"],done_criteria:["引用来源"],
    roles:sourceRoles,capability_requirements:sourceNeeds,
    quality_checks:[{type:"contains",expected:"来源"}],
    require_plan_review:false,
    knowledge_base_ids:["123456789012345"],
    require_approval:false,
    custom_model:{connection_id:"PERSONAL_MODEL_SECRET"},
    api_key:"NEVER_COPY_THIS_KEY",hidden_context:"NEVER_COPY_SECRET_CONTEXT",
  },
 })
 await expect("POST",endpoint,"B",{action:"preview",spec_id:source.id},404)
 const preview=await expect("POST",endpoint,"A",{action:"preview",spec_id:source.id})
 assert.match(preview.preview_hash,/^[a-f0-9]{64}$/)
 assert.equal(preview.preview_spec.require_approval,true)
 assert.deepEqual(preview.preview_spec.tools,["calculate","knowledge_search"])
 assert.deepEqual(preview.preview_spec.knowledge_base_ids,[])
 assert.equal(preview.preview_spec.roles.length,5)
 assert.deepEqual(preview.preview_spec.roles.map(r=>r.id),sequence)
 assert.deepEqual(preview.preview_spec.roles.map(r=>r.tools),[[],[],[],[],[]])
 assert.ok(preview.preview_spec.roles.every(r=>!Object.hasOwn(r,"skill_refs")))
 assert.deepEqual(preview.preview_spec.capability_requirements.map(x=>x.role_ids),
   [["research"],["delivery"]])
 assert.deepEqual(preview.preview_spec.capability_requirements.map(x=>x.suggested_tool_ids),[[],[]])
 assert.deepEqual(preview.preview_spec.capability_requirements.map(x=>x.search_terms),[[],[]])
 assert.deepEqual(preview.preview_spec.quality_checks,[{type:"contains",expected:"来源"}])
 assert.equal(preview.preview_spec.require_plan_review,true)
 assert.doesNotMatch(JSON.stringify(preview),/PERSONAL_MODEL_SECRET|NEVER_COPY|123456789012345|EXTERNAL_PRIVATE_TOOL/)
 await expect("POST",endpoint,"A",{action:"create",spec_id:source.id},409)
 await expect("POST",endpoint,"A",{action:"create",spec_id:source.id,
  confirm_safe:"true",preview_hash:preview.preview_hash},409)
 await expect("POST",endpoint,"A",{action:"create",spec_id:source.id,
  confirm_safe:true,preview_hash:"f".repeat(64)},409)
 const createReviewed=()=>expect("POST",endpoint,"A",{
  action:"create",spec_id:source.id,confirm_safe:true,preview_hash:preview.preview_hash,
 })
 const created=await createReviewed()
 // Once issued, the reviewed snapshot must never change if the author edits
 // or deletes the original spec before a colleague redeems the code.
 await expect("PATCH","/api/agent_specs/"+source.id,"A",{
  spec:{goal:"已更新的目标",tools:["calculate"],knowledge_base_ids:[]},
 })
 assert.match(created.share_code,/^[A-Za-z0-9]{48}$/)
 assert.equal(created.one_time,true)
 assert.ok(created.expires_ms>Date.now())
 const ownerList=await expect("GET",endpoint,"A")
 assert.equal(ownerList.invites.length,1)
 assert.equal(ownerList.specs.length,1)
 assert.doesNotMatch(JSON.stringify(ownerList),new RegExp(created.share_code))
 const strangerList=await expect("GET",endpoint,"B")
 assert.equal(strangerList.specs.length,0)
 assert.equal(strangerList.invites.length,0)
 assert.doesNotMatch(JSON.stringify(strangerList),/内部研究助手|123456789012345/)
 await expect("POST",endpoint,"A",{action:"redeem",share_code:created.share_code},404)
 await expect("POST",endpoint,"B",{action:"revoke",id:created.id},404)

 const imported=await expect("POST",endpoint,"B",{action:"redeem",share_code:created.share_code})
 assert.match(imported.spec_id,/^[A-Za-z0-9]{15}$/)
 assert.notEqual(imported.spec_id,source.id)
 const result=await expect("GET","/api/agent_specs/"+imported.spec_id,"B")
 assert.equal(result.rh_user_id,"B")
 assert.equal(result.spec.require_approval,true)
 assert.deepEqual(result.spec.knowledge_base_ids,[])
 assert.deepEqual(result.spec.tools,["calculate","knowledge_search"])
 assert.equal(result.spec.goal,"研究市场机会；共享者需确认没有敏感信息")
 assert.equal(result.spec.roles.length,5)
 assert.deepEqual(result.spec.roles.map(r=>r.id),sequence)
 assert.deepEqual(result.spec.roles[4].depends_on,["review"])
 assert.ok(result.spec.roles.every(r=>r.tools.length===0&&!Object.hasOwn(r,"skill_refs")))
 assert.deepEqual(result.spec.capability_requirements.map(r=>r.role_ids),
   [["research"],["delivery"]])
 assert.ok(result.spec.capability_requirements.every(r=>r.suggested_tool_ids.length===0))
 assert.ok(result.spec.capability_requirements.every(r=>r.search_terms.length===0))
 assert.deepEqual(result.spec.quality_checks,[{type:"contains",expected:"来源"}])
 assert.equal(result.spec.require_plan_review,true)
 assert.doesNotMatch(JSON.stringify(result),/PERSONAL_MODEL_SECRET|NEVER_COPY|123456789012345|EXTERNAL_PRIVATE_TOOL|pvtSkill0000001|owner_private_tool|owner_private_sender/)
 await expect("GET","/api/agent_specs/"+imported.spec_id,"A",undefined,404)
 await expect("POST",endpoint,"C",{action:"redeem",share_code:created.share_code},404)
 const ownerAfter=await expect("GET",endpoint,"A")
 assert.ok(ownerAfter.invites[0].used_ms>0)
 assert.doesNotMatch(JSON.stringify(ownerAfter),/used_by|sha256|share_code/)

 await expect("POST",endpoint,"A",{action:"create",spec_id:source.id,
  confirm_safe:true,preview_hash:preview.preview_hash},409)
 const newPreview=await expect("POST",endpoint,"A",{action:"preview",spec_id:source.id})
 const createCurrent=()=>expect("POST",endpoint,"A",{
  action:"create",spec_id:source.id,
  confirm_safe:true,preview_hash:newPreview.preview_hash,
 })
 const revoked=await createCurrent()
 await expect("POST",endpoint,"A",{action:"revoke",id:revoked.id})
 await expect("POST",endpoint,"C",{action:"redeem",share_code:revoked.share_code},404)
 const expired=await createCurrent()
 const sqlite=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
 try{
  const row=sqlite.prepare("SELECT token_hash FROM agent_studio_template_invites WHERE id=?").get(created.id)
  assert.ok(row.token_hash.startsWith("sha256:"))
  assert.ok(!row.token_hash.includes(created.share_code))
  const snapshot=sqlite.prepare("SELECT snapshot_json FROM agent_studio_template_invites WHERE id=?").get(created.id)
  assert.deepEqual(JSON.parse(snapshot.snapshot_json).tools,["calculate","knowledge_search"])
  assert.equal(JSON.parse(snapshot.snapshot_json).roles.length,5)
  assert.ok(JSON.parse(snapshot.snapshot_json).roles.every(r=>!r.skill_refs && r.tools.length===0))
  assert.doesNotMatch(snapshot.snapshot_json,/NEVER_COPY|EXTERNAL_PRIVATE_TOOL|PERSONAL_MODEL_SECRET/)

  sqlite.prepare("UPDATE agent_studio_template_invites SET expires_ms=? WHERE id=?")
    .run(Date.now()-10000,expired.id)
 } finally {sqlite.close()}
 await expect("POST",endpoint,"C",{action:"redeem",share_code:expired.share_code},404)

 console.log("PASS reviewed immutable Agent snapshot: consent+hash, no secrets, replay/revoke/expiry, tenant isolation")
} finally {
 server.kill()
 await Promise.race([new Promise(resolve=>server.once("exit",resolve)),sleep(1600)])
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
