// Read-only checks for each independent login used by the private Broker.
import type {SqlPool} from "./contracts.ts"
import {verifyPgRuntimeTarget,type PgRuntimeTarget} from "./pg-runtime-target.ts"
export type BoundDispatchRole="api"|"identity"|"broker"
const groups={api:"agentstudio_api",identity:"agentstudio_bound_dispatch",broker:"agentstudio_model_broker"}
const logins={api:"agentstudio_stage_login",identity:"agentstudio_bound_dispatch_login",broker:"agentstudio_model_broker_login"}
const protectedTables=["users","agent_specs","runs","jobs","approvals",
  "external_effects","model_connections","tool_connections","tool_connection_headers"]
function refuse():never{throw Error("unsafe_bound_dispatch_database_role")}
export async function verifyBoundDispatchRole(
  pool:SqlPool,target:PgRuntimeTarget,kind:BoundDispatchRole,
):Promise<void>{
  if(!Object.hasOwn(groups,kind)||target.mode!=="baota_pg18")refuse()
  await verifyPgRuntimeTarget(pool,{...target,user:logins[kind]})
  await verifyBoundDispatchPrivileges(pool,kind)
}

// Read-only privilege inspection, independently testable on disposable PG18.
// This does not attest a deployment target. Production startup must call the
// complete verifyBoundDispatchRole wrapper above, including target checks.
export async function verifyBoundDispatchPrivileges(
  pool:SqlPool,kind:BoundDispatchRole,
):Promise<void>{
  if(!Object.hasOwn(groups,kind))refuse()
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN READ ONLY");begun=true
    const attributes=await db.query<{
      name:string;login:boolean;inherit:boolean;createRole:boolean;createDb:boolean;replication:boolean;
      superuser:boolean;bypass:boolean
    }>("SELECT rolname AS name,rolcanlogin AS login,rolinherit AS inherit,rolcreaterole AS \"createRole\","+
      "rolsuper AS superuser,rolbypassrls AS bypass,"+
      "rolcreatedb AS \"createDb\",rolreplication AS replication "+
      "FROM pg_roles WHERE rolname=session_user")
    const a=attributes.rows[0]
    if(!a||a.name!==logins[kind]||a.superuser!==false||a.bypass!==false||
       a.login!==true||a.inherit!==false||a.createRole!==false||
       a.createDb!==false||a.replication!==false)refuse()
    const memberships=await db.query<{name:string}>(
      "SELECT rolname AS name FROM pg_roles WHERE rolname<>session_user "+
      "AND pg_has_role(session_user,oid,'member')")
    // Reject every extra membership, including built-in file/program roles.
    if(memberships.rows.length!==1||memberships.rows[0]?.name!==groups[kind])refuse()
    // Group names are fixed constants, never request/environment input.
    await db.query("SET LOCAL ROLE "+groups[kind])
    const effective=await db.query<{
      login:boolean;inherit:boolean;superuser:boolean;bypass:boolean;
      createRole:boolean;createDb:boolean;replication:boolean
    }>("SELECT rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,"+
      "rolbypassrls AS bypass,rolcreaterole AS \"createRole\","+
      "rolcreatedb AS \"createDb\",rolreplication AS replication "+
      "FROM pg_roles WHERE rolname=current_user")
    const e=effective.rows[0]
    if(!e||e.login!==false||e.inherit!==false||e.superuser!==false||e.bypass!==false||
       e.createRole!==false||e.createDb!==false||e.replication!==false)refuse()
    const rls=await db.query<{name:string;enabled:boolean;forced:boolean}>(
      "SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced "+
      "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' AND c.relname=ANY($1::text[])",
      [protectedTables])
    if(rls.rows.length!==protectedTables.length||rls.rows.some(r=>
      !protectedTables.includes(r.name)||r.enabled!==true||r.forced!==true))refuse()
    const privilege=await db.query<{
      role:string;modelSecret:boolean;toolSecret:boolean;runBody:boolean;
      modelWrite:boolean;resolveLease:boolean;authAccess:boolean;
      identityDefiner:boolean;identityConfig:string[]|null;identityVolatile:string
    }>("SELECT current_user AS role,"+
      "has_column_privilege(current_user,m.oid,'api_key_ciphertext','SELECT') AS \"modelSecret\","+
      "has_column_privilege(current_user,t.oid,'value_ciphertext','SELECT') AS \"toolSecret\","+
      "has_column_privilege(current_user,r.oid,'instruction','SELECT') AS \"runBody\","+
      "has_table_privilege(current_user,m.oid,'UPDATE') AS \"modelWrite\","+
      "has_function_privilege(current_user,p.oid,'EXECUTE') AS \"resolveLease\","+
      "p.prosecdef AS \"identityDefiner\",p.proconfig AS \"identityConfig\","+
      "p.provolatile AS \"identityVolatile\","+
      "has_schema_privilege(current_user,'agentstudio_auth','USAGE') AS \"authAccess\" "+
      "FROM pg_namespace n JOIN pg_class m ON m.relnamespace=n.oid AND m.relname='model_connections' "+
      "JOIN pg_class t ON t.relnamespace=n.oid AND t.relname='tool_connection_headers' "+
      "JOIN pg_class r ON r.relnamespace=n.oid AND r.relname='runs' "+
      "JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname='bound_model_lease_identity' AND p.pronargs=5 "+
      "WHERE n.nspname='agentstudio'")
    const p=privilege.rows[0]
    if(privilege.rows.length!==1||!p||p.role!==groups[kind]||p.authAccess!==false||
       p.identityDefiner!==true||p.identityVolatile!=="v"||
       !Array.isArray(p.identityConfig)||!p.identityConfig.some(value=>
         value.replace(/\s/g,"")==="search_path=pg_catalog,agentstudio")||
       p.modelSecret!==(kind==="broker")||p.toolSecret!==(kind==="broker")||
       p.runBody!==(kind==="api")||p.modelWrite!==(kind==="api")||
       p.resolveLease!==(kind==="identity"))refuse()
  }catch{refuse()}
  finally{
    let rollbackFailed=false
    if(begun)try{await db.query("ROLLBACK")}catch{rollbackFailed=true}
    db.release()
    if(rollbackFailed)refuse()
  }
}

// Optional V2 extension. The original role boundary must pass first.
export async function verifyWorkflowModelIdentityPrivileges(pool:SqlPool,kind:BoundDispatchRole):Promise<void>{
  return verifyWorkflowEffectIdentityPrivileges(pool,kind,"model")
}
export async function verifyWorkflowEffectIdentityPrivileges(pool:SqlPool,kind:BoundDispatchRole,effect:"model"|"tool"|"agent_model"|"agent_tool"):Promise<void>{
  if(!["model","tool","agent_model","agent_tool"].includes(effect))refuse()
  if(!Object.hasOwn(groups,kind))refuse()
  const db=await pool.connect();let begun=false
  try{
    await db.query("BEGIN READ ONLY");begun=true;await db.query("SET LOCAL ROLE "+groups[kind])
    const rows=(await db.query<{definer:boolean;config:string[];volatile:string;can:boolean;public:boolean;api:boolean;worker:boolean;broker:boolean}>(
      "SELECT p.prosecdef AS definer,p.proconfig AS config,p.provolatile AS volatile,"+
      "has_function_privilege(current_user,p.oid,'EXECUTE') AS can,"+
      "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,"+
      "has_function_privilege('agentstudio_worker',p.oid,'EXECUTE') AS worker,"+
      "has_function_privilege('agentstudio_model_broker',p.oid,'EXECUTE') AS broker,"+
      "EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "+
      "WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public FROM pg_proc p "+
      "WHERE p.oid=to_regprocedure($1::text)",["agentstudio.workflow_"+effect+"_lease_identity(uuid,uuid,uuid,bigint,text,text,text"+(effect.startsWith("agent_")?",text":"")+")"])).rows
    const row=rows[0]
    if(rows.length!==1||!row||!row.definer||row.volatile!=="v"||row.can!==(kind==="identity")||
       row.public!==false||row.api!==false||row.worker!==false||row.broker!==false||
       !Array.isArray(row.config)||!row.config.some(value=>value.replace(/\s/g,"")==="search_path=pg_catalog,agentstudio"))refuse()
    if(effect!=="model"){
      const constraints=(await db.query<{valid:boolean;definition:string}>("SELECT convalidated AS valid,pg_get_constraintdef(oid) AS definition "+
        "FROM pg_constraint WHERE conrelid=to_regclass('agentstudio.external_effects') AND conname='external_effects_status_check' AND contype='c'")).rows
      if(constraints.length!==1||constraints[0]?.valid!==true||!/'failed'::text/.test(constraints[0].definition))refuse()
    }
  }catch{refuse()}
  finally{let failed=false;if(begun)try{await db.query("ROLLBACK")}catch{failed=true};db.release();if(failed)refuse()}
}
