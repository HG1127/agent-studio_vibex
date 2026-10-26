import type {SqlClient,SqlPool} from "./contracts.ts"
const table="agentstudio.agent_human_input_responses",role="agentstudio_api"
const columns=["owner_user_id","run_id","request_id","parent_step_key","step_key","source_sha256","pending_sha256","input_sha256","kind","decision","answer_sha256","request_sha256","created_at"]
function refuse():never{throw Error("unsafe_agent_human_input_privileges")}
export async function verifyAgentHumanInputCredentials(db:SqlClient):Promise<boolean>{
  const object=(await db.query<{id:number|null}>("SELECT to_regclass($1)::oid AS id",[table])).rows[0]
  if(!object||object.id!==null&&(!Number.isSafeInteger(object.id)||object.id<=0))refuse()
  const id=object.id
  const access=(await db.query<{ok:boolean;role:string}>("SELECT current_user AS role,has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]
  const canRead=access?.ok
  if(typeof canRead!=="boolean")refuse()
  if(!canRead&&!["agentstudio_bound_dispatch","agentstudio_model_broker"].includes(access!.role))refuse()
  let stamped=false
  if(canRead){const value=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_048') AS ok")).rows[0]?.ok
    if(typeof value!=="boolean")refuse();stamped=value}
  // Dedicated identity/Broker groups cannot read the migration ledger. They
  // still inspect the complete catalog and cross-role grants below. API and
  // Worker (and the SET ROLE API startup wrapper) must verify the actual stamp.
  if(!id){if(stamped)refuse();return false}
  if(canRead&&!stamped)refuse()
  const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
    "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AND "+
    "NOT has_table_privilege($2,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
    "(SELECT count(*)=2 AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND "+
    "CASE polcmd WHEN 'r' THEN polname='agent_human_input_owner_read' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
    "WHEN 'a' THEN polname='agent_human_input_owner_insert' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' ELSE false END) "+
    "FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,role])).rows[0]?.ok
  if(!state)refuse()
  const grants=(await db.query<{name:string;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT attname AS name,has_column_privilege($2,attrelid,attnum,'SELECT') AS read,"+
    "has_column_privilege($2,attrelid,attnum,'INSERT') AS insert,has_column_privilege($2,attrelid,attnum,'UPDATE') AS update,has_column_privilege($2,attrelid,attnum,'REFERENCES') AS reference "+
    "FROM pg_catalog.pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped",[id,role])).rows
  if(grants.length!==columns.length||grants.some(c=>!columns.includes(c.name)||c.read!==true||c.insert!==(c.name!=="created_at")||c.update!==false||c.reference!==false))refuse()
  const indexes=(await db.query<{name:string;columns:string[];unique:boolean;valid:boolean}>("SELECT c.relname AS name,i.indisunique AS unique,i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AS valid,"+
    "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns "+
    "FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=$1::oid",[id])).rows
  for(const names of [["owner_user_id","request_id"],["run_id","step_key"]])if(!indexes.some(i=>i.unique===true&&i.valid===true&&JSON.stringify(i.columns)===JSON.stringify(names)))refuse()
  const foreign=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(convalidated AND NOT condeferrable AND confdeltype='r' AND confupdtype='a' AND confrelid='agentstudio.runs'::regclass AND "+
    "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o)=ARRAY['run_id','owner_user_id']::text[] AND "+
    "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o)=ARRAY['id','owner_user_id']::text[]) AS ok "+
    "FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows[0]?.ok
  if(foreign!==true)refuse()
  const fields=["goal","task_scope","deliverables","task_plan","done_criteria","tools","http_tools","mcp_tools","knowledge_base_ids","knowledge_retrieval","model_binding","require_approval","require_plan_review"]
  const expressions:Record<string,string>={
    agent_release_human_spec_required:"COALESCE(((jsonb_typeof(spec_snapshot)='object'::text)AND((spec_snapshot->'require_approval'::text)='true'::jsonb)AND(jsonb_typeof((spec_snapshot->'goal'::text))='string'::text)),false)",
    agent_release_human_spec_fields:"((spec_snapshot-ARRAY["+fields.map(name=>"'"+name+"'::text").join(",")+"])='{}'::jsonb)",
    agent_release_plan_review_boolean:"((NOT(spec_snapshot?'require_plan_review'::text))OR(jsonb_typeof((spec_snapshot->'require_plan_review'::text))='boolean'::text))"
  }
  const constraints=(await db.query<{name:string;valid:boolean;expression:string}>("SELECT conname AS name,contype='c' AND convalidated AND NOT connoinherit AS valid,"+
    "regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]]','','g') AS expression FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_release_versions'::regclass AND conname=ANY($1::text[])",[Object.keys(expressions)])).rows
  if(constraints.length!==3||constraints.some(c=>c.valid!==true||c.expression!==expressions[c.name]))refuse()
  const schedule=(await db.query<{ok:boolean}>("SELECT prosecdef AND provolatile='v' AND proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_scheduler') AND "+
    "proconfig=ARRAY['search_path=pg_catalog']::text[] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=$1::text AS ok FROM pg_catalog.pg_proc "+
    "WHERE oid=to_regprocedure('agentstudio.schedule_reserve(uuid,bigint,timestamp with time zone,timestamp with time zone,text)')",["7963e0cfd5ee0995456c9594533347e1e26263463fa2a33e12ac4b48484fb950"])).rows[0]?.ok
  if(schedule!==true)refuse()
  return true
}
export async function inspectAgentHumanInputSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentHumanInputCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
