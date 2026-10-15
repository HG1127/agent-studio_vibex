// V8 POSTGRESQL API pilot isolated HTTP integration tests.
// Uses a strict in-memory SQL adapter; no PG/PocketBase/browser/network except
// an ephemeral loopback Node HTTP server. Real PG engine still unverified.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {randomUUID} from "node:crypto"
import {AgentSpecRepository,withActor,verifyDatabaseRole} from "../services/pg-api/src/repository.ts"
import {createHandler} from "../services/pg-api/src/http.ts"

const uuids={
  A:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
}
class FakePool {
  rows=new Map()
  sql=[]
  identities=new Map([
    ["https://identity.internal.example|A",uuids.A],
    ["https://identity.internal.example|B",uuids.B],
  ])
  connections=[]
  async connect(){
    const pool=this
    const c={
      inTx:false, role:"service_login", actor:"",
      released:false, queryCount:0,
      async query(statement,values=[]){
        this.queryCount++
        pool.sql.push({statement,values})
        const sql=statement.trim()
        if(sql==="BEGIN"){this.inTx=true;return {rows:[]}}
        if(sql==="COMMIT"){this.inTx=false;this.actor="";return {rows:[]}}
        if(sql==="ROLLBACK"){this.inTx=false;this.actor="";return {rows:[]}}
        if(sql==="SET LOCAL ROLE agentstudio_api"){
          assert.equal(this.inTx,true)
          this.role="agentstudio_api";return {rows:[]}
        }
        if(sql.startsWith("SELECT agentstudio.identity_user_id")){
          assert.equal(this.role,"agentstudio_api")
          return {rows:[{id:pool.identities.get(values.join("|"))||null}]}
        }
        if(sql.startsWith("SELECT set_config('agentstudio.actor_id'")){
          assert.equal(this.inTx,true)
          this.actor=values[0];return {rows:[{set_config:values[0]}]}
        }
        if(sql.startsWith("SELECT session_user AS username"))
          return {rows:[{username:"service_login",admin:false,bypass:false}]}
        if(sql.startsWith("SELECT current_user AS name"))
          return {rows:[{name:this.role}]}
        if(!this.inTx || !this.actor || this.role!=="agentstudio_api")
          throw new Error("missing_authenticated_rls_transaction")
        const mine=[...pool.rows.values()].filter(row=>row.owner_user_id===this.actor)
        if(sql.startsWith("SELECT") && sql.includes("LIMIT $2::int"))
          return {rows:mine.slice(0,values[1]).map(r=>({...r,revision:String(r.revision)}))}
        if(sql.startsWith("SELECT") && sql.includes("WHERE id=$1::uuid"))
          return {rows:mine.filter(row=>row.id===values[0]).map(r=>({...r,revision:String(r.revision)}))}
        if(sql.startsWith("INSERT INTO agentstudio.agent_specs")){
          const id=randomUUID()
          const row={id,owner_user_id:this.actor,name:values[1],
            spec:JSON.parse(values[2]),revision:1,created_at:"2026-01-01",updated_at:"2026-01-01"}
          pool.rows.set(id,row);return {rows:[{...row,revision:String(row.revision)}]}
        }
        if(sql.startsWith("UPDATE agentstudio.agent_specs")){
          const row=mine.find(r=>r.id===values[0] && r.revision===values[4])
          if(!row)return {rows:[]}
          row.name=values[2];row.spec=JSON.parse(values[3]);row.revision++
          return {rows:[{...row,revision:String(row.revision)}]}
        }
        throw new Error("unexpected_query:"+sql.slice(0,65))
      },
      release(){this.released=true;this.actor="";this.role="service_login"},
    }
    this.connections.push(c)
    return c
  }
}
const goodSpec={goal:"研究公开信息",tools:["summarize"],task_plan:["收集资料"],deliverables:["结论报告"]}

test("API pilot cannot be used without cryptographically verified identity and is fail-closed",async()=>{
  const pool=new FakePool()
  const repo=new AgentSpecRepository(pool)
  const handler=createHandler({
    repository:repo,
    allowedOrigin:"https://internal.example",
    async verifyToken(token){
      if(token==="signedA")return {issuer:"https://identity.internal.example",subject:"A"}
      if(token==="signedB")return {issuer:"https://identity.internal.example",subject:"B"}
      if(token==="unknownEmployee")return {issuer:"https://identity.internal.example",subject:"C"}
      throw new Error("jwt_bad_signature")
    },
  })
  const server=createServer(handler)
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  const base="http://127.0.0.1:"+server.address().port
  const call=async(method,path,token,body,headers={})=>{
    const res=await fetch(base+path,{method,
      headers:{"Accept":"application/json",
        ...(body===undefined?{}:{"Content-Type":"application/json"}),
        ...(token?{"Authorization":"Bearer "+token}:{}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(2000)})
    return {status:res.status,data:await res.json(),headers:res.headers}
  }
  try{
    const health=await call("GET","/healthz")
    assert.equal(health.status,200)
    assert.equal(health.data.scope,"isolated")
    assert.equal((await call("GET","/api/v2/agent-specs",null,undefined,
      {"X-Rh-User-Id":"B"})).status,401)
    assert.equal(pool.connections.length,0,"Unauthorized request must not touch DB")
    assert.equal((await call("GET","/api/v2/agent-specs","invalid")).status,401)
    assert.equal((await call("GET","/api/v2/agent-specs","unknownEmployee")).status,403)
    assert.equal((await call("GET","/api/v2/agent-specs","signedA",undefined,
      {Origin:"https://malicious.example"})).status,403)
    assert.equal((await call("GET","/api/v2/agent-specs?limit=1000","signedA")).status,400)
    const unsafe=await call("POST","/api/v2/agent-specs","signedA",
      {name:"bad",spec:{...goodSpec,api_key:"do_not_accept"}})
    assert.equal(unsafe.status,400)
    assert.equal(unsafe.data.error,"unsafe_agent_spec_field")
    const a=await call("POST","/api/v2/agent-specs","signedA",
      {name:"员工A的Agent",spec:goodSpec})
    assert.equal(a.status,201)
    assert.equal(a.data.item.owner_user_id,uuids.A)
    assert.equal(a.data.item.spec.require_approval,true)
    assert.deepEqual(a.data.item.spec.knowledge_base_ids,[])
    const b=await call("POST","/api/v2/agent-specs","signedB",
      {name:"员工B的Agent",spec:goodSpec})
    assert.equal(b.status,201)
    assert.equal(b.data.item.owner_user_id,uuids.B)

    // Identity header forgery is ignored even when a valid A token is present.
    const aList=await call("GET","/api/v2/agent-specs","signedA",undefined,
      {"X-Rh-User-Id":"B"})
    assert.equal(aList.status,200)
    assert.deepEqual(aList.data.items.map(row=>row.id),[a.data.item.id])
    assert.equal(aList.headers.get("access-control-allow-origin"),null)
    assert.equal(aList.headers.get("cache-control"),"no-store")
    assert.equal((await call("GET","/api/v2/agent-specs/"+b.data.item.id,"signedA")).status,404)
    assert.equal((await call("PATCH","/api/v2/agent-specs/"+b.data.item.id,"signedA",{
      name:"hijack",spec:goodSpec,expected_revision:1,
    })).status,404)

    const stale=await call("PATCH","/api/v2/agent-specs/"+a.data.item.id,"signedA",{
      name:"wrong revision",spec:goodSpec,expected_revision:42,
    })
    assert.equal(stale.status,409)
    const updated=await call("PATCH","/api/v2/agent-specs/"+a.data.item.id,"signedA",{
      name:"修改后",spec:goodSpec,expected_revision:1,
    })
    assert.equal(updated.status,200)
    assert.equal(updated.data.item.revision,2)
    assert.equal((await call("GET","/api/v2/agent-specs/"+a.data.item.id,"signedA")).data.item.name,"修改后")
    assert.equal((await call("POST","/api/v2/agent-specs/"+a.data.item.id,"signedA",{name:"bad"})).status,405)
    assert.ok(pool.connections.every(c=>c.released),"Every pooled connection must be released")
    assert.ok(pool.connections.every(c=>c.actor===""),"SET LOCAL actor must never leak into another request")
    assert.ok(pool.sql.some(q=>q.statement==="SET LOCAL ROLE agentstudio_api"))
    assert.ok(pool.sql.some(q=>q.statement.includes("identity_user_id($1::text,$2::text)")))
    assert.ok(pool.sql.every(q=>!q.statement.includes("员工A") && !q.statement.includes("员工B")),
      "SQL text must not interpolate user-provided content")
    assert.equal(pool.rows.size,2)
  }finally{await new Promise(resolve=>server.close(resolve))}
})

test("Postgres identity scoping rolls back and releases connection on unhandled errors",async()=>{
  const pool=new FakePool()
  await assert.rejects(
    withActor(pool,{issuer:"https://identity.internal.example",subject:"A"},async()=>{throw Error("abort")}),
    /abort/,
  )
  const c=pool.connections[0]
  assert.equal(c.released,true)
  assert.equal(c.actor,"")
  assert.ok(pool.sql.some(x=>x.statement==="ROLLBACK"))
})

test("Postgres startup rejects privileged database connection",async()=>{
  const pool=new FakePool()
  await verifyDatabaseRole(pool)
  const admin={
    async connect(){return {release(){},async query(sql){
      if(sql.startsWith("SELECT session_user"))return {rows:[{username:"agentstudio_admin",admin:true,bypass:true}]}
      return {rows:[]}
    }}},
  }
  await assert.rejects(verifyDatabaseRole(admin),/unsafe_database_role/)
})
