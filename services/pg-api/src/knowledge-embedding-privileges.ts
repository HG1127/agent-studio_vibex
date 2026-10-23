import type {SqlClient,SqlPool} from "./contracts.ts"
const role="agentstudio_knowledge_embedding"
const tables=["knowledge_embedding_profiles","knowledge_embedding_vectors","knowledge_embedding_queue","knowledge_embedding_receipts"]
const functions=[
  ["knowledge_embedding_actor()",false],["knowledge_embedding_settings()",true],
  ["knowledge_embedding_receipt(uuid)",true],["knowledge_embedding_status(uuid)",true],
  ["knowledge_embedding_change(uuid,bigint,text,uuid,bigint,text,text,uuid)",true],
  ["knowledge_embedding_enqueue_chunk()",false],["knowledge_embedding_enqueue_document()",false],
  ["knowledge_content_import(uuid,uuid,text,text,text)",true,"agentstudio_knowledge_content"],
  ["knowledge_content_delete(uuid,uuid,uuid,text)",true,"agentstudio_knowledge_content"],
  ["knowledge_content_import_without_embedding_fence(uuid,uuid,text,text,text)",false,"agentstudio_knowledge_content"],
  ["knowledge_content_delete_without_embedding_fence(uuid,uuid,uuid,text)",false,"agentstudio_knowledge_content"],
] as const
function refuse():never{throw Error("unsafe_knowledge_embedding_privileges")}
// Runs even with the settings capability off if the helper role exists.
export async function verifyKnowledgeEmbeddingCredentials(db:SqlClient):Promise<void>{
  const state=(await db.query<{safe:boolean;members:number}>("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit "+
    "AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AS safe,"+
    "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS members "+
    "FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]
  if(!state)return
  if(!state.safe||state.members!==0)refuse()
  const sensitive=(await db.query<{id:number;schema:string;name:string}>("SELECT c.oid AS id,n.nspname AS schema,c.relname AS name "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE "+
    "(n.nspname='agentstudio' AND c.relname IN ('model_connections','tool_connection_headers','mcp_connection_headers','smithery_credentials')) "+
    "OR (n.nspname='agentstudio_auth' AND c.relname IN ('accounts','sessions'))")).rows
  for(const table of sensitive){
    const grants=(await db.query<{name:string;read:boolean;write:boolean}>("SELECT attname AS name,has_column_privilege($1,attrelid,attnum,'SELECT') AS read,"+
      "has_column_privilege($1,attrelid,attnum,'INSERT,UPDATE,REFERENCES') AS write FROM pg_catalog.pg_attribute "+
      "WHERE attrelid=$2::oid AND attnum>0 AND NOT attisdropped",[role,table.id])).rows
    const model=table.schema==="agentstudio"&&table.name==="model_connections"
    const allowed=["id","owner_user_id","provider","base_url","enabled","models","revision"]
    if(grants.some(column=>column.write||(column.read&&(!model||!allowed.includes(column.name)))))refuse()
    if((await db.query<{write:boolean}>("SELECT has_table_privilege($1,$2::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS write",[role,table.id])).rows[0]?.write!==false)refuse()
  }
  const data=(await db.query<{id:number}>("SELECT c.oid AS id FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[])",[tables])).rows
  // Include member logins, whose direct grants would survive SET ROLE NONE.
  // Production's separate role preflight rejects superuser/bypass logins.
  const principals=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND EXISTS("+
    "SELECT 1 FROM pg_catalog.pg_roles base WHERE base.rolname=ANY($1::text[]) AND pg_has_role(r.oid,base.oid,'MEMBER'))",
    [["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch"]])).rows
  for(const table of data)for(const {name:principal} of principals){
    const grant=(await db.query<{unsafe:boolean}>("SELECT has_any_column_privilege($1,$2::oid,'SELECT,INSERT,UPDATE,REFERENCES') "+
      "OR has_table_privilege($1,$2::oid,'DELETE,TRUNCATE,TRIGGER') AS unsafe",[principal,table.id])).rows[0]
    if(!grant||grant.unsafe)refuse()
  }
}
export async function verifyKnowledgeEmbeddingSchema(pool:SqlPool):Promise<void>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY")
    try{
      await db.query("SET LOCAL ROLE agentstudio_api")
      await verifyKnowledgeEmbeddingCredentials(db)
      if((await db.query<{present:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_035') AS present")).rows[0]?.present!==true)refuse()
      const state=(await db.query<{safe:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS safe "+
        "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[])",[tables])).rows
      if(state.length!==tables.length||state.some(item=>!item.safe))refuse()
      const vector=(await db.query<{safe:boolean}>("SELECT a.atttypid='public.vector'::regtype AND a.atttypmod=-1 AND a.attnotnull AS safe "+
        "FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.knowledge_embedding_vectors'::regclass AND a.attname='embedding' AND NOT a.attisdropped")).rows[0]
      if(!vector?.safe)refuse()
      for(const [signature,api,owner=role] of functions){
        const row=(await db.query<{safe:boolean;owner:string;config:string[];api:boolean;others:boolean;public:boolean}>("SELECT p.prosecdef AS safe,r.rolname AS owner,p.proconfig AS config,"+
          "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,"+
          "(has_function_privilege('agentstudio_worker',p.oid,'EXECUTE') OR has_function_privilege('agentstudio_model_broker',p.oid,'EXECUTE') OR "+
          "has_function_privilege('agentstudio_bound_dispatch',p.oid,'EXECUTE')) AS others,"+
          "EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public "+
          "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)",["agentstudio."+signature])).rows[0]
        if(!row||!row.safe||row.owner!==owner||row.api!==api||row.others||row.public||row.config?.length!==1||row.config[0]!=="search_path=pg_catalog")refuse()
      }
      const triggers=(await db.query<{safe:boolean}>("SELECT t.tgenabled='O' AND NOT t.tgisinternal AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) AS safe "+
        "FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE t.tgname IN ('knowledge_embedding_chunk_change','knowledge_embedding_document_change')",[role])).rows
      if(triggers.length!==2||triggers.some(item=>!item.safe))refuse()
    }finally{await db.query("ROLLBACK")}
  }finally{db.release()}
}
