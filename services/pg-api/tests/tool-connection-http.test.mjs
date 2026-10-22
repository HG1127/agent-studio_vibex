// Synthetic local-only PG Tool Connections HTTP CRUD contract.
// No PocketBase, external endpoint, real credential, or Worker execution.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {createHandler} from "../src/http.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://tool-http-synthetic.invalid"
const key=Buffer.from("0123456789abcdef".repeat(4),"hex")
const fakeHeader="Bearer-SYNTHETIC-TEST-VALUE-NEVER-RETURN-12345"
const base={
  name:"CRM query",description:"Read synthetic CRM test evidence",
  url:"https://api.example.com/v2/contacts",method:"POST",
  headers:[{key:"Authorization",value:fakeHeader}],
  body_template:"{\"query\":\"{{input}}\"}",timeout_s:10,enabled:true
}
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(schema)
  const owners={}
  for(const subject of ["alice","bob"]){
    owners[subject]=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  }
  const pool={async connect(){return {
    query:(sql,args=[])=>pg.query(sql,args),release(){}
  }}}
  const repo=new ToolConnectionRepository(pool,key)
  const auth=new Map(["alice","bob"].map(subject=>[
    subject,{issuer,subject}]))
  const server=createServer(createHandler({
    repository:{},toolConnectionRepository:repo,
    verifyToken:async token=>{
      const owner=auth.get(token)
      if(!owner)throw Error("missing_test_identity")
      return owner
    },
    allowedOrigin:"https://isolated-studio.invalid"
  }))
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  const url="http://127.0.0.1:"+server.address().port
  async function call(token,method,pathname,body,origin="https://isolated-studio.invalid"){
    const res=await fetch(url+pathname,{
      method,
      headers:{
        ...(token?{Authorization:"Bearer "+token}:{}),
        Origin:origin,
        ...(body===undefined?{}:{"Content-Type":"application/json"})
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(10000)
    })
    return {status:res.status,data:await res.json()}
  }
  return {pg,owners,call,async close(){
    await new Promise(resolve=>server.close(resolve))
    await pg.close()
  }}
}
test("owner-only HTTP tool CRUD masks secrets, fences stale versions and never calls configured URL",async()=>{
  const f=await fixture()
  try{
    const url="/api/v2/tool-connections"
    const denied=await f.call(null,"GET",url)
    assert.equal(denied.status,401)
    assert.equal((await f.call("alice","GET",url,undefined,
      "https://untrusted.invalid")).status,403)
    assert.deepEqual((await f.call("alice","GET",url)).data.items,[])
    const forged=await f.call("alice","POST",url,{
      ...base,owner_user_id:f.owners.bob
    })
    assert.equal(forged.status,400)
    assert.equal(forged.data.error,"unknown_request_field")
    const created=await f.call("alice","POST",url,base)
    assert.equal(created.status,201,JSON.stringify(created.data))
    assert.equal(created.data.execution_enabled,false)
    const item=created.data.item
    assert.equal(item.owner_user_id,f.owners.alice)
    assert.equal(item.revision,1)
    assert.deepEqual(item.headers,[{key:"authorization",value:"••••"}])
    assert.equal(JSON.stringify(item).includes(fakeHeader),false)
    const child=(await f.pg.query(
      "SELECT value_ciphertext FROM agentstudio.tool_connection_headers "+
      "WHERE tool_connection_id=$1::uuid",[item.id])).rows
    assert.equal(child.length,1)
    assert.equal(Buffer.from(child[0].value_ciphertext).includes(Buffer.from(fakeHeader)),false)
    assert.deepEqual((await f.call("bob","GET",url)).data.items,[])
    assert.equal((await f.call("bob","GET",url+"/"+item.id)).status,404)
    assert.equal((await f.call("bob","PATCH",url+"/"+item.id,{
      ...base,expected_revision:1
    })).status,404)
    assert.equal((await f.call("bob","DELETE",url+"/"+item.id)).status,404)
    const updated=await f.call("alice","PATCH",url+"/"+item.id,{
      ...base,name:"Edited CRM connection",
      headers:[{key:"authorization",value:""}],expected_revision:1
    })
    assert.equal(updated.status,200,JSON.stringify(updated.data))
    assert.equal(updated.data.item.revision,2)
    assert.equal(updated.data.item.headers[0].value,"••••")
    assert.equal((await f.call("alice","PATCH",url+"/"+item.id,{
      ...base,expected_revision:1
    })).status,409)
    const current=await f.call("alice","GET",url+"/"+item.id)
    assert.equal(current.status,200)
    assert.equal(current.data.item.name,"Edited CRM connection")
    for(const endpoint of [url+"/"+item.id+"/probe",
      url+"/"+item.id+"/execute",url+"/"+item.id+"/test"]){
      assert.equal((await f.call("alice","POST",endpoint,{})).status,404)
    }
    const removed=await f.call("alice","DELETE",url+"/"+item.id)
    assert.equal(removed.status,200)
    assert.equal(removed.data.execution_enabled,false)
    assert.equal((await f.call("alice","GET",url+"/"+item.id)).status,404)
    assert.equal((await f.pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.tool_connection_headers "+
      "WHERE tool_connection_id=$1::uuid",[item.id]
    )).rows[0].n,0)
    const audit=(await f.pg.query(
      "SELECT action FROM agentstudio.audit_events "+
      "WHERE target_id=$1::text ORDER BY occurred_at",[item.id]
    )).rows.map(r=>r.action)
    assert.deepEqual(audit,[
      "tool.connection_create","tool.connection_update","tool.connection_delete"
    ])
  }finally{await f.close()}
})
test("HTTP rejects unknown owners, fields and credential-bearing URLs before any tool write",async()=>{
  const f=await fixture()
  try{
    const url="/api/v2/tool-connections"
    for(const data of [
      {...base,url:"http://api.example.com"},
      {...base,url:"https://user:secret@api.example.com/v1"},
      {...base,headers:[{key:"Authorization\r\nX-Inject",value:"wrong"}]},
      {...base,rh_user_id:f.owners.bob},
      {...base,expected_revision:1}
    ]){
      const reply=await f.call("alice","POST",url,data)
      assert.equal(reply.status,400,JSON.stringify(reply))
    }
    assert.equal((await f.call("anonymous","GET",url)).status,401)
    assert.equal((await f.pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.tool_connections"
    )).rows[0].n,0)
  }finally{await f.close()}
})
