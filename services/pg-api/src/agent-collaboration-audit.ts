import type {SqlClient,SqlPool} from "./contracts.ts"
const role="agentstudio_collaboration",api="agentstudio_api"
const privateColumns:Record<string,string[]>={
  agent_collaboration_grants:["spec_id","owner_user_id","recipient_id","role","active","revision","created_at","updated_at"],
  agent_collaboration_proposals:["id","owner_user_id","spec_id","author_user_id","grant_revision","base_revision","base_sha256","proposed","comment","status","created_at","reviewed_at","reviewer_user_id"],
  agent_collaboration_revisions:["id","owner_user_id","spec_id","actor_user_id","kind","source_revision_id","proposal_id","spec_revision","source_sha256","safe_spec","note","created_at"],
  agent_collaboration_receipts:["actor_user_id","request_id","spec_id","request_sha256","input_sha256","result","created_at"],
}
const reads={...privateColumns,agent_specs:["id","owner_user_id","name","spec","revision"],users:["id","external_issuer","external_subject","status","display_name"],"auth.accounts":["user_id","enabled"]}
const inserts={...privateColumns,audit_events:["owner_user_id","actor_user_id","action","target_kind","target_id","result","metadata"]}
const updates={agent_collaboration_grants:["role","active","revision","updated_at"],agent_collaboration_proposals:["status","reviewed_at","reviewer_user_id"],agent_specs:["spec","revision","updated_at"]}
export const collaborationFunctions:Array<[string,string[]]>=[
  ["collaboration_native_active(uuid)",[]],["collaboration_utf16_length(text)",[]],["collaboration_safe_text(jsonb)",[]],["collaboration_source_sha(uuid)",[]],
  ["collaboration_compact_json(jsonb)",[]],["collaboration_proposal_sha(uuid)",[]],["collaboration_role(uuid,uuid)",[]],["collaboration_record_spec_edit()",[]],
  ["agent_collaboration_list()",[api]],["agent_collaboration_detail(uuid)",[api]],["agent_collaboration_receipt(uuid,uuid)",[api]],
  ["agent_collaboration_grant(uuid,uuid,text,bigint,uuid,text)",[api]],["agent_collaboration_propose(uuid,bigint,text,jsonb,text,uuid,text)",[api]],
  ["agent_collaboration_revisions(uuid)",[api]],["agent_collaboration_review(uuid,uuid,bigint,text,text,text,boolean,uuid,text)",[api]],
  ["agent_collaboration_edit(uuid,bigint,text,jsonb,uuid,text)",[api]],
  ["agent_collaboration_restore(uuid,uuid,bigint,text,text,boolean,uuid,text)",[api]],
]
const refuse=():never=>{throw Error("unsafe_agent_collaboration_privileges")}
export async function agentCollaborationInstalled(db:SqlClient):Promise<boolean>{
  const value=(await db.query<{installed:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND starts_with(c.relname,'agent_collaboration_')) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND (starts_with(p.proname,'collaboration_') OR starts_with(p.proname,'agent_collaboration_'))) AS installed",[role])).rows[0]?.installed
  return typeof value==="boolean"?value:refuse()
}
export async function verifyAgentCollaborationCredentials(db:SqlClient):Promise<boolean>{
  if(!await agentCollaborationInstalled(db))return false
  const safe=(await db.query<{ok:boolean}>("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]?.ok
  if(!safe)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>(
    "SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,"+
    "has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  const allows=(map:Record<string,string[]>,key:string,column:string)=>map[key]?.includes(column)??false
  for(const c of columns){const key=c.schema==="agentstudio_auth"?"auth."+c.table:c.table
    if(c.read!==allows(reads,key,c.column)||c.insert!==allows(inserts,key,c.column)||c.update!==allows(updates,key,c.column)||c.reference)refuse()}
  for(const map of [reads,inserts,updates])for(const [key,names] of Object.entries(map))for(const name of names)
    if(!columns.some(c=>(c.schema==="agentstudio_auth"?"auth."+c.table:c.table)===key&&c.column===name))refuse()
  if(!(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') "+
    "AND c.relkind IN('r','p','v','m','f') AND has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER')) AS ok",[role])).rows[0]?.ok)refuse()
  for(const table of Object.keys(privateColumns)){
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive AND "+
      "pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS ok FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)",["agentstudio."+table,role])).rows[0]?.ok
    if(!state)refuse()
  }
  for(const [signature,grantees] of collaborationFunctions){
    const fn=(await db.query<{ok:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
      "NOT EXISTS(SELECT 1 FROM unnest($3::text[])g WHERE NOT has_function_privilege(g,p.oid,'EXECUTE')) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND "+
      "a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,role,grantees,[role,...grantees]])).rows[0]?.ok
    if(!fn)refuse()
  }
  const surface=(await db.query<{ok:boolean}>("SELECT (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) "+
    "OR n.nspname='agentstudio' AND (starts_with(p.proname,'collaboration_') OR starts_with(p.proname,'agent_collaboration_')))=$2::integer AND "+
    "(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relkind IN('r','p') AND starts_with(c.relname,'agent_collaboration_'))=4 AS ok",[role,collaborationFunctions.length])).rows[0]?.ok
  if(!surface)refuse()
  const trigger=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(t.tgrelid='agentstudio.agent_specs'::regclass AND t.tgname='native_agent_collaboration_history' AND "+
    "t.tgfoid='agentstudio.collaboration_record_spec_edit()'::regprocedure AND t.tgtype=17 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgconstraint=0 AND "+
    "NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr::text=(SELECT string_agg(a.attnum::text,' ' ORDER BY a.attnum) "+
    "FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.agent_specs'::regclass AND a.attname IN('name','spec') AND NOT a.attisdropped)) AS ok FROM pg_catalog.pg_trigger t "+
    "WHERE t.tgname='native_agent_collaboration_history' OR t.tgfoid='agentstudio.collaboration_record_spec_edit()'::regprocedure")).rows[0]?.ok
  if(!trigger)refuse()
  return true
}
export async function inspectAgentCollaborationSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{
    await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api")
    if(!await verifyAgentCollaborationCredentials(db))return false
    if((await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_045') AS ok")).rows[0]?.ok!==true)refuse()
    return true
  }finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
