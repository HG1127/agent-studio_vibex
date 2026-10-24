import type {SqlClient,SqlPool} from "./contracts.ts"
const role="agentstudio_scheduler"
const privateTables=["schedule_execution_authorities","schedule_execution_origins","schedule_execution_effect_receipts"]
const privateColumns:Record<string,string[]>={
  schedule_execution_authorities:["id","owner_user_id","schedule_id","schedule_revision","request_id","source_sha256","max_occurrences","used_occurrences","max_auto_effects","expires_at","allow_paid_knowledge","created_at"],
  schedule_execution_origins:["run_id","owner_user_id","authority_id","occurrence_id","run_sha256","created_at"],
  schedule_execution_effect_receipts:["run_id","step_key","owner_user_id","input_sha256","effect_kind","knowledge_charge","created_at"],
}
const readColumns:Record<string,string[]|true>={...privateColumns,schedules:true,schedule_occurrences:true,
  users:["id","external_issuer","external_subject","status"],"auth.accounts":["user_id","enabled"],agent_specs:["id","owner_user_id","revision","spec"],
  workflows:["id","owner_user_id","revision","graph"],model_connections:["id","owner_user_id","revision","enabled","status","provider","base_url","models"],
  tool_connections:["id","owner_user_id","revision","enabled","status","url","method","body_template","timeout_s"],mcp_connections:["id","owner_user_id","revision","enabled","status","url","catalog"],
  runs:["id","owner_user_id","kind","workflow_id","agent_spec_id","status","instruction","checkpoint"],
}
const insertColumns:Record<string,string[]|true>={...privateColumns,schedule_occurrences:true,audit_events:["owner_user_id","actor_user_id","run_id","action","target_kind","target_id","result","metadata"]}
const updateColumns:Record<string,string[]|true>={schedules:true,schedule_occurrences:true,schedule_execution_authorities:["used_occurrences"]}
const api="agentstudio_api",worker="agentstudio_worker"
export const scheduleFunctions:Array<[string,string[]]>=[
  ["schedule_native_active(uuid)",[]],["schedule_resource_material(uuid)",[]],["schedule_resource_sha(uuid)",[]],["schedule_material_sha(uuid)",[]],
  ["schedule_authority_current(uuid)",[]],["schedule_run_sha(uuid)",[]],["schedule_run_current(uuid,uuid)",["agentstudio_knowledge_query"]],
  ["schedule_validate_run(uuid)",[api]],["schedule_automatic_candidate(uuid)",[api]],["schedule_resource_fingerprint(uuid)",[api]],
  ["schedule_activate(uuid,bigint,jsonb,timestamp with time zone,text,uuid)",[api]],
  ["schedule_make_occurrence(uuid,timestamp with time zone,boolean)",[]],["schedule_run_now(uuid,bigint)",[api]],["schedule_retry_start(uuid,bigint,uuid)",[api]],
  ["schedule_peek()",[worker]],["schedule_reserve(uuid,bigint,timestamp with time zone,timestamp with time zone,text)",[worker]],
  ["schedule_launch_context(uuid,uuid,bigint,text)",[worker]],["schedule_register_origin(uuid,uuid,bigint,text,uuid)",[worker]],
  ["schedule_launch_failed(uuid,uuid,bigint,text,text)",[worker]],["schedule_quarantine(uuid,bigint,timestamp with time zone,text)",[worker]],
  ["schedule_effect_authorize(uuid,text,text,text,boolean)",[worker]],["schedule_control(uuid,bigint,text)",[api]],["schedule_execution_status(uuid)",[api]],
  ["schedule_sync_run_status()",[]],
]
const refuse=():never=>{throw Error("unsafe_native_schedule_privileges")}
export async function scheduleRuntimeInstalled(db:SqlClient):Promise<boolean>{
  const installed=(await db.query<{installed:boolean}>("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY($2::text[])) OR "+
    "EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND starts_with(p.proname,'schedule_')) AS installed",[role,privateTables])).rows[0]?.installed
  return typeof installed==="boolean"?installed:refuse()
}
export async function verifyScheduleCredentials(db:SqlClient):Promise<boolean>{
  if(!await scheduleRuntimeInstalled(db))return false
  const safe=(await db.query<{ok:boolean}>("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication "+
    "AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS ok FROM pg_catalog.pg_roles r WHERE rolname=$1",[role])).rows[0]
  if(!safe?.ok)refuse()
  const columns=(await db.query<{schema:string;table:string;column:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>(
    "SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,"+
    "has_column_privilege($1,c.oid,a.attnum,'INSERT') AS insert,has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS update,"+
    "has_column_privilege($1,c.oid,a.attnum,'REFERENCES') AS reference FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') AND a.attnum>0 AND NOT a.attisdropped",[role])).rows
  const allows=(map:Record<string,string[]|true>,key:string,name:string)=>map[key]===true||Array.isArray(map[key])&&map[key].includes(name)
  for(const c of columns){const key=c.schema==="agentstudio_auth"?"auth."+c.table:c.table
    if(c.read!==allows(readColumns,key,c.column)||c.insert!==allows(insertColumns,key,c.column)||c.update!==allows(updateColumns,key,c.column)||c.reference)refuse()}
  for(const map of [readColumns,insertColumns,updateColumns])for(const [key,names] of Object.entries(map)){
    if(!columns.some(c=>(c.schema==="agentstudio_auth"?"auth."+c.table:c.table)===key))refuse()
    if(Array.isArray(names)&&names.some(name=>!columns.some(c=>(c.schema==="agentstudio_auth"?"auth."+c.table:c.table)===key&&c.column===name)))refuse()
  }
  const dml=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE "+
    "n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') AND has_table_privilege($1,c.oid,'DELETE,TRUNCATE,TRIGGER')) AS ok",[role])).rows[0]
  if(!dml?.ok)refuse()
  for(const table of privateTables){
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND "+
      "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND "+
      "r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "(SELECT count(*)=1 AND bool_and(polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='*' AND polpermissive "+
      "AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true') FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS ok FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)",["agentstudio."+table,role])).rows[0]
    if(!state?.ok)refuse()
  }
  for(const [signature,grantees] of scheduleFunctions){
    const fn=(await db.query<{ok:boolean}>("SELECT p.prosecdef AND p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
      "NOT EXISTS(SELECT 1 FROM unnest($3::text[])g WHERE NOT has_function_privilege(g,p.oid,'EXECUTE')) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND "+
      "a.grantee NOT IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($4::text[]))) AS ok FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",
      ["agentstudio."+signature,role,grantees,[role,...grantees]])).rows[0];if(!fn?.ok)refuse()
  }
  const surface=(await db.query<{ok:boolean}>("SELECT (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE "+
    "p.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1) OR n.nspname='agentstudio' AND starts_with(p.proname,'schedule_'))=$2::integer AND "+
    "NOT has_any_column_privilege('agentstudio_api','agentstudio.schedule_occurrences','INSERT,UPDATE,REFERENCES') AND "+
    "NOT EXISTS(SELECT 1 FROM unnest(ARRAY['lease_token','lease_owner','lease_version','lease_until']) c WHERE has_column_privilege('agentstudio_api','agentstudio.schedule_occurrences',c,'SELECT')) AS ok",[role,scheduleFunctions.length])).rows[0]
  if(!surface?.ok)refuse()
  const trigger=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(t.tgrelid='agentstudio.runs'::regclass AND t.tgname='native_schedule_run_status' AND "+
    "t.tgfoid='agentstudio.schedule_sync_run_status()'::regprocedure AND t.tgtype=17 AND t.tgenabled='O' AND NOT t.tgisinternal AND "+
    "t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND "+
    "t.tgattr::text=(SELECT a.attnum::text FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.runs'::regclass AND a.attname='status' AND NOT a.attisdropped)) AS ok "+
    "FROM pg_catalog.pg_trigger t WHERE t.tgname='native_schedule_run_status' OR t.tgfoid='agentstudio.schedule_sync_run_status()'::regprocedure")).rows[0]
  if(!trigger?.ok)refuse()
  return true
}
export async function verifyScheduleRuntimeSchema(pool:SqlPool){const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api")
    if(!await verifyScheduleCredentials(db)||(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_044') AS ok")).rows[0]?.ok!==true)throw Error("native_schedule_schema_required")
  }finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
