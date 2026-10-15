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
  const payload=kind==="anthropic"?{content:[{type:"text",text:answer}]}
    :kind==="gemini"?{candidates:[{content:{parts:[{text:answer}]}}]}
    :{choices:[{message:{role:"assistant",content:answer}}]}
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
