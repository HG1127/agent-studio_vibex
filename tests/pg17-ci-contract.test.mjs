// Offline evidence that the PG17 job is ephemeral and refuses developer
// machines or unapproved databases before establishing any connection.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const read=file=>readFileSync(path.join(root,file),"utf8")

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
    "test:stage-collaboration-import","test:stage-kb-content-import",
    "test:stage-kb-atomic-cli","test:stage-history-import",
    "test:stage-user-import","test:stage-migration-identity",
    "test:stage-reconciliation","test:stage-domain-import",
    "test:stage-kb-embedding-archive","test:stage-kb-embedding-cli",
    "test:stage-kb-combined","test:stage-kb-combined-cli",
    "test:stage-parallel-migrations"
  ])assert.ok(domains.includes("- "+name),name)
  assert.match(domains,/matrix\.script/)
  assert.doesNotMatch(web,/run test:stage-agent-import/)
  assert.doesNotMatch(web,/run test:pg17/)
  assert.match(web,/run: pnpm check/)
  assert.doesNotMatch(pg+domains,/docker compose up|deploy production|secrets\./i)
})
test("Independent PG17 read-only reconciliation job uses an isolated synthetic database",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const pg17=workflow.split("\n  pg17-reconciliation-isolated:\n")[1]
    ?.split("\n  pg-api-core:\n")[0]
  assert.ok(pg17,"independent PG17 reconciliation job is present")
  assert.match(pg17,/image: pgvector\/pgvector:pg17/)
  assert.match(pg17,/POSTGRES_DB: agentstudio_stage/)
  assert.match(pg17,/127\.0\.0\.1:5432:5432/)
  assert.match(pg17,/AGENT_STUDIO_PG17_TEST_ENABLED: "true"/)
  assert.match(pg17,/AGENT_STUDIO_PG17_RECONCILIATION_TEST_ENABLED: "true"/)
  assert.match(pg17,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(pg17,/AGENT_STUDIO_PG17_PORT: "5432"/)
  assert.match(pg17,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(pg17,/synthetic-agentstudio-pg17-ci-/)
  assert.match(pg17,/pg17-reconciliation\.integration\.mjs/)
  const testScript=read("services/pg-api/tests/pg17-reconciliation.integration.mjs")
  assert.match(testScript,/refuse_non_ephemeral_pg17_reconciliation/)
  assert.match(testScript,/RUNNER_ENVIRONMENT/)
  assert.match(testScript,/PG17 TCP:/)
  assert.doesNotMatch(pg17,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE/)
})

test("PG17 stage-operator end-to-end CI is a separate ephemeral job and fail-closed on non GitHub-hosted machines",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-stage-operator-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"a separate actual PostgreSQL17 stage operator job must exist")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_STAGE_OPERATOR_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-stage-operator\.integration\.mjs/)
  assert.match(job,/AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED: "true"/)
  assert.match(job,/node ops\/pg17-stage-restore-ci\.mjs/)
  assert.match(read("ops/pg17-stage-restore-ci.mjs"),/W14_PG17_RESTORE_PASS/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const code=read("services/pg-api/tests/pg17-stage-operator.integration.mjs")
  assert.match(code,/refuse_non_ephemeral_pg17_stage_operator/)
  assert.match(code,/RUNNER_ENVIRONMENT/)
  assert.match(code,/W12_PG17_STAGE_OPERATOR_PASS/)
  assert.match(code,/production_cutover_allowed/)
})
test("Independent PG17 cross-domain CI uses own fresh synthetic database and strict runner gate",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-crossdomain-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"cross-domain test must be a separate PG17 service, not share W12")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_CROSSDOMAIN_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-crossdomain-stage\.integration\.mjs/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const code=read("services/pg-api/tests/pg17-crossdomain-stage.integration.mjs")
  assert.match(code,/refuse_non_ephemeral_pg17_crossdomain_stage/)
  assert.match(code,/RUNNER_ENVIRONMENT/)
  assert.match(code,/W13_PG17_STAGE_OPERATOR_PASS/)
  assert.match(code,/production_cutover_allowed/)
})
test("Non-empty KB content real PG17 CI has independent synthetic stage and pre-socket guard",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-kb-content-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"KB archive integration must not reuse W12/W13 database")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_KB_CONTENT_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-kb-content-stage\.integration\.mjs/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const code=read("services/pg-api/tests/pg17-kb-content-stage.integration.mjs")
  assert.match(code,/refuse_non_ephemeral_pg17_kb_content_stage/)
  assert.match(code,/RUNNER_ENVIRONMENT/)
  assert.match(code,/production_cutover_allowed|cutover=NO-GO/)
})
test("W17 PG17 Embedding archive CI is isolated, synthetic and never a runtime queue",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-embedding-archive-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"W17 synthetic embedding archive must run separate PG17 service")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_W17_EMBEDDING_ARCHIVE_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-kb-embedding-archive\.integration\.mjs/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const source=read("services/pg-api/tests/pg17-kb-embedding-archive.integration.mjs")
  assert.match(source,/refuse_non_ephemeral_pg17_kb_embedding_archive/)
  assert.match(source,/RUNNER_ENVIRONMENT/)
  assert.match(source,/W17_PG17_EMBEDDING_ARCHIVE_PASS/)
})
test("W19 combined KB real PG17 CI uses its own clean synthetic service and strong pre-socket isolation",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-kb-combined-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"combined W2/W6/W16 test must have independent PG17 service")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_W19_KB_COMBINED_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-kb-combined\.integration\.mjs/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const source=read("services/pg-api/tests/pg17-kb-combined.integration.mjs")
  assert.match(source,/refuse_non_ephemeral_pg17_kb_combined/)
  assert.match(source,/RUNNER_ENVIRONMENT/)
  assert.match(source,/W19_PG17_KB_COMBINED_PASS/)
})
test("W20 full stage operator real PG17 CI is independent and fail-closed",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const job=workflow.split("\n  pg17-full-stage-operator-isolated:\n")[1]
    ?.split("\n  stage-operator-container:\n")[0]
  assert.ok(job,"separate W20 PostgreSQL 17 service required")
  assert.match(job,/image: pgvector\/pgvector:pg17/)
  assert.match(job,/POSTGRES_DB: agentstudio_stage/)
  assert.match(job,/127\.0\.0\.1:5432:5432/)
  assert.match(job,/AGENT_STUDIO_PG17_W20_FULL_STAGE_TEST_ENABLED: "true"/)
  assert.match(job,/AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"/)
  assert.match(job,/github\.sha \}\}0123456789abcdef01234567/)
  assert.match(job,/services\/pg-api\/tests\/pg17-combined-stage-operator\.integration\.mjs/)
  assert.doesNotMatch(job,/secrets\.|AGENT_STUDIO_BAOTA|AGENT_STUDIO_POCKETBASE|docker compose up/)
  const source=read("services/pg-api/tests/pg17-combined-stage-operator.integration.mjs")
  assert.match(source,/refuse_non_ephemeral_pg17_full_stage/)
  assert.match(source,/RUNNER_ENVIRONMENT/)
  assert.match(source,/W20_PG17_FULL_STAGE_PASS/)
})
test("Quality job provisions PocketBase, PG API modules and local-only Vite source before root tests",()=>{
  const workflow=read(".github/workflows/agent-studio-quality.yml")
  const quality=workflow.split("\n  quality:\n")[1]||""
  const check=quality.indexOf("run: pnpm check")
  const pg=quality.indexOf("services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts")
  const pb=quality.indexOf("POCKETBASE_BIN=$GITHUB_WORKSPACE/.ci-bin/pocketbase")
  assert.ok(check>0&&pg>=0&&pg<check,"PG API imported by CI contract tests must be installed first")
  assert.ok(pb>=0&&pb<check,"PocketBase standalone-init tests require actual binary before pnpm check")
  const config=read("vibex-local/vite.local.config.ts")
  assert.match(config,/target: 'http:\/\/127\.0\.0\.1:7402'/)
  assert.match(config,/AGENT_STUDIO_PB_ORIGIN must be a loopback HTTP origin/)
  assert.match(read(".gitignore"),/!vibex-local\/vite\.local\.config\.ts/)
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
