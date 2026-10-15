import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {main} from "../ops/pg17-stage-restore-ci.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const file=path.join(root,"ops","pg17-stage-restore-ci.mjs")
const refusal="refuse_non_ephemeral_pg17_restore"
test("restore rehearsal refuses unapproved environment before Docker, files and networking",async()=>{
  const checks=[
    {},
    {GITHUB_ACTIONS:"false",RUNNER_TEMP:"/tmp"},
    {GITHUB_ACTIONS:"true",RUNNER_ENVIRONMENT:"self-hosted",RUNNER_OS:"Linux"},
    {GITHUB_ACTIONS:"true",GITHUB_RUN_ID:"123",RUNNER_ENVIRONMENT:"github-hosted",
      RUNNER_OS:"Linux",RUNNER_TEMP:"/tmp",
      AGENT_STUDIO_PG17_TEST_ENABLED:"true",
      AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED:"false",
      AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:"true",
      AGENT_STUDIO_PG17_HOST:"127.0.0.1",
      AGENT_STUDIO_PG17_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG17_ADMIN_USER:"agentstudio_admin",
      AGENT_STUDIO_PG17_ADMIN_PASSWORD:"synthetic-agentstudio-pg17-ci-123-"+("abcdef0123456789".repeat(4))},
  ]
  for(const input of checks)await assert.rejects(main(input,"linux"),
    e=>e.message===refusal)
  await assert.rejects(main({...checks[3],
    AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED:"true",
  },"win32"),e=>e.message===refusal)
})
test("invoked CLI fails before touching a Docker daemon without explicit CI authorization",()=>{
  const child=spawnSync(process.execPath,[file],{
    cwd:root,encoding:"utf8",timeout:16000,env:{
      PATH:process.env.PATH,
      GITHUB_ACTIONS:"false",RUNNER_OS:"Windows",
      AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED:"false",
    },
  })
  assert.equal(child.status,1)
  assert.match(child.stderr,/PG17 restore rehearsal refused: refuse_non_ephemeral_pg17_restore/)
  assert.doesNotMatch(child.stderr,/ECONNREFUSED|Cannot connect to the Docker daemon|PRIVATE/)
  assert.equal(child.stdout,"")
})
test("CI restore procedure is create-only, stays in synthetic namespace and compares every table hash",()=>{
  const src=readFileSync(file,"utf8")
  for(const property of [
    "pg_dump","createdb","pg_restore","--single-transaction",
    "pg17_dump_modified_source","pg17_restore_fingerprint_mismatch",
    "all_tables_hashed=true","cutover=NO-GO",
    "AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED",
    "pgvector/pgvector:pg17",
  ])assert.ok(src.includes(property),property)
  const executable=src.split(/\r?\n/).filter(line=>
    !line.trim().startsWith("//")).join("\n")
  assert.doesNotMatch(executable,/pg_restore.*--clean|DROP DATABASE|pg_restore.*--create/i)
})
