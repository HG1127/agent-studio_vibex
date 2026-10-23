import type {SqlPool} from "./contracts.ts"
import {verifyKnowledgeEmbeddingConsentSchema} from "./knowledge-embedding-consent-privileges.ts"
import {knowledgeIndexRole as helper,knowledgeIndexTables as tables,verifyKnowledgeIndexCredentials} from "./knowledge-index-audit.ts"
export {verifyKnowledgeIndexCredentials} from "./knowledge-index-audit.ts"
const functions:[string,"api"|"worker"|"broker"|null][]=[
  ["knowledge_index_enabled()",null],["knowledge_index_current(uuid,uuid,bigint,bigint)",null],["knowledge_index_valid(uuid)",null],
  ["knowledge_index_authorize(uuid,bigint,uuid,bigint,text)","api"],["knowledge_index_authorization_receipt(uuid)","api"],["knowledge_index_status(uuid)","api"],
  ["knowledge_index_prune_queue(uuid,uuid)",null],["knowledge_index_claim(uuid)","worker"],
  ["knowledge_index_reserve(uuid,uuid,text)","broker"],["knowledge_index_recheck(uuid,uuid,text)","broker"],["knowledge_index_finish(uuid,uuid,text,jsonb)","broker"],
]
function refuse():never{throw Error("unsafe_knowledge_index_privileges")}
export async function verifyKnowledgeIndexSchema(pool:SqlPool,kind:"api"|"worker"|"broker"="api"):Promise<void>{
  if(!["api","worker","broker"].includes(kind))refuse()
  if(kind==="api")await verifyKnowledgeEmbeddingConsentSchema(pool)
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE "+(kind==="api"?"agentstudio_api":helper+"_"+kind))
      await verifyKnowledgeIndexCredentials(db)
      if((await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_037') AS ok")).rows[0]?.ok!==true)refuse()
      const state=(await db.query<{safe:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS safe FROM pg_catalog.pg_class c "+
        "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[])",[tables])).rows
      if(state.length!==4||state.some(x=>!x.safe))refuse()
      for(const [signature,access] of functions){
        const row=(await db.query<{safe:boolean;config:string[];api:boolean;worker:boolean;broker:boolean;extra:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS safe,p.proconfig AS config,"+
          "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,has_function_privilege('agentstudio_knowledge_index_worker',p.oid,'EXECUTE') AS worker,"+
          "has_function_privilege('agentstudio_knowledge_index_broker',p.oid,'EXECUTE') AS broker,"+
          "EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN "+
          "(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($3::text[]))) AS extra FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
          ["agentstudio."+signature,helper,[helper,...(access?[access==="api"?"agentstudio_api":helper+"_"+access]:[])]] )).rows[0]
        if(!row||!row.safe||row.extra||row.api!==(access==="api")||row.worker!==(access==="worker")||row.broker!==(access==="broker")||row.config?.length!==1||row.config[0]!=="search_path=pg_catalog")refuse()
      }
      const unique=(await db.query<{safe:boolean}>("SELECT i.indisunique AND i.indisvalid AND i.indrelid='agentstudio.knowledge_index_attempt_chunks'::regclass "+
        "AND pg_get_expr(i.indpred,i.indrelid)='reserved' AS safe FROM pg_catalog.pg_index i WHERE i.indexrelid=to_regclass('agentstudio.knowledge_index_no_replay')")).rows[0]
      if(!unique?.safe)refuse()
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
export async function verifyKnowledgeIndexLogin(pool:SqlPool,kind:"worker"|"broker"):Promise<void>{
  if(!["worker","broker"].includes(kind))refuse()
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      const role=(await db.query<{safe:boolean}>("SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AS safe "+
        "FROM pg_catalog.pg_roles WHERE rolname=session_user")).rows[0]
      const memberships=(await db.query<{name:string}>("SELECT rolname AS name FROM pg_catalog.pg_roles WHERE rolname<>session_user AND pg_has_role(session_user,oid,'MEMBER')")).rows
      if(!role?.safe||memberships.length!==1||memberships[0]?.name!==helper+"_"+kind)refuse()
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
  await verifyKnowledgeIndexSchema(pool,kind)
}
