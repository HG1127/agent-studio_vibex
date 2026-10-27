import type {SqlClient} from "./contracts.ts"
const role="agentstudio_knowledge_lineage",table="workflow_sample_lineage"
const refuse=():never=>{throw Error("unsafe_workflow_sample_lineage_privileges")}
export async function knowledgeLineageInstalled(db:SqlClient):Promise<boolean>{
  const row=(await db.query<{installed:boolean}>("SELECT to_regclass('agentstudio.workflow_sample_lineage') IS NOT NULL OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE n.nspname='agentstudio' AND starts_with(p.proname,'knowledge_lineage_')) AS installed",[role])).rows[0]
  if(!row||typeof row.installed!=="boolean")return refuse()
  return row.installed
}
export async function verifyKnowledgeLineageCredentials(db:SqlClient):Promise<boolean>{
  if(!await knowledgeLineageInstalled(db))return false
  const safe=(await db.query<{ok:boolean}>("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]
  if(!safe?.ok)refuse()
  const runtime=["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth","agentstudio_knowledge_acl","agentstudio_knowledge_content",
    "agentstudio_knowledge_embedding","agentstudio_knowledge_index","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker","agentstudio_knowledge_query","agentstudio_knowledge_execution","agentstudio_knowledge_keyword","agentstudio_knowledge_agent",role]
  const relation=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=c.relowner AND NOT r.rolsuper AND (r.rolname=ANY($1::text[]) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_roles parent WHERE parent.rolname=ANY($1::text[]) AND pg_has_role(r.oid,parent.oid,'MEMBER')))) AS ok "+
    "FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('agentstudio.workflow_sample_lineage')",[runtime])).rows[0]
  if(!relation?.ok)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;write:boolean}>("SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,"+
    "has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
    "has_column_privilege($1,c.oid,a.attnum,'UPDATE,REFERENCES') AS write FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  const names=["reader_user_id","run_id","debug_sha256","provenance","source_run_id","source_sha256","created_at"]
  for(const c of columns){const allowed=c.schema==="agentstudio"&&c.table===table&&names.includes(c.column);if(c.read!==allowed||c.insert!==allowed||c.write)refuse()}
  if(names.some(name=>!columns.some(c=>c.schema==="agentstudio"&&c.table===table&&c.column===name)))refuse()
  const access=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname IN ('agentstudio','agentstudio_auth') AND c.relkind IN ('r','p') AND has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER')) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_class c ON c.oid=to_regclass('agentstudio.workflow_sample_lineage') WHERE NOT r.rolsuper AND r.oid<>c.relowner AND "+
    "r.rolname NOT IN($1,'pg_read_all_data','pg_write_all_data') AND (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS ok",[role])).rows[0]
  if(!access?.ok)refuse()
  const functions:Array<[string,string,string[]]>=[
    ["knowledge_lineage_context(uuid,uuid)","agentstudio_knowledge_execution",[role]],
    ["knowledge_query_execution_observations_before_lineage(uuid,uuid,text)","agentstudio_knowledge_query",[role]],
    ["knowledge_lineage_walk(uuid,uuid,uuid[])",role,[]],
    ["knowledge_lineage_register(uuid,text)",role,["agentstudio_api"]],
    ["knowledge_lineage_current(uuid,uuid)",role,["agentstudio_knowledge_query"]],
  ]
  for(const [signature,owner,grantees] of functions){const fn=(await db.query<{ok:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND "+
    "p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND NOT EXISTS(SELECT 1 FROM unnest($3::text[])g WHERE NOT has_function_privilege(g,p.oid,'EXECUTE')) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND "+
    "a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
    ["agentstudio."+signature,owner,grantees,[owner,...grantees]])).rows[0];if(!fn?.ok)refuse()}
  const fences=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=to_regclass('agentstudio.workflow_sample_lineage') AND "+
    "i.indisprimary AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL AND "+
    "(SELECT array_agg(a.attname::text ORDER BY x.n) FROM unnest(i.indkey) WITH ORDINALITY x(att,n) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=x.att)=ARRAY['reader_user_id','run_id']::text[]) AND "+
    "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)]::oid[] AND polcmd='*' AND polpermissive AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') "+
    "FROM pg_catalog.pg_policy WHERE polrelid=to_regclass('agentstudio.workflow_sample_lineage')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=to_regclass('agentstudio.workflow_sample_lineage') AND NOT tgisinternal) AND "+
    "(SELECT count(*)=3 FROM pg_catalog.pg_proc WHERE proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) AS ok",[role])).rows[0]
  if(!fences?.ok)refuse()
  return true
}
