import type {SqlClient,SqlPool} from "./contracts.ts"
const helper="agentstudio_knowledge_query",table="knowledge_query_jobs"
const functions:[string,"api"|"worker"|"broker"|null][]=[
  ["knowledge_query_enabled()",null],["knowledge_query_scope(uuid,uuid[],boolean)",null],["knowledge_query_reader_current(uuid,uuid,bigint,bigint)",null],
  ["knowledge_query_rank(jsonb,text,integer,text,public.vector,text)",null],["knowledge_query_refs_valid(uuid)",null],["knowledge_query_get(uuid)","api"],
  ["knowledge_query_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text)","api"],["knowledge_query_job_current(uuid)",null],
  ["knowledge_query_claim(uuid)","worker"],["knowledge_query_reserve(uuid,uuid,text)","broker"],["knowledge_query_recheck(uuid,uuid,text)","broker"],["knowledge_query_finish(uuid,uuid,text,jsonb)","broker"],
]
const readable:Record<string,true|string[]>={users:["id","external_issuer","external_subject"],model_connections:["id","owner_user_id","provider","enabled","models","revision"],
  knowledge_bases:["id","owner_user_id","visibility","revision"],knowledge_documents:["id","owner_user_id","base_id","status","filename","created_at"],
  knowledge_chunks:["id","owner_user_id","document_id","chunk_index","text_content"],knowledge_access:true,knowledge_embedding_profiles:true,
  knowledge_embedding_consents:true,knowledge_embedding_vectors:true,knowledge_query_jobs:true}
function refuse():never{throw Error("unsafe_knowledge_query_privileges")}
export async function verifyKnowledgeQueryCredentials(db:SqlClient):Promise<void>{
  const role=(await db.query<{safe:boolean}>("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS safe FROM pg_catalog.pg_roles r WHERE rolname=$1",[helper])).rows[0]
  if(!role){
    // Optional on older schemas, mandatory if any SQL038 footprint remains.
    const state=(await db.query<{installed:boolean}>("SELECT to_regclass('agentstudio.knowledge_query_jobs') IS NOT NULL OR "+
      "to_regprocedure('agentstudio.knowledge_query_get(uuid)') IS NOT NULL AS installed")).rows[0]
    if(state?.installed!==false)refuse();return
  }
  if(!role.safe)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,"+
    "has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
    "has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid "+
    "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped",[helper])).rows
  for(const x of columns){const read=x.schema==="agentstudio"?readable[x.table]:undefined,job=x.schema==="agentstudio"&&x.table===table,
    audit=x.schema==="agentstudio"&&x.table==="audit_events"&&["owner_user_id","actor_user_id","action","target_kind","target_id","result","metadata"].includes(x.column)
    if(x.reference||x.read&&read!==true&&!(Array.isArray(read)&&read.includes(x.column))||x.insert&&!job&&!audit||x.update&&!job)refuse()}
  if((await db.query<{bad:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER')) AS bad",[helper])).rows[0]?.bad!==false)refuse()
  const state=(await db.query<{safe:boolean}>("SELECT relkind='r' AND relrowsecurity AND relforcerowsecurity AS safe FROM pg_catalog.pg_class WHERE oid=to_regclass('agentstudio.knowledge_query_jobs')")).rows[0]
  if(!state?.safe)refuse()
  for(const [signature,access] of functions){
    const row=(await db.query<{safe:boolean;config:string[];api:boolean;worker:boolean;broker:boolean;extra:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS safe,p.proconfig AS config,"+
      "has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,has_function_privilege('agentstudio_knowledge_index_worker',p.oid,'EXECUTE') AS worker,"+
      "has_function_privilege('agentstudio_knowledge_index_broker',p.oid,'EXECUTE') AS broker,EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a "+
      "WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($3::text[]))) AS extra FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,helper,[helper,...(access?[access==="api"?"agentstudio_api":"agentstudio_knowledge_index_"+access]:[])]] )).rows[0]
    if(!row||!row.safe||row.extra||row.api!==(access==="api")||row.worker!==(access==="worker")||row.broker!==(access==="broker")||row.config?.length!==1||row.config[0]!=="search_path=pg_catalog")refuse()
  }
  const principals=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles parent "+
    "WHERE parent.rolname=ANY($1::text[]) AND pg_has_role(r.oid,parent.oid,'MEMBER'))",[["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth","agentstudio_knowledge_embedding","agentstudio_knowledge_index","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker"]])).rows
  for(const {name} of principals){
    const row=(await db.query<{bad:boolean}>("SELECT has_any_column_privilege($1,'agentstudio.knowledge_query_jobs','SELECT,INSERT,UPDATE,REFERENCES') OR "+
      "has_table_privilege($1,'agentstudio.knowledge_query_jobs','DELETE,TRUNCATE,TRIGGER') AS bad",[name])).rows[0]
    if(!row||row.bad)refuse()
  }
  const unique=(await db.query<{safe:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid='agentstudio.knowledge_query_jobs'::regclass AND i.indisunique AND i.indisvalid "+
    "AND i.indpred IS NULL AND i.indexprs IS NULL AND (SELECT array_agg(a.attname::text ORDER BY x.n) FROM unnest(i.indkey) WITH ORDINALITY x(att,n) "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=x.att)=ARRAY['reader_user_id','request_id']::text[]) AS safe")).rows[0]
  if(!unique?.safe)refuse()
}
export async function verifyKnowledgeQuerySchema(pool:SqlPool,kind:"api"|"worker"|"broker"="api"):Promise<void>{
  if(!["api","worker","broker"].includes(kind))refuse()
  const db=await pool.connect();try{await db.query("BEGIN READ ONLY");try{
    await db.query("SET LOCAL ROLE "+(kind==="api"?"agentstudio_api":"agentstudio_knowledge_index_"+kind))
    await verifyKnowledgeQueryCredentials(db)
    if((await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_038') AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='agentstudio_knowledge_query') AS ok")).rows[0]?.ok!==true)refuse()
  }finally{await db.query("ROLLBACK")}}finally{db.release()}
}
