import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyMemoryRelationAcl} from "./agent-memory-relation-acl.ts"
import {verifyAgentMemoryContextCredentials} from "./agent-memory-context-audit.ts"
const api="agentstudio_api",receipt="agent_memory_derived_receipts",entry="agent_memory_derived_entries"
const fields:Record<string,Record<string,string>>={
  [receipt]:{owner_user_id:"uuid",request_id:"uuid",memory_id:"uuid",spec_id:"uuid",source_run_id:"uuid",action:"text",kind:"text",source_sha256:"text",content_sha256:"text",tools_sha256:"text",request_sha256:"text",created_at:"timestamp with time zone"},
  [entry]:{owner_user_id:"uuid",id:"uuid",fact:"text",tools_used:"text",content_sha256:"text",tools_sha256:"text",created_at:"timestamp with time zone"}
}
const functions:Record<string,{hash:string;language:string;volatility:string;result:string;arguments:string;execute:boolean}>={
  agent_memory_run_source_sha256:{hash:"d4d7c0e31b04f8e3f1cce2038902c96c87224b9987f71dc196dd4eece4ded0c1",language:"sql",volatility:"s",result:"text",arguments:"uuid",execute:true},
  agent_memory_derived_receipt_guard:{hash:"95d589ecab0bd8c4abfd19136eda56d57d616a7d91adbff60832b230d990d84f",language:"plpgsql",volatility:"v",result:"trigger",arguments:"",execute:false},
  agent_memory_derived_entry_guard:{hash:"ddd3f3709865bde40168a7c60f0ca016511b209590303ee45d68893ec59d1e59",language:"plpgsql",volatility:"v",result:"trigger",arguments:"",execute:false}
}
const checks:Record<string,string>={
  agent_memory_derived_entries_check:"(content_sha256=encode(sha256(convert_to(fact,'UTF8'::name)),'hex'::text))",
  agent_memory_derived_entries_check1:"(tools_sha256=encode(sha256(convert_to(tools_used,'UTF8'::name)),'hex'::text))",
  agent_memory_derived_entries_fact_check:"(((length(btrim(fact))>=1)AND(length(btrim(fact))<=500))AND(octet_length(fact)<=2000))",
  agent_memory_derived_entries_tools_used_check:"((length(tools_used)<=300)AND(octet_length(tools_used)<=1200)AND(tools_used!~'[[:cntrl:]]'::text))",
  agent_memory_derived_receipts_action_check:"(action=ANY(ARRAY['save_success'::text,'save_failure'::text,'forget'::text]))",
  agent_memory_derived_receipts_check:"(((action='save_success'::text)AND(kind='fact'::text)AND(request_id=memory_id))OR((action='save_failure'::text)AND(kind='lesson'::text)AND(request_id=memory_id))OR((action='forget'::text)AND(request_id<>memory_id)))",
  agent_memory_derived_receipts_content_sha256_check:"(content_sha256~'^[a-f0-9]{64}$'::text)",
  agent_memory_derived_receipts_kind_check:"(kind=ANY(ARRAY['fact'::text,'lesson'::text]))",
  agent_memory_derived_receipts_request_sha256_check:"(request_sha256~'^[a-f0-9]{64}$'::text)",
  agent_memory_derived_receipts_source_sha256_check:"(source_sha256~'^[a-f0-9]{64}$'::text)",
  agent_memory_derived_receipts_tools_sha256_check:"(tools_sha256~'^[a-f0-9]{64}$'::text)"
}
const refuse=():never=>{throw Error("unsafe_agent_memory_derived_privileges")}
function expressionKey(value:string):string{
  let out="",quoted=false
  for(let i=0;i<value.length;i++){
    const c=value[i]!
    if(quoted){out+=c;if(c==="'"){if(value[i+1]==="'"){out+="'";i++}else quoted=false}}
    else if(c==="'"){quoted=true;out+=c}else if(!/\s/u.test(c))out+=c
  }
  return out
}
export async function verifyAgentMemoryDerivedCredentials(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number|null}>("SELECT name,to_regclass('agentstudio.'||name)::oid AS id FROM unnest($1::text[])name",[Object.keys(fields)])).rows
  const routines=(await db.query<{name:string;hash:string;language:string;volatility:string;result:string;arguments:string;safe:boolean;execute:boolean}>("SELECT p.proname AS name,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS hash,l.lanname AS language,p.provolatile AS volatility,p.prorettype::regtype::text AS result,oidvectortypes(p.proargtypes) AS arguments,"+
    "NOT p.prosecdef AND NOT p.proleakproof AND NOT p.proretset AND NOT p.proisstrict AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.proargnames IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR "+
    "(a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) OR p.proname<>'agent_memory_run_source_sha256' OR a.is_grantable))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>p.proowner AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS execute FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND p.proname=ANY($1::text[])",[Object.keys(functions),api])).rows
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(objects.length!==2||typeof canRead!=="boolean")return refuse()
  if(!canRead){if(objects.every(o=>o.id===null)&&!routines.length)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_051') AS ok")).rows[0]?.ok
  if(objects.every(o=>o.id===null)&&!routines.length&&stamp===false)return false
  if(stamp!==true||objects.some(o=>!o.id)||routines.length!==3||!await verifyAgentMemoryContextCredentials(db))return refuse()
  if(routines.some(f=>!Object.hasOwn(functions,f.name)||!f.safe||Object.entries(functions[f.name]!).some(([key,value])=>f[key as keyof typeof f]!==value)))return refuse()
  for(const object of objects){
    const erase=object.name===entry,id=object.id!
    const state=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AND "+
      "NOT has_table_privilege($2,c.oid,'UPDATE,TRUNCATE,REFERENCES,TRIGGER') AND has_table_privilege($2,c.oid,'DELETE')=$3::boolean AND "+
      "(SELECT count(*)=$4::integer AND bool_and(polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND CASE polcmd "+
      "WHEN 'r' THEN polname=$5||'_owner_read' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
      "WHEN 'a' THEN polname=$5||'_owner_insert' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' "+
      "WHEN 'd' THEN $3::boolean AND polname=$5||'_owner_delete' AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL ELSE false END) FROM pg_catalog.pg_policy WHERE polrelid=c.oid) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api,erase,erase?3:2,object.name])).rows[0]?.ok
    if(state!==true||!await verifyMemoryRelationAcl(db,id,erase))return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;read:boolean;insert:boolean;update:boolean;reference:boolean}>("SELECT attname AS name,atttypid::regtype::text AS type,attnotnull AS required,has_column_privilege($2,attrelid,attnum,'SELECT') AS read,"+
      "has_column_privilege($2,attrelid,attnum,'INSERT') AS insert,has_column_privilege($2,attrelid,attnum,'UPDATE') AS update,has_column_privilege($2,attrelid,attnum,'REFERENCES') AS reference FROM pg_catalog.pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped",[id,api])).rows
    if(columns.length!==Object.keys(fields[object.name]!).length||columns.some(c=>fields[object.name]?.[c.name]!==c.type||!c.required||!c.read||c.insert!==(c.name!=="created_at")||c.update||c.reference))return refuse()
    const triggers=(await db.query<{name:string;function_ok:boolean;kind:number;ok:boolean}>("SELECT tgname AS name,tgfoid=to_regprocedure($2::text) AS function_ok,tgtype AS kind,tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgconstraint=0 AND NOT tgdeferrable AND NOT tginitdeferred AND tgattr::text='' AS ok FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal",[id,"agentstudio."+(erase?"agent_memory_derived_entry_guard()":"agent_memory_derived_receipt_guard()")])).rows
    if(triggers.length!==1||triggers.some(t=>!t.ok||!t.function_ok||t.name!==(erase?"agent_memory_derived_entry_receipt":"agent_memory_derived_source")||t.kind!==(erase?15:7)))return refuse()
    const indexes=(await db.query<{columns:string[];valid:boolean}>("SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AS valid,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
    for(const names of erase?[["owner_user_id","id"]]:[["owner_user_id","request_id"],["owner_user_id","memory_id","action"]])if(!indexes.some(i=>i.valid&&JSON.stringify(i.columns)===JSON.stringify(names)))return refuse()
    const foreign=(await db.query<{target:string;columns:string[];references:string[];valid:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND confdeltype='r' AND confupdtype='a' AS valid,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    const wanted=erase?[{target:"agentstudio."+receipt,columns:["owner_user_id","id"],references:["owner_user_id","request_id"]}]:[
      {target:"agentstudio."+receipt,columns:["owner_user_id","memory_id"],references:["owner_user_id","request_id"]},
      {target:"agentstudio.agent_specs",columns:["spec_id","owner_user_id"],references:["id","owner_user_id"]},
      {target:"agentstudio.runs",columns:["source_run_id","owner_user_id"],references:["id","owner_user_id"]}]
    if(foreign.length!==wanted.length||wanted.some(w=>!foreign.some(f=>f.valid&&f.target===w.target&&JSON.stringify(f.columns)===JSON.stringify(w.columns)&&JSON.stringify(f.references)===JSON.stringify(w.references))))return refuse()
    const constraints=(await db.query<{name:string;expression:string;valid:boolean}>("SELECT conname AS name,pg_get_expr(conbin,conrelid) AS expression,convalidated AND NOT connoinherit AS valid FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='c'",[id])).rows
    if(constraints.length!==Object.keys(checks).filter(name=>name.startsWith(object.name+"_")).length||constraints.some(c=>!c.valid||expressionKey(c.expression)!==checks[c.name]))return refuse()
  }
  return true
}
export async function inspectAgentMemoryDerivedSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentMemoryDerivedCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
