import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {options,run,firstAdminPreflightForTest} from "../src/native-first-admin-cli.mjs"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const entry=path.join(root,"services/pg-api/src/native-first-admin-cli.mjs")
test("first-admin offline plan hard-codes PG18 and never reads credentials",async()=>{
  const p=await run(["--plan"],{DATABASE_URL:"postgres://unsafe",PGHOST:"bad"})
  assert.equal(p.db,"agent_studio")
  assert.equal(p.port,5333)
  assert.equal(p.postgres_major,18)
  assert.equal(p.initializes_only_one_admin,true)
  assert.equal(p.network_used,false)
  assert.equal(p.production_cutover_allowed,false)
})
test("first-admin cannot execute by default, against other DB or outside Linux root",()=>{
  for(const args of [[],["--execute"],["--execute","--confirm-database","vcaios"],
    ["--execute","--confirm-database","postgres"],
    ["--execute","--confirm-database","agent_studio","--force"]]){
    assert.throws(()=>options(args,{}, "linux",0),/invalid_first_admin_arguments/)
  }
  const correct=["--execute","--confirm-database","agent_studio"]
  assert.throws(()=>options(correct,{},"linux",0),/first_admin_bootstrap_disabled/)
  const enabled={AGENT_STUDIO_PG18_FIRST_ADMIN_ENABLED:"true",
    AGENT_STUDIO_PG_NATIVE_AUTH_USER:"agentstudio_native_login"}
  assert.throws(()=>options(correct,enabled,"win32",0),/first_admin_bootstrap_disabled/)
  assert.throws(()=>options(correct,enabled,"linux",1000),/first_admin_bootstrap_disabled/)
  assert.throws(()=>options(correct,{...enabled,DATABASE_URL:"postgres://unsafe"},"linux",0),
    /first_admin_bootstrap_disabled/)
  const parsed=options(correct,enabled,"linux",0)
  assert.equal(parsed.db,"agent_studio")
  assert.equal(parsed.host,"127.0.0.1")
  assert.equal(parsed.port,5333)
  const preflight=["--preflight","--confirm-database","agent_studio"]
  const readOnly=options(preflight,enabled,"linux",0)
  assert.equal(readOnly.action,"preflight")
  assert.equal(readOnly.initialPassword,undefined)
  assert.equal(readOnly.profileFile,undefined)

})

test("first admin read-only preflight validates account vacancy and SQL grants",async()=>{
  const identity={
    db:"agent_studio",login:"agentstudio_native_login",port:5333,
    addr:"127.0.0.1",major:180000,can_login:true,superuser:false,
    bypass:false,create_role:false,can_auth:true,can_api:false,
    can_worker:false
  }
  const facts={accounts:0,sessions:0,local_users:0,
    insert_user_id:true,insert_issuer:true,insert_subject:true,
    insert_display:true,insert_status:true,insert_account:true}
  const seen=[]
  function instance(state={},privileges={}){
    return {async connect(){return {
      async query(sql){
        seen.push(sql)
        if(sql.startsWith("SELECT current_database"))return {rows:[{...identity,...state}]}
        if(sql==="SELECT current_user AS role")
          return {rows:[{role:"agentstudio_native_auth"}]}
        if(sql.startsWith("SELECT (SELECT count"))
          return {rows:[{...facts,...privileges}]}
        return {rows:[]}
      },
      release(){}
    }}}
  }
  const good=await firstAdminPreflightForTest(instance())
  assert.equal(good.ready,true)
  assert.deepEqual(good.blockers,[])
  assert.equal(good.accounts,0)
  assert.equal(good.writes_performed,false)
  assert.ok(seen.indexOf("BEGIN READ ONLY")>=0)
  assert.ok(seen.indexOf("SET LOCAL ROLE agentstudio_native_auth")>=0)
  assert.equal(seen[seen.length-1],"ROLLBACK")
  assert.ok(!seen.some(x=>/^(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|COMMIT)\b/i.test(x)))
  const occupied=await firstAdminPreflightForTest(instance({},{accounts:1}))
  assert.equal(occupied.ready,false)
  assert.deepEqual(occupied.blockers,["native_admin_already_initialized"])
  const noGrants=await firstAdminPreflightForTest(
    instance({},{insert_user_id:false}))
  assert.equal(noGrants.ready,false)
  assert.deepEqual(noGrants.blockers,["native_auth_insert_grants_missing"])
  const noStatusGrant=await firstAdminPreflightForTest(
    instance({},{insert_status:false}))
  assert.deepEqual(noStatusGrant.blockers,["native_auth_insert_grants_missing"])
  await assert.rejects(
    firstAdminPreflightForTest(instance({port:5432})),
    /unsafe_first_admin_target/)
  await assert.rejects(
    firstAdminPreflightForTest(instance({can_api:true})),
    /unsafe_first_admin_target/)
  await assert.rejects(
    firstAdminPreflightForTest(instance({superuser:true})),
    /unsafe_first_admin_target/)
})
test("first-admin CLI plan runs while all TCP socket connect calls are blocked",()=>{
  const preload="data:text/javascript,"+encodeURIComponent(
    "import net from 'node:net';"+
    "import {syncBuiltinESMExports} from 'node:module';"+
    "net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_TCP')};"+
    "syncBuiltinESMExports();")
  const p=spawnSync(process.execPath,["--import",preload,entry,"--plan"],{
    cwd:root,encoding:"utf8",timeout:12000,
    env:{...process.env,DATABASE_URL:"postgres://production",
      AGENT_STUDIO_PG18_FIRST_ADMIN_ENABLED:"false"}})
  assert.equal(p.status,0,p.stderr)
  assert.doesNotMatch(p.stdout+p.stderr,/FORBIDDEN_TCP|postgres:\/\/production/)
  assert.equal(JSON.parse(p.stdout).network_used,false)
})
