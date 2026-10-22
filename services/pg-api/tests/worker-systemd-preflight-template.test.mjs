import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=rel=>readFileSync(path.join(root,rel),"utf8")

test("worker systemd templates are not installable background runners",()=>{
  for(const kind of ["prepare","model","workflow"]){
    const name="agentstudio-pg18-"+kind+".service"
    const file=read("ops/templates/"+name+".example")
    assert.match(file,/Type=oneshot/)
    assert.match(file,new RegExp("User=agentstudio-pg18-"+kind))
    assert.match(file,/DynamicUser=yes/)
    assert.match(file,/LoadCredential=worker\.secret:\/root\/\.agentstudio-pg18-secrets\/worker\.secret/)
    assert.match(file,/AGENT_STUDIO_PG_WORKER_PASSWORD_FILE=%d\/worker\.secret/)
    assert.match(file,/AGENT_STUDIO_PG_HOST=127\.0\.0\.1/)
    assert.match(file,/AGENT_STUDIO_PG_PORT=5333/)
    assert.match(file,/AGENT_STUDIO_PG_DATABASE=agent_studio/)
    assert.match(file,/AGENT_STUDIO_PG_WORKER_USER=agentstudio_stage_worker/)
    assert.match(file,/IPAddressDeny=any/)
    assert.match(file,/IPAddressAllow=127\.0\.0\.0\/8/)
    assert.match(file,/ProtectHome=yes/)
    assert.match(file,/ProtectSystem=strict/)
    assert.match(file,/NoNewPrivileges=yes/)
    assert.match(file,/--preflight/)
    assert.doesNotMatch(file,/^ExecStart=.*--serve/m)
    assert.doesNotMatch(file,/^\[Install\]/m)
    assert.doesNotMatch(file,/^Environment=.*(?:MODEL_API_KEY|OPENAI_API_KEY|WORKER_TRIAL_OPERATOR_APPROVED)/m)
    assert.doesNotMatch(file,/^Restart=always/m)
  }
})
test("Worker CLIs refuse any execution without explicit --serve and PG18 approval",()=>{
  for(const src of ["worker-loop.ts","model-worker-loop.ts","workflow-worker-loop.ts"]){
    const source=read("services/pg-api/src/"+src)
    const workflow=src==="workflow-worker-loop.ts"
    assert.match(source,workflow
      ?/PG_WORKFLOW_WORKER_EXPLICIT_MODE_REQUIRED/
      :/PG_(?:PREPARE|MODEL)_WORKER_EXPLICIT_MODE_REQUIRED/)
    assert.match(source,/assertPg18WorkerCredentialBinding/)
    assert.match(source,/assertPgWorkerActivation/)
    assert.match(source,workflow?/mode==="preflight"/:/if\(preflight\)/)
    assert.match(source,/verifyPgWorkerRoleBoundary/)
    assert.match(source,workflow?/external_calls:false/:/external_model_calls:false/)
    assert.match(source,/worker_started:false/)
    assert.match(source,/production_cutover_allowed:false/)
  }
  const verifier=read("services/pg-api/src/worker-role-preflight.ts")
  assert.match(verifier,/BEGIN READ ONLY/)
  assert.match(verifier,/workerCanReadAgentSpecs/)
  assert.match(verifier,/loginCanJoinNativeAuth/)
})
