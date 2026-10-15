import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {randomBytes} from "node:crypto"
import {
 inspectStandalone,inspectAttestation,report,parseArgs,readEnv,EVIDENCE_IDS,
} from "../ops/standalone-preflight.mjs"

const example=()=>{
 const data={
  AGENT_STUDIO_AUTH_MODE:"standalone",
  AGENT_STUDIO_ALLOW_ANON:"false",
  AGENT_STUDIO_STRICT_SECRETS:"true",
  AGENT_STUDIO_SECRET_KEY:randomBytes(24).toString("base64url"),
  AGENT_STUDIO_WORKER_TOKEN:randomBytes(45).toString("base64url"),
  AGENT_STUDIO_BACKGROUND_WORKER:"true",
  AGENT_STUDIO_WORKER_URL:"http://127.0.0.1:7000",
  AGENT_STUDIO_WORKER_INTERNAL_URL:"http://127.0.0.1:7000",
 }
 return data
}
test("standalone preflight fails closed until manually verified",()=>{
 const configured=example()
 assert.equal(inspectStandalone(configured).every(x=>x.status==="pass"),true)
 const pending=report(configured,null)
 assert.equal(pending.status,"NO_GO_UNVERIFIED")
 assert.equal(pending.counts.manual_pending,EVIDENCE_IDS.length)
 assert.equal(pending.production_deployed,false)
 const now=Date.now()
 const evidence={
  reviewer:"IT reviewer",reviewed_at:new Date(now).toISOString(),
  checks:Object.fromEntries(EVIDENCE_IDS.map(id=>[
   id,{passed:true,evidence:"Verified by approved internal change record "+id}
  ])),
 }
 const approved=report(configured,evidence,now)
 assert.equal(approved.status,"READY_FOR_OPERATOR_SIGNOFF")
 assert.equal(approved.production_deployed,false)
 const stale=report(configured,{...evidence,reviewed_at:new Date(now-9*86400000).toISOString()},now)
 assert.equal(stale.status,"NO_GO_UNVERIFIED")
 const forbidden={...configured,AGENT_STUDIO_AUTH_MODE:"legacy",AGENT_STUDIO_ALLOW_ANON:"true"}
 assert.equal(report(forbidden,evidence,now).status,"NO_GO_CONFIG")
 const activeBootstrap={...configured,AGENT_STUDIO_BOOTSTRAP_SECRET:"should-be-rotated"}
 assert.equal(report(activeBootstrap,evidence,now).status,"NO_GO_CONFIG")
 const unsafeEmbedding={...configured,AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true"}
 assert.equal(report(unsafeEmbedding,evidence,now).status,"NO_GO_CONFIG")
 const sharedSecret={...configured,AGENT_STUDIO_WORKER_TOKEN:configured.AGENT_STUDIO_SECRET_KEY}
 assert.equal(report(sharedSecret,evidence,now).status,"NO_GO_CONFIG")
 assert.throws(()=>parseArgs(["--json"]),/provide_explicit_env_file/)
})
test("preflight reads only explicit config and never prints key material",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-preflight-"))
 try {
  const content=example()
  const filename=path.join(dir,"studio.env")
  const evidenceFile=path.join(dir,"review.json")
  fs.writeFileSync(filename,Object.entries(content).map(([k,v])=>k+"="+v).join("\n"))
  fs.writeFileSync(evidenceFile,JSON.stringify({
   reviewer:"Reviewer",reviewed_at:new Date().toISOString(),
   checks:Object.fromEntries(EVIDENCE_IDS.map(id=>[
    id,{passed:true,evidence:"Internal ticket verifying "+id}
   ])),
  }))
  assert.deepEqual(readEnv(filename),content)
  const script=path.resolve("ops/standalone-preflight.mjs")
  const args=[script,"--env",filename,"--evidence",evidenceFile,"--json"]
  const first=spawnSync(process.execPath,args,{encoding:"utf8",timeout:14000})
  assert.equal(first.status,0,first.stderr)
  assert.equal(JSON.parse(first.stdout).status,"READY_FOR_OPERATOR_SIGNOFF")
  assert.doesNotMatch(first.stdout,RegExp(content.AGENT_STUDIO_WORKER_TOKEN))
  assert.doesNotMatch(first.stdout,RegExp(content.AGENT_STUDIO_SECRET_KEY))
  const missing=spawnSync(process.execPath,[script,"--env",filename,"--json"],
    {encoding:"utf8",timeout:14000})
  assert.equal(missing.status,1)
  assert.equal(JSON.parse(missing.stdout).status,"NO_GO_UNVERIFIED")
  assert.equal(fs.statSync(filename).size>0,true)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
