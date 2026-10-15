import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {createPgPilotApi,PgPilotApiError} from "../src/lib/pgPilotApi.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const sampleToken="abc.def.ghi"
test("PostgreSQL pilot client never sends signed token outside local same-origin proxy",async()=>{
  const visits=[]
  const fakeFetch=async(url,opts)=>{
    visits.push({url,opts})
    if(url.endsWith("/agent-specs"))return new Response(JSON.stringify({items:[]}),{status:200})
    if(url.endsWith("/runs"))return new Response(JSON.stringify({runs:[]}),{status:200})
    if(url.endsWith("/workflows"))return new Response(JSON.stringify({items:[]}),{status:200})
    if(url.endsWith("/knowledge-bases"))return new Response(JSON.stringify({items:[]}),{status:200})
    if(url.endsWith("/model-approval"))return new Response(JSON.stringify({
      replayed:false,approval:"approved",run:{id:"synthetic"},
    }),{status:202})
    if(url.includes("/text-documents"))return new Response(JSON.stringify({
      item:{id:"synthetic"},
    }),{status:201})
    if(url.includes("/search"))return new Response(JSON.stringify({
      items:[{citation:"document-1"}],mode:"literal_keyword",
    }),{status:200})
    if(url.includes("/agent-specs/")&&url.endsWith("/runs"))
      return new Response(JSON.stringify({run:{id:"synthetic"},replayed:false}),{status:202})
    throw Error("unexpected_api_url "+url)
  }
  const api=createPgPilotApi(sampleToken,fakeFetch)
  await api.listAgents()
  await api.listRuns()
  await api.listWorkflows()
  await api.listKnowledgeBases()
  const uuid="11111111-1111-4111-8111-111111111111"
  await api.submitRun(uuid,"Summarize research","idempotent-test-0001")
  await api.decideModel(uuid,"approved")
  await api.importText(uuid,"evidence.md","Some synthetic test text")
  await api.searchKnowledge(uuid,"evidence")
  assert.equal(visits.length,8)
  for(const {url,opts} of visits){
    assert.match(url,/^\/__pg\/api\/v2\/[A-Za-z0-9/_-]+$/)
    assert.equal(opts.credentials,"omit")
    assert.equal(opts.redirect,"error")
    assert.equal(opts.cache,"no-store")
    assert.equal(opts.referrerPolicy,"no-referrer")
    assert.equal(opts.headers.Authorization,"Bearer "+sampleToken)
  }
  assert.throws(()=>api.decideModel("../../admin","approved"),
    err=>err instanceof PgPilotApiError&&err.code==="invalid_resource_id")
  assert.equal(visits.length,8,"malicious route never reaches transport")
  assert.throws(()=>createPgPilotApi("pb-token",fakeFetch),
    err=>err instanceof PgPilotApiError&&err.status===401)
  assert.throws(()=>createPgPilotApi("",fakeFetch),/oidc_access_token_required/)
})
test("Pilot API maps verified server errors without exposing response content",async()=>{
  const bad=createPgPilotApi(sampleToken,async()=>new Response(
    JSON.stringify({error:"approval_already_decided",private_instruction:"SECRET"}),
    {status:409},
  ))
  await assert.rejects(bad.listRuns(),error=>{
    assert.equal(error.code,"approval_already_decided")
    assert.equal(error.status,409)
    assert.doesNotMatch(String(error),/SECRET/)
    return true
  })
  const unreachable=createPgPilotApi(sampleToken,async()=>{throw Error("auth token printed")})
  await assert.rejects(unreachable.listAgents(),error=>{
    assert.equal(error.code,"pilot_connection_unavailable")
    assert.doesNotMatch(String(error),/token printed/)
    return true
  })
})
test("Pilot UI is dev-only opt-in; /__pg cannot target arbitrary external hosts",()=>{
  const app=readFileSync(path.join(root,"src/App.tsx"),"utf8")
  const vite=readFileSync(path.join(root,"vibex-local/vite.local.config.ts"),"utf8")
  const ui=readFileSync(path.join(root,"src/pages/PgPilot/PgPilotPage.tsx"),"utf8")
  assert.match(app,/import\.meta\.env\.DEV\s*&&/)
  assert.match(app,/VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED\s*===\s*"true"/)
  assert.match(app,/PG_PILOT_LOCAL_ONLY\s*\?\s*lazy\(/)
  assert.match(app,/PgPilotRoute\s*&&\s*<Route path="\/pg-pilot"/)
  assert.match(vite,/target:\s*'http:\/\/127\.0\.0\.1:7402'/)
  assert.match(vite,/host:\s*'127\.0\.0\.1'/)
  assert.match(vite,/['"]\/__pg['"]:\s*pgPilotProxy/)
  assert.doesNotMatch(ui,/(?:localStorage|sessionStorage)\s*\.\s*setItem|document\.cookie\s*=/)
  assert.match(ui,/模型调用.*Worker/)
})
test("Isolated model_worker requires independent compose overlay and external secret",()=>{
  const base=readFileSync(path.join(root,"deploy/postgres-staging/compose.yaml"),"utf8")
  const overlay=readFileSync(path.join(root,"deploy/postgres-staging/model-worker.compose.yaml"),"utf8")
  assert.doesNotMatch(base,/\n\s{2}model_worker:/)
  assert.match(base,/internal:\s*true/)
  assert.match(overlay,/profiles:\s*\["model-worker"\]/)
  assert.match(overlay,/AGENT_STUDIO_PG_MODEL_WORKER_ENABLED:\s*"true"/)
  assert.match(overlay,/AGENT_STUDIO_MODEL_API_KEY_FILE: \/run\/secrets\/model_api_key/)
  assert.match(overlay,/AGENT_STUDIO_STAGE_MODEL_API_KEY_FILE:\?/)
  assert.match(overlay,/read_only:\s*true/)
  assert.doesNotMatch(overlay,/ports:/)
})
