// V8 Workflow storage API via REAL embedded PostgreSQL/RLS and RSA-verified JWT.
// Runs in memory with a single serial PostgreSQL connection and loopback HTTP.
// No Docker, PocketBase, browser, real company data or external model calls.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {createServer} from "node:http"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose"
import {AgentSpecRepository} from "../src/repository.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {createHandler} from "../src/http.ts"
import {createJwtVerifier} from "../src/auth.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const flow={
  nodes:[
    {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"model",type:"model",data:{title:"分析"},position:{x:200,y:0}},
    {id:"end",type:"end",data:{title:"结束"},position:{x:400,y:0}},
  ],
  edges:[
    {id:"e1",source:"start",target:"model"},
    {id:"e2",source:"model",target:"end"},
  ],
}

test("workflow graph fails closed on secrets, orphan nodes and unsafe cycles",async()=>{
  const {safeWorkflowGraph}=await import("../src/contracts.ts")
  const base=safeWorkflowGraph(flow)
  assert.deepEqual(base,flow)
  const secret=structuredClone(flow)
  secret.nodes[1].data={title:"分析",api_key:"SENSITIVE-KEY"}
  assert.throws(()=>safeWorkflowGraph(secret),e=>e.code==="invalid_workflow_graph")
  const dangling=structuredClone(flow)
  dangling.edges[1].target="does-not-exist"
  assert.throws(()=>safeWorkflowGraph(dangling),e=>e.code==="invalid_workflow_graph")
  const cycle=structuredClone(flow)
  cycle.edges.push({id:"e3",source:"model",target:"model"})
  assert.throws(()=>safeWorkflowGraph(cycle),e=>e.code==="invalid_workflow_graph")
  const duplicate=structuredClone(flow)
  duplicate.nodes[2].id="start"
  assert.throws(()=>safeWorkflowGraph(duplicate),e=>e.code==="invalid_workflow_graph")
  const huge=structuredClone(flow)
  huge.nodes[0].position.x=Infinity
  assert.throws(()=>safeWorkflowGraph(huge),e=>e.code==="invalid_workflow_graph")
  const toolArgs=structuredClone(flow)
  toolArgs.nodes[1].data={title:"分析",model_id:"other-account-model"}
  assert.throws(()=>safeWorkflowGraph(toolArgs),e=>e.code==="invalid_workflow_graph")
})

test("signed employee JWT controls real PostgreSQL Workflow CRUD and RLS",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  let server
  try{
    await pg.exec(schema)
    const issuer="https://oidc.staging.invalid"
    const audience="agentstudio-staging"
    const employeeA=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'A') RETURNING id",[issuer])
    const employeeB=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'B') RETURNING id",[issuer])
    const aID=employeeA.rows[0].id,bID=employeeB.rows[0].id
    // Single-session PGlite adapter: HTTP checks below are sequential.
    const pool={async connect(){return {
      async query(sql,params=[]){return pg.query(sql,params)},
      release(){},
    }}}
    const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
    const key=await exportJWK(publicKey)
    key.alg="RS256";key.kid="local"
    const verifyToken=createJwtVerifier({issuer,audience},
      createLocalJWKSet({keys:[key]}))
    const sign=subject=>new SignJWT({sub:subject})
      .setProtectedHeader({alg:"RS256",kid:"local"})
      .setIssuer(issuer).setAudience(audience)
      .setIssuedAt().setExpirationTime("10m").sign(privateKey)
    const bearerA=await sign("A")
    const bearerB=await sign("B")
    const handler=createHandler({
      repository:new AgentSpecRepository(pool),
      workflowRepository:new WorkflowRepository(pool),
      verifyToken,allowedOrigin:"https://intranet.staging.invalid",
    })
    server=createServer(handler)
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const base="http://127.0.0.1:"+server.address().port
    const invoke=async(method,url,token,body,headers={})=>{
      const response=await fetch(base+url,{
        method,
        headers:{
          "Accept":"application/json",
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
          ...(token?{Authorization:"Bearer "+token}:{}),
          ...headers,
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(6000),
      })
      return {
        status:response.status,
        data:await response.json(),
      }
    }
    const empty=await invoke("GET","/api/v2/workflows",bearerA)
    assert.equal(empty.status,200)
    assert.deepEqual(empty.data.items,[])
    const unauthorized=await invoke("POST","/api/v2/workflows",undefined,{
      name:"forged",graph:flow,
    },{"X-Rh-User-Id":"A"})
    assert.equal(unauthorized.status,401)
    const invalid=await invoke("POST","/api/v2/workflows",bearerA,{
      name:"invalid",graph:{...flow,nodes:[
        {...flow.nodes[0],data:{title:"开始",api_key:"never"}},
        ...flow.nodes.slice(1),
      ]},
    })
    assert.equal(invalid.status,400)
    assert.equal(invalid.data.error,"invalid_workflow_graph")
    const orphan=await invoke("POST","/api/v2/workflows",bearerA,{
      name:"orphan",graph:{...flow,edges:flow.edges.slice(0,1)},
    })
    assert.equal(orphan.status,400)

    const a=await invoke("POST","/api/v2/workflows",bearerA,{
      name:"我的流程",graph:flow,
    })
    assert.equal(a.status,201,JSON.stringify(a.data))
    assert.equal(a.data.item.owner_user_id,aID)
    assert.equal(a.data.item.revision,1)
    assert.equal(a.data.item.graph.nodes.length,3)
    assert.equal(JSON.stringify(a.data.item).includes("credentials"),false)
    const b=await invoke("POST","/api/v2/workflows",bearerB,{
      name:"另一员工流程",graph:flow,
    })
    assert.equal(b.status,201)
    assert.equal(b.data.item.owner_user_id,bID)

    const listA=await invoke("GET","/api/v2/workflows",bearerA,
      undefined,{"X-Rh-User-Id":"B"})
    assert.equal(listA.status,200)
    assert.deepEqual(listA.data.items.map(item=>item.id),[a.data.item.id])
    assert.equal((await invoke("GET","/api/v2/workflows/"+b.data.item.id,bearerA)).status,404)
    assert.equal((await invoke("PATCH","/api/v2/workflows/"+b.data.item.id,bearerA,{
      name:"越权",graph:flow,expected_revision:1,
    })).status,404)

    const stale=await invoke("PATCH","/api/v2/workflows/"+a.data.item.id,bearerA,{
      name:"旧版本",graph:flow,expected_revision:99,
    })
    assert.equal(stale.status,409)
    const updated=await invoke("PATCH","/api/v2/workflows/"+a.data.item.id,bearerA,{
      name:"更新名称",graph:flow,expected_revision:1,
    })
    assert.equal(updated.status,200,JSON.stringify(updated.data))
    assert.equal(updated.data.item.revision,2)
    assert.equal(updated.data.item.name,"更新名称")

    // Database RLS itself protects owner even if a future query accidentally
    // forgets the owner condition in SQL.
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[aID])
      const visible=await pg.query("SELECT name FROM agentstudio.workflows")
      assert.deepEqual(visible.rows.map(r=>r.name),["更新名称"])
    }finally{await pg.exec("ROLLBACK")}
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,2)
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    await pg.close()
  }
})
