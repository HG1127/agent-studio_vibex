import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {randomBytes,createHash} from "node:crypto"
import {createServer} from "node:http"
import {skillAbMessages} from "../src/lib/skillAbCompare.ts"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const SHA=source=>createHash("sha256").update(source).digest("hex")
const METHOD=[
  "---",
  "name: first-principles-analysis",
  "description: Use when analyzing assumptions, cost constraints and disproving old industry beliefs.",
  "allowed-tools: web_search",
  "---",
  "# First-principles analysis",
  "FIRST_PRINCIPLES_TEST_TAG",
  "1. List existing beliefs and mark which are actually facts.",
  "2. Derive physical and economic constraints using evidence.",
  "3. Propose alternative systems and falsifiable experiments.",
  "4. Include counterexamples and explain uncertainty."
].join("\n")
function listen(server){return new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
test("Skill text import, owner review, role-only injection, immutable run and no tool escalation",async()=>{
  assert.ok(fs.existsSync(binary),"isolated PocketBase binary required")
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-skills-"))
  const modelPrompts=[]
  const model=createServer(async(req,res)=>{
    // Decode UTF-8 after collecting network chunks; decoding each Buffer
    // individually corrupts multibyte Chinese at TCP chunk boundaries.
    const wireChunks=[]
    for await(const chunk of req)wireChunks.push(chunk)
    const raw=Buffer.concat(wireChunks).toString("utf8")
    const input=JSON.parse(raw||"{}")
    const system=input.messages?.find(x=>x.role==="system")?.content||""
    const user=input.messages?.find(x=>x.role==="user")?.content||""
    const active=system.includes("当前角色：第一性原理研究员")
      ?"researcher":system.includes("当前角色：独立审核员")?"reviewer":"unknown"
    modelPrompts.push({active,system,user})
    const answer=active==="researcher"
      ?{action:"role_complete",role_id:"researcher",role_output:user.includes("FIRST_PRINCIPLES_TEST_TAG")?
         "APPLIED_FIRST_PRINCIPLES_AND_FALSIFICATION":"NO_FIRST_PRINCIPLES"}
      :active==="reviewer"?{action:"final",final_answer:"Independent reviewer checked evidence and marked uncertainty."}
      :null
    const content=answer?JSON.stringify(answer):(user.includes("FIRST_PRINCIPLES_TEST_TAG")
      ?"SYNTHETIC_SKILL_AB_METHOD_REFERENCED":"SYNTHETIC_BASELINE_AB_ONLY")
    res.writeHead(200,{"Content-Type":"application/json"})
    res.end(JSON.stringify({choices:[{message:{role:"assistant",content}}],
      usage:{prompt_tokens:75,completion_tokens:45}}))
  })
  let pb=null,logs=""
  try{
    await listen(model)
    const modelBase="http://127.0.0.1:"+model.address().port+"/v1"
    const reserve=createServer()
    await listen(reserve)
    const origin="http://127.0.0.1:"+reserve.address().port
    await new Promise(resolve=>reserve.close(resolve))
    const secret=randomBytes(32).toString("hex")
    pb=spawnHeadlessPocketBase(binary,["serve","--http="+origin.slice("http://".length),
      "--dir="+dataDir,"--hooksDir="+path.join(root,"pocketbase/pb_hooks")],{
      cwd:path.join(root,"pocketbase"),windowsHide:true,env:{
        ...process.env,AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
        AGENT_STUDIO_LEGACY_TEST_ONLY:"false",AGENT_STUDIO_BACKGROUND_WORKER:"false",
        AGENT_STUDIO_BOOTSTRAP_SECRET:secret,
        AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString("hex"),
        AGENT_STUDIO_STRICT_SECRETS:"true"
      }
    })
    for(const stream of [pb.stdout,pb.stderr])stream.on("data",chunk=>logs=(logs+chunk).slice(-6000))
    let ready=false
    for(let i=0;i<120;i++){
      try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(450)})).ok){ready=true;break}}catch{}
      if(pb.exitCode!==null)break
      await sleep(100)
    }
    assert.ok(ready,"PocketBase did not start: "+logs)
    async function request(method,route,body,token=""){
      const response=await fetch(origin+route,{method,headers:{"Content-Type":"application/json",
        ...(token?{Authorization:token}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(30000)})
      return {status:response.status,data:await response.json().catch(()=>({}))}
    }
    const email="skills-"+randomBytes(5).toString("hex")+"@example.test"
    const password="Fixture-"+randomBytes(18).toString("hex")+"!"
    const setup=await fetch(origin+"/api/studio/bootstrap",{method:"POST",
      headers:{"Content-Type":"application/json","X-Agent-Studio-Setup-Key":secret},
      body:JSON.stringify({email,password,display_name:"Skill Test Owner"})})
    assert.equal(setup.status,201,"bootstrap "+await setup.text())
    const login=await request("POST","/api/collections/studio_users/auth-with-password",{identity:email,password})
    assert.equal(login.status,200,JSON.stringify(login.data))
    const token=login.data.token
    async function ok(method,route,body){const r=await request(method,route,body,token)
      assert.equal(r.status,200,method+" "+route+" "+JSON.stringify(r.data));return r.data}
    assert.equal((await request("GET","/api/skills")).status,401)
    const imported=await ok("POST","/api/skills/import",{source:METHOD})
    const sid=imported.item.id
    assert.equal(imported.item.version,1)
    assert.equal(imported.item.approved,false)
    assert.match(sid,/^[A-Za-z0-9]{15}$/)
    const summary=(await ok("GET","/api/skills")).items[0]
    assert.equal(summary.approved_version,0)
    assert.equal(JSON.stringify(summary).includes("FIRST_PRINCIPLES_TEST_TAG"),false)
    const detail=await ok("GET","/api/skills/detail?id="+sid+"&version=1")
    assert.match(detail.content,/FIRST_PRINCIPLES_TEST_TAG/)
    assert.equal(detail.hash,SHA(METHOD))
    // Optional, opt-in public GitHub import smoke. Not run in CI; its HTTPS
    // availability must not make deterministic offline tests flaky.
    if(process.env.AGENT_STUDIO_TEST_PUBLIC_GITHUB_SKILL==="1"){
      const publicSkill=await ok("POST","/api/skills/import",{
        github_url:"https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md"
      })
      const publicDetail=await ok("GET","/api/skills/detail?id="+publicSkill.item.id+"&version=1")
      assert.ok(publicDetail.source_url.includes("github.com/anthropics/skills/"))
      assert.match(publicDetail.content,/^---\nname:/)
      assert.equal(publicDetail.approved,false)
      console.log("SKILL_PUBLIC_GITHUB_IMPORT_PASS: name="+publicSkill.item.name+
        " characters="+publicDetail.content.length+" reviewed=false")
    }
    // A second real employee cannot inspect, approve or disable the owner's Skill.
    // Forging the legacy owner header must not change server-side ownership.
    const otherEmail="other-"+randomBytes(5).toString("hex")+"@example.test"
    const otherPassword="Fixture-"+randomBytes(18).toString("hex")+"!"
    const created=await request("POST","/api/studio/users",{
      email:otherEmail,password:otherPassword,display_name:"Skill Unauthorized Reviewer",
      role:"employee",share_enabled:false
    },token)
    assert.equal(created.status,201)
    assert.equal(created.data.user.role,"employee")
    const otherLogin=await request("POST","/api/collections/studio_users/auth-with-password",{
      identity:otherEmail,password:otherPassword
    })
    assert.equal(otherLogin.status,200)
    const otherToken=otherLogin.data.token
    assert.equal((await request("GET","/api/skills",undefined,otherToken)).data.items.length,0)
    assert.equal((await request("GET","/api/skills/detail?id="+sid+"&version=1",
      undefined,otherToken)).status,404)
    assert.equal((await request("POST","/api/skills/approve",
      {id:sid,version:1,confirm_review:true},otherToken)).status,404)
    assert.equal((await request("POST","/api/skills/active",
      {id:sid,active:false},otherToken)).status,404)
    const spoof=await fetch(origin+"/api/skills/detail?id="+sid+"&version=1",{
      headers:{"Authorization":otherToken,"X-Rh-User-Id":login.data.record.id},
      signal:AbortSignal.timeout(30000)
    })
    assert.equal(spoof.status,404)
    assert.equal((await request("POST","/api/skills/approve",{id:sid,version:1},token)).status,400)
    const modelConnection=await ok("POST","/api/model-connections",{
      name:"Skill model fixture",provider:"openai",base_url:modelBase,api_key:"synthetic-only",
      models:["mock-skill-role"]
    })
    const roles=[
      {id:"researcher",name:"第一性原理研究员",responsibility:"分析基本约束",tasks:["拆解假设"],
        inputs:["用户任务"],deliverables:["假设清单"],depends_on:[],tools:[],
        done_criteria:["列明可验证实验"],skill_refs:[{id:sid,version:1,hash:detail.hash}]},
      {id:"reviewer",name:"独立审核员",responsibility:"独立审核",tasks:["交叉核对"],
        inputs:["前序成果"],deliverables:["审核记录"],depends_on:["researcher"],tools:[],
        done_criteria:["标出不确定性"],skill_refs:[]}
    ]
    const save=await ok("POST","/api/agent_specs",{name:"First principles role",spec:{
      goal:"Review a synthetic energy company",task_scope:"Synthetic only",tools:[],
      deliverables:["Evidence report"],task_plan:["Research","Review"],
      done_criteria:["Explain counterarguments"],roles}})
    const startBody={spec_id:save.id,instruction:"Review a synthetic company",model:"mock-skill-role",
      config:{max_steps:6,max_model_calls:12,tools:{},
        custom_model:{connection_id:modelConnection.item.id,model_id:"mock-skill-role"}}}
    const blocked=await request("POST","/api/agent-runs/start",startBody,token)
    assert.equal(blocked.status,400,JSON.stringify(blocked.data))
    assert.equal(blocked.data.error,"skill_reference_unavailable")
    await ok("POST","/api/skills/approve",{id:sid,version:1,confirm_review:true})
    const run=await ok("POST","/api/agent-runs/start",startBody)
    const snapshot=await ok("GET","/api/agent_runs/"+run.run_id)
    const pinned=snapshot.config.role_skill_snapshots
    assert.equal(pinned.length,1)
    assert.equal(pinned[0].skills[0].hash,detail.hash)
    assert.ok(pinned[0].skills[0].content.includes("FIRST_PRINCIPLES_TEST_TAG"))
    assert.deepEqual(snapshot.config.tools,{calculate:false,summarize:false,knowledge_search:false,web_fetch:false,web_search:false})
    await ok("POST","/api/llm/agent-engine/"+run.run_id+"/tick",{})
    assert.ok(modelPrompts[0].user.includes("FIRST_PRINCIPLES_TEST_TAG"))
    assert.ok(modelPrompts[0].user.includes("外部低信任方法资料"))
    assert.equal(modelPrompts[0].active,"researcher")
    const update=await ok("POST","/api/skills/import",{source:METHOD.replace("FIRST_PRINCIPLES_TEST_TAG","UPDATED_SKILL_DO_NOT_LEAK")})
    assert.equal(update.item.version,2)
    const oldVersion=await ok("GET","/api/skills/detail?id="+sid+"&version=1")
    const newerVersion=await ok("GET","/api/skills/detail?id="+sid+"&version=2")
    assert.equal(oldVersion.approved,true,"previous approved Skill remains usable after v2 import")
    assert.equal(newerVersion.approved,false,"new imported versions need a new review")
    assert.equal(oldVersion.hash,detail.hash,"old approved version is immutable")
    assert.notEqual(newerVersion.hash,oldVersion.hash)
    await ok("POST","/api/skills/active",{id:sid,active:false})
    assert.equal((await request("POST","/api/agent-runs/start",startBody,token)).status,400)
    await ok("POST","/api/llm/agent-engine/"+run.run_id+"/tick",{})
    const after=await ok("GET","/api/agent_runs/"+run.run_id)
    assert.equal(after.status,"succeeded",JSON.stringify(after))
    assert.equal(modelPrompts[1].active,"reviewer")
    assert.equal(modelPrompts[1].user.includes("FIRST_PRINCIPLES_TEST_TAG"),false,
      "reviewer must not inherit researcher's Skill instructions")
    assert.equal(modelPrompts[1].user.includes("UPDATED_SKILL_DO_NOT_LEAK"),false)
    const detailRun=await ok("GET","/api/agent-runs/"+run.run_id+"/detail")
    assert.equal(detailRun.events.filter(x=>x.content?.role_phase==="skill_loaded").length,1)
    assert.equal(detailRun.events.some(x=>JSON.stringify(x).includes("FIRST_PRINCIPLES_TEST_TAG")),false,
      "event evidence must include version/hash, not raw instructions")
    // Real PocketBase route + local provider simulate the two paid-boundary
    // calls. This verifies full long-Skill input and security, NOT model IQ.
    const longPrefix=METHOD.replace("name: first-principles-analysis","name: steve-jobs-test")
    const longSkill=longPrefix+"\n"+"战略产品方法与反面证据".repeat(1500).slice(0,15553-longPrefix.length-1)
    assert.equal(longSkill.length,15553)
    const longImported=await ok("POST","/api/skills/import",{source:longSkill})
    const longId=longImported.item.id
    const longDetail=await ok("GET","/api/skills/detail?id="+longId+"&version=1")
    assert.equal(longDetail.content,longSkill,
      "server registry must preserve the full original 15.5K Skill before approval")
    assert.equal(longDetail.approved,false)
    const longRef={id:longId,version:1,hash:longDetail.hash}
    const abBase={page:"skill_ab_review",connection_id:modelConnection.item.id,
      model:"mock-skill-role",strict_model:true,max_tokens:900,skill_ref:longRef}
    const nextId=()=>"skill-ab-test-"+randomBytes(10).toString("hex")
    const deniedUnapproved=await request("POST","/api/llm/chat",{
      ...abBase,variant:"with_skill",request_id:nextId()},token)
    assert.equal(deniedUnapproved.status,400,
      "no model request with unapproved full Skill text")
    const modelBefore=modelPrompts.length
    assert.equal(modelPrompts.length,modelBefore)
    await ok("POST","/api/skills/approve",{
      id:longId,version:1,confirm_review:true})
    const baseline=await ok("POST","/api/llm/chat",{
      ...abBase,request_id:nextId(),variant:"baseline"})
    const withMethod=await ok("POST","/api/llm/chat",{
      ...abBase,request_id:nextId(),variant:"with_skill"})
    assert.equal(baseline.model,"mock-skill-role")
    assert.equal(withMethod.model,"mock-skill-role")
    assert.match(baseline.text,/SYNTHETIC_BASELINE_AB_ONLY/)
    assert.match(withMethod.text,/SYNTHETIC_SKILL_AB_METHOD_REFERENCED/)
    assert.ok(Number.isInteger(withMethod.usage?.input_tokens)&&
      Number.isInteger(withMethod.usage?.output_tokens),"A/B mode must report provider tokens")
    assert.equal(modelPrompts.length,modelBefore+2,
      "only two employee-approved model calls should dispatch")
    const delivered=modelPrompts.at(-1).user
    const start=delivered.indexOf(longSkill.slice(0,160))
    let mismatch=0
    while(mismatch<longSkill.length&&delivered[start+mismatch]===longSkill[mismatch])mismatch++
    assert.ok(delivered.includes(longSkill),
      "backend must send complete frozen 15.5K Skill to model, without truncation: "+
      JSON.stringify({originalChars:longSkill.length,deliveredChars:delivered.length,
        firstMatchingChars:mismatch,mismatchExpected:longSkill.charCodeAt(mismatch),
        mismatchDelivered:delivered.charCodeAt(start+mismatch),
        originalEndsAt:delivered.lastIndexOf(longSkill.slice(-160)),
        originalStartsAt:start}))
    assert.equal(modelPrompts.at(-2).user.includes("FIRST_PRINCIPLES_TEST_TAG"),false,
      "baseline must not include the Skill")
    const deniedPayloads=[
      {...abBase,strict_model:false,request_id:nextId(),variant:"baseline"},
      {...abBase,model:"some-other-model",request_id:nextId(),variant:"baseline"},
      {...abBase,request_id:nextId(),variant:"with_skill",
        messages:skillAbMessages("with_skill",longSkill)},
      {...abBase,request_id:nextId(),variant:"with_skill",tools:[{name:"send_email"}]},
      {...abBase,request_id:nextId(),variant:"arbitrary",skill_ref:longRef},
    ]
    for (const attempted of deniedPayloads) {
      const beforeCall=modelPrompts.length
      assert.equal((await request("POST","/api/llm/chat",attempted,token)).status,400)
      assert.equal(modelPrompts.length,beforeCall,
        "invalid A/B request must not dispatch to the billable provider")
    }
    const alien=await request("POST","/api/llm/chat",{
      ...abBase,request_id:nextId(),variant:"with_skill"},otherToken)
    assert.equal(alien.status,400,"employee B cannot use employee A's Skill")
    const legacyV28=await request("POST","/api/llm/chat",{
      ...abBase,page:"agent_v28_blind",request_id:nextId(),
      messages:skillAbMessages("with_skill",longSkill)},token)
    assert.equal(legacyV28.status,400,
      "unrelated V28 benchmark must retain its separate 8K message limit")
    assert.equal(modelPrompts.length,modelBefore+2)
    console.log("SKILL_FULLTEXT_AB_PASS",JSON.stringify({chars:longSkill.length,
      sentChars:modelPrompts.at(-1).user.length,modelCalls:2,
      v28CapUnchanged:true,crossTenantRejected:true}))
    console.log(JSON.stringify({status:"SKILL_E2E_PASS",roles:2,skillSnapshots:pinned.length,
      events:detailRun.events.length,modelCalls:modelPrompts.length,foreignSkillLeak:false}))
  }finally{
    if(pb)await stopHeadlessPocketBase(pb)
    await new Promise(resolve=>model.close(resolve))
    fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:3,retryDelay:100})
  }
})
