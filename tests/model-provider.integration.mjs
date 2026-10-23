// Real PocketBase Agent and Workflow transport validation with local fake providers.
// No paid API calls and no production credentials.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"

const root=process.cwd()
const pb=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb),"Set POCKETBASE_BIN for provider integration")
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-provider-test-"))
const pbPort=Number(process.env.PB_MODEL_PROVIDER_TEST_PORT || 7351)
const modelPort=Number(process.env.PB_MODEL_PROVIDER_MOCK_PORT || 7352)
const origin="http://127.0.0.1:"+pbPort
const user="model-provider-test-user"
const headers={"Content-Type":"application/json","X-Rh-User-Id":user}
const calls=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const provider=createServer(async (req,res)=>{
  let body=""
  for await (const part of req) body+=part.toString()
  const parsed=JSON.parse(body||"{}")
  const kind=req.url?.includes("generateContent")?"gemini"
    : req.url?.endsWith("/messages")?"anthropic":"openai"
  calls.push({kind,headers:req.headers,url:req.url,body:parsed})
  const isWorkflow=body.includes("workflow-probe")
  const answer=isWorkflow?"workflow-provider-passed"
    : JSON.stringify({action:"final",thought:"Model provider smoke test",final_answer:"agent-provider-passed"})
  const debugEmpty=kind==="openai" && body.includes("debug-empty-no-retry")
  const payload=kind==="anthropic"?{content:[{type:"text",text:answer}],usage:{input_tokens:13,output_tokens:21}}
    :kind==="gemini"?{candidates:[{content:{parts:[{text:answer}]}}],usageMetadata:{promptTokenCount:13,candidatesTokenCount:21}}
    :{choices:[{message:{role:"assistant",content:debugEmpty?"":answer},
      finish_reason:debugEmpty?"length":"stop"}],usage:{prompt_tokens:13,completion_tokens:21}}
  res.writeHead(200,{"Content-Type":"application/json"})
  res.end(JSON.stringify(payload))
})
const env={...process.env,AGENT_STUDIO_ALLOW_ANON:"false"}
const server=spawnHeadlessPocketBase(pb,["serve","--http=127.0.0.1:"+pbPort,"--dir="+tmp,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks")],{
  cwd:path.join(root,"pocketbase"),env,windowsHide:true,
})
let logs=""
server.stdout.on("data",x=>{logs=(logs+x).slice(-15000)})
server.stderr.on("data",x=>{logs=(logs+x).slice(-15000)})
async function api(method,route,body,asUser=user) {
  const scopedHeaders={...headers}
  if(asUser) scopedHeaders["X-Rh-User-Id"]=asUser
  else delete scopedHeaders["X-Rh-User-Id"]
  const response=await fetch(origin+route,{
    method,headers:scopedHeaders,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(18000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function expect(method,route,body,status=200) {
  const r=await api(method,route,body)
  assert.equal(r.status,status,method+" "+route+" "+JSON.stringify(r.data))
  return r.data
}
async function runWorkflow(connectionId,kind) {
  const flow=await expect("POST","/api/workflow-studio/create",{
    name:"V7.2 "+kind+" flow",
    graph:{
      nodes:[
        {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
        {id:"model",type:"model",data:{title:"模型",model:"custom:"+connectionId+":mock-"+kind,
          prompt:"workflow-probe "+kind},position:{x:160,y:0}},
        {id:"end",type:"end",data:{title:"结束",output_template:"{{模型.output}}"},position:{x:320,y:0}},
      ],
      edges:[{id:"e1",source:"start",target:"model"},{id:"e2",source:"model",target:"end"}],
    },
  })
  const run=await expect("POST","/api/workflow-runs/start",{
    workflow_id:flow.id,instruction:"V7.2 model provider transport",
  })
  let row
  for(let i=0;i<8;i++){
    await expect("POST","/api/llm/workflow-engine/"+run.run_id+"/tick",{})
    const status=await expect("GET","/api/workflow-runs/"+run.run_id+"/detail")
    row=status.run
    if(["succeeded","failed"].includes(row.status))break
  }
  assert.equal(row.status,"succeeded",JSON.stringify(row))
  assert.match(row.result,/workflow-provider-passed/)
  const trace=await expect("GET","/api/execution-traces?kind=workflow&run_id="+run.run_id)
  assert.ok(trace.items.length>=1,kind+" Workflow model span missing")
  assert.equal(trace.trace_id,run.run_id)
  assert.equal(trace.items[0].operation,"model")
  assert.equal(trace.items[0].status,"succeeded")
  assert.ok(trace.items[0].duration_ms>=0)
  assert.equal((await api("GET","/api/execution-traces?kind=workflow&run_id="+run.run_id,undefined,"other-user")).status,404)
  assert.doesNotMatch(JSON.stringify(trace),/mock-secret|mock-provider-key|api_key|headers|prompt/)

}
async function runAgent(connectionId,kind) {
  const spec=await expect("POST","/api/agent_specs",{
    name:"V7.2 "+kind+" Agent",
    spec:{goal:"Transport test",task_scope:"Local mock",tools:[],deliverables:["Result"],
      task_plan:["Answer directly"],done_criteria:["Returns evidence"]},
  })
  const run=await expect("POST","/api/agent-runs/start",{
    spec_id:spec.id,model:"mock-"+kind,instruction:"agent-probe "+kind,
    config:{max_steps:3,tools:{},
      custom_model:{connection_id:connectionId,model_id:"mock-"+kind}},
  })
  let row
  for(let i=0;i<5;i++){
    await expect("POST","/api/llm/agent-engine/"+run.run_id+"/tick",{})
    row=await expect("GET","/api/agent_runs/"+run.run_id)
    if(["succeeded","failed"].includes(row.status))break
  }
  assert.equal(row.status,"succeeded",JSON.stringify(row))
  assert.match(row.result,/agent-provider-passed/)
  const trace=await expect("GET","/api/execution-traces?kind=agent&run_id="+run.run_id)
  assert.ok(trace.items.length>=1,kind+" Agent model span missing")
  assert.equal(trace.items[0].trace_id,run.run_id)
  assert.equal(trace.items[0].operation,"model")
  assert.equal(trace.items[0].status,"succeeded")
  assert.ok(trace.items[0].duration_ms>=0)
  assert.equal((await api("GET","/api/execution-traces?kind=agent&run_id="+run.run_id,undefined,"other-user")).status,404)
  assert.doesNotMatch(JSON.stringify(trace),/mock-secret|mock-provider-key|api_key|headers|prompt/)

}
try {
  await new Promise(resolve=>provider.listen(modelPort,"127.0.0.1",resolve))
  let started=false
  for(let i=0;i<110;i++){
    if(server.exitCode!==null)break
    try { if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){started=true;break} }catch{}
    await pause(160)
  }
  assert.ok(started,"PocketBase did not start: "+logs.slice(-2500))
  assert.equal((await api("GET","/api/execution-traces?kind=agent&run_id=invalid")).status,400)
  assert.equal((await api("GET","/api/execution-traces?kind=agent&run_id=abcdefghijklmno",undefined,"")).status,401)

  for(const kind of ["openai","anthropic","gemini"]) {
    const conn=await expect("POST","/api/model-connections",{
      name:"V7.2 "+kind,provider:kind,
      base_url:"http://127.0.0.1:"+modelPort+"/v1",
      api_key:"mock-secret-"+kind,models:["mock-"+kind],
    })
    // Strict employee-scoped model-node debugger must refuse stale model
    // selections BEFORE any outbound provider call or billing.
    const beforeDenied=calls.length
    const strictDenied=await api("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"removed-model",strict_model:true,
      page:"workflow_node_debug",request_id:"strict-denied-"+kind,
      max_tokens:512,messages:[{role:"user",content:"never-call-provider"}],
    })
    assert.equal(strictDenied.status,400,JSON.stringify(strictDenied.data))
    assert.equal(strictDenied.data.error,"model_not_permitted")
    assert.equal(calls.length,beforeDenied,"denied debug model must not contact provider")
    // Agent creation must not silently switch away from the exact model
    // selected by this employee, even when a different default exists.
    const homeBefore=calls.length
    const invalidHome=await api("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"removed-model",strict_model:true,
      page:"home",request_id:"design-denied-"+kind+"-model",max_tokens:1200,
      messages:[{role:"system",content:"Design a synthetic Agent"},{role:"user",content:"No real data"}],
    })
    assert.equal(invalidHome.status,400,JSON.stringify(invalidHome.data))
    assert.equal(invalidHome.data.error,"model_not_permitted")
    assert.equal(calls.length,homeBefore,"rejected design binding must cost zero calls")
    const foreignHome=await api("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"home",request_id:"design-foreign-"+kind+"-model",max_tokens:1200,
      messages:[{role:"user",content:"Foreign employee must not use this model"}],
    },"other-user")
    assert.equal(foreignHome.status,400,JSON.stringify(foreignHome.data))
    assert.equal(calls.length,homeBefore)
    const designHome=await expect("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"home",request_id:"design-authorized-"+kind+"-model",max_tokens:1200,
      messages:[{role:"system",content:"Design synthetic multirole Agent"},
        {role:"user",content:"Only synthetic information"}],
    })
    assert.equal(designHome.status,"success")
    assert.equal(designHome.model,"mock-"+kind)
    assert.equal(calls.length,homeBefore+1)
    assert.equal(calls.at(-1).kind,kind,"design must use the employee-selected provider")
    const beforeDebugInvalid=calls.length
    const debugBase={
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"workflow_node_debug",request_id:"workflow-debug-invalid-"+kind,
      max_tokens:512,messages:[{role:"user",content:"debug validation probe"}],
    }
    const invalidCases=[
      [{...debugBase,strict_model:false},"debug_binding_required"],
      [{...debugBase,connection_id:""},"debug_binding_required"],
      [{...debugBase,max_tokens:513},"debug_token_limit"],
      [{...debugBase,max_tokens:-1},"debug_token_limit"],
      [{...debugBase,messages:[{role:"user",content:"A".repeat(8001)}]},"debug_prompt_limit"],
      [{...debugBase,messages:[{role:"system",content:"bypass"}]},"debug_prompt_limit"],
      [{...debugBase,request_id:"bad"},"debug_request_id_invalid"],
    ]
    for(const [payload,error] of invalidCases){
      const rejected=await api("POST","/api/llm/chat",payload)
      assert.equal(rejected.status,400,JSON.stringify(rejected.data))
      assert.equal(rejected.data.error,error)
    }
    assert.equal(calls.length,beforeDebugInvalid,
      "rejected debug requests must not invoke a provider")
    const debugId="workflow-debug-"+kind
    const debug=await expect("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"workflow_node_debug",request_id:debugId,
      max_tokens:512,messages:[{role:"user",content:"debug fixture (no real service)"}],
    })
    assert.equal(debug.status,"success")
    const debugCall=calls[calls.length-1]
    assert.equal(debugCall.kind,kind,"authorized debug node must use selected provider")
    if(kind==="openai")assert.equal(debugCall.body.max_tokens,512)
    if(kind==="anthropic")assert.equal(debugCall.body.max_tokens,512)
    if(kind==="gemini")assert.equal(debugCall.body.generationConfig?.maxOutputTokens,512,
      "Gemini debug must enforce maxOutputTokens instead of using an uncapped default")
    const callsAfterAuthorizedDebug=calls.length
    const cachedDebug=await expect("POST","/api/llm/chat",{
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"workflow_node_debug",request_id:debugId,
      max_tokens:512,messages:[{role:"user",content:"debug fixture (no real service)"}],
    })
    assert.equal(cachedDebug.cached,true,"same debug request ID must reuse previous result")
    assert.equal(calls.length,callsAfterAuthorizedDebug,"cached request must not invoke provider twice")
    const polled=await expect("POST","/api/llm/poll",{request_id:debugId})
    assert.equal(polled.status,"success")
    const other=await api("POST","/api/llm/poll",{request_id:debugId},"other-user")
    assert.equal(other.status,200)
    assert.equal(other.data.status,"not_found","debug result must be owner-scoped")
    if(kind==="openai"){
      const beforeEmpty=calls.length
      const truncated=await api("POST","/api/llm/chat",{
        connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
        page:"workflow_node_debug",request_id:"debug-empty-no-retry-openai",
        max_tokens:512,messages:[{role:"user",content:"debug-empty-no-retry"}],
      })
      assert.equal(truncated.status,502,
        "empty reasoning output should fail without a second billable request")
      assert.equal(calls.length,beforeEmpty+1,
        "node debug must never auto-retry with 2048 or 16384 tokens")
    }

    // V28 uses the same employee-owned model connection, never an exported
    // API key or a second set of Runner environment credentials.
    const blindBase={
      connection_id:conn.item.id,model:"mock-"+kind,strict_model:true,
      page:"agent_v28_blind",request_id:"v28-blind-"+kind+"-test",
      max_tokens:1024,messages:[
        {role:"system",content:"Agent Studio synthetic blind planning fixture"},
        {role:"user",content:JSON.stringify({requirement:"Synthetic complex task",available_tools:[]})},
      ],
    }
    const blindBefore=calls.length
    for(const [invalid,error] of [
      [{...blindBase,strict_model:false},"blind_binding_required"],
      [{...blindBase,max_tokens:10240},"blind_output_budget_invalid"],
      [{...blindBase,messages:[{role:"user",content:"bypass"}]},"blind_request_invalid"],
      [{...blindBase,model:"removed-model"},"model_not_permitted"],
    ]){
      const denied=await api("POST","/api/llm/chat",invalid)
      assert.equal(denied.status,400,JSON.stringify(denied.data))
      assert.equal(denied.data.error,error)
    }
    assert.equal(calls.length,blindBefore,"invalid blind requests must never reach the model")
    const foreign=await api("POST","/api/llm/chat",blindBase,"foreign-user")
    assert.equal(foreign.status,400,"another employee cannot run a blind test on this connection")
    assert.equal(calls.length,blindBefore)
    const blind=await expect("POST","/api/llm/chat",blindBase)
    assert.equal(blind.status,"success")
    assert.deepEqual(blind.usage,{input_tokens:13,output_tokens:21},
      "return only verified provider token counts; no API key or account details")
    assert.equal(calls.length,blindBefore+1,"one explicit blind attempt means exactly one provider request")
    const blindCall=calls[calls.length-1]
    if(kind==="openai")assert.equal(blindCall.body.max_tokens,1024)
    if(kind==="anthropic")assert.equal(blindCall.body.max_tokens,1024)
    if(kind==="gemini")assert.equal(blindCall.body.generationConfig.maxOutputTokens,1024)
    const duplicate=await expect("POST","/api/llm/chat",blindBase)
    assert.equal(duplicate.cached,true)
    assert.equal(calls.length,blindBefore+1,"a duplicated request ID must never incur an extra charge")
    assert.doesNotMatch(JSON.stringify(blind),/mock-secret-|api_key|authorization|headers/)

    await runAgent(conn.item.id,kind)
    await runWorkflow(conn.item.id,kind)
    const kindCalls=calls.filter(c=>c.kind===kind)
    assert.ok(kindCalls.length>=2,kind+" should be invoked by Agent and Workflow")
    for(const c of kindCalls){
      if(kind==="openai"){
        assert.equal(c.headers.authorization,"Bearer mock-secret-openai")
        assert.equal(c.body.model,"mock-openai")
      } else if(kind==="anthropic"){
        assert.equal(c.headers["x-api-key"],"mock-secret-anthropic")
        assert.equal(c.body.model,"mock-anthropic")
      } else {
        assert.ok(c.url.includes("key=mock-secret-gemini"))
        assert.equal(c.headers.authorization,undefined)
        assert.ok(c.body.contents.length>=1)
      }
    }
  }
  console.log("PASS V7.3 provider, owner-isolated model spans: 3 protocols x Agent + Workflow")
} finally {
  server.kill()
  provider.close()
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),pause(1200)])
  await pause(150)
  try { fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:250}) }catch{}
}
