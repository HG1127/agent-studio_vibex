import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyKnowledgeEmbeddingCredentials} from "./knowledge-embedding-privileges.ts"
import {verifyKnowledgeKeywordCredentials} from "./knowledge-keyword-audit.ts"
import {verifyKnowledgeAgentCredentials} from "./knowledge-agent-audit.ts"
const helpers=["agentstudio_knowledge_acl","agentstudio_knowledge_content"]
function refuse():never{throw Error("unsafe_knowledge_content_privileges")}
// Also called by the ordinary startup inspector when the UI capability is off.
// No employee values are read and private schemas need no login USAGE.
export async function verifyKnowledgeHelperCredentials(db:SqlClient):Promise<void>{
  await verifyKnowledgeEmbeddingCredentials(db)
  const roles=(await db.query<{name:string;safe:boolean;members:number}>("SELECT rolname AS name,(NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS members "+
    "FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[])",[helpers])).rows
  if(!roles.length)return
  if(roles.some(role=>!role.safe||role.members!==0))refuse()
  const tables=(await db.query<{id:number;schema:string;name:string}>("SELECT c.oid AS id,n.nspname AS schema,c.relname AS name "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE "+
    "(n.nspname='agentstudio' AND c.relname IN ('model_connections','tool_connection_headers','mcp_connection_headers','smithery_credentials')) "+
    "OR (n.nspname='agentstudio_auth' AND c.relname IN ('accounts','sessions'))")).rows
  for(const role of roles)for(const table of tables){
    const predicate=role.name===helpers[0]&&table.schema==="agentstudio_auth"&&table.name==="accounts"
    const state=(await db.query<{read:boolean;write:boolean}>("SELECT has_any_column_privilege($1::text,$2::oid,'SELECT') AS read,"+
      "(has_table_privilege($1::text,$2::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR "+
      "has_any_column_privilege($1::text,$2::oid,'INSERT,UPDATE,REFERENCES')) AS write",[role.name,table.id])).rows[0]
    if(!state||state.write||(!predicate&&state.read))refuse()
    if(predicate){
      const columns=(await db.query<{name:string;read:boolean}>("SELECT attname AS name,has_column_privilege($1::text,attrelid,attnum,'SELECT') AS read "+
        "FROM pg_catalog.pg_attribute WHERE attrelid=$2::oid AND attnum>0 AND NOT attisdropped",[role.name,table.id])).rows
      if(!columns.some(c=>c.name==="user_id"&&c.read)||!columns.some(c=>c.name==="enabled"&&c.read)||
        columns.some(c=>!["user_id","enabled"].includes(c.name)&&c.read))refuse()
    }
  }
}
const functions=[
  ["knowledge_employee_active(uuid)",helpers[0],false],
  ["knowledge_access_mode(uuid)",helpers[0],true],
  ["knowledge_share_recipient_active(uuid,uuid)",helpers[0],true],
  ["knowledge_shared_bases()",helpers[0],true],["knowledge_owner_grants(uuid)",helpers[0],true],
  ["knowledge_content_metadata(uuid)",helpers[1],true],["knowledge_content_documents(uuid)",helpers[1],true],
  ["knowledge_content_search(uuid,text,integer)",helpers[1],true],["knowledge_content_receipt(uuid,uuid)",helpers[1],true],
  ["knowledge_content_import(uuid,uuid,text,text,text)",helpers[1],true],["knowledge_content_delete(uuid,uuid,uuid,text)",helpers[1],true],
] as const
const runtimeFunctions=[
  ["knowledge_runtime_scope(uuid[])",helpers[1],true],
  ["knowledge_runtime_search(uuid,text)",helpers[1],true],
] as const
export async function verifyKnowledgeContentSchema(pool:SqlPool):Promise<void>{
  return verifySchema(pool,false)
}
export async function verifyKnowledgeRuntimeSchema(pool:SqlPool,requireKeywordObservations=false):Promise<void>{
  return verifySchema(pool,true,requireKeywordObservations)
}
export async function verifyKnowledgeAgentSchema(pool:SqlPool):Promise<void>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE agentstudio_api")
      if(!await verifyKnowledgeAgentCredentials(db)||
        (await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_042') AS ok")).rows[0]?.ok!==true)
        throw Error("agent_observation_schema_required")
      await verifyKnowledgeHelperCredentials(db)
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
async function verifySchema(pool:SqlPool,runtime:boolean,requireKeywordObservations=false):Promise<void>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE agentstudio_api")
      if(requireKeywordObservations&&(!await verifyKnowledgeKeywordCredentials(db)||
        (await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_041') AS ok")).rows[0]?.ok!==true))throw Error("keyword_observation_schema_required")
      const roles=(await db.query<{name:string;safe:boolean;members:number}>("SELECT rolname AS name,(NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls "+
        "AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) AS safe,"+
        "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid) AS members "+
        "FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[])",[helpers])).rows
      if(roles.length!==2||roles.some(role=>!role.safe||role.members!==0))refuse()
      await verifyKnowledgeHelperCredentials(db)
      const tables=(await db.query<{safe:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS safe "+
        "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
        "AND c.relname IN ('knowledge_access','knowledge_access_receipts','knowledge_content_receipts','knowledge_bases','knowledge_documents','knowledge_chunks')")).rows
      if(tables.length!==6||tables.some(row=>!row.safe))refuse()
      for(const [signature,owner,api] of runtime?[...functions,...runtimeFunctions]:functions){
        const row=(await db.query<{safe:boolean;config:string[];owner:string;api:boolean;others:boolean}>("SELECT p.prosecdef AS safe,p.proconfig AS config,r.rolname AS owner,"+
          "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,"+
          "(has_function_privilege('agentstudio_worker',p.oid,'EXECUTE') OR has_function_privilege('agentstudio_model_broker',p.oid,'EXECUTE') OR "+
          "has_function_privilege('agentstudio_bound_dispatch',p.oid,'EXECUTE')) AS others "+
          "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1::text)",["agentstudio."+signature])).rows[0]
        if(!row||!row.safe||row.owner!==owner||row.api!==api||row.others||row.config?.length!==1||row.config[0]!=="search_path=pg_catalog")refuse()
      }
      for(const column of ["embedding","embedding_model"]){
        const row=(await db.query<{unsafe:boolean}>("SELECT (has_column_privilege('agentstudio_knowledge_content','agentstudio.knowledge_chunks',$1::text,'SELECT,INSERT,UPDATE,REFERENCES') OR "+
          "has_any_column_privilege('agentstudio_knowledge_acl','agentstudio.knowledge_chunks','SELECT,INSERT,UPDATE,REFERENCES')) AS unsafe",[column])).rows[0]
        if(!row||row.unsafe)refuse()
      }
      const object=(await db.query<{unsafe:boolean}>("SELECT has_column_privilege('agentstudio_knowledge_content','agentstudio.knowledge_documents','object_key','SELECT') AS unsafe")).rows[0]
      if(!object||object.unsafe)refuse()
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
