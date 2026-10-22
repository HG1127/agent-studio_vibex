// Isolated PostgreSQL model-connection CRUD, RLS and envelope encryption.
// No live provider calls, PocketBase, production DB or external network.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {ModelConnectionRepository,safeModelConnectionInput} from "../src/model-connection-repository.ts"
import {decryptModelSecret} from "../src/model-connection-crypto.ts"
import {createHandler} from "../src/http.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://model-connection-test.invalid"
const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const secret="synthetic-model-key-never-return-this-42"

async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(schema)
  const users={}
  for(const subject of ["alice","bob"]){
    users[subject]=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  }
  const pool={async connect(){return{
    query:(statement,params=[])=>pg.query(statement,params),
    release(){}
  }}}
  const repo=new ModelConnectionRepository(pool,key)
  const identities={alice:{issuer,subject:"alice"},bob:{issuer,subject:"bob"}}
  const tokens=new Map([["alice",identities.alice],["bob",identities.bob]])
  let server
  return {
    pg,pool,repo,users,
    async start(){
      server=createServer(createHandler({
        repository:{},modelConnectionRepository:repo,
        verifyToken:async token=>{
          const identity=tokens.get(token)
          if(!identity)throw Error("invalid_test_token")
          return identity
        },
        allowedOrigin:"https://studio.test.invalid",
      }))
      await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
      return "http://127.0.0.1:"+server.address().port
    },
    async close(){if(server)await new Promise(resolve=>server.close(resolve));await pg.close()}
  }
}
const valid={
  name:"Primary OpenAI",provider:"openai",base_url:"https://api.openai.com/v1",
  api_key:secret,models:["gpt-4o","gpt-4.1"],enabled:true
}

test("model connection validation rejects plaintext HTTP, local targets and credential-bearing URLs",()=>{
  assert.equal(safeModelConnectionInput(valid,true).provider,"openai")
  for(const base_url of [
    "http://api.openai.com/v1","https://localhost/v1",
    "https://127.0.0.1/v1","https://10.0.0.8/v1",
    "https://gateway.local/v1","https://gateway.internal/v1",
    "https://user:pass@api.openai.com/v1",
    "https://api.openai.com/v1?token=secret",
    "https://api.openai.com/v1#fragment",
  ])assert.throws(()=>safeModelConnectionInput({...valid,base_url},true),/invalid_model_connection/)
  assert.throws(()=>safeModelConnectionInput({...valid,api_key:""},true),/model_api_key_required/)
  assert.throws(()=>safeModelConnectionInput({...valid,owner_user_id:"alice"},true),/invalid_model_connection/)
  assert.throws(()=>safeModelConnectionInput({...valid,models:Array(301).fill("x")},true),/invalid_model_connection/)
})

test("internal model execution material is owner/revision/model scoped and official-endpoint only",async()=>{
  const f=await fixture()
  const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
  try{
    const connection=await f.repo.create(alice,
      safeModelConnectionInput(valid,true))
    const binding={connection_id:connection.id,
      connection_revision:connection.revision,model_id:"gpt-4o"}
    const material=await f.repo.resolveExecutionMaterial(
      alice,f.users.alice,binding)
    assert.deepEqual({
      owner_user_id:material.owner_user_id,
      connection_id:material.connection_id,
      connection_revision:material.connection_revision,
      provider:material.provider,base_url:material.base_url,
      model_id:material.model_id,api_key:material.api_key,
    },{
      owner_user_id:f.users.alice,connection_id:connection.id,
      connection_revision:1,provider:"openai",
      base_url:"https://api.openai.com/v1",model_id:"gpt-4o",api_key:secret,
    })
    const lockedActor={
      async query(sql,args=[]){
        if(sql.includes("agentstudio.actor_id()"))
          return {rows:[{actor_id:f.users.alice}]}
        return f.pg.query(sql,args)
      }
    }
    const locked=await f.repo.resolveExecutionMaterial(
      alice,f.users.alice,binding,lockedActor)
    assert.equal(locked.api_key,secret)
    await assert.rejects(f.repo.resolveExecutionMaterial(
      bob,f.users.alice,binding),e=>e.status===403&&
        e.code==="model_connection_owner_mismatch")
    await assert.rejects(f.repo.resolveExecutionMaterial(
      alice,f.users.alice,{...binding,connection_revision:2}),
      e=>e.status===409&&e.code==="model_connection_revision_changed")
    await assert.rejects(f.repo.resolveExecutionMaterial(
      alice,f.users.alice,{...binding,model_id:"not-authorized"}),
      e=>e.status===409&&e.code==="model_not_allowed_by_connection")
    const disabled=await f.repo.create(alice,safeModelConnectionInput({
      ...valid,name:"Disabled connection",enabled:false,
    },true))
    await assert.rejects(f.repo.resolveExecutionMaterial(
      alice,f.users.alice,{connection_id:disabled.id,
        connection_revision:disabled.revision,model_id:"gpt-4o"}),
      e=>e.status===409&&e.code==="model_connection_disabled")
    const custom=await f.repo.create(alice,safeModelConnectionInput({
      ...valid,name:"Custom URL must fail closed",
      base_url:"https://api.example.com/v1",
    },true))
    await assert.rejects(f.repo.resolveExecutionMaterial(
      alice,f.users.alice,{connection_id:custom.id,
        connection_revision:custom.revision,model_id:"gpt-4o"}),
      e=>e.status===409&&e.code==="model_provider_endpoint_not_allowlisted")
    const publicItem=await f.repo.get(alice,connection.id)
    assert.equal("api_key" in publicItem,false)
    assert.equal(JSON.stringify(publicItem).includes(secret),false)
    const privileges=(await f.pg.query(
      "SELECT has_column_privilege('agentstudio_api',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS api_read,"+
      "has_column_privilege('agentstudio_worker',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS worker_read"
    )).rows[0]
    assert.deepEqual(privileges,{api_read:false,worker_read:false})
  }finally{await f.close()}
})

test("model connection API encrypts secrets, masks output, enforces owner RLS and revision checks",async()=>{
  const f=await fixture()
  try{
    const origin=await f.start()
    const call=async(token,method,url,body)=>{
      const response=await fetch(origin+url,{
        method,
        headers:{
          Accept:"application/json",
          ...(token?{Authorization:"Bearer "+token}:{}),
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(5000),
      })
      return {status:response.status,data:await response.json()}
    }
    const base="/api/v2/model-connections"
    assert.equal((await call(null,"GET",base)).status,401)
    assert.deepEqual((await call("alice","GET",base)).data.items,[])
    const bad=await call("alice","POST",base,{...valid,owner_user_id:f.users.bob})
    assert.equal(bad.status,400)
    assert.equal(bad.data.error,"unknown_request_field")

    const created=await call("alice","POST",base,valid)
    assert.equal(created.status,201,JSON.stringify(created.data))
    const item=created.data.item
    assert.equal(item.owner_user_id,f.users.alice)
    assert.equal(item.api_key_tail,secret.slice(-4))
    assert.equal(item.revision,1)
    assert.equal(item.status,"untested")
    assert.equal("api_key" in item,false)
    assert.equal("api_key_ciphertext" in item,false)
    assert.equal(JSON.stringify(item).includes(secret),false)

    const raw=(await f.pg.query(
      "SELECT api_key_ciphertext,api_key_nonce,api_key_tag "+
      "FROM agentstudio.model_connections WHERE id=$1::uuid",[item.id])).rows[0]
    const ciphertext=Buffer.from(raw.api_key_ciphertext)
    assert.ok(ciphertext.length>0)
    assert.notEqual(ciphertext.toString("utf8"),secret)
    assert.equal(decryptModelSecret({
      ciphertext:Buffer.from(raw.api_key_ciphertext),
      nonce:Buffer.from(raw.api_key_nonce),tag:Buffer.from(raw.api_key_tag)
    },Buffer.from(key,"hex")),secret)
    assert.equal(await f.repo.secretForExecution({issuer,subject:"alice"},item.id),secret)

    assert.deepEqual((await call("bob","GET",base)).data.items,[])
    assert.equal((await call("bob","GET",base+"/"+item.id)).status,404)
    assert.equal(await f.repo.delete({issuer,subject:"bob"},item.id),false)

    const changed=await call("alice","PATCH",base+"/"+item.id,{
      name:"Renamed connection",provider:"openai",base_url:valid.base_url,
      models:["gpt-4.1"],enabled:false,expected_revision:1,
    })
    assert.equal(changed.status,200,JSON.stringify(changed.data))
    assert.equal(changed.data.item.revision,2)
    assert.equal(changed.data.item.enabled,false)
    assert.deepEqual(changed.data.item.models,["gpt-4.1"])
    assert.equal(changed.data.item.api_key_tail,secret.slice(-4))
    assert.equal(await f.repo.secretForExecution({issuer,subject:"alice"},item.id),null)
    const reenabled=await call("alice","PATCH",base+"/"+item.id,{
      name:"Renamed connection",provider:"openai",base_url:valid.base_url,
      models:["gpt-4.1"],enabled:true,expected_revision:2,
    })
    assert.equal(reenabled.status,200,JSON.stringify(reenabled.data))
    assert.equal(reenabled.data.item.revision,3)
    assert.equal(await f.repo.secretForExecution({issuer,subject:"alice"},item.id),secret)

    // Direct repository updates with an explicitly empty API Key must
    // preserve the previous encrypted envelope and nonempty masked tail.
    const noKey=await f.repo.update({issuer,subject:"alice"},item.id,{
      name:"Renamed connection",provider:"openai",base_url:valid.base_url,
      api_key:"",models:["gpt-4.1"],enabled:true,
    },3)
    assert.equal(noKey.revision,4)
    assert.equal(noKey.api_key_tail,secret.slice(-4))
    assert.equal(await f.repo.secretForExecution({issuer,subject:"alice"},item.id),secret)

    const conflict=await call("alice","PATCH",base+"/"+item.id,{
      name:"Stale edit",provider:"openai",base_url:valid.base_url,
      models:[],enabled:true,expected_revision:1,
    })
    assert.equal(conflict.status,409)
    assert.equal((await call("alice","DELETE",base+"/"+item.id)).status,200)
    assert.equal((await call("alice","GET",base+"/"+item.id)).status,404)
  }finally{await f.close()}
})

test("provider probe metadata is owner-scoped, cooldown-limited, and revision fenced",async()=>{
  const f=await fixture()
  const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
  try{
    const created=await f.repo.create(alice,valid)
    let calls=0
    const stub=async material=>{
      calls++
      assert.equal(material.api_key,secret)
      assert.equal(material.base_url,valid.base_url)
      return {status:"ok",latency_ms:17,error_code:""}
    }
    await assert.rejects(f.repo.testConnection(bob,created.id,1,stub),
      error=>error.status===404&&error.code==="model_connection_not_found")
    assert.equal(calls,0)
    await assert.rejects(f.repo.testConnection(alice,created.id,2,stub),
      error=>error.status===409&&error.code==="revision_conflict")
    const first=await f.repo.testConnection(alice,created.id,1,stub)
    assert.equal(calls,1)
    assert.equal(first.status,"ok")
    assert.equal(first.revision,2)
    assert.equal(first.last_error,"")
    assert.equal(first.last_latency_ms,17)
    assert.ok(first.last_checked_at)
    assert.equal(JSON.stringify(first).includes(secret),false)
    const audit=(await f.pg.query(
      "SELECT result,metadata FROM agentstudio.audit_events "+
      "WHERE target_kind='model_connection' AND target_id=$1",[created.id])).rows
    assert.equal(audit.length,1)
    assert.equal(audit[0].result,"succeeded")
    assert.equal(audit[0].metadata.latency_ms,17)
    assert.equal(JSON.stringify(audit).includes(secret),false)
    await assert.rejects(f.repo.testConnection(alice,created.id,2,stub),
      error=>error.status===429&&error.code==="provider_probe_rate_limited")
    const changed=await f.repo.update(alice,created.id,
      safeModelConnectionInput({...valid,name:"Changed while testing"},true),2)
    assert.equal(changed.revision,3)
    let complete
    const pending=f.repo.testConnection(alice,created.id,3,
      async()=>new Promise(resolve=>{complete=resolve}))
    for(let i=0;i<100&&!complete;i++)
      await new Promise(resolve=>setImmediate(resolve))
    assert.equal(typeof complete,"function")
    await assert.rejects(f.repo.testConnection(alice,created.id,3,stub),
      error=>error.status===429&&error.code==="provider_probe_rate_limited")
    assert.equal(calls,1)
    const changedAgain=await f.repo.update(alice,created.id,
      safeModelConnectionInput({...valid,name:"Latest version"},true),3)
    assert.equal(changedAgain.revision,4)
    complete({status:"ok",latency_ms:11,error_code:""})
    await assert.rejects(pending,
      error=>error.status===409&&error.code==="revision_conflict")
    const unchanged=await f.repo.get(alice,created.id)
    assert.equal(unchanged.status,"untested")
    assert.equal(unchanged.revision,4)
    await f.repo.update(alice,created.id,
      safeModelConnectionInput({...valid,enabled:false},true),4)
    const failed=await f.repo.testConnection(alice,created.id,5,
      async()=>({status:"error",latency_ms:8,
        error_code:"provider_credential_rejected"}))
    assert.equal(failed.enabled,false)
    assert.equal(failed.status,"error")
    assert.equal(failed.last_error,"provider_credential_rejected")
    assert.equal(failed.revision,6)
    const history=(await f.pg.query(
      "SELECT result,metadata FROM agentstudio.audit_events "+
      "WHERE target_kind='model_connection' AND target_id=$1 "+
      "ORDER BY occurred_at",[created.id])).rows
    assert.equal(history.length,2)
    assert.equal(history.filter(x=>x.result==="failed").length,1)
    assert.equal(JSON.stringify(history).includes(secret),false)
    assert.equal(await f.repo.secretForExecution(alice,created.id),null)
  }finally{await f.close()}
})

test("AES-256-GCM envelope rejects tampering and malformed keys",()=>{
  assert.throws(()=>new ModelConnectionRepository({connect:async()=>({query:async()=>({rows:[]}),release(){}})}, "not-a-key"),/invalid_model_encryption_key/)
  const encrypted={
    ciphertext:Buffer.from("ciphertext"),
    nonce:Buffer.alloc(12,1),
    tag:Buffer.alloc(16,2),
  }
  assert.throws(()=>decryptModelSecret(encrypted,Buffer.alloc(32)),/model_secret_authentication_failed/)
})
