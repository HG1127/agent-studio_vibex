import type {SqlClient,SqlPool} from "./contracts.ts"
const role="agentstudio_releases",api="agentstudio_api"
const privateColumns:Record<string,string[]>={
  agent_release_heads:["spec_id","owner_user_id","next_version_no","revision","active_version_id","updated_at"],
  agent_release_versions:["id","owner_user_id","spec_id","version_no","spec_revision","source_sha256","name_snapshot","spec_snapshot","note","test_run_id","test_passed","test_model_binding","status","revision","created_at","updated_at","published_at","deleted_at"],
  agent_release_acceptance_runs:["run_id","owner_user_id","spec_id","request_id","spec_revision","source_sha256","instruction_sha256","max_steps","selected_model_binding","created_at"],
  agent_release_receipts:["actor_user_id","request_id","spec_id","action","request_sha256","input_sha256","result","created_at"],
}
const reads={...privateColumns,agent_specs:["id","owner_user_id","name","spec","revision"],users:["id","status","external_issuer","external_subject"],"auth.accounts":["user_id","enabled"]}
const inserts:Record<string,string[]>={agent_release_heads:["spec_id","owner_user_id"],
  agent_release_versions:["id","owner_user_id","spec_id","version_no","spec_revision","source_sha256","name_snapshot","spec_snapshot","note"],
  agent_release_receipts:["actor_user_id","request_id","spec_id","action","request_sha256","input_sha256","result"],
  audit_events:["owner_user_id","actor_user_id","action","target_kind","target_id","result","metadata"]}
const updates:Record<string,string[]>={agent_release_heads:["next_version_no","updated_at","active_version_id","revision"],agent_release_versions:["status","revision","updated_at","published_at"]}
export const agentReleaseFunctions:Array<[string,string[]]>=[
  ["release_utf16_length(text)",[]],["release_native_active(uuid)",[]],["release_source_seal(uuid,uuid,text,bigint,jsonb)",[]],["release_source_sha(uuid)",[]],["release_version_sha(uuid)",[]],["release_version_immutable()",[]],
  ["agent_release_workspace(uuid)",[api]],["agent_release_detail(uuid,uuid)",[api]],["agent_release_receipt(uuid,uuid)",[api]],
  ["agent_release_snapshot(uuid,bigint,text,text,uuid,uuid,text)",[api]],
  ["agent_release_publish(uuid,uuid,bigint,text,text,bigint,bigint,boolean,boolean,uuid,text)",[api]],
]
function refuse():never{throw Error("unsafe_agent_release_privileges")}
export async function agentReleasesInstalled(db:SqlClient):Promise<boolean>{
  const installed=(await db.query<{installed:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'agent_release_')) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR n.nspname='agentstudio' AND starts_with(p.proname,'agent_release_')) AS installed",[role])).rows[0]?.installed
  if(typeof installed!=="boolean")refuse()
  return installed
}
export async function verifyAgentReleaseCredentials(db:SqlClient):Promise<boolean>{
  if(!await agentReleasesInstalled(db))return false
  const safe=(await db.query<{ok:boolean}>("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid OR roleid=r.oid) AND "+
    "NOT has_schema_privilege(r.oid,'agentstudio','CREATE') AND NOT has_schema_privilege(r.oid,'agentstudio_auth','CREATE') AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]?.ok
  if(!safe)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>(
    "SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
    "has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  for(const column of columns){const key=column.schema==="agentstudio_auth"?"auth."+column.table:column.table
    if(column.read!==((reads as Record<string,string[]>)[key]?.includes(column.column)??false)||column.insert!==(inserts[key]?.includes(column.column)??false)||column.update!==(updates[key]?.includes(column.column)??false)||column.reference)refuse()}
  for(const map of [reads,inserts,updates])for(const [key,names] of Object.entries(map))for(const name of names)
    if(!columns.some(c=>(c.schema==="agentstudio_auth"?"auth."+c.table:c.table)===key&&c.column===name))refuse()
  const noWrites=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') "+
    "AND c.relkind IN('r','p','v','m','f') AND (has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER') OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a "+
    "WHERE a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) AND (a.privilege_type<>'SELECT' OR a.is_grantable)))) AS ok",[role])).rows[0]?.ok
  if(!noWrites)refuse()
  for(const table of Object.keys(privateColumns)){
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive AND "+
      "pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal AND NOT(c.relname='agent_release_versions' AND tgname='native_agent_release_immutable')) AS ok "+
      "FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)",["agentstudio."+table,role])).rows[0]?.ok
    if(!state)refuse()
  }
  for(const [signature,grantees] of agentReleaseFunctions){
    const fn=(await db.query<{ok:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
      "NOT EXISTS(SELECT 1 FROM unnest($3::text[])g WHERE NOT has_function_privilege(g,p.oid,'EXECUTE')) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND "+
      "a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,role,grantees,[role,...grantees]])).rows[0]?.ok
    if(!fn)refuse()
  }
  const surface=(await db.query<{ok:boolean}>("SELECT (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR n.nspname='agentstudio' AND starts_with(p.proname,'agent_release_'))=$2::integer AND "+
    "(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relkind IN('r','p','v','m','f') AND starts_with(c.relname,'agent_release_'))=4 AS ok",[role,agentReleaseFunctions.length])).rows[0]?.ok
  if(!surface)refuse()
  const trigger=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(t.tgrelid='agentstudio.agent_release_versions'::regclass AND t.tgname='native_agent_release_immutable' AND "+
    "t.tgfoid='agentstudio.release_version_immutable()'::regprocedure AND t.tgtype=27 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND "+
    "t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr::text='') AS ok FROM pg_catalog.pg_trigger t WHERE t.tgname='native_agent_release_immutable' OR t.tgfoid='agentstudio.release_version_immutable()'::regprocedure")).rows[0]?.ok
  if(!trigger)refuse()
  const index=(await db.query<{ok:boolean}>("SELECT i.indrelid='agentstudio.agent_release_versions'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indexprs IS NULL AND "+
    "i.indkey::text=(SELECT attnum::text FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attname='spec_id') AND "+
    "regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')=$1 AS ok FROM pg_catalog.pg_index i WHERE i.indexrelid=to_regclass('agentstudio.ux_agent_release_published')",["status='published'::text"])).rows[0]?.ok
  if(!index)refuse()
  return true
}
export async function inspectAgentReleaseSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api")
    if(!await verifyAgentReleaseCredentials(db))return false
    if((await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_046') AS ok")).rows[0]?.ok!==true)throw Error("agent_release_runtime_incomplete")
    return true
  }finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
