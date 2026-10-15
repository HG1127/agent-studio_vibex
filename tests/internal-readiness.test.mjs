import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { createVerifiedBackup } from "../ops/sqlite-backup.mjs"
import { assess,inspectConfig,inspectEvidence } from "../ops/internal-readiness.mjs"
import { parseOrigin,verifyGateway } from "../ops/verify-gateway.mjs"

const good={
  AGENT_STUDIO_ALLOW_ANON:"false",
  AGENT_STUDIO_STRICT_SECRETS:"true",
  AGENT_STUDIO_SECRET_KEY:"aB3dE5fG7hJ9kL1mN2pQ4rS6tU8vW0xY",
  AGENT_STUDIO_BACKGROUND_WORKER:"true",
  AGENT_STUDIO_WORKER_TOKEN:"B7qd2Nf9kPz5Qw8Rk3Nt6Yx4Ae0Vo1Mu9Ls5Hw2Cf8Dp6Kr3",
  AGENT_STUDIO_WORKER_INTERNAL_URL:"http://127.0.0.1:7000",
  AGENT_STUDIO_WORKER_URL:"http://127.0.0.1:7000",
  AGENT_STUDIO_WORKER_ALLOW_INSECURE_HTTP:"false",
  AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER:"true",
  AGENT_STUDIO_INTERNAL_SHARE_USERS:"empA,empB",
  VIBEX_APP_ID:"app-21b2bf592c904e939083806fa411cac9",
}
const statuses=checks=>Object.fromEntries(checks.map(x=>[x.id,x.status]))
test("readiness always reports manual environment gaps, never falsely claims deployed",async()=>{
  const c=inspectConfig(good)
  assert.ok(c.every(x=>x.status==="pass"),JSON.stringify(c))
  const x=await assess(good)
  assert.equal(x.production_deployed,false)
  assert.equal(x.scope,"offline_no_network")
  assert.equal(x.decision,"NO_GO_UNVERIFIED")
  assert.equal(x.counts.pending_manual,10)
  assert.equal(x.checks.find(y=>y.id==="trusted_gateway").status,"manual")
})
test("identity, worker and secret misconfigurations fail closed without disclosing secret",async()=>{
  const env={...good,AGENT_STUDIO_ALLOW_ANON:"true",
    AGENT_STUDIO_STRICT_SECRETS:"false",AGENT_STUDIO_WORKER_URL:"http://public.example:7000",
    AGENT_STUDIO_WORKER_ALLOW_INSECURE_HTTP:"true",
    AGENT_STUDIO_INTERNAL_SHARE_USERS:"local-anon,empB"}
  const res=await assess(env)
  assert.equal(res.decision,"NO_GO_CONFIG")
  const map=statuses(res.checks)
  for(const id of ["anonymous_disabled","secrets_strict","worker_client_transport",
    "remote_http_forbidden","internal_share_whitelist"])assert.equal(map[id],"fail")
  assert.doesNotMatch(JSON.stringify(res),new RegExp(good.AGENT_STUDIO_SECRET_KEY))
  assert.doesNotMatch(JSON.stringify(res),new RegExp(good.AGENT_STUDIO_WORKER_TOKEN))
  const placeholder=inspectConfig({...good,AGENT_STUDIO_SECRET_KEY:"a".repeat(32)})
  assert.equal(statuses(placeholder).aes_key_32_bytes,"fail")
})
test("operator evidence remains attestation, with mandatory date, reviewer, and backing snapshot",async()=>{
  const keys=["trusted_gateway","pocketbase_private","worker_24h","backup_restore",
    "real_model","outbound_filter","source_published","two_employee_acceptance",
    "incident_owner_and_rollback"]
  const now=Date.now()
  const evidence={reviewer:"QA supervisor",reviewed_at:new Date(now).toISOString(),
    checks:Object.fromEntries(keys.map(id=>[id,{passed:true,evidence:"Verification log: "+id}]))}
  assert.equal(inspectEvidence(evidence,now).filter(x=>x.status==="attested").length,9)
  const noSnap=await assess(good,{evidence:undefined})
  assert.equal(noSnap.decision,"NO_GO_UNVERIFIED")
  evidence.reviewed_at=new Date(now-10*86400000).toISOString()
  assert.equal(inspectEvidence(evidence,now).filter(x=>x.status==="attested").length,0)
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-internal-ready-"))
  const original=path.join(dir,"sqlite.db"),bak=path.join(dir,"snapshot","sqlite.db")
  const db=new DatabaseSync(original)
  db.exec("CREATE TABLE agent_studio_schema_migrations(id TEXT PRIMARY KEY,applied_ms INTEGER,description TEXT)")
  db.exec("INSERT INTO agent_studio_schema_migrations VALUES('a',1,'test')")
  db.close()
  try{
    await createVerifiedBackup(original,bak)
    const verified=await assess(good,{backup:bak})
    assert.equal(verified.checks.find(x=>x.id==="verified_sqlite_snapshot").status,"pass")
    assert.equal(verified.decision,"NO_GO_UNVERIFIED","backup alone never equals production readiness")
    evidence.reviewed_at=new Date(now).toISOString()
    const evidencePath=path.join(dir,"review.json")
    fs.writeFileSync(evidencePath,JSON.stringify(evidence))
    const ready=await assess(good,{backup:bak,evidence:evidencePath,now})
    assert.equal(ready.decision,"READY_FOR_OPERATOR_SIGNOFF")
    assert.equal(ready.production_deployed,false,"An attested checklist cannot assert actual deployment")

  }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
})
test("gateway probe rejects unsafe target URLs and requires explicit loopback option",()=>{
  assert.throws(()=>parseOrigin("http://example.com"),/gateway_probe_requires_https/)
  assert.throws(()=>parseOrigin("http://127.0.0.1:7000"),/gateway_probe_requires_https/)
  assert.throws(()=>parseOrigin("https://alice:secret@example.com/"),/gateway_origin/)
  assert.throws(()=>parseOrigin("https://example.com/path"),/gateway_origin/)
  assert.equal(parseOrigin("http://127.0.0.1:7000/",true),"http://127.0.0.1:7000")
})
test("read-only gateway probe detects identity spoof acceptance and properly denies forged identities",async()=>{
  let allowSpoof=false,calls=0
  const server=createServer((req,res)=>{
    calls++
    assert.equal(req.method,"GET")
    assert.ok(req.url.startsWith("/api/agent_specs?perPage=1"))
    const forged=Boolean(req.headers["x-rh-user-id"])
    const status=allowSpoof && forged?200:401
    res.writeHead(status,{"Content-Type":"application/json"})
    res.end("{}")
  })
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  const origin="http://127.0.0.1:"+server.address().port
  try{
    const good=await verifyGateway(origin,{allowLoopback:true})
    assert.equal(good.result,"PASS")
    assert.deepEqual(good.checks.map(x=>x.status),[401,401])
    allowSpoof=true
    const unsafe=await verifyGateway(origin,{allowLoopback:true})
    assert.equal(unsafe.result,"FAIL")
    assert.deepEqual(unsafe.checks.map(x=>x.status),[401,200])
    assert.equal(calls,4)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
