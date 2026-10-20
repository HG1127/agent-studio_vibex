// Offline safety contract for real PostgreSQL 18 Native Auth HTTPS UAT.
// No localhost socket or OpenSSL is invoked until exact ephemeral CI attested.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {loadNativeAuthPg18CiSchema} from "../src/pg18-native-auth-ci-schema.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
test("disposable PG18 Native Auth SQL retains roles, RLS and production guards",()=>{
  const source=fs.readFileSync(path.join(root,
    "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
  const {sql,originalSha256,ci_only,production_cutover_allowed}=
    loadNativeAuthPg18CiSchema()
  assert.equal(originalSha256.length,64)
  assert.equal(ci_only,true)
  assert.equal(production_cutover_allowed,false)
  assert.match(source,/current_database\(\) <> 'agent_studio'/)
  assert.match(sql,/current_database\(\) <> 'agentstudio_pg18_ci'/)
  assert.match(sql,/current_setting\('port'\)::integer <> 5432/)
  assert.match(sql,/session_user <> 'agentstudio_admin'/)
  assert.match(sql,/CREATE POLICY native_auth_verified_local_users/)
  assert.match(sql,/FORCE ROW LEVEL SECURITY/)
  assert.match(sql,/NOBYPASSRLS/)
  assert.match(sql,/server_version_num/)
  assert.match(sql,/extversion FROM pg_extension/)
  assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)\b/i)
  assert.equal((sql.match(/CREATE TABLE agentstudio_auth\./g)||[]).length,2)
  assert.equal((source.match(/CREATE TABLE agentstudio_auth\./g)||[]).length,2)
})

test("Native Auth real HTTPS integration refuses ordinary workstations before creating a Pool",()=>{
  const entry=path.join(root,"services/pg-api/tests/pg18-native-auth-tcp.integration.mjs")
  for(const env of [
    {GITHUB_ACTIONS:"false",CI:"false"},
    {GITHUB_ACTIONS:"true",CI:"true",
      AGENT_STUDIO_PG18_CI_HOST:"127.0.0.1",
      AGENT_STUDIO_PG18_CI_PORT:"5333",
      AGENT_STUDIO_PG18_CI_DATABASE:"agent_studio",
      GITHUB_RUN_ID:"3431271",
      AGENT_STUDIO_PG18_CI_EPHEMERAL:"true",
      AGENT_STUDIO_PG18_CI_WRITE_APPROVED:"YES_DISPOSABLE_GITHUB_ONLY"}
  ]){
    const result=spawnSync(process.execPath,[
      "--experimental-strip-types","--test",entry
    ],{encoding:"utf8",timeout:15000,
      env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
        DATABASE_URL:"postgres://127.0.0.1:5333/agent_studio",...env}})
    assert.notEqual(result.status,0)
    assert.match(result.stdout+result.stderr,/refuse_non_ephemeral_pg18_ci/)
    assert.doesNotMatch(result.stdout+result.stderr,
      /ECONNREFUSED|password authentication failed|unable to verify the first certificate/)
  }
})

test("real PG18 Native HTTPS UAT is strictly localhost TLS without model, provider or production deploy",()=>{
  const entry=fs.readFileSync(path.join(root,
    "services/pg-api/tests/pg18-native-auth-tcp.integration.mjs"),"utf8")
  assert.ok(entry.indexOf("requireEphemeralPg18Ci(process.env)")<
    entry.indexOf("const admin=new pg.Pool(target)"))
  assert.match(entry,/createTlsServer/)
  assert.match(entry,/ca,rejectUnauthorized:true/)
  assert.match(entry,/servername:"localhost"/)
  assert.match(entry,/__Host-agentstudio_session/)
  assert.match(entry,/SameSite=Strict/)
  assert.match(entry,/SET LOCAL ROLE agentstudio_native_auth/)
  assert.match(entry,/SET LOCAL ROLE agentstudio_api/)
  assert.match(entry,/authenticateRequest:native\.authenticateRequest/)
  assert.match(entry,/createHandler\(/)
  assert.match(entry,/\/api\/v2\/agent-specs/)
  assert.match(entry,/ci_readonly_business_only/)
  assert.doesNotMatch(entry,/\/uat\/agents/)
  const business=fs.readFileSync(path.join(root,
    "services/pg-api/src/http.ts"),"utf8")
  assert.match(business,/authenticateRequest\?:/)
  assert.match(business,/identity=await deps\.authenticateRequest\(req\)/)
  assert.match(business,/native_request_origin_denied/)
  assert.match(business,/identity=await deps\.verifyToken\(tokenFrom\(req\)\)/)
  for(const illegal of [
    /--serve/,/systemctl/,/PocketBase\.collection/,/createStagingOpenAIProvider/,
    /DATABASE_URL\s*=/,/https?:\/\/(?:192\.168|10\.|172\.|baota)/,
    /fetch\(/,/DROP DATABASE/,/DROP ROLE/,/ALTER USER postgres/
  ])assert.doesNotMatch(entry,illegal)
})
