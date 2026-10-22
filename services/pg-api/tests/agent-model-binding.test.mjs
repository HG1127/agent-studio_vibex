// Isolated PGlite validation: user model selection never transfers secrets,
// trusts a forged owner, or queues the wrong staging Worker/provider.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {safeAgentSpec} from "../src/contracts.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {RunRepository} from "../src/run-repository.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(x=>!x.trim().startsWith("\\")).join("\n")
const issuer="https://owner-model-bind-test.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const base={goal:"Prepare an investment research brief",task_scope:"",
  deliverables:[],task_plan:[],done_criteria:[],tools:[],knowledge_base_ids:[]}
const example={name:"Synthetic OpenAI",provider:"openai",
  base_url:"https://api.openai.com/v1",
  api_key:"synthetic-test-key-never-reveal-98765",
  models:["gpt-4.1-mini"],enabled:true}

async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  for(const who of ["alice","bob"])await db.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES($1,$2)",[issuer,who])
  const pool={async connect(){return{
    query:(sql,args=[])=>db.query(sql,args),release(){}
  }}}
  return {db,models:new ModelConnectionRepository(pool,key),
    agents:new AgentSpecRepository(pool),runs:new RunRepository(pool),
    async close(){await db.close()}}
}
const binding=(row,model_id="gpt-4.1-mini")=>({
  connection_id:row.id,connection_revision:row.revision,model_id
})
test("model binding request accepts only 3 safe fields, never credentials",()=>{
  const id="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const current={connection_id:id,connection_revision:4,model_id:"gpt-4.1-mini"}
  assert.deepEqual(safeAgentSpec({...base,model_binding:current}).model_binding,current)
  assert.equal(safeAgentSpec({...base,model_binding:null}).model_binding,undefined)
  for(const invalid of [
    {...current,connection_id:"../etc"},
    {...current,connection_revision:0},
    {...current,model_id:"model\nName"},
    {...current,api_key:"spoofed"},
    {...current,owner_user_id:id},
    {...current,base_url:"https://evil.invalid"},
    {connection_id:id,model_id:"gpt-4.1-mini"},
    "fake",
    [],
  ])assert.throws(()=>safeAgentSpec({...base,model_binding:invalid}),
    error=>error.status===400&&error.code==="invalid_agent_model_binding")
  assert.throws(()=>safeAgentSpec({...base,api_key:"unsafe"}),
    error=>error.status===400&&error.code==="unsafe_agent_spec_field")
})

test("Postgres Agent owner binding checks credentials metadata only and blocks wrong execution",async()=>{
  const f=await fixture()
  try{
    const mine=await f.models.create(alice,example)
    const other=await f.models.create(bob,example)
    const untested=safeAgentSpec({...base,model_binding:binding(mine)})
    await assert.rejects(f.agents.create(alice,"Unprobed",untested),
      error=>error.status===409&&error.code==="model_connection_not_ready")
    const approved=await f.models.testConnection(alice,mine.id,1,
      async()=>({status:"ok",latency_ms:13,error_code:""}))
    const bobReady=await f.models.testConnection(bob,other.id,1,
      async()=>({status:"ok",latency_ms:12,error_code:""}))
    await assert.rejects(f.agents.create(alice,"Foreign",
      safeAgentSpec({...base,model_binding:binding(bobReady)})),
      error=>error.status===404&&error.code==="model_connection_not_found")
    await assert.rejects(f.agents.create(alice,"Old version",
      safeAgentSpec({...base,model_binding:binding(mine)})),
      error=>error.status===409&&error.code==="model_connection_revision_changed")
    await assert.rejects(f.agents.create(alice,"Wrong model",
      safeAgentSpec({...base,model_binding:binding(approved,"model-not-configured")})),
      error=>error.status===409&&error.code==="model_not_in_connection")
    const saved=await f.agents.create(alice,"Selected model",
      safeAgentSpec({...base,model_binding:binding(approved)}))
    assert.equal(saved.spec.model_binding.connection_id,approved.id)
    assert.equal(saved.spec.model_binding.model_id,"gpt-4.1-mini")
    assert.equal(saved.revision,1)
    assert.equal(JSON.stringify(saved).includes(example.api_key),false)
    assert.deepEqual((await f.agents.list(bob)).map(x=>x.id),[])
    await assert.rejects(f.runs.submit(alice,saved.id,
      {instruction:"Never call wrong model",idempotency_key:"binding-safety-01"}),
      error=>error.status===409&&error.code==="model_binding_runtime_not_enabled")
    const total=await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")
    assert.equal(total.rows[0].n,0)
    const unbound=await f.agents.update(alice,saved.id,"Unbound",
      safeAgentSpec({...base,model_binding:null}),saved.revision)
    assert.equal(unbound.revision,2)
    assert.equal(unbound.spec.model_binding,undefined)
    const queued=await f.runs.submit(alice,saved.id,
      {instruction:"Only old approved worker",idempotency_key:"binding-safety-02"})
    assert.equal(queued.run.status,"queued")
  }finally{await f.close()}
})

test("provider URL and enabled-status metadata deny new Agent bindings even after claimed probes",async()=>{
  const f=await fixture()
  try{
    const custom=await f.models.create(alice,{...example,
      base_url:"https://example.com/v1"})
    const falselyOk=await f.models.testConnection(alice,custom.id,1,
      async()=>({status:"ok",latency_ms:0,error_code:""}))
    await assert.rejects(f.agents.create(alice,"Custom URL",
      safeAgentSpec({...base,model_binding:binding(falselyOk)})),
      error=>error.status===409&&error.code==="model_provider_not_allowlisted")
    const disabled=await f.models.create(alice,{...example,enabled:false})
    const checked=await f.models.testConnection(alice,disabled.id,1,
      async()=>({status:"ok",latency_ms:0,error_code:""}))
    await assert.rejects(f.agents.create(alice,"Disabled",
      safeAgentSpec({...base,model_binding:binding(checked)})),
      error=>error.status===409&&error.code==="model_connection_not_ready")
  }finally{await f.close()}
})
