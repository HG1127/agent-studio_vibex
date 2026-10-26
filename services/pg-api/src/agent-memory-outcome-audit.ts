import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentMemoryDerivedCredentials} from "./agent-memory-derived-audit.ts"
import {verifyMemoryRelationAcl} from "./agent-memory-relation-acl.ts"
const api="agentstudio_api",prefix="agent_memory_outcome_"
const fields:Record<string,Record<string,string>>={
  consents:{owner_user_id:"uuid",run_id:"uuid",spec_id:"uuid",spec_revision:"bigint",owner_epoch:"bigint",protocol:"text",instruction_sha256:"text",graph_sha256:"text",intent_sha256:"text",memory_id:"uuid",created_at:"timestamp with time zone"},
  stops:{owner_user_id:"uuid",run_id:"uuid",request_id:"uuid",intent_sha256:"text",request_sha256:"text",created_at:"timestamp with time zone"},
  results:{owner_user_id:"uuid",run_id:"uuid",memory_id:"uuid",intent_sha256:"text",decision:"text",reason_code:"text",source_sha256:"text",created_at:"timestamp with time zone"}
}
const routines:Record<string,{hash:string;language:string;volatility:string;result:string;arguments:string;definer:boolean;execute:boolean}>={
  epoch:{hash:"89ce1baff61beb31f8fef5195a710893568fb40c30e1f4b4c0300944374be36d",language:"plpgsql",volatility:"v",result:"bigint",arguments:"",definer:true,execute:true},
  id:{hash:"6cf6d4ad947b47181042d5aee9075f9f6cd8e6c484bf9509c8ea1c14b7c73688",language:"sql",volatility:"i",result:"uuid",arguments:"uuid, uuid, text",definer:false,execute:true},
  consent_guard:{hash:"bcd1ede346c30f9150125e503eb0fcca7599f2daffa9f6f7315fc30d62c7a0d4",language:"plpgsql",volatility:"v",result:"trigger",arguments:"",definer:false,execute:false},
  stop_guard:{hash:"dec677e55219f71145c678eaac468bdae2d8c0eccfd717d69a0c7f5ffdaa3f4e",language:"plpgsql",volatility:"v",result:"trigger",arguments:"",definer:false,execute:false},
  result_guard:{hash:"30cd680d7f7e9b4119ce281e6bb1e9fac12a6c1e2e6bcbfd368c605c143fd165",language:"plpgsql",volatility:"v",result:"trigger",arguments:"",definer:false,execute:false}
}
const refuse=():never=>{throw Error("unsafe_agent_memory_outcome_privileges")}
export async function verifyAgentMemoryOutcomeCredentials(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number|null}>("SELECT name,to_regclass('agentstudio.'||name)::oid AS id FROM unnest($1::text[])name",[Object.keys(fields).map(k=>prefix+k)])).rows
  const functions=(await db.query<{name:string;hash:string;language:string;volatility:string;result:string;arguments:string;definer:boolean;execute:boolean;safe:boolean}>("SELECT p.proname AS name,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS hash,l.lanname AS language,p.provolatile AS volatility,p.prorettype::regtype::text AS result,oidvectortypes(p.proargtypes) AS arguments,p.prosecdef AS definer,has_function_privilege($2,p.oid,'EXECUTE') AS execute,"+
    "NOT p.proleakproof AND NOT p.proretset AND NOT p.proisstrict AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.proargnames IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR "+
    "(a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) OR NOT p.proname=ANY($3::text[]) OR a.is_grantable))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>p.proowner AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND p.proname=ANY($1::text[])",
    [Object.keys(routines).map(k=>prefix+k),api,[prefix+"epoch",prefix+"id"]])).rows
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(objects.length!==3||typeof canRead!=="boolean")return refuse()
  if(!canRead){if(objects.every(o=>o.id===null)&&!functions.length)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_052') AS ok")).rows[0]?.ok
  if(objects.every(o=>o.id===null)&&!functions.length&&stamp===false)return false
  if(stamp!==true||objects.some(o=>!o.id)||functions.length!==5||!await verifyAgentMemoryDerivedCredentials(db))return refuse()
  for(const f of functions){const expected=routines[f.name.slice(prefix.length)]
    if(!expected||!f.safe||Object.entries(expected).some(([key,value])=>f[key as keyof typeof f]!==value))return refuse()}
  for(const object of objects){
    const name=object.name.slice(prefix.length),id=object.id!,singular=name.slice(0,-1),definition=fields[name]!
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "NOT has_table_privilege($2,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
      "(SELECT count(*)=2 AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND CASE polcmd "+
      "WHEN 'r' THEN polname=$3||'_owner_read' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
      "WHEN 'a' THEN polname=$3||'_owner_insert' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' ELSE false END) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok "+
      "FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api,object.name])).rows[0]?.ok
    if(state!==true||!await verifyMemoryRelationAcl(db,id,false))return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;safe:boolean;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,"+
      "a.attidentity='' AND a.attgenerated='' AND CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS safe,"+
      "has_column_privilege($2,a.attrelid,a.attnum,'SELECT') AS read,has_column_privilege($2,a.attrelid,a.attnum,'INSERT') AS insert,has_column_privilege($2,a.attrelid,a.attnum,'UPDATE') AS update,has_column_privilege($2,a.attrelid,a.attnum,'REFERENCES') AS reference "+
      "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped",[id,api])).rows
    if(columns.length!==Object.keys(definition).length||columns.some(c=>definition[c.name]!==c.type||c.required!==(c.name!=="source_sha256")||!c.safe||!c.read||c.insert!==(c.name!=="created_at")||c.update||c.reference))return refuse()
    const triggers=(await db.query<{name:string;ok:boolean}>("SELECT tgname AS name,tgfoid=to_regprocedure($2::text) AND tgtype=7 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgconstraint=0 AND NOT tgdeferrable AND NOT tginitdeferred AND tgattr::text='' AS ok "+
      "FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal",[id,"agentstudio."+prefix+singular+"_guard()"])).rows
    if(triggers.length!==1||triggers[0]?.ok!==true||triggers[0].name!==prefix+singular)return refuse()
    const indexes=(await db.query<{columns:string[];primary:boolean;valid:boolean}>("SELECT i.indisprimary AS primary,i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=i.indnatts AS valid,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
    const expectedIndexes=[["owner_user_id","run_id"],...(name==="results"?[]:[["owner_user_id",name==="stops"?"request_id":"memory_id"]])]
    if(indexes.length!==expectedIndexes.length||expectedIndexes.some((names,i)=>!indexes.some(x=>x.valid&&x.primary===(i===0)&&JSON.stringify(x.columns)===JSON.stringify(names))))return refuse()
    const foreign=(await db.query<{target:string;columns:string[];references:string[];valid:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND confdeltype='r' AND confupdtype='a' AS valid,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    const expectedForeign=name==="consents"?[
      {target:"agentstudio.runs",columns:["run_id","owner_user_id"],references:["id","owner_user_id"]},
      {target:"agentstudio.agent_specs",columns:["spec_id","owner_user_id"],references:["id","owner_user_id"]}]:[
      {target:"agentstudio."+prefix+"consents",columns:["owner_user_id","run_id"],references:["owner_user_id","run_id"]}]
    if(foreign.length!==expectedForeign.length||expectedForeign.some(e=>!foreign.some(f=>f.valid&&f.target===e.target&&JSON.stringify(f.columns)===JSON.stringify(e.columns)&&JSON.stringify(f.references)===JSON.stringify(e.references))))return refuse()
    if((await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='c'",[id])).rows[0]?.n!==0)return refuse()
  }
  return true
}
export async function inspectAgentMemoryOutcomeSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentMemoryOutcomeCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
