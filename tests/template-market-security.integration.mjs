// Template publication and redemption must not expose or inherit an author's
// KB IDs, private connector names, credentials, quality fixtures or access rules.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"Local PocketBase binary needed for isolated template test")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-templates-ux-"))
const port=await new Promise((resolve,reject)=>{
  const s=net.createServer()
  s.once("error",reject)
  s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(()=>resolve(port))})
})
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(binary,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,env:{
  ...process.env,AGENT_STUDIO_ALLOW_ANON:"false",
}})
let logs=""
server.stdout.on("data",part=>logs=(logs+String(part)).slice(-7000))
server.stderr.on("data",part=>logs=(logs+String(part)).slice(-7000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function call(method,route,user,body) {
  const headers={"Content-Type":"application/json",...(user?{"X-Rh-User-Id":user}:{})}
  const response=await fetch(origin+route,{method,headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(12000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function ok(method,route,user,body) {
  const result=await call(method,route,user,body)
  assert.equal(result.status,200,route+" => "+JSON.stringify(result.data).slice(0,850))
  return result.data
}
try{
  let ready=false
  for(let i=0;i<110;i++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}
    catch{}
    await sleep(150)
  }
  assert.ok(ready,"Disposable PocketBase failed: "+logs.slice(-1600))
  assert.equal((await call("GET","/api/templates/market","")).status,401)
  const base=await ok("POST","/api/knowledge-bases/manage","employee-owner-123",{
    action:"create",name:"仅限所有者的知识库",description:"private workspace",
  })
  const confidential="SECRET_VALUE_MUST_NOT_LEAK_12345"
  const source=await ok("POST","/api/agent_specs","employee-owner-123",{
    name:"公开研究方案",spec:{
      goal:"帮助使用者进行公开信息研究",
      task_scope:"只整理公开来源，禁止使用私人投资资料",
      deliverables:["研究提纲","引用列表"],
      task_plan:["检索","核实","生成报告"],
      done_criteria:["引用准确"],
      tools:["web_search","knowledge_search","mkt__abcdefghijklmno__private_write","private_connector_api_key"],
      knowledge_base_ids:[base.id],
      quality_checks:[{type:"contains",expected:confidential}],
      model_api_token:confidential,
      headers:{authorization:confidential},
      custom_model:{api_key:confidential},
      require_approval:false,require_plan_review:true,
    },
  })
  const publishBody={
    source_spec_id:source.id,name:"研究模板",description:"仅用于公开数据示例",category:"research",
  }
  assert.equal((await call("POST","/api/templates/publish","employee-owner-123",publishBody)).status,428,
    "A public template cannot be published without a reviewed source revision")
  const published=await ok("POST","/api/templates/publish","employee-owner-123",{
    ...publishBody,expected_updated:source.updated,
  })
  assert.ok(published.item?.id)
  const templateId=published.item.id
  const later=await ok("PATCH","/api/agent_specs/"+source.id,"employee-owner-123",{
    expected_updated:source.updated,
    spec:{...source.spec,goal:"其他标签页更新后应重新审核的目标"},
  })
  const stalePublish=await call("POST","/api/templates/publish","employee-owner-123",{
    ...publishBody,expected_updated:source.updated,
  })
  assert.equal(stalePublish.status,409,
    "Template publication must reject a changed plan after user reviewed it")
  assert.equal(stalePublish.data.error,"template_source_changed")
  assert.ok(later.updated)

  const market=await ok("GET","/api/templates/market","employee-other-789")
  const result=market.items.find(item=>item.id===templateId)
  assert.ok(result,"Public template must be discoverable by another employee")
  assert.deepEqual(result.spec.knowledge_base_ids,[],"Private KB must not be returned in public API")
  assert.deepEqual(result.spec.tools,["web_search","knowledge_search"])
  assert.deepEqual(result.spec.quality_checks,[])
  assert.equal(result.spec.require_approval,true)
  assert.equal(result.spec.require_plan_review,true)
  const pub=JSON.stringify(result)
  assert.doesNotMatch(pub,/SECRET_VALUE_MUST_NOT_LEAK|private_write|private_connector_api_key|model_api_token|authorization|custom_model/)
  const builtin=market.items.filter(item=>item.built_in)
  assert.ok(builtin.length>=3,"Built-in templates should exist for empty teams")
  assert.ok(builtin.every(item=>Array.isArray(item.spec.knowledge_base_ids)&&
    item.spec.knowledge_base_ids.length===0))
  const cloned=await ok("POST","/api/templates/"+templateId+"/use","employee-other-789",{})
  const clonedSpec=await ok("GET","/api/agent_specs/"+cloned.spec_id,"employee-other-789")
  assert.equal(clonedSpec.rh_user_id,"employee-other-789")
  assert.deepEqual(clonedSpec.spec.knowledge_base_ids,[])
  assert.deepEqual(clonedSpec.spec.tools,["web_search","knowledge_search"])
  assert.equal(clonedSpec.spec.require_approval,true)
  assert.doesNotMatch(JSON.stringify(clonedSpec.spec),/SECRET_VALUE_MUST_NOT_LEAK|private_write|private_connector_api_key/)
  assert.equal((await call("POST","/api/templates/"+templateId+"/unpublish","employee-other-789",{})).status,404)
  assert.equal((await call("DELETE","/api/templates/"+templateId,"employee-other-789")).status,404)
  await ok("POST","/api/templates/"+templateId+"/unpublish","employee-owner-123",{})
  assert.ok(!(await ok("GET","/api/templates/market","employee-other-789"))
    .items.some(item=>item.id===templateId))
  assert.equal((await call("POST","/api/templates/"+templateId+"/use","employee-other-789",{})).status,404)
  // Existing copies remain owned by their recipient after template unpublication.
  assert.equal((await ok("GET","/api/agent_specs/"+cloned.spec_id,"employee-other-789")).id,cloned.spec_id)
  await ok("POST","/api/templates/"+templateId+"/republish","employee-owner-123",{})
  assert.ok((await ok("GET","/api/templates/market","employee-other-789"))
    .items.some(item=>item.id===templateId))
  await ok("DELETE","/api/templates/"+templateId,"employee-owner-123")
  assert.ok(!(await ok("GET","/api/templates/market","employee-other-789"))
    .items.some(item=>item.id===templateId))
  assert.equal((await ok("GET","/api/agent_specs/"+cloned.spec_id,"employee-other-789")).id,cloned.spec_id)
  console.log("PASS template lifecycle: publish safe snapshot, public visibility, owner ACL, copy isolated, unpublish, republish, delete")
}catch(error){
  console.error("TEMPLATE_UX_SECURITY_FAILURE",error.stack||String(error))
  console.error("PB_LOG",logs.slice(-1800))
  process.exitCode=1
}finally{
  try{await stopHeadlessPocketBase(server)}catch{}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:220})}catch{}
}
