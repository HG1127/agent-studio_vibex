import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {knowledgeIndexServiceConfig} from "../src/knowledge-index-service.ts"
import {boundCredentialDirectory,readBoundRuntimeCredential} from "../src/bound-runtime-credentials.ts"
const env={AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",AGENT_STUDIO_PG_PILOT_ENABLED:"true",
  AGENT_STUDIO_PG_HOST:"127.0.0.1",AGENT_STUDIO_PG_PORT:"5333",AGENT_STUDIO_PG_DATABASE:"agent_studio",AGENT_STUDIO_PG_USER:"agentstudio_stage_login",
  AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED:"true",AGENT_STUDIO_PG_KNOWLEDGE_INDEX_SERVER_FINGERPRINT:"11".repeat(32),AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT:"22".repeat(32)}
test("index service default/plan ignores ambient execution switches and performs no credential, listener or provider work",()=>{
  const script=fileURLToPath(new URL("../src/knowledge-index-service.ts",import.meta.url))
  for(const args of [[],["--plan"]]){
    const result=spawnSync(process.execPath,["--experimental-strip-types",script,...args],{encoding:"utf8",windowsHide:true,timeout:15000,
      env:{...process.env,AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT"}})
    assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout.trim())
    for(const key of ["credentials_read","network_used","provider_calls","workers_started","production_cutover_allowed"])assert.equal(plan[key],false)
    assert.equal(plan.broker_bind,"127.0.0.1");assert.equal(plan.broker_port,7455)
  }
})
test("index service serve needs independent runtime approval, exact Linux/non-root credentials and a fixed PG18 destination",()=>{
  for(const kind of ["worker","broker"]){
    const service=kind==="worker"?"knowledge-index":"knowledge-index-broker",ready={...env,CREDENTIALS_DIRECTORY:boundCredentialDirectory(service)}
    assert.equal(knowledgeIndexServiceConfig(ready,kind,"preflight","linux",1001).approved,false)
    assert.throws(()=>knowledgeIndexServiceConfig(ready,kind,"serve","linux",1001))
    const approved={...ready,AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT"}
    assert.equal(knowledgeIndexServiceConfig(approved,kind,"serve","linux",1001).port,7455)
    for(const patch of [{CREDENTIALS_DIRECTORY:"/tmp/unreviewed"},{DATABASE_URL:"postgresql://must-not-be-used"},{AGENT_STUDIO_PG_PORT:"5432"},
      {AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_EMBEDDING_CONSENT_NO_DISPATCH"}])assert.throws(()=>knowledgeIndexServiceConfig({...approved,...patch},kind,"serve","linux",1001))
    assert.throws(()=>knowledgeIndexServiceConfig(approved,kind,"serve","linux",0));assert.throws(()=>knowledgeIndexServiceConfig(approved,kind,"serve","win32",1001))
  }
  assert.throws(()=>readBoundRuntimeCredential("knowledge-index","model-encryption.secret",{},1001))
})

test("query-only service requires its own dispatch and sharing approvals independently of index execution",()=>{
  const query={...env,AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT",
    AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY"}
  for(const kind of ["worker","broker"]){
    const ready={...query,CREDENTIALS_DIRECTORY:boundCredentialDirectory(kind==="worker"?"knowledge-index":"knowledge-index-broker")}
    const selected=knowledgeIndexServiceConfig(ready,kind,"serve","linux",1001)
    assert.equal(selected.queryApproved,true);assert.equal(selected.approved,false)
    for(const patch of [{AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:"wrong"},{AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:undefined,AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:undefined}])
      assert.throws(()=>knowledgeIndexServiceConfig({...ready,...patch},kind,"serve","linux",1001))
  }
})
