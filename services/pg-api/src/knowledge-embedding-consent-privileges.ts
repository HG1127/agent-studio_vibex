import type {SqlPool} from "./contracts.ts"
import {verifyKnowledgeEmbeddingSchema} from "./knowledge-embedding-privileges.ts"
const functions=[
  ["knowledge_embedding_profile_epoch()",false],["knowledge_embedding_consent_actor()",false],
  ["knowledge_embedding_consent()",true],["knowledge_embedding_consent_receipt(uuid)",true],
  ["knowledge_embedding_consent_change(uuid,bigint,text,uuid,bigint,boolean,boolean,text)",true],
] as const
function refuse():never{throw Error("unsafe_knowledge_embedding_consent_privileges")}
export async function verifyKnowledgeEmbeddingConsentSchema(pool:SqlPool):Promise<void>{
  await verifyKnowledgeEmbeddingSchema(pool)
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE agentstudio_api")
      if((await db.query<{present:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_036') AS present")).rows[0]?.present!==true)refuse()
      const state=(await db.query<{safe:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS safe "+
        "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
        "AND c.relname IN ('knowledge_embedding_consents','knowledge_embedding_consent_receipts')")).rows
      if(state.length!==2||state.some(item=>!item.safe))refuse()
      const epoch=(await db.query<{safe:boolean}>("SELECT a.atttypid='uuid'::regtype AND a.attnotnull AS safe FROM pg_catalog.pg_attribute a "+
        "WHERE a.attrelid='agentstudio.knowledge_embedding_profiles'::regclass AND a.attname='configuration_id' AND NOT a.attisdropped")).rows[0]
      if(!epoch?.safe)refuse()
      for(const [signature,api] of functions){
        const row=(await db.query<{safe:boolean;config:string[];api:boolean;others:boolean;public:boolean}>("SELECT p.prosecdef AND r.rolname='agentstudio_knowledge_embedding' AS safe,p.proconfig AS config,"+
          "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,"+
          "(has_function_privilege('agentstudio_worker',p.oid,'EXECUTE') OR has_function_privilege('agentstudio_model_broker',p.oid,'EXECUTE') OR "+
          "has_function_privilege('agentstudio_bound_dispatch',p.oid,'EXECUTE')) AS others,"+
          "EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public "+
          "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)",["agentstudio."+signature])).rows[0]
        if(!row||!row.safe||row.api!==api||row.others||row.public||row.config?.length!==1||row.config[0]!=="search_path=pg_catalog")refuse()
      }
      const trigger=(await db.query<{safe:boolean}>("SELECT t.tgenabled='O' AND NOT t.tgisinternal AND t.tgfoid='agentstudio.knowledge_embedding_profile_epoch()'::regprocedure AS safe "+
        "FROM pg_catalog.pg_trigger t WHERE t.tgrelid='agentstudio.knowledge_embedding_profiles'::regclass AND t.tgname='knowledge_embedding_profile_epoch'")).rows
      if(trigger.length!==1||!trigger[0]?.safe)refuse()
      for(const table of ["knowledge_embedding_consents","knowledge_embedding_consent_receipts"]){
        const grants=(await db.query<{mutate:boolean}>("SELECT has_table_privilege('agentstudio_knowledge_embedding',$1,'DELETE,TRUNCATE,TRIGGER') "+
          "OR ($2::boolean AND has_any_column_privilege('agentstudio_knowledge_embedding',$1,'UPDATE')) AS mutate",["agentstudio."+table,table.endsWith("receipts")])).rows[0]
        if(!grants||grants.mutate)refuse()
      }
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
