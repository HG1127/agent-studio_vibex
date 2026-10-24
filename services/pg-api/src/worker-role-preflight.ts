// Shared PostgreSQL Worker role preflight.
// Pure database SELECT queries and READ ONLY role-change transactions.
// No job leasing, DML, model/tool calls, or application side effects.
import type {SqlPool} from "./contracts.ts"
import type {PgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyOptionalCredentialBoundary} from "./optional-credential-boundary.ts"

function refuse():never{throw Error("unsafe_pg_worker_role_boundary")}

export async function verifyPgWorkerRoleBoundary(
  pool:SqlPool,target:PgRuntimeTarget,
):Promise<void>{
  const connection=await pool.connect()
  let inTransaction=false
  try{
    const rows=await connection.query<{
      login:string;superuser:boolean;bypassrls:boolean
      canLogin:boolean;createRole:boolean;inherits:boolean
    }>(
      "SELECT session_user AS login,rolsuper AS superuser,"+
      "rolbypassrls AS bypassrls,rolcanlogin AS \"canLogin\","+
      "rolcreaterole AS \"createRole\",rolinherit AS inherits "+
      "FROM pg_roles WHERE rolname=session_user",
    )
    const role=rows.rows[0]
    if(!role||role.login!==target.user||
       role.login!=="agentstudio_stage_worker"||
       role.superuser!==false||role.bypassrls!==false||
       role.canLogin!==true||role.createRole!==false||
       role.inherits!==false)refuse()

    if(target.mode==="baota_pg18"){
      const grants=await connection.query<{
        workerCanSeeJobs:boolean;workerCanUpdateStatus:boolean
        workerCanReadExternalEffects:boolean
        workerCanReadRunInstructions:boolean;workerCanReadAgentSpecs:boolean
        workerCanReadAuthAccounts:boolean;workerCanUseAuthSchema:boolean
        loginCanJoinNativeAuth:boolean
        workerLoginCanJoinApi:boolean
        workerLoginCanJoinBroker:boolean
        apiRoleCanReadModelCiphertext:boolean
        workerLoginCanReadModelCiphertext:boolean
        apiRoleCanReadToolHeaderCiphertext:boolean
        workerLoginCanReadToolHeaderCiphertext:boolean
      }>(
        // An unprivileged NOINHERIT login must not resolve protected
        // relation names via regclass: doing so throws schema 42501 before
        // privilege checks. Resolve relation OIDs from public pg_catalog
        // metadata instead; no private table contents are selected.
        "WITH rels AS ("+
        "SELECT "+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='jobs') AS jobs,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='external_effects') AS effects,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='runs') AS runs,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='agent_specs') AS specs,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='model_connections') AS model_conn,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio' "+
            "AND c.relname='tool_connection_headers') AS tool_headers,"+
          "max(c.oid) FILTER(WHERE n.nspname='agentstudio_auth' "+
            "AND c.relname='accounts') AS auth "+
        "FROM pg_catalog.pg_class c "+
        "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace) "+
        "SELECT "+
        "has_table_privilege('agentstudio_worker',rels.jobs,'SELECT') "+
          "AS \"workerCanSeeJobs\","+
        "has_column_privilege('agentstudio_worker',rels.jobs,"+
          "'status','UPDATE') AS \"workerCanUpdateStatus\","+
        "has_column_privilege('agentstudio_worker',rels.effects,"+
          "'status','SELECT') AS \"workerCanReadExternalEffects\","+
        "has_column_privilege('agentstudio_worker',rels.runs,"+
          "'instruction','SELECT') AS \"workerCanReadRunInstructions\","+
        "has_table_privilege('agentstudio_worker',rels.specs,'SELECT') "+
          "AS \"workerCanReadAgentSpecs\","+
        "has_table_privilege('agentstudio_worker',rels.auth,'SELECT') "+
          "AS \"workerCanReadAuthAccounts\","+
        "has_schema_privilege('agentstudio_worker',"+
          "'agentstudio_auth','USAGE') AS \"workerCanUseAuthSchema\","+
        "pg_has_role(session_user,'agentstudio_native_auth','member') "+
          "AS \"loginCanJoinNativeAuth\","+
        "pg_has_role(session_user,'agentstudio_api','member') "+
          "AS \"workerLoginCanJoinApi\","+
        "pg_has_role(session_user,'agentstudio_model_broker','member') "+
          "AS \"workerLoginCanJoinBroker\","+
        "has_column_privilege('agentstudio_api',rels.model_conn,"+
          "'api_key_ciphertext','SELECT') AS \"apiRoleCanReadModelCiphertext\","+
        "has_column_privilege(session_user,rels.model_conn,"+
          "'api_key_ciphertext','SELECT') AS \"workerLoginCanReadModelCiphertext\","+
        "has_column_privilege('agentstudio_api',rels.tool_headers,"+
          "'value_ciphertext','SELECT') AS \"apiRoleCanReadToolHeaderCiphertext\","+
        "has_column_privilege(session_user,rels.tool_headers,"+
          "'value_ciphertext','SELECT') AS \"workerLoginCanReadToolHeaderCiphertext\" "+
        "FROM rels",
      )
      const perm=grants.rows[0]
      if(!perm||perm.workerCanSeeJobs!==true||
         perm.workerCanUpdateStatus!==true||
         perm.workerCanReadExternalEffects!==true||
         perm.workerCanReadRunInstructions!==false||
         perm.workerCanReadAgentSpecs!==false||
         perm.workerCanReadAuthAccounts!==false||
         perm.workerCanUseAuthSchema!==false||
          perm.loginCanJoinNativeAuth!==false||
          perm.workerLoginCanJoinApi!==true||
          perm.workerLoginCanJoinBroker!==false||
          perm.apiRoleCanReadModelCiphertext!==false||
          perm.workerLoginCanReadModelCiphertext!==false||
          perm.apiRoleCanReadToolHeaderCiphertext!==false||
          perm.workerLoginCanReadToolHeaderCiphertext!==false)refuse()    }

    // Prove that each required role switch succeeds under READ ONLY.
    // Rollback releases the role immediately on reused connections.
    for(const expected of ["agentstudio_worker","agentstudio_api"]){
      await connection.query("BEGIN READ ONLY")
      inTransaction=true
      try{
        await connection.query("SET LOCAL ROLE "+expected)
        const current=await connection.query<{role:string}>(
          "SELECT current_user AS role",
        )
        if(current.rows[0]?.role!==expected)refuse()
        if(target.mode==="baota_pg18"&&expected==="agentstudio_api"){
          try{await verifyOptionalCredentialBoundary(connection,"worker")}catch{refuse()}
        }
      }finally{
        await connection.query("ROLLBACK")
        inTransaction=false
      }
    }
  }finally{
    if(inTransaction)
      await connection.query("ROLLBACK").catch(()=>undefined)
    connection.release()
  }
}
