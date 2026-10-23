// Administrative metadata audit. Does not lease jobs or read employee payloads.
import type {SqlClient} from "./contracts.ts"
import {captureFreshRuntimeSources,freshRuntimeRoles} from "./pg18-fresh-runtime-source.mjs"
import {verifyRuntimeSchemaReceipt} from "./pg18-fresh-runtime-install.ts"
import {serviceLoginDefinition,serviceLoginKinds,serviceLogins,serviceLoginReceiptVersion,serviceLoginTargetGuardSql,type ServiceLoginKind} from "./pg18-service-login-policy.mjs"
import {verifyKnowledgeHelperCredentials} from "./knowledge-content-privileges.ts"
import {matchesServiceScram,serviceLoginVerifier,validateServiceLoginPassword} from "./pg18-service-login-secrets.mjs"
type Snapshot=ReturnType<typeof captureFreshRuntimeSources>
type Role={name:string;login:boolean;safe:boolean;has_password:boolean;scram:boolean}
function refuse():never{throw Error("unsafe_service_login_catalog")}
const nativeLogin="agentstudio_native_login"
export async function inspectPreparedServiceLogins(db:SqlClient,snapshot:Snapshot){
  const {serviceReceipts}=await verifyRuntimeSchemaReceipt(db,snapshot,true,true)
  const definitions=serviceLoginKinds.map(k=>serviceLogins[k]),accountNames=[nativeLogin,...definitions.map(d=>d.login)]
  const names=[...new Set([...freshRuntimeRoles,...accountNames])]
  const rows=(await db.query<Role>("SELECT r.rolname AS name,r.rolcanlogin AS login,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND "+
    "NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe,"+
    "a.rolpassword IS NOT NULL AS has_password,coalesce(a.rolpassword LIKE 'SCRAM-SHA-256$%',false) AS scram "+
    "FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_authid a ON a.oid=r.oid WHERE r.rolname=ANY($1::text[])",[names])).rows
  const roles=new Map(rows.map(r=>[r.name,r]))
  if(freshRuntimeRoles.some(name=>!roles.has(name))||rows.some(r=>!r.safe||!accountNames.includes(r.name)&&(r.login||r.has_password)||r.has_password&&!r.scram))refuse()
  const native=roles.get(nativeLogin)
  if(!native?.login||!native.scram)throw Error("native_auth_activation_required_first")
  const expected=[nativeLogin+":agentstudio_native_auth"]
  for(const def of definitions)if(roles.has(def.login)&&(["api","worker"].includes(def.kind)||roles.get(def.login)?.login||serviceReceipts.some(r=>r.kind===def.kind)))
    expected.push(...def.groups.map(g=>def.login+":"+g))
  const membershipRows=(await db.query<{child:string;parent:string;safe:boolean}>("SELECT c.rolname AS child,p.rolname AS parent,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles c ON c.oid=m.member "+
    "JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE c.rolname=ANY($1::text[]) OR p.rolname=ANY($1::text[]) ORDER BY c.rolname,p.rolname",[names])).rows
  if(membershipRows.some(r=>!r.safe)||JSON.stringify(membershipRows.map(r=>r.child+":"+r.parent))!==JSON.stringify(expected.sort()))refuse()
  for(const def of [...definitions,{kind:"native",login:nativeLogin,groups:["agentstudio_native_auth"]}]){
    const role=roles.get(def.login),receipt=serviceReceipts.find(r=>r.kind===def.kind)
    if(def.kind!=="native"&&(receipt&&(!role?.login||!role.scram)||role?.login&&!receipt))refuse()
    if(!role)continue
    // NOINHERIT accounts receive CONNECT and membership only. All business
    // access must require an explicit switch to the reviewed group role.
    const direct=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','S') AND "+
      "(c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'SELECT,UPDATE,USAGE') ELSE "+
      "has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND "+
      "(p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "+
      "WHERE a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)))) AND "+
      "NOT has_schema_privilege($1,'agentstudio','USAGE,CREATE') AND NOT has_schema_privilege($1,'agentstudio_auth','USAGE,CREATE') AND "+
      "has_database_privilege($1,current_database(),'CONNECT') AND NOT has_database_privilege($1,current_database(),'CREATE') AS ok",[def.login])).rows[0]
    if(!direct?.ok)refuse()
  }
  const admin=(await db.query<{ready:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id "+
    "WHERE a.enabled AND a.is_admin AND u.status='active' AND u.external_issuer='urn:agentstudio:local:v1') AS ready")).rows[0]
  if(!admin?.ready)throw Error("first_native_admin_required")
  for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_bound_dispatch","agentstudio_native_auth"]){
    const denied=(await db.query<{ok:boolean}>("SELECT NOT has_column_privilege($1,'agentstudio.model_connections','api_key_ciphertext','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.model_connections','api_key_nonce','SELECT') AND NOT has_column_privilege($1,'agentstudio.model_connections','api_key_tag','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_ciphertext','SELECT') AND NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_nonce','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_tag','SELECT') AS ok",[role])).rows[0]
    if(!denied?.ok)refuse()
  }
  await db.query("SET LOCAL ROLE agentstudio_api")
  try{await verifyKnowledgeHelperCredentials(db)}finally{await db.query("RESET ROLE")}
  return {roles,receipts:serviceReceipts}
}
export async function reservePreparedServiceLogin(db:SqlClient,kind:ServiceLoginKind,snapshot:Snapshot){
  await db.query(serviceLoginTargetGuardSql)
  const def=serviceLoginDefinition(kind),before=await inspectPreparedServiceLogins(db,snapshot)
  if(before.receipts.some(r=>r.kind===kind))throw Error("service_login_already_activated")
  if(before.roles.has(def.login))return {created:false,login:def.login}
  await db.query("CREATE ROLE "+def.login+" NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION")
  // Reserve optional accounts without memberships. Startup audits require
  // members of the index roles to be enabled logins, so membership and LOGIN
  // are installed atomically with the activation receipt, never in reserve.
  await db.query("GRANT CONNECT ON DATABASE agent_studio TO "+def.login)
  await inspectPreparedServiceLogins(db,snapshot)
  return {created:true,login:def.login}
}
export async function activatePreparedServiceLogin(db:SqlClient,kind:ServiceLoginKind,snapshot:Snapshot,password:string){
  await db.query(serviceLoginTargetGuardSql)
  validateServiceLoginPassword(password)
  const def=serviceLoginDefinition(kind),before=await inspectPreparedServiceLogins(db,snapshot)
  if(before.receipts.some(r=>r.kind===kind)||before.roles.get(def.login)?.login)throw Error("service_login_already_activated")
  if(!before.roles.has(def.login))throw Error("service_login_not_reserved")
  const otherNames=["agentstudio_native_login",...serviceLoginKinds.map(k=>serviceLogins[k].login)].filter(name=>name!==def.login)
  const hashes=(await db.query<{verifier:string}>("SELECT rolpassword AS verifier FROM pg_catalog.pg_authid WHERE rolname=ANY($1::text[]) AND rolpassword IS NOT NULL",[otherNames])).rows
  if(hashes.some(row=>matchesServiceScram(password,row.verifier)))throw Error("service_login_password_reused")
  const verifier=serviceLoginVerifier(password)
  if(!["api","worker"].includes(kind))await db.query("GRANT "+def.groups.join(",")+" TO "+def.login)
  await db.query("ALTER ROLE "+def.login+" LOGIN PASSWORD '"+verifier+"'")
  const clock=(await db.query<{now:Date|string}>("SELECT clock_timestamp() AS now")).rows[0]
  if(!clock)refuse()
  const body={format:"pg18_service_login_activation_v1",kind,login:def.login,groups:def.groups,source_sha256:snapshot.source_sha256,
    operator:"postgres",activated_at:new Date(clock.now).toISOString()}
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)",[serviceLoginReceiptVersion(kind),JSON.stringify(body)])
  await inspectPreparedServiceLogins(db,snapshot)
  return {login:def.login,activated:true,scram_verified:true,activation_receipt:serviceLoginReceiptVersion(kind),services_started:false,production_cutover_allowed:false}
}
