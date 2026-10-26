import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentMemoryCredentials} from "./agent-memory-audit.ts"
const table="agentstudio.agent_memory_run_contexts",api="agentstudio_api"
const fields:Record<string,string>={owner_user_id:"uuid",run_id:"uuid",spec_id:"uuid",spec_revision:"bigint",protocol:"text",graph_sha256:"text",context_sha256:"text",created_at:"timestamp with time zone"}
const refuse=():never=>{throw Error("unsafe_agent_memory_context_privileges")}
export async function verifyAgentMemoryContextCredentials(db:SqlClient):Promise<boolean>{
  const object=(await db.query<{id:number|null}>("SELECT to_regclass($1)::oid AS id",[table])).rows[0]
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(!object||typeof canRead!=="boolean")return refuse()
  if(object.id===null&&!canRead)return false
  if(!canRead)return refuse()
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_050') AS ok")).rows[0]?.ok
  if(object.id===null&&stamp===false)return false
  if(!object.id||stamp!==true||!await verifyAgentMemoryCredentials(db))return refuse()
  const id=object.id
  const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
    "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
    "NOT has_table_privilege($2,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AND "+
    "(SELECT count(*)=2 AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND "+
    "CASE polcmd WHEN 'r' THEN polname='agent_memory_context_owner_read' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
    "WHEN 'a' THEN polname='agent_memory_context_owner_insert' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' ELSE false END) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api])).rows[0]?.ok
  if(state!==true)return refuse()
  const columns=(await db.query<{name:string;type:string;required:boolean;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT attname AS name,atttypid::regtype::text AS type,attnotnull AS required,"+
    "has_column_privilege($2,attrelid,attnum,'SELECT') AS read,has_column_privilege($2,attrelid,attnum,'INSERT') AS insert,has_column_privilege($2,attrelid,attnum,'UPDATE') AS update,has_column_privilege($2,attrelid,attnum,'REFERENCES') AS reference "+
    "FROM pg_catalog.pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped",[id,api])).rows
  if(columns.length!==8||columns.some(c=>fields[c.name]!==c.type||!c.required||!c.read||c.insert!==(c.name!=="created_at")||c.update||c.reference))return refuse()
  const indexes=(await db.query<{valid:boolean;columns:string[]}>("SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AS valid,"+
    "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
  if(!indexes.some(i=>i.valid&&JSON.stringify(i.columns)===JSON.stringify(["owner_user_id","run_id"])))return refuse()
  const foreign=(await db.query<{target:string;columns:string[];references:string[];valid:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND confdeltype='r' AND confupdtype='a' AS valid,"+
    "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
    "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references "+
    "FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
  const expected=[{target:"agentstudio.runs",columns:["run_id","owner_user_id"],references:["id","owner_user_id"]},
    {target:"agentstudio.agent_specs",columns:["spec_id","owner_user_id"],references:["id","owner_user_id"]}]
  if(foreign.length!==2||expected.some(w=>!foreign.some(f=>f.valid&&f.target===w.target&&JSON.stringify(f.columns)===JSON.stringify(w.columns)&&JSON.stringify(f.references)===JSON.stringify(w.references))))return refuse()
  const checks=(await db.query<{name:string;valid:boolean;expression:string}>("SELECT conname AS name,convalidated AND NOT connoinherit AS valid,regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]]','','g') AS expression "+
    "FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='c'",[id])).rows
  const expressions:Record<string,string>={agent_memory_run_contexts_spec_revision_check:"((spec_revision>=1)AND(spec_revision<=9007199254740991))",agent_memory_run_contexts_protocol_check:"(protocol='agent_memory_context_v1')",
    agent_memory_run_contexts_graph_sha256_check:"(graph_sha256~'^[a-f0-9]{64}$')",agent_memory_run_contexts_context_sha256_check:"(context_sha256~'^[a-f0-9]{64}$')"}
  const normalized=(s:string)=>s.replace(/'([0-9]+)'::bigint/g,"$1").replace(/::(?:text|bigint)/g,"")
  if(checks.length!==4||checks.some(c=>!c.valid||normalized(c.expression)!==expressions[c.name]))return refuse()
  return true
}
export async function inspectAgentMemoryContextSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentMemoryContextCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
