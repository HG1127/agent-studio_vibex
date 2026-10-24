import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {randomUUID} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {AgentCollaborationRepository} from "../src/agent-collaboration-repository.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {createHandler} from "../src/http.ts"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {inspectAgentCollaborationSchema} from "../src/agent-collaboration-audit.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
test("Native Cookie collaboration keeps CSRF/owner scoping and permits only explicit stops and receipt reads after write opt-out",async()=>{
  const f=await agentCollaborationFixture();let server,handler,enabled=true,native
  try{
    assert.equal(await inspectAgentCollaborationSchema(f.pool),true)
    server=createServer((req,res)=>{void handler(req,res)})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const origin="http://127.0.0.1:"+server.address().port
    const configure=()=>{
      let business
      native=createNativeAuthHttpHandler({auth:f.store,allowedOrigin:origin,allowConfigurationWrites:enabled,allowAgentCollaboration:true,
        businessHandler:(req,res)=>{if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:enabled,autonomousAgentUat:true})){
          res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return}
          return business(req,res)}})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("no OIDC fallback")},authenticateRequest:native.authenticateRequest,
        repository:new AgentSpecRepository(f.pool),autonomousAgentRunRepository:new AutonomousAgentRunRepository(f.pool),
        agentCollaborationRepository:new AgentCollaborationRepository(f.pool,(identity,email)=>f.store.resolveKnowledgeRecipient(identity,email),{enabled})})
      handler=native.handler
    }
    configure()
    const call=async(path,{method="GET",body,cookie,csrf=true,extra={}}={})=>{
      const headers={Origin:origin,"Content-Type":"application/json",...(csrf?{"X-AgentStudio-Request":"1"}:{}),...(cookie?{Cookie:cookie}:{}),...extra}
      const response=await fetch(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
      return {status:response.status,headers:response.headers,body:await response.json()}
    }
    const login=async(email,password)=>{const response=await call("/api/native-auth/login",{method:"POST",body:{email,password}});assert.equal(response.status,200);return response.headers.get("set-cookie").split(";")[0]}
    const alice=await login("synthetic-admin@example.test","SyntheticServiceAdmin#2026"),bob=await login("collaborator@example.test","SyntheticCollaborator#2026")
    const client=cookie=>createPgNativePilotApi((route,init)=>fetch(origin+String(route).replace(/^\/__pg_native/,""),{...init,headers:{...init.headers,Origin:origin,Cookie:cookie}}))
    const aliceApi=client(alice),bobApi=client(bob)
    const large={goal:"目".repeat(2998)+"🚀",task_scope:"域".repeat(4000),deliverables:Array(30).fill("项".repeat(500)),task_plan:Array(30).fill("计".repeat(500)),done_criteria:Array(30).fill("成".repeat(500))}
    const createdLarge=await call("/api/v2/agent-specs",{method:"POST",cookie:alice,body:{name:"Large descriptive role",spec:large}})
    assert.equal(createdLarge.status,201);assert.deepEqual(createdLarge.body.item.spec.task_plan,large.task_plan)
    assert.deepEqual((await aliceApi.getAgentCollaboration(createdLarge.body.item.id)).safe.task_plan,large.task_plan)
    const created=await call("/api/v2/agent-specs",{method:"POST",cookie:alice,body:{name:"HTTP collaboration",spec:{goal:"Owner description",tools:["calculate"]}}})
    assert.equal(created.status,201);const role=created.body.item,base="/api/v2/agent-collaboration/"+role.id
    const grant={action:"grant",request_id:randomUUID(),recipient_email:"collaborator@example.test",role:"editor",expected_access_revision:0}
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,csrf:false,body:grant})).status,403)
    assert.equal((await call(base+"/change",{method:"POST",cookie:bob,body:grant,extra:{"X-Rh-User-Id":f.owner.id}})).status,404)
    assert.equal((await aliceApi.changeAgentCollaboration(role.id,grant)).revision,1)
    const saved=await call(base+"/change",{method:"POST",cookie:alice,body:grant});assert.equal(saved.status,200);assert.equal(saved.body.item.revision,1);assert.equal(saved.body.item.replayed,true)
    const shared=await call(base,{cookie:bob});assert.equal(shared.status,200);assert.equal(shared.body.item.role,"editor");assert.deepEqual(shared.body.item.grants,[])
    assert.equal((await bobApi.getAgentCollaboration(role.id)).role,"editor");assert.equal((await bobApi.listAgentCollaboration()).length,1)
    assert.equal((await call("/api/v2/agent-specs/"+role.id,{cookie:bob,extra:{"X-Rh-User-Id":f.owner.id}})).status,404)
    assert.equal((await call("/api/v2/agent-specs/"+role.id+"/autonomous-runs",{method:"POST",cookie:bob,body:{expected_revision:role.revision,instruction:"Cannot execute a collaborator role",max_steps:1,idempotency_key:"collaboration-is-not-execution"}})).status,404)
    const proposal={action:"propose",request_id:randomUUID(),expected_spec_revision:shared.body.item.revision,source_sha256:shared.body.item.source_sha256,
      proposed:{...shared.body.item.safe,goal:"Editor safe proposal"},comment:"Explain the safe wording improvement"}
    assert.equal((await call(base+"/change",{method:"POST",cookie:bob,body:proposal})).status,200)
    const owner=(await call(base,{cookie:alice})).body.item,pending=owner.proposals[0]
    const reject={action:"review",request_id:randomUUID(),expected_spec_revision:owner.revision,source_sha256:owner.source_sha256,proposal_id:pending.id,proposal_sha256:pending.proposal_sha256,decision:"reject",confirm:true}
    enabled=false;configure()
    assert.equal((await call("/api/native-auth/capabilities",{cookie:alice})).body.agent_collaboration_available,true)
    assert.equal((await aliceApi.getConfigCapabilities()).agent_collaboration_available,true)
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,body:grant})).status,405)
    assert.equal((await call(base+"/confirm",{method:"POST",cookie:alice,body:grant})).body.item.replayed,true)
    assert.equal((await aliceApi.confirmAgentCollaboration(role.id,grant)).replayed,true)
    assert.equal((await call(base+"/revoke",{method:"POST",cookie:alice,body:grant})).status,400)
    assert.equal((await call(base+"/reject",{method:"POST",cookie:alice,body:{...reject,decision:"accept"}})).status,400)
    assert.equal((await call(base+"/reject",{method:"POST",cookie:alice,body:reject})).body.item.status,"rejected")
    assert.equal((await call(base+"/confirm",{method:"POST",cookie:alice,body:{...grant,request_id:randomUUID()}})).status,404)
    assert.equal((await call(base+"/revoke",{method:"POST",cookie:alice,body:{action:"revoke",request_id:randomUUID(),recipient_id:f.recipient.id,expected_access_revision:1},extra:{Origin:"https://foreign.invalid"}})).status,403)
    const revoked=await call(base+"/revoke",{method:"POST",cookie:alice,body:{action:"revoke",request_id:randomUUID(),recipient_id:f.recipient.id,expected_access_revision:1}})
    assert.equal(revoked.status,200);assert.equal(revoked.body.item.active,false)
    assert.equal((await call(base+"/confirm",{method:"POST",cookie:alice,body:grant})).body.item.replayed,true)
    assert.equal((await call(base,{cookie:bob})).status,404)
    await assert.rejects(bobApi.getAgentCollaboration(role.id),e=>e.status===404)
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,body:grant,extra:{Origin:"https://foreign.invalid"}})).status,405)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
