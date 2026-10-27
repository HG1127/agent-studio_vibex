import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentMemoryOutcomeCredentials} from "./agent-memory-outcome-audit.ts"
import {verifyMemoryRelationAcl} from "./agent-memory-relation-acl.ts"
const table="agentstudio.agent_memory_failure_sources",routine="agent_memory_record_failure_source",api="agentstudio_api",worker="agentstudio_worker"
const fields:Record<string,string>={owner_user_id:"uuid",run_id:"uuid",job_id:"uuid",lease_version:"bigint",worker_sha256:"text",protocol:"text",source_sha256:"text",graph_sha256:"text",error_code:"text",owner_epoch:"bigint",created_at:"timestamp with time zone"}
const sourceHash="939cf33a95479324715479a3aee08a2464e68e8ab4d33fb152945e96e021e494"
const refuse=():never=>{throw Error("unsafe_agent_memory_failure_source_privileges")}
export async function verifyAgentMemoryFailureSourceCredentials(db:SqlClient):Promise<boolean>{
  const id=(await db.query<{id:number|null}>("SELECT to_regclass($1::text)::oid AS id",[table])).rows[0]?.id
  const functions=(await db.query<{ok:boolean}>("SELECT l.lanname='plpgsql' AND p.provolatile='v' AND p.prosecdef AND p.prorettype::regtype::text='boolean' AND "+
    "oidvectortypes(p.proargtypes)='uuid, uuid, bigint, text' AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$2 AND "+
    "NOT p.proleakproof AND NOT p.proretset AND NOT p.proisstrict AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.proargnames IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "has_function_privilege($3,p.oid,'EXECUTE') AND NOT has_function_privilege($4,p.oid,'EXECUTE') AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR "+
    "a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$3) OR a.is_grantable)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>p.proowner AND r.rolname<>$3 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS ok "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND p.proname=$1",[routine,sourceHash,worker,api])).rows
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(id===undefined||typeof canRead!=="boolean")return refuse()
  if(!canRead){if(id===null&&!functions.length)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_053') AS ok")).rows[0]?.ok
  if(id===null&&!functions.length&&stamp===false)return false
  if(!id||stamp!==true||functions.length!==1||functions[0]?.ok!==true||!await verifyAgentMemoryOutcomeCredentials(db))return refuse()
  const relation=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
    "has_table_privilege($2,c.oid,'SELECT') AND NOT has_any_column_privilege($2,c.oid,'INSERT,UPDATE,REFERENCES') AND NOT has_table_privilege($2,c.oid,'DELETE,TRUNCATE,TRIGGER') AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
    "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
    "(SELECT count(*)=1 AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND polcmd='r' AND polname='agent_memory_failure_owner_read' AND "+
    "pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api])).rows[0]?.ok
  if(relation!==true||!await verifyMemoryRelationAcl(db,id,false))return refuse()
  const columns=(await db.query<{name:string;type:string;ok:boolean}>("SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AND a.attidentity='' AND a.attgenerated='' AND "+
    "CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS ok "+
    "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped",[id])).rows
  if(columns.length!==Object.keys(fields).length||columns.some(c=>fields[c.name]!==c.type||c.ok!==true))return refuse()
  const indexes=(await db.query<{ok:boolean}>("SELECT i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=2 AND i.indnatts=2 AND "+
    "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o)=ARRAY['owner_user_id','run_id']::text[] AS ok "+
    "FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
  if(indexes.length!==1||indexes[0]?.ok!==true)return refuse()
  const foreign=(await db.query<{target:string;columns:string[];references:string[];ok:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND NOT condeferred AND confmatchtype='s' AND confupdtype='a' AND confdeltype='r' AS ok,"+
    "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
    "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
  const expected=[{target:"agentstudio.runs",columns:["run_id","owner_user_id"],references:["id","owner_user_id"]},{target:"agentstudio.jobs",columns:["job_id"],references:["id"]}]
  if(foreign.length!==2||expected.some(e=>!foreign.some(f=>f.ok&&f.target===e.target&&JSON.stringify(f.columns)===JSON.stringify(e.columns)&&JSON.stringify(f.references)===JSON.stringify(e.references))))return refuse()
  // NOT NULL is checked for every column above; audit logical PK/FK/check/
  // unique/exclusion constraints independently of their catalog representation.
  if((await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype IN('p','f','c','u','x')",[id])).rows[0]?.n!==3)return refuse()
  return true
}
export async function inspectAgentMemoryFailureSourceSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentMemoryFailureSourceCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
