import type {SqlClient} from "./contracts.ts"
const helper="agentstudio_knowledge_execution"
const readable:Record<string,readonly string[]>={
  jobs:["id","owner_user_id","run_id","kind","payload","status","lease_token","lease_version","lease_owner","lease_until"],
  runs:["id","owner_user_id","kind","status","workflow_id","agent_spec_id","instruction","checkpoint"],
  approvals:["run_id","owner_user_id","step_key","status","reason_code"],
  external_effects:["run_id","owner_user_id","step_key","status","tool_name","arguments_sha256"],
  workflows:["id","owner_user_id","revision"],agent_specs:["id","owner_user_id","revision"],
}
function refuse():never{throw Error("unsafe_knowledge_execution_privileges")}
// Catalog-only optional discovery works on old schemas and on the restricted
// API/Worker/Broker logins. Any partial SQL039 footprint fails closed.
export async function verifyKnowledgeExecutionCredentials(db:SqlClient):Promise<boolean>{
  const footprint=(await db.query<{installed:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR "+
    "to_regprocedure('agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb)') IS NOT NULL OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('agentstudio.knowledge_query_jobs') AND attname='execution_source' AND NOT attisdropped) AS installed",[helper])).rows[0]
  if(footprint?.installed===false)return false
  const role=(await db.query<{safe:boolean}>("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS safe FROM pg_catalog.pg_roles r WHERE rolname=$1",[helper])).rows[0]
  if(!role?.safe)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;write:boolean}>("SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,"+
    "has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES') AS write "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid "+
    "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped",[helper])).rows
  for(const x of columns)if(x.write||x.read&&!(x.schema==="agentstudio"&&readable[x.table]?.includes(x.column)))refuse()
  for(const [table,names] of Object.entries(readable))for(const column of names)
    if(!columns.some(x=>x.schema==="agentstudio"&&x.table===table&&x.column===column&&x.read))refuse()
  const tableState=(await db.query<{safe:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND "+
    "(has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER') OR c.relname=ANY($2::text[]) AND NOT(c.relrowsecurity AND c.relforcerowsecurity))) AS safe",[helper,Object.keys(readable)])).rows[0]
  if(!tableState?.safe)refuse()
  const functions=[
    ["knowledge_execution_source_current(uuid,jsonb)",helper,"agentstudio_knowledge_query"],
    ["knowledge_execution_source_seal(uuid,jsonb,uuid[])",helper,"agentstudio_knowledge_query"],
    ["knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb)","agentstudio_knowledge_query","agentstudio_api"],
  ] as const
  for(const [signature,owner,grantee] of functions){
    const x=(await db.query<{safe:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) "+
      "AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND has_function_privilege($3,p.oid,'EXECUTE') AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' "+
      "AND a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS safe FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,owner,grantee,[owner,grantee]])).rows[0]
    if(!x?.safe)refuse()
  }
  const index=(await db.query<{safe:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=to_regclass('agentstudio.knowledge_query_jobs') "+
    "AND i.indisunique AND i.indisvalid AND i.indexprs IS NULL AND pg_get_expr(i.indpred,i.indrelid)='(source_run_id IS NOT NULL)' "+
    "AND (SELECT array_agg(a.attname::text ORDER BY x.n) FROM unnest(i.indkey) WITH ORDINALITY x(att,n) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid "+
    "AND a.attnum=x.att)=ARRAY['reader_user_id','source_run_id','source_step_key']::text[]) AS safe")).rows[0]
  if(!index?.safe)refuse()
  return true
}
