import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentMemoryFailureSourceCredentials} from "./agent-memory-failure-source-audit.ts"
import {verifyMemoryRelationAcl} from "./agent-memory-relation-acl.ts"
const api="agentstudio_api",prefix="agent_feedback_",refuse=():never=>{throw Error("unsafe_agent_feedback_privileges")}
const functions:Record<string,{args:string;returns:string;language:string;volatility:string;strict:boolean;execute:boolean;sha:string}>={
  agent_feedback_digest:{args:"text[]",returns:"text",language:"sql",volatility:"i",strict:true,execute:true,sha:"8aec820f04e8d122c050bf49285bef74b5dcaeae40d0833bf5ee2d8ad9fa5aec"},
  agent_feedback_statement_sha256:{args:"uuid, uuid, text, text, jsonb, text",returns:"text",language:"sql",volatility:"i",strict:true,execute:true,sha:"d2224da3c608389b5d706dc1c6ac6fdba3d1eea7a218f4166f434bac45033a8f"},
  agent_feedback_run_source_sha256:{args:"uuid",returns:"text",language:"sql",volatility:"s",strict:true,execute:true,sha:"630a415ac07f2d3261a70db280d359fce7fd1c8ec1a5d504819861a8aa8e4f92"},
  agent_feedback_receipt_guard:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,sha:"e15b57272181a9298024a6910542186ed1df21f1ec6cdb23e98a55ba80c3e7a5"},
  agent_feedback_body_guard:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,sha:"570ddf4087b949f92d5629c1b096fbbb46b546731b1523c274171c37768706c8"},
  agent_feedback_lesson_result_guard:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,sha:"4ae7a29c288292df651b2306017bf35627bff96d79971f50a46a9b198b3bb001"},
  agent_feedback_lesson_guard:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,sha:"dcc5db9cd97ebd8ab65c8e0f8c4376473b572db5dd05f0b0abed98543984e0af"},
}
type Foreign={target:string;columns:string[];references:string[]}
type Table={fields:Record<string,string>;insert:string[];nullable:string[];erase:boolean;pk:string[];foreign:Foreign[];trigger:string;fn:string;triggerType:number}
const reference=(target:string,columns:string[],references:string[]):Foreign=>({target:"agentstudio."+target,columns,references})
const tables:Record<string,Table>={
  agent_feedback_receipts:{fields:{owner_user_id:"uuid",request_id:"uuid",run_id:"uuid",spec_id:"uuid",action:"text",revision:"bigint",feedback_id:"uuid",source_sha256:"text",statement_sha256:"text",feedback_sha256:"text",request_sha256:"text",owner_epoch:"bigint",remember_lesson:"boolean",created_at:"timestamp with time zone"},
    insert:["owner_user_id","request_id","run_id","spec_id","action","revision","feedback_id","source_sha256","statement_sha256","request_sha256","remember_lesson"],nullable:[],erase:false,pk:["owner_user_id","request_id"],
    foreign:[reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"]),reference("runs",["run_id","owner_user_id"],["id","owner_user_id"]),reference("agent_specs",["spec_id","owner_user_id"],["id","owner_user_id"])],trigger:"agent_feedback_receipt",fn:"agent_feedback_receipt_guard",triggerType:7},
  agent_feedback_bodies:{fields:{owner_user_id:"uuid",feedback_id:"uuid",rating:"text",tags:"jsonb",comment:"text",created_at:"timestamp with time zone"},insert:["owner_user_id","feedback_id","rating","tags","comment"],nullable:[],erase:true,pk:["owner_user_id","feedback_id"],foreign:[reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"])],trigger:"agent_feedback_body",fn:"agent_feedback_body_guard",triggerType:15},
  agent_feedback_lesson_results:{fields:{owner_user_id:"uuid",feedback_id:"uuid",decision:"text",content_sha256:"text",created_at:"timestamp with time zone"},insert:["owner_user_id","feedback_id","decision","content_sha256"],nullable:["content_sha256"],erase:false,pk:["owner_user_id","feedback_id"],foreign:[reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"])],trigger:"agent_feedback_lesson_result",fn:"agent_feedback_lesson_result_guard",triggerType:7},
  agent_feedback_lessons:{fields:{owner_user_id:"uuid",feedback_id:"uuid",fact:"text",content_sha256:"text",created_at:"timestamp with time zone"},insert:["owner_user_id","feedback_id","fact","content_sha256"],nullable:[],erase:true,pk:["owner_user_id","feedback_id"],foreign:[reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"])],trigger:"agent_feedback_lesson",fn:"agent_feedback_lesson_guard",triggerType:15},
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
// Keep the exact literal. Only PostgreSQL's optional external text cast varies;
// normalizing inside quoted values would accept a different index predicate.
const revisionPredicate=(v:string|null)=>v==="(action <> 'forget_lesson'::text)"||v==="(action <> 'forget_lesson')"
export async function verifyAgentFeedbackCredentials(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number}>("SELECT c.relname AS name,c.oid::integer AS id FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,15)=$1 AND c.relkind NOT IN('i','I')",[prefix])).rows
  const routines=(await db.query<{name:string;args:string;returns:string;language:string;volatility:string;strict:boolean;execute:boolean;sha:string;safe:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,p.prorettype::regtype::text AS returns,l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS strict,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS execute,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "NOT p.prosecdef AND NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) OR a.is_grantable)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>p.proowner AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,15)=$1",[prefix,api])).rows
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(!objects.length&&!routines.length)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_054') AS ok")).rows[0]?.ok
  if(stamp===false&&!objects.length&&!routines.length)return false
  if(stamp!==true||objects.length!==Object.keys(tables).length||routines.length!==Object.keys(functions).length||!await verifyAgentMemoryFailureSourceCredentials(db))return refuse()
  for(const row of routines){const expected=functions[row.name];if(!expected||row.safe!==true||Object.entries(expected).some(([k,v])=>row[k as keyof typeof row]!==v))return refuse()}
  for(const object of objects){
    const expected=tables[object.name];if(!expected)return refuse();const id=object.id
    const relation=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND "+
      "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
      "has_table_privilege($2,c.oid,'SELECT') AND has_table_privilege($2,c.oid,'DELETE')=$3::boolean AND NOT has_any_column_privilege($2,c.oid,'UPDATE,REFERENCES') AND NOT has_table_privilege($2,c.oid,'TRUNCATE,TRIGGER') AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api,expected.erase])).rows[0]?.ok
    if(relation!==true||!await verifyMemoryRelationAcl(db,id,expected.erase))return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;insert:boolean;clean:boolean}>("SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,has_column_privilege($2,a.attrelid,a.attnum,'INSERT') AS insert,"+
      "a.attidentity='' AND a.attgenerated='' AND CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS clean "+
      "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped",[id,api])).rows
    if(columns.length!==Object.keys(expected.fields).length||columns.some(c=>c.type!==expected.fields[c.name]||c.required===expected.nullable.includes(c.name)||c.insert!==expected.insert.includes(c.name)||c.clean!==true))return refuse()
    const policies=(await db.query<{name:string;command:string;ok:boolean}>("SELECT polname AS name,polcmd AS command,polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND "+
      "CASE polcmd WHEN 'r' THEN pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
      "WHEN 'a' THEN polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' "+
      "WHEN 'd' THEN pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL ELSE false END AS ok FROM pg_catalog.pg_policy WHERE polrelid=$1::oid",[id,api])).rows
    const policyPrefix=object.name
    const policyNames=[{name:policyPrefix+"_read",command:"r"},{name:policyPrefix+"_insert",command:"a"},...(expected.erase?[{name:policyPrefix+"_delete",command:"d"}]:[])]
    if(policies.length!==policyNames.length||policyNames.some(p=>!policies.some(q=>q.name===p.name&&q.command===p.command&&q.ok===true)))return refuse()
    const triggers=(await db.query<{name:string;fn:string;type:number;ok:boolean}>("SELECT t.tgname AS name,p.proname AS fn,t.tgtype::integer AS type,t.tgenabled='O' AND n.nspname='agentstudio' AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS ok FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid=$1::oid AND NOT t.tgisinternal",[id])).rows
    if(triggers.length!==1||triggers[0]?.ok!==true||triggers[0].name!==expected.trigger||triggers[0].fn!==expected.fn||triggers[0].type!==expected.triggerType)return refuse()
    const indexes=(await db.query<{primary:boolean;columns:string[];predicate:string|null;ok:boolean}>("SELECT i.indisprimary AS primary,pg_get_expr(i.indpred,i.indrelid) AS predicate,i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL AND i.indnatts=i.indnkeyatts AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
    const extra=object.name==="agent_feedback_receipts"
    if(indexes.length!==(extra?2:1)||!indexes.some(i=>i.ok&&i.primary&&i.predicate===null&&same(i.columns,expected.pk))||extra&&!indexes.some(i=>i.ok&&!i.primary&&same(i.columns,["owner_user_id","run_id","revision"])&&revisionPredicate(i.predicate)))return refuse()
    const pk=(await db.query<{ok:boolean}>("SELECT convalidated AND NOT condeferrable AND NOT condeferred AS ok FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='p'",[id])).rows
    const foreign=(await db.query<Foreign&{ok:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND NOT condeferred AND confmatchtype='s' AND confupdtype='a' AND confdeltype='r' AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
      "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    const logical=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype IN('p','f','c','u','x')",[id])).rows[0]?.n
    if(pk.length!==1||pk[0]?.ok!==true||foreign.length!==expected.foreign.length||logical!==1+expected.foreign.length||expected.foreign.some(e=>!foreign.some(f=>f.ok&&f.target===e.target&&same(f.columns,e.columns)&&same(f.references,e.references))))return refuse()
  }
  return true
}
export async function inspectAgentFeedbackSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentFeedbackCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
