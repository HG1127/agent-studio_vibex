// Offline evidence that the PG17 job is ephemeral and refuses developer
// machines or unapproved databases before establishing any connection.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
// Normalize Windows CRLF so the same CI contract runs identically on Ubuntu.
const read=file=>readFileSync(path.join(root,file),"utf8").replace(/\r\n/g,"\n")

test("PG17 integration refuses any non-ephemeral CI environment before networking",()=>{
  const file=path.join(root,"services/pg-api/tests/pg17-tcp.integration.mjs")
  const env={...process.env}
  for(const name of [
    "GITHUB_ACTIONS","GITHUB_RUN_ID","AGENT_STUDIO_PG17_TEST_ENABLED",
    "AGENT_STUDIO_PG17_HOST","AGENT_STUDIO_PG17_DATABASE",
    "AGENT_STUDIO_PG17_ADMIN_USER","AGENT_STUDIO_PG17_ADMIN_PASSWORD",
  ]) delete env[name]
  // Prevent the outer Node test runner's worker mode leaking into the child.
  delete env.NODE_TEST_CONTEXT
  const processResult=spawnSync(process.execPath,[
    "--experimental-strip-types","--test",file,
  ],{cwd:root,env,encoding:"utf8",timeout:30000})
  assert.equal(processResult.status,1,
    "PG17 test must reject execution without CI safety markers")
  assert.match(processResult.stdout||"",/refuse_non_ephemeral_pg17/)
  assert.doesNotMatch(processResult.stderr||"",/ECONNREFUSED|connection refused/)
})


test("CI splits Web/PocketBase, PostgreSQL core, and migration domains into parallel independent jobs",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const pg=workflow.split("\n  pg-api-core:\n")[1]?.split("\n  pg-migration-domains:\n")[0]
  const domains=workflow.split("\n  pg-migration-domains:\n")[1]?.split("\n  quality:\n")[0]
  const web=workflow.split("\n  quality:\n")[1]
  assert.ok(pg&&domains&&web,"separate jobs must exist")
  assert.match(pg,/--test-concurrency=2/)
  assert.match(pg,/services\/pg-api\/tests\/postgres-engine.test.mjs/)
  assert.match(pg,/services\/pg-api\/tests\/stage-login.test.mjs/)
  assert.match(domains,/fail-fast:\s*false/)
  for(const name of [
    "test:stage-agent-import","test:stage-workflow-import",
    "test:stage-kb-import","test:stage-schedule-import",
    "test:stage-parallel-migrations"
  ])assert.ok(domains.includes("- "+name),name)
  assert.match(domains,/matrix\.script/)
  assert.doesNotMatch(web,/run test:stage-agent-import/)
  assert.doesNotMatch(web,/run test:pg17/)
  assert.match(web,/run: pnpm check/)
  assert.doesNotMatch(pg+domains,/docker compose up|deploy production|secrets\./i)
})
test("CI PG17 test is separate, version-pinned and isolated from production targets",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const pg17Job=workflow.split("\n  pg17-tcp-isolated:\n")[1]
    ?.split("\n  pg-api-core:\n")[0]
  assert.ok(pg17Job,"independent PG17 job must exist")
  assert.match(pg17Job,/image: pgvector\/pgvector:pg17/)
  assert.match(pg17Job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(pg17Job,/POSTGRES_USER: agentstudio_admin/)
  assert.match(pg17Job,/127\.0\.0\.1:5432:5432/)
  assert.match(pg17Job,/AGENT_STUDIO_PG17_TEST_ENABLED: "true"/)
  assert.match(pg17Job,/AGENT_STUDIO_PG17_HOST: "127\.0\.0\.1"/)
  assert.match(pg17Job,/synthetic-agentstudio-pg17-ci-/)
  assert.match(pg17Job,/run test:pg17/)
  assert.doesNotMatch(pg17Job,/secrets\./)
  assert.doesNotMatch(pg17Job,/AGENT_STUDIO_POCKETBASE|AGENT_STUDIO_BAOTA/)
  const script=read("services/pg-api/tests/pg17-tcp.integration.mjs")
  assert.match(script,/refuse_non_ephemeral_pg17/)
  assert.match(script,/to_regclass\('agentstudio\.runs'\)/)
  assert.match(script,/FOR UPDATE SKIP LOCKED|SKIP LOCKED must prevent duplicate/)
  assert.match(script,/model_lease_exhausted/)
  assert.match(script,/model_lease_expired/)
})
