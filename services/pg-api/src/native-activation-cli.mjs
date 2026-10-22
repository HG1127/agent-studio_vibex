#!/usr/bin/env node
// Operator-controlled activation of ONE dedicated BaoTa PG18 native-auth login.
// --plan never reads the disk or opens TCP; --preflight is strictly read-only.
// --activate is a separate explicit one-time action; DOES NOT create schema,
// change API/Worker credentials, import PocketBase, or start a service.
import {readFileSync,realpathSync,lstatSync,statSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createHash,createHmac,pbkdf2Sync,randomBytes} from "node:crypto"

const database="agent_studio",host="127.0.0.1",port=5333
const group="agentstudio_native_auth",login="agentstudio_native_login"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const adminName="AGENT_STUDIO_PG18_NATIVE_ADMIN_PASSWORD_FILE"
const serviceName="AGENT_STUDIO_PG18_NATIVE_AUTH_LOGIN_PASSWORD_FILE"
function fail(code){throw Error(code)}
export function parseNativeActivation(argv,env=process.env,
    platform=process.platform,uid=process.getuid?.()){
  if(argv.length===1&&argv[0]==="--plan")return {
    mode:"plan",database,host,port,expected_major:18,
    identity_role:login,login_initially_disabled:true,
    creates_db_tables:false,read_only:true,network_used:false,
    production_cutover_allowed:false
  }
  if(argv.length!==3||!["--preflight","--activate"].includes(argv[0])||
     argv[1]!=="--confirm-database"||argv[2]!==database)
    fail("invalid_activation_arguments")
  const mode=argv[0].slice(2)
  if(platform!=="linux"||uid!==0||
     env.AGENT_STUDIO_PG18_NATIVE_ACTIVATION_ENABLED!=="true"||
     Object.keys(env).some(key=>key==="DATABASE_URL"||
       /^PG[A-Z_]/.test(key)))
    fail("activation_disabled")
  if(mode==="activate"&&
     env.AGENT_STUDIO_PG18_NATIVE_ACTIVATION_WRITE_APPROVED!=="true")
    fail("activation_write_not_approved")
  return {mode,database,host,port,expected_major:18,
    adminFile:env[adminName],
    serviceFile:mode==="activate"?env[serviceName]:undefined,
    production_cutover_allowed:false}
}
function outsideRepo(file){
  if(typeof file!=="string"||!path.isAbsolute(file)||file.includes("\0"))
    fail("private_secret_file_required")
  let current=path.parse(file).root
  for(const part of file.slice(current.length).split(path.sep)){
    if(!part)continue
    current=path.join(current,part)
    if(lstatSync(current).isSymbolicLink())
      fail("private_secret_file_required")
  }
  const real=realpathSync(file)
  const relative=path.relative(root,real)
  if(relative===""||(!relative.startsWith(".."+path.sep)&&
     relative!==".."&&!path.isAbsolute(relative)))
    fail("private_secret_file_required")
  const st=statSync(real)
  if(!st.isFile()||st.uid!==0||(st.mode&0o077)!==0||
     st.size<1||st.size>514)
    fail("private_secret_file_required")
  const raw=readFileSync(real)
  const password=raw.toString("utf8")
  if(!Buffer.from(password,"utf8").equals(raw))
    fail("invalid_secret_format")
  const trimmed=password.replace(/\r?\n$/,"")
  if(!trimmed||/[\0\r\n]/.test(trimmed))
    fail("invalid_secret_format")
  return {password:trimmed,real,device:st.dev,inode:st.ino}
}
const activatePassword=password=>{
  if(typeof password!=="string"||!/^[0-9a-f]{80}$/.test(password))
    fail("independent_high_entropy_secret_required")
  return password
}
// PostgreSQL uses the FIRST matching HBA rule. A later SCRAM host rule is
// insufficient if an earlier local all/all trust permits passwordless socket
// login after the auth role becomes LOGIN. Require an exact local reject or
// SCRAM rule and an exact TCP SCRAM rule as the first matches.
const isSpecific=(array,value)=>Array.isArray(array)&&array.includes(value)
function maybeMatchesDb(values){
  return isSpecific(values,database)||isSpecific(values,"all")||
    isSpecific(values,"samerole")||isSpecific(values,"samegroup")
}
function maybeMatchesUser(values){
  return isSpecific(values,login)||isSpecific(values,"all")||
    (Array.isArray(values)&&values.some(x=>typeof x==="string"&&
      (x.startsWith("+")||x.startsWith("@"))))
}
function ipv4Int(value){
  if(typeof value!=="string")return null
  const chunks=value.split(".")
  if(chunks.length!==4||chunks.some(x=>!/^[0-9]{1,3}$/.test(x)||
     Number(x)>255))return null
  return chunks.reduce((acc,x)=>((acc<<8)>>>0)+Number(x),0)>>>0
}
function couldMatchLoopback(rule){
  if(rule.address==="samehost"||rule.address==="samenet")return true
  if(rule.address==null)return true
  const address=ipv4Int(rule.address),mask=ipv4Int(rule.netmask)
  if(address===null||mask===null){
    // Unrecognized hostname or network rule might match loopback. Fail
    // closed if it precedes our exact guard.
    if(typeof rule.address==="string"&&rule.address.includes(":"))
      return false // IPv6 is not our forced IPv4 127.0.0.1 client
    return true
  }
  const loop=ipv4Int(host)
  return ((address&mask)>>>0)===((loop&mask)>>>0)
}
export function verifyNativeHbaOrder(rows){
  if(!Array.isArray(rows)||rows.some(x=>x.error!==null&&
     x.error!==undefined))return {tcp:false,local:false}
  const ordered=[...rows].sort((a,b)=>Number(a.rule_number)-Number(b.rule_number))
  const applies=r=>maybeMatchesDb(r.database)&&maybeMatchesUser(r.user_name)
  const local=ordered.find(r=>r.type==="local"&&applies(r))
  const tcp=ordered.find(r=>["host","hostnossl"].includes(r.type)&&
    applies(r)&&couldMatchLoopback(r))
  const exact=r=>isSpecific(r?.database,database)&&
    isSpecific(r?.user_name,login)&&
    !r.database.includes("all")&&!r.user_name.includes("all")
  return {
    local:!!local&&exact(local)&&
      ["reject","scram-sha-256"].includes(local.auth_method),
    tcp:!!tcp&&exact(tcp)&&tcp.auth_method==="scram-sha-256"&&
      tcp.address===host&&
      (tcp.netmask==="255.255.255.255"||tcp.netmask==="32"),
  }
}

export function diagnoseNativeSchema(rows){
  const errors=[]
  const state=rows?.state
  if(!state||state.database!==database||
     state.server_address!==host||
     Number(state.port)!==port||
     Number(state.version)<180000||Number(state.version)>=190000||
     state.session_user!=="postgres"||state.superuser!==true)
    errors.push("unexpected_pg18_target")
  if(Number(rows?.base_tables)!==23||Number(rows?.base_force_rls)!==22)
    errors.push("baseline_tables_or_rls_missing")
  if(rows?.vector!=="0.8.7")errors.push("vector_version_mismatch")
  if(rows?.ledger!==true)errors.push("native_auth_migration_not_applied")
  if(Number(rows?.auth_tables)!==2||Number(rows?.auth_force_rls)!==2)
    errors.push("native_auth_tables_or_rls_missing")
  if(rows?.membership!==true||rows?.business_can_auth!==false||
     rows?.worker_can_auth!==false||
     rows?.login_can_business!==false)
    errors.push("native_auth_privilege_boundary_failed")
  if(rows?.group_no_login!==true)errors.push("native_auth_group_unsafe")
  if(rows?.login_no_super!==true)errors.push("native_auth_login_unsafe")
  if(rows?.hba_rule!==true)errors.push("native_auth_hba_rule_missing")
  if(rows?.local_rule_safe!==true)
    errors.push("native_auth_socket_passwordless_risk")
  const already=rows?.activated===true
  if(already)errors.push("native_auth_already_activated")
  if(rows?.login_password_absent!==true)errors.push("native_auth_password_state_unexpected")
  return {ready:errors.length===0,blockers:errors,
    existing_auth_tables:Number(rows?.auth_tables)||0,
    activated:already,production_cutover_allowed:false}
}
async function collectEvidence(db){
  const state=(await db.query(
    "SELECT current_database() AS database,session_user AS session_user,"+
    "host(inet_server_addr()) AS server_address,inet_server_port() AS port,"+
    "current_setting('server_version_num')::integer AS version,"+
    "rolsuper AS superuser FROM pg_roles WHERE rolname=session_user")).rows[0]
  const base=(await db.query(
    "SELECT (SELECT count(*)::integer FROM pg_tables "+
    "WHERE schemaname='agentstudio') AS tables,"+
    "(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n "+
    "ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
    "AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS force_rls,"+
    "(SELECT extversion FROM pg_extension WHERE extname='vector') AS vector,"+
    "(SELECT to_regclass('agentstudio.schema_migrations') IS NOT NULL) AS ledger_table")).rows[0]
  const ledger=base.ledger_table
    ?(await db.query("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations "+
      "WHERE version='pg18_native_auth_001') AS applied")).rows[0].applied
    :false
  const auth=(await db.query(
    "SELECT (SELECT count(*)::integer FROM pg_tables "+
    "WHERE schemaname='agentstudio_auth') AS tables,"+
    "(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n "+
    "ON n.oid=c.relnamespace WHERE n.nspname='agentstudio_auth' "+
    "AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS rls")).rows[0]
  const roles=(await db.query(
    "SELECT "+
    "(SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls "+
    "FROM pg_roles WHERE rolname='agentstudio_native_auth') AS group_safe,"+
    "(SELECT NOT rolsuper AND NOT rolbypassrls "+
    "FROM pg_roles WHERE rolname='agentstudio_native_login') AS login_safe,"+
    "(SELECT rolcanlogin FROM pg_roles "+
    "WHERE rolname='agentstudio_native_login') AS activated,"+
    "(SELECT rolpassword IS NULL FROM pg_authid "+
    "WHERE rolname='agentstudio_native_login') AS password_absent,"+
    "COALESCE(pg_has_role(to_regrole('agentstudio_native_login')::oid,"+
      "to_regrole('agentstudio_native_auth')::oid,'member'),false) AS member,"+
    "COALESCE(pg_has_role(to_regrole('agentstudio_stage_login')::oid,"+
      "to_regrole('agentstudio_native_auth')::oid,'member'),false) AS api_member,"+
    "COALESCE(pg_has_role(to_regrole('agentstudio_stage_worker')::oid,"+
      "to_regrole('agentstudio_native_auth')::oid,'member'),false) AS worker_member,"+
    "COALESCE(pg_has_role(to_regrole('agentstudio_native_login')::oid,"+
      "to_regrole('agentstudio_api')::oid,'member'),false) AS native_api_member")).rows[0]
  // Interpret the full HBA file IN ORDER, not mere presence of a later rule.
  // This prevents an earlier local all all trust from bypassing passwords.
  const rules=(await db.query(
    "SELECT rule_number,type,database,user_name,address,netmask,"+
    "auth_method,error FROM pg_hba_file_rules ORDER BY rule_number")).rows
  const hba=verifyNativeHbaOrder(rules)
  return {
    state,base_tables:base.tables,base_force_rls:base.force_rls,
    vector:base.vector,ledger,auth_tables:auth.tables,
    auth_force_rls:auth.rls,membership:roles.member,
    business_can_auth:roles.api_member,worker_can_auth:roles.worker_member,
    login_can_business:roles.native_api_member,
    group_no_login:roles.group_safe,login_no_super:roles.login_safe,
    activated:roles.activated,login_password_absent:roles.password_absent,
    hba_rule:hba.tcp,local_rule_safe:hba.local
  }
}
// Build a valid PostgreSQL SCRAM verifier CLIENT-SIDE, never transmit the
// clear-text native auth password as a SQL DDL literal (which could be logged).
// PostgreSQL accepts a precomputed SCRAM-SHA-256 verifier as PASSWORD value.
export function makeNativeScramVerifier(password,salt=randomBytes(16),
    iterations=15000){
  activatePassword(password)
  if(!Buffer.isBuffer(salt)||salt.length!==16||
     !Number.isSafeInteger(iterations)||iterations<4096||iterations>200000)
    fail("invalid_scram_parameters")
  const salted=pbkdf2Sync(Buffer.from(password,"utf8"),salt,iterations,32,"sha256")
  const clientKey=createHmac("sha256",salted).update("Client Key").digest()
  const stored=createHash("sha256").update(clientKey).digest()
  const server=createHmac("sha256",salted).update("Server Key").digest()
  return "SCRAM-SHA-256$"+iterations+":"+salt.toString("base64")+"$"+
    stored.toString("base64")+":"+server.toString("base64")
}

// Injectable read-only SQL probe for embedded PostgreSQL parity tests.
export {collectEvidence as collectNativeActivationEvidenceForTest}

export async function runNativeActivation(argv,env=process.env){
  const cfg=parseNativeActivation(argv,env)
  if(cfg.mode==="plan")return cfg
  const admin=outsideRepo(cfg.adminFile)
  const native=cfg.mode==="activate"?outsideRepo(cfg.serviceFile):null
  if(native){
    activatePassword(native.password)
    if(native.device===admin.device&&native.inode===admin.inode)
      fail("independent_secret_file_required")
    if(native.password===admin.password)
      fail("independent_secret_file_required")
  }
  const {Pool}=await import("pg")
  const pool=new Pool({host,port,database,user:"postgres",
    password:admin.password,max:1,ssl:false,
    connectionTimeoutMillis:4000,statement_timeout:9000})
  try{
    const client=await pool.connect()
    try{
      const rows=await collectEvidence(client)
      const report=diagnoseNativeSchema(rows)
      if(cfg.mode==="preflight"){
        return {mode:cfg.mode,...report,target:database,auth_login:login,
          network_used:true,writes_performed:false}
      }
      if(!report.ready)fail("native_auth_preflight_not_ready")
      // Never interpolate plaintext passwords into DDL or SQL logs. The
      // locally computed SCRAM verifier is a single syntactically validated
      // ASCII token; no secret plaintext is transmitted as SQL text.
      await client.query("BEGIN")
      let committed=false
      try{
        await client.query("SELECT pg_advisory_xact_lock(61824,20261015)")
        await client.query("SET LOCAL password_encryption='scram-sha-256'")
        // Compare catalog state again under the activation lock.
        const checked=await collectEvidence(client)
        if(!diagnoseNativeSchema(checked).ready)
          fail("native_auth_activation_race")
        const verifier=makeNativeScramVerifier(native.password)
        if(!/^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier))
          fail("invalid_scram_parameters")
        await client.query(
          "ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+verifier+"'")
        const check=(await client.query(
          "SELECT rolcanlogin,rolpassword LIKE 'SCRAM-SHA-256$%' AS scram "+
          "FROM pg_authid WHERE rolname='agentstudio_native_login'")).rows[0]
        if(check?.rolcanlogin!==true||check.scram!==true)
          fail("native_auth_scram_not_verified")
        await client.query("COMMIT")
        committed=true
      }finally{if(!committed)await client.query("ROLLBACK").catch(()=>undefined)}
      return {mode:"activate",target:database,activated:true,
        scram_verified:true,production_cutover_allowed:false,
        workers_started:false}
    }finally{client.release()}
  }finally{await pool.end()}
}
export async function main(argv){
  try{const result=await runNativeActivation(argv)
    process.stdout.write(JSON.stringify(result)+"\n")
    if(result.ready===false)process.exitCode=2
  }catch(error){
    const known=new Set(["invalid_activation_arguments","activation_disabled",
      "activation_write_not_approved","private_secret_file_required",
      "invalid_secret_format","independent_high_entropy_secret_required",
      "independent_secret_file_required","native_auth_preflight_not_ready",
      "native_auth_activation_race","native_auth_scram_not_verified"])
    known.add("invalid_scram_parameters")
    const code=error instanceof Error&&known.has(error.message)
      ?error.message:"native_auth_activation_refused"
    process.stderr.write("PG18_NATIVE_AUTH_ACTIVATION_REFUSED:"+code+"\n")
    process.exitCode=1
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  void main(process.argv.slice(2))
