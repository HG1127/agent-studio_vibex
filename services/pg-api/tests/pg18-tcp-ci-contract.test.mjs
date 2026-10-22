// Offline contract: genuine PostgreSQL 18 TCP test MUST fail before making
// connections except in one exact, disposable GitHub Actions environment.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {requireEphemeralPg18Ci} from "../src/pg18-ephemeral-ci-guard.mjs"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const runId="123456789"
const safe={
  GITHUB_ACTIONS:"true",CI:"true",GITHUB_RUN_ID:runId,
  AGENT_STUDIO_PG18_CI_EPHEMERAL:"true",
  AGENT_STUDIO_PG18_CI_WRITE_APPROVED:"YES_DISPOSABLE_GITHUB_ONLY",
  AGENT_STUDIO_PG18_CI_HOST:"127.0.0.1",
  AGENT_STUDIO_PG18_CI_PORT:"5432",
  AGENT_STUDIO_PG18_CI_DATABASE:"agentstudio_pg18_ci",
  AGENT_STUDIO_PG18_CI_ADMIN_USER:"agentstudio_admin",
  AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:"synthetic-agentstudio-pg18-ci-"+runId
}

test("pure PG18 CI schema loader checks the versioned baseline without operator credential tooling",()=>{
  const result=loadPg18CiBaseline()
  assert.match(result.sha256,/^[a-f0-9]{64}$/)
  assert.equal((result.sql.match(/\bCREATE TABLE agentstudio\./g)||[]).length,23)
  assert.match(result.sql,/FORCE ROW LEVEL SECURITY/)
  assert.match(result.sql,/worker_effect_safety_read/)
  assert.doesNotMatch(result.sql,/\\set ON_ERROR_STOP on|^BEGIN;$|^COMMIT;$/m)
  const source=readFileSync(path.join(root,"services/pg-api/src/pg18-ci-schema.mjs"),"utf8")
  assert.doesNotMatch(source,/pg\.Pool|pg\.Client|require\(["']pg|readPasswordContent|secret\(/)
})

test("only exact disposable PG18 CI target passes the pure guard",()=>{
  assert.deepEqual(requireEphemeralPg18Ci(safe),{
    host:"127.0.0.1",port:5432,database:"agentstudio_pg18_ci",
    user:"agentstudio_admin",password:safe.AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD,
    max:4,connectionTimeoutMillis:5000,statement_timeout:15000
  })
  for(const [name,bad] of Object.entries({
    missing_markers:{},
    production_database:{AGENT_STUDIO_PG18_CI_DATABASE:"agent_studio"},
    production_port:{AGENT_STUDIO_PG18_CI_PORT:"5333"},
    remote_host:{AGENT_STUDIO_PG18_CI_HOST:"192.168.1.133"},
    server_url:{DATABASE_URL:"postgres://admin@127.0.0.1/agent_studio"},
    postgres_host:{PGHOST:"127.0.0.1"},
    postgres_password:{PGPASSWORD:"secret"},
    remote_ci:{GITHUB_ACTIONS:"false"},
    local_ci:{CI:"false"},
    unapproved:{AGENT_STUDIO_PG18_CI_WRITE_APPROVED:undefined},
    wrong_run_id:{GITHUB_RUN_ID:"987654321"},
    wrong_password:{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:"admin"},
    shell_user:{AGENT_STUDIO_PG18_CI_ADMIN_USER:"postgres"},
  })){
    const attempt=name==="missing_markers"?{}:{...safe,...bad}
    assert.throws(()=>requireEphemeralPg18Ci(attempt),
      /refuse_non_ephemeral_pg18_ci/,name)
  }
})

test("real PG18 TCP integration exits before any socket on an ordinary checkout",()=>{
  const cli=path.join(root,"services/pg-api/tests/pg18-tcp.integration.mjs")
  const run=spawnSync(process.execPath,[
    "--experimental-strip-types","--test",cli
  ],{cwd:root,encoding:"utf8",timeout:20000,
    env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
      GITHUB_ACTIONS:"false",CI:"false",
      DATABASE_URL:"postgres://127.0.0.1:5333/agent_studio"}
  })
  assert.notEqual(run.status,0)
  assert.match(run.stdout+run.stderr,/refuse_non_ephemeral_pg18_ci/)
  assert.doesNotMatch(run.stdout+run.stderr,
    /ECONNREFUSED|password authentication failed|database system is starting up/)
})

test("genuine mTLS integration refuses any local checkout before openssl or sockets",()=>{
  const cli=path.join(root,"services/pg-api/tests/pg18-mtls-ci.integration.mjs")
  const run=spawnSync(process.execPath,[
    "--experimental-strip-types","--test",cli
  ],{cwd:root,encoding:"utf8",timeout:20000,
    env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
      GITHUB_ACTIONS:"false",CI:"false",
      DATABASE_URL:"postgres://127.0.0.1:5333/agent_studio"}
  })
  assert.notEqual(run.status,0)
  assert.match(run.stdout+run.stderr,/refuse_non_ephemeral_pg18_ci/)
  assert.doesNotMatch(run.stdout+run.stderr,
    /ECONNREFUSED|password authentication failed|database system is starting up/)
  const code=readFileSync(cli,"utf8")
  assert.match(code,/requireEphemeralPg18Ci\(process\.env\)/)
  assert.ok(code.indexOf("requireEphemeralPg18Ci(process.env)")<
    code.indexOf("const temp=mkdtempSync"))
  assert.match(code,/requestCert:true,rejectUnauthorized:true/)
  assert.match(code,/new X509Certificate/)
  assert.match(code,/createIsolatedBoundModelInternalHandler/)
  assert.match(code,/hostname:"127\.0\.0\.1"/)
  assert.doesNotMatch(code,/from\s+["'].*(?:pocketbase|model-provider)/)
  assert.doesNotMatch(code,/DATABASE_URL\s*=|systemctl|DROP DATABASE|--serve/)
})

test("PG18 ephemeral lifecycle test has no external model/provider imports or production actions",()=>{
  const src=readFileSync(path.join(root,
    "services/pg-api/tests/pg18-tcp.integration.mjs"),"utf8")
  assert.match(src,/requireEphemeralPg18Ci\(process\.env\)/)
  assert.ok(src.indexOf("requireEphemeralPg18Ci(process.env)")<
    src.indexOf("const admin=new Pool(target)"))
  assert.match(src,/loadPg18CiBaseline\(\)\.sql/)
  assert.match(src,/new AgentPrepareWorker/)
  assert.match(src,/new AgentModelWorker/)
  assert.match(src,/Promise\.all\(\[\s*claimInChildProcess\("a"\),claimInChildProcess\("b"\)/)
  assert.match(src,/execFileAsync\(process\.execPath/)
  assert.match(src,/const childEnvKeys=\[/)
  assert.match(src,/agentstudio\.external_effects/)
  assert.match(src,/pg_v9_024_bound_dispatch_identity\.sql/)
  assert.match(src,/pg_v9_023_workflow_safe_worker\.sql/)
  assert.match(src,/new BoundLeaseIdentityRepository\(adapter\(boundIdentityPool\)\)/)
  assert.match(src,/agentstudio_bound_dispatch_ci_login/)
  assert.match(src,/has_function_privilege/)
  assert.match(src,/SQLSTATE 42501/)
  assert.doesNotMatch(src,/from\s+["'].*(?:pocketbase|model-provider)/)
  assert.doesNotMatch(src,/fetch\(|https\.request\(|http\.request\(|--serve|systemctl/)
  assert.doesNotMatch(src,/DROP DATABASE|DROP SCHEMA|TRUNCATE TABLE|DATABASE_URL\s*=/)
})
test("new V9.024 lease identity migration remains private, replayable and role-fenced",()=>{
  const sql=readFileSync(path.join(root,
    "db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql"),"utf8")
  assert.match(sql,/pg_v9_023/)
  assert.match(sql,/CREATE ROLE agentstudio_bound_dispatch NOLOGIN NOINHERIT/)
  assert.match(sql,/SECURITY DEFINER/)
  assert.match(sql,/REVOKE ALL ON FUNCTION agentstudio\.bound_model_lease_identity/)
  assert.match(sql,/FROM PUBLIC/)
  assert.match(sql,/agentstudio_api,agentstudio_worker,agentstudio_model_broker/)
  assert.match(sql,/FROM agentstudio\.jobs AS j/)
  assert.match(sql,/j\.lease_until>clock_timestamp\(\)/)
  assert.match(sql,/a\.status='approved'/)
  assert.match(sql,/u\.status='active'/)
  assert.match(sql,/ON CONFLICT\(version\) DO NOTHING/)
  assert.doesNotMatch(sql,/CREATE ROLE[^;]*\bLOGIN\b/i)
  assert.doesNotMatch(sql,/DROP DATABASE|DROP SCHEMA|TRUNCATE TABLE/)
})
test("separate OS-process Prepare claim fails closed in ordinary local environment",()=>{
  const child=path.join(root,
    "services/pg-api/tests/helpers/pg18-ci-claim-worker.mjs")
  for(const args of [
    ["--prepare-claim-once","a"],["--prepare-claim-once","b"],
    ["--serve"],["--prepare-claim-once","arbitrary"]
  ]){
    const result=spawnSync(process.execPath,[
      "--experimental-strip-types",child,...args
    ],{encoding:"utf8",timeout:15000,
      env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
        GITHUB_ACTIONS:"false",CI:"false",DATABASE_URL:
          "postgres://127.0.0.1:5333/agent_studio"}})
    assert.equal(result.status,3)
    assert.equal(result.stdout,"")
    assert.match(result.stderr,/pg18_ephemeral_claim_refused/)
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|password authentication failed/)
  }
  const source=readFileSync(child,"utf8")
  assert.ok(source.indexOf("requireEphemeralPg18Ci(process.env)")<
    source.indexOf("const pool=new pg.Pool"))
  assert.match(source,/new AgentPrepareWorker/)
  assert.match(source,/\.claim\(\)/)
  assert.doesNotMatch(source,/\.prepare\(|\.tick\(|\.generate\(|--serve|fetch\(/)
})

test("CI image and test credentials are pinned to a disposable PG18-only service",()=>{
  const pipeline=readFileSync(path.join(root,
    ".github/workflows/pg18-ephemeral-ci.yml"),"utf8")
  const block=pipeline.split("  pg18-tcp-ephemeral:")[1]
  assert.ok(block,"isolated job must exist")
  assert.match(block,/image: pgvector\/pgvector:0\.8\.7-pg18/)
  assert.match(block,/POSTGRES_DB: agentstudio_pg18_ci/)
  assert.match(block,/POSTGRES_USER: agentstudio_admin/)
  assert.match(block,/127\.0\.0\.1:5432:5432/)
  assert.match(block,/AGENT_STUDIO_PG18_CI_WRITE_APPROVED: "YES_DISPOSABLE_GITHUB_ONLY"/)
  assert.match(block,/run: node --experimental-strip-types --test services\/pg-api\/tests\/pg18-tcp\.integration\.mjs/)
  assert.match(block,/run: pnpm --dir services\/pg-api run test:pg18:mtls:ci/)
  assert.match(pipeline,/migration\/pg18-tcp-ci-\*/)
  assert.match(pipeline,/^permissions:\s*\n\s+contents: read/m)
  assert.match(block,/synthetic-agentstudio-pg18-ci-/)
  assert.doesNotMatch(block,/127\.0\.0\.1:5333|POSTGRES_DB: agent_studio\s|DATABASE_URL:|--serve|systemctl/)
})
