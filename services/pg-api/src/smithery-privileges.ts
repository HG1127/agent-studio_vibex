import type {SqlPool} from "./contracts.ts"
export async function verifySmitheryPrivileges(api:SqlPool,broker:SqlPool):Promise<void>{
  for(const [pool,role] of [[api,"agentstudio_api"],[broker,"agentstudio_model_broker"]] as const){
    const db=await pool.connect()
    try{
      await db.query("BEGIN READ ONLY")
      try{
        await db.query("SET LOCAL ROLE "+role)
        const row=(await db.query<{readable:boolean;writable:boolean;map_readable:boolean;map_writable:boolean;worker_access:boolean;rls:number}>("SELECT "+
          "has_column_privilege(current_user,'agentstudio.smithery_credentials','api_key_ciphertext','SELECT') AS readable,"+
          "has_table_privilege(current_user,'agentstudio.smithery_credentials','INSERT,UPDATE,DELETE') AS writable,"+
          "has_table_privilege(current_user,'agentstudio.smithery_connections','SELECT') AS map_readable,"+
          "has_table_privilege(current_user,'agentstudio.smithery_connections','INSERT,UPDATE,DELETE') AS map_writable,"+
          "(has_table_privilege('agentstudio_worker','agentstudio.smithery_credentials','SELECT,INSERT,UPDATE,DELETE') OR "+
          "has_table_privilege('agentstudio_worker','agentstudio.smithery_connections','SELECT,INSERT,UPDATE,DELETE') OR "+
          "has_any_column_privilege('agentstudio_worker','agentstudio.smithery_credentials','SELECT,INSERT,UPDATE') OR "+
          "has_any_column_privilege('agentstudio_worker','agentstudio.smithery_connections','SELECT,INSERT,UPDATE')) AS worker_access,"+
          "(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
          "AND c.relname IN ('smithery_credentials','smithery_connections') AND c.relrowsecurity AND c.relforcerowsecurity) AS rls")).rows[0]
        const ordinary=role==="agentstudio_api"
        if(!row||row.rls!==2||row.readable===ordinary||row.writable!==ordinary||row.map_readable!==ordinary||row.map_writable!==ordinary||row.worker_access)
          throw Error("unsafe_smithery_privileges")
      }finally{await db.query("ROLLBACK")}
    }finally{db.release()}
  }
}
