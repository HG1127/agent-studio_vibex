import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {
  pg18CredentialMetadataAccepted,assertPg18CredentialMetadata,
  expectedPg18CredentialFile,
} from "../src/worker-credential-policy.ts"

function input(kind="prepare"){
  const file=expectedPg18CredentialFile(kind)
  return {kind,file,uid:61111,canRead:true,
    env:{AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
      CREDENTIALS_DIRECTORY:path.posix.dirname(file),
      AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:file},
    stat:{isFile:()=>true,isSymbolicLink:()=>false,
      mode:0o100440,uid:0,gid:0,size:96}}
}
function accepts(p){return pg18CredentialMetadataAccepted(p)}
test("systemd nonroot root:root 0440 ACL-readable credential accepted only at exact Prepare/Model paths",()=>{
  for(const kind of ["prepare","model"]){
    const p=input(kind)
    assert.equal(accepts(p),true)
    assert.doesNotThrow(()=>assertPg18CredentialMetadata(p))
  }
})
test("ordinary private 0600 or 0400 accepted only for exact dynamic user",()=>{
  for(const mode of [0o600,0o400]){
    const p=input();p.stat={...p.stat,mode,uid:p.uid,gid:p.uid}
    assert.equal(accepts(p),true)
  }
  const p=input();p.stat={...p.stat,mode:0o600,uid:0,gid:0}
  assert.equal(accepts(p),false)
})
test("ACL exception rejects every mode other than exact root:root 0440",()=>{
  for(const mode of [0o440,0o444,0o640,0o460,0o660,0o400,0o604,0o777,0o7777,0o450,0o540,0o4440]){
    const p=input();p.stat={...p.stat,mode}
    assert.equal(accepts(p),mode===0o440,"mode="+mode.toString(8))
  }
  for(const [uid,gid,canRead] of [
    [61111,0,true],[0,61111,true],[7,7,true],[0,0,false]
  ]){
    const p=input();p.stat={...p.stat,uid,gid};p.canRead=canRead
    assert.equal(accepts(p),false,
      "uid="+uid+" gid="+gid+" read="+canRead)
  }
})
test("strict systemd path, active PG18 flag and credential-directory binding required",()=>{
  const p=input()
  const variants=[
    {...p,file:"/tmp/worker.secret"},
    {...p,file:"%d/worker.secret"},
    {...p,env:{...p.env,CREDENTIALS_DIRECTORY:"/run/credentials/agentstudio-pg18-model.service"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:"%d/worker.secret"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/worker.secret"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_BAOTA18_ENABLED:"false"}},
    {...p,env:{...p.env,AGENT_STUDIO_PG_BAOTA18_ENABLED:undefined}},
    {...p,kind:"model"},
    {...p,kind:"unknown"},
  ]
  for(const v of variants){
    assert.equal(accepts(v),false,JSON.stringify(v.env))
    assert.throws(()=>assertPg18CredentialMetadata(v),/unsafe_worker_secret/)
  }
})
test("nonroot UID and regular nonsymlink valid-size metadata enforced",()=>{
  const p=input()
  const variants=[
    {...p,uid:0},{...p,uid:undefined},{...p,uid:-1},
    {...p,stat:{...p.stat,isFile:()=>false}},
    {...p,stat:{...p.stat,isSymbolicLink:()=>true}},
    {...p,stat:{...p.stat,size:31}},
    {...p,stat:{...p.stat,size:4097}},
    {...p,stat:{...p.stat,size:NaN}},
    {...p,stat:{...p.stat,uid:NaN}},
    {...p,stat:{...p.stat,gid:NaN}},
  ]
  for(const v of variants)assert.equal(accepts(v),false)
})
test("both Worker loops use same narrow policy, independent stage probe uses no task engine",()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
  for(const name of ["worker-loop.ts","model-worker-loop.ts"]){
    const text=fs.readFileSync(path.join(root,"src",name),"utf8")
    assert.match(text,/assertPg18CredentialMetadata/)
    assert.match(text,/accessSync\(file,constants\.R_OK\)/)
    assert.match(text,/target\.mode==="baota_pg18"/)
    assert.match(text,/if\(preflight\)/)
    assert.match(text,/if\(!preflight\)assertPgWorkerActivation/)
  }
  const probe=fs.readFileSync(path.join(root,"src","pg18-prepare-acl-stage-probe.ts"),"utf8")
  assert.match(probe,/assertPg18CredentialMetadata/)
  assert.match(probe,/verifyPgWorkerRoleBoundary/)
  assert.doesNotMatch(probe,/AgentPrepareWorker|AgentModelWorker|createStagingOpenAIProvider/)
  assert.doesNotMatch(probe,/--serve|\.tick\(|claimJob/)
})
