import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {ToolConnectionRepository,safeToolConnectionInput}
  from "../src/tool-connection-repository.ts"
import {decryptModelSecret} from "../src/model-connection-crypto.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://tool-connection-test.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const key=Buffer.from("0123456789abcdef".repeat(4),"hex")
const secretA="Bearer-THIS-IS-A-UNIQUE-SYNTHETIC-SECRET-0123456789"
const secretB="ROTATED-SYNTHETIC-SECRET-9876543210-NEVER-REAL"
const base={
  name:"CRM search",description:"Search an authorized CRM endpoint",
  url:"https://api.example.com/v1/search",method:"POST",headers:[],
  body_template:'{"query":"{{input}}"}',timeout_s:12,enabled:true,
}
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  for(const subject of ["alice","bob"])await db.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES($1,$2)",[issuer,subject])
  const pool={async connect(){return{
    query:(sql,args=[])=>db.query(sql,args),release(){}
  }}}
  return {db,repo:new ToolConnectionRepository(pool,key),
    async close(){await db.close()}}
}
async function values(db,id){
  const rows=(await db.query(
    "SELECT header_name,value_ciphertext,value_nonce,value_tag "+
    "FROM agentstudio.tool_connection_headers WHERE tool_connection_id=$1::uuid "+
    "ORDER BY header_name",[id])).rows
  return rows.map(row=>({
    key:row.header_name,
    value:JSON.parse(decryptModelSecret({
      ciphertext:Buffer.from(row.value_ciphertext),
      nonce:Buffer.from(row.value_nonce),tag:Buffer.from(row.value_tag),
    },key)).value,
    ciphertext:Buffer.from(row.value_ciphertext),
  }))
}
test("tool input rejects unsafe targets, invalid headers and unsupported request bodies",()=>{
  const valid={...base,headers:[{key:"Authorization",value:"Bearer safe-value"}]}
  assert.deepEqual(safeToolConnectionInput(valid).headers,
    [{key:"authorization",value:"Bearer safe-value"}])
  for(const url of [
    "http://api.example.com/v1","https://127.0.0.1/private",
    "https://localhost/private","https://service.internal/run",
    "https://api.example.com/v1?token=secret",
    "https://user:pass@api.example.com/v1",
    "https://api.example.com/v1#fragment",
  ])assert.throws(()=>safeToolConnectionInput({...base,url}))
  assert.throws(()=>safeToolConnectionInput({...base,
    headers:[{key:"Authorization",value:"one"},
      {key:"authorization",value:"two"}]}))
  assert.throws(()=>safeToolConnectionInput({...base,
    headers:[{key:"X-Auth",value:"ok\r\nInjected: yes"}]}))
  assert.throws(()=>safeToolConnectionInput({...base,method:"GET",body_template:"{}"}))
  assert.throws(()=>safeToolConnectionInput({...base,timeout_s:61}))
  assert.throws(()=>safeToolConnectionInput({...base,owner_user_id:"forged"}))
})
test("tool configuration encrypts header values and returns only masked key names",async()=>{
  const f=await fixture()
  try{
    const item=await f.repo.create(alice,{...base,headers:[
      {key:"Authorization",value:secretA},{key:"X-Trace",value:"short"},
    ]})
    assert.equal(item.status,"untested")
    assert.equal(item.revision,1)
    assert.deepEqual(item.headers,[
      {key:"authorization",value:"••••"},{key:"x-trace",value:"••••"},
    ])
    assert.equal(JSON.stringify(item).includes(secretA),false)
    const stored=await values(f.db,item.id)
    assert.deepEqual(stored.map(x=>[x.key,x.value]),[
      ["authorization",secretA],["x-trace","short"],
    ])
    for(const row of stored)
      assert.equal(row.ciphertext.includes(Buffer.from(secretA)),false)
    assert.equal((await f.repo.list(bob)).length,0)
    assert.equal(await f.repo.get(bob,item.id),null)
    assert.equal(await f.repo.update(bob,item.id,{...base,headers:[]},1),null)
    assert.equal(await f.repo.delete(bob,item.id),false)
    const privilege=(await f.db.query(
      "SELECT has_column_privilege('agentstudio_api',"+
      "'agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS api_read,"+
      "has_column_privilege('agentstudio_worker',"+
      "'agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS worker_read,"+
      "has_column_privilege('agentstudio_model_broker',"+
      "'agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS broker_read,"+
      "has_table_privilege('agentstudio_model_broker',"+
      "'agentstudio.tool_connection_headers','UPDATE') AS broker_write"
    )).rows[0]
    assert.deepEqual(privilege,{api_read:false,worker_read:false,
      broker_read:true,broker_write:false})
  }finally{await f.close()}
})
test("blank values preserve encrypted headers, nonblank values rotate, omitted rows remove secrets",async()=>{
  const f=await fixture()
  try{
    const created=await f.repo.create(alice,{...base,headers:[
      {key:"Authorization",value:secretA},{key:"X-Trace",value:"old-trace"},
    ]})
    const updated=await f.repo.update(alice,created.id,{...base,
      name:"CRM search updated",headers:[
        {key:"authorization",value:""},
        {key:"x-trace",value:secretB},
      ]},created.revision)
    assert.ok(updated)
    assert.equal(updated.revision,2)
    assert.deepEqual(updated.headers,[
      {key:"authorization",value:"••••"},{key:"x-trace",value:"••••"},
    ])
    assert.deepEqual((await values(f.db,created.id)).map(x=>[x.key,x.value]),[
      ["authorization",secretA],["x-trace",secretB],
    ])
    assert.equal(await f.repo.update(alice,created.id,{...base,headers:[]},1),null,
      "stale revision must not overwrite newer settings")
    const remove=await f.repo.update(alice,created.id,{...base,headers:[
      {key:"x-trace",value:""},
    ]},2)
    assert.ok(remove)
    assert.deepEqual(remove.headers,[{key:"x-trace",value:"••••"}])
    assert.deepEqual((await values(f.db,created.id)).map(x=>[x.key,x.value]),
      [["x-trace",secretB]])
    assert.equal(await f.repo.delete(alice,created.id),true)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.tool_connection_headers "+
      "WHERE tool_connection_id=$1::uuid",[created.id])).rows[0].n,0)
    const actions=(await f.db.query(
      "SELECT action FROM agentstudio.audit_events WHERE target_kind='tool_connection' "+
      "AND target_id=$1::text ORDER BY occurred_at",[created.id])).rows.map(x=>x.action)
    assert.deepEqual(actions,["tool.connection_create","tool.connection_update",
      "tool.connection_update","tool.connection_delete"])
  }finally{await f.close()}
})
test("Tool Connections expose CRUD only and never a test-call or execution route",()=>{
  const http=readFileSync(path.join(root,"services/pg-api/src/http.ts"),"utf8")
  assert.match(http,/toolConnectionsRoute/)
  assert.match(http,/execution_enabled:false/)
  const block=http.slice(http.indexOf("if(toolConnectionsRoute)"),http.indexOf("if(runRoute)"))
  assert.doesNotMatch(block,/probe|execute/i)
})
