import type {SqlPool} from "./contracts.ts"
// Only when explicit discovery is enabled; no writes, sockets or credentials.
export async function verifyMcpDiscoveryPrivileges(api:SqlPool,broker:SqlPool):Promise<void>{
  for(const [pool,role] of [[api,"agentstudio_api"],[broker,"agentstudio_model_broker"]] as const){
    const db=await pool.connect()
    try{
      await db.query("BEGIN READ ONLY")
      try{
        await db.query("SET LOCAL ROLE "+role)
        const row=(await db.query<{readable:boolean;writable:boolean;worker_readable:boolean;worker_writable:boolean;rls:number}>("SELECT "+
          "has_column_privilege(current_user,'agentstudio.mcp_connection_headers','value_ciphertext','SELECT') AS readable,"+
          "has_table_privilege(current_user,'agentstudio.mcp_connection_headers','INSERT,UPDATE,DELETE') AS writable,"+
          "has_column_privilege('agentstudio_worker','agentstudio.mcp_connection_headers','value_ciphertext','SELECT') AS worker_readable,"+
          "has_table_privilege('agentstudio_worker','agentstudio.mcp_connection_headers','INSERT,UPDATE,DELETE') AS worker_writable,"+
          "(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
          "AND c.relname IN ('mcp_connections','mcp_connection_headers') AND c.relrowsecurity AND c.relforcerowsecurity) AS rls")).rows[0]
        if(!row||row.rls!==2||row.worker_readable||row.worker_writable||row.readable!==(role==="agentstudio_model_broker")||row.writable!==(role==="agentstudio_api"))throw Error("unsafe_mcp_discovery_privileges")
      }finally{await db.query("ROLLBACK")}
    }finally{db.release()}
  }
}
export async function verifyMcpExecutionSchema(pool:SqlPool):Promise<void>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE agentstudio_api")
      const row=(await db.query<{definition:string}>("SELECT pg_get_functiondef(to_regprocedure('agentstudio.workflow_tool_lease_identity(uuid,uuid,uuid,bigint,text,text,text)')) AS definition")).rows[0]
      if(typeof row?.definition!=="string"||!row.definition.includes("mcp_binding"))throw Error("mcp_execution_schema_not_ready")
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
