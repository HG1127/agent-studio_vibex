import type {SqlClient,SqlPool} from "./contracts.ts"
import {verifyAgentFeedbackCredentials} from "./agent-feedback-audit.ts"
import {verifyAgentCollaborationCredentials} from "./agent-collaboration-audit.ts"
import {verifyMemoryRelationAcl} from "./agent-memory-relation-acl.ts"
const api="agentstudio_api",prefix="agent_optimization_",refuse=():never=>{throw Error("unsafe_agent_optimization_privileges")}
const functions:Record<string,{args:string;returns:string;language:string;volatility:string;strict:boolean;execute:boolean;definer:boolean;sha:string}>={
  agent_optimization_compact:{args:"jsonb",returns:"text",language:"plpgsql",volatility:"i",strict:true,execute:true,definer:false,sha:"1b315be46dc61561b974dab6a7f80e6f6992077c18e809e4cd418ab7210515fa"},
  agent_optimization_candidate_sha:{args:"text, jsonb",returns:"text",language:"sql",volatility:"i",strict:true,execute:true,definer:false,sha:"69e763b204e5c80b498c5aefbc226758b2c00d9263391f10a4f05cc2e2e4b0cf"},
  agent_optimization_role_sha:{args:"uuid, uuid, text, bigint, jsonb",returns:"text",language:"sql",volatility:"i",strict:true,execute:true,definer:false,sha:"b4f5e2b171fac2147c9c9b09f0ce4a688ffce5260d4dbdb6872747be4d09f482"},
  agent_optimization_intent_guard:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,definer:false,sha:"057a9defe65c28a23745d041887d1bb877cb198f8a98a5dd6c8939c3ba5c0cee"},
  agent_optimization_role_history:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,definer:true,sha:"e0f6cfa1db578a4829fcbc06e0343607fa4f82aba950f02578b3ccc0f9b41295"},
}
type Foreign={target:string;columns:string[];references:string[]}
type Table={fields:Record<string,string>;insert:string[];pk:string[];unique:string[][];foreign:Foreign[];trigger:{name:string;fn:string;type:number}|null}
const reference=(target:string,columns:string[],references:string[]):Foreign=>({target:"agentstudio."+target,columns,references})
const common={owner_user_id:"uuid",request_id:"uuid",spec_id:"uuid",run_id:"uuid",feedback_id:"uuid",feedback_sha256:"text"}
const ownership=[reference("agent_specs",["spec_id","owner_user_id"],["id","owner_user_id"]),reference("runs",["run_id","owner_user_id"],["id","owner_user_id"]),reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"])]
const tables:Record<string,Table>={
  agent_optimization_intents:{fields:{...common,before_spec_revision:"bigint",before_spec_sha256:"text",candidate_sha256:"text",request_sha256:"text",feedback_revision:"bigint",feedback_source_sha256:"text",owner_epoch:"bigint",transaction_id:"text",created_at:"timestamp with time zone"},insert:["owner_user_id","request_id","spec_id","run_id","feedback_id","feedback_sha256","before_spec_revision","before_spec_sha256","candidate_sha256","request_sha256"],pk:["owner_user_id","request_id"],unique:[["owner_user_id","spec_id","transaction_id"]],foreign:ownership,trigger:{name:"agent_optimization_intent",fn:"agent_optimization_intent_guard",type:7}},
  agent_optimization_links:{fields:{...common,feedback_revision:"bigint",feedback_source_sha256:"text",before_spec_revision:"bigint",after_spec_revision:"bigint",before_spec_sha256:"text",after_spec_sha256:"text",before_revision_id:"uuid",after_revision_id:"uuid",changed_keys:"jsonb",candidate_sha256:"text",request_sha256:"text",owner_epoch:"bigint",created_at:"timestamp with time zone"},insert:[],pk:["owner_user_id","request_id"],unique:[],foreign:[...ownership,reference("agent_optimization_intents",["owner_user_id","request_id"],["owner_user_id","request_id"]),reference("agent_collaboration_revisions",["before_revision_id"],["id"]),reference("agent_collaboration_revisions",["after_revision_id"],["id"])],trigger:null},
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
export async function verifyAgentOptimizationCredentials(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number}>("SELECT c.relname AS name,c.oid::integer AS id FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,19)=$1 AND c.relkind NOT IN('i','I')",[prefix])).rows
  const routines=(await db.query<{name:string;args:string;returns:string;language:string;volatility:string;strict:boolean;execute:boolean;definer:boolean;sha:string;safe:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,p.prorettype::regtype::text AS returns,l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS definer,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS execute,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) OR a.is_grantable)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>p.proowner AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,19)=$1",[prefix,api])).rows
  const mounted=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND (t.tgname='native_agent_optimization_history' OR left(t.tgname,19)=$1 OR left(p.proname,19)=$1)",[prefix])).rows[0]?.n
  if(!Number.isSafeInteger(mounted))return refuse()
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(!objects.length&&!routines.length&&mounted===0)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_055') AS ok")).rows[0]?.ok
  if(stamp===false&&!objects.length&&!routines.length&&mounted===0)return false
  if(stamp!==true||objects.length!==2||routines.length!==5||mounted!==2||!await verifyAgentFeedbackCredentials(db)||!await verifyAgentCollaborationCredentials(db))return refuse()
  for(const row of routines){const expected=functions[row.name];if(!expected||row.safe!==true||Object.entries(expected).some(([k,v])=>row[k as keyof typeof row]!==v))return refuse()}
  for(const object of objects){
    const expected=tables[object.name];if(!expected)return refuse();const id=object.id
    const relation=(await db.query<{ok:boolean}>("SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND "+
      "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
      "has_table_privilege($2,c.oid,'SELECT') AND NOT has_table_privilege($2,c.oid,'DELETE,TRUNCATE,TRIGGER') AND NOT has_any_column_privilege($2,c.oid,'UPDATE,REFERENCES') AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid<>c.relowner AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
      "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER'))) AS ok FROM pg_catalog.pg_class c WHERE c.oid=$1::oid",[id,api])).rows[0]?.ok
    if(relation!==true||!await verifyMemoryRelationAcl(db,id,false))return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;insert:boolean;clean:boolean}>("SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,has_column_privilege($2,a.attrelid,a.attnum,'INSERT') AS insert,"+
      "a.attidentity='' AND a.attgenerated='' AND CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS clean "+
      "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped",[id,api])).rows
    if(columns.length!==Object.keys(expected.fields).length||columns.some(c=>c.type!==expected.fields[c.name]||c.required!==true||c.insert!==expected.insert.includes(c.name)||c.clean!==true))return refuse()
    const policies=(await db.query<{name:string;command:string;ok:boolean}>("SELECT polname AS name,polcmd AS command,polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND "+
      "CASE polcmd WHEN 'r' THEN pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL "+
      "WHEN 'a' THEN polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='(owner_user_id = agentstudio.actor_id())' ELSE false END AS ok FROM pg_catalog.pg_policy WHERE polrelid=$1::oid",[id,api])).rows
    const policyNames=[{name:object.name+"_read",command:"r"},...(expected.insert.length?[{name:object.name+"_insert",command:"a"}]:[])]
    if(policies.length!==policyNames.length||policyNames.some(p=>!policies.some(q=>q.name===p.name&&q.command===p.command&&q.ok===true)))return refuse()
    const triggers=(await db.query<{name:string;fn:string;type:number;ok:boolean}>("SELECT t.tgname AS name,p.proname AS fn,t.tgtype::integer AS type,t.tgenabled='O' AND n.nspname='agentstudio' AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS ok FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid=$1::oid AND NOT t.tgisinternal",[id])).rows
    if(expected.trigger?triggers.length!==1||triggers[0]?.ok!==true||triggers[0].name!==expected.trigger.name||triggers[0].fn!==expected.trigger.fn||triggers[0].type!==expected.trigger.type:triggers.length!==0)return refuse()
    const indexes=(await db.query<{primary:boolean;columns:string[];ok:boolean}>("SELECT i.indisprimary AS primary,i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i WHERE i.indrelid=$1::oid",[id])).rows
    if(indexes.length!==1+expected.unique.length||!indexes.some(i=>i.ok&&i.primary&&same(i.columns,expected.pk))||expected.unique.some(u=>!indexes.some(i=>i.ok&&!i.primary&&same(i.columns,u))))return refuse()
    const pk=(await db.query<{ok:boolean}>("SELECT convalidated AND NOT condeferrable AND NOT condeferred AS ok FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='p'",[id])).rows
    const unique=(await db.query<{columns:string[];ok:boolean}>("SELECT convalidated AND NOT condeferrable AND NOT condeferred AS ok,ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='u'",[id])).rows
    const foreign=(await db.query<Foreign&{ok:boolean}>("SELECT confrelid::regclass::text AS target,convalidated AND NOT condeferrable AND NOT condeferred AND confmatchtype='s' AND confupdtype='a' AND confdeltype='r' AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
      "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    const logical=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype IN('p','f','c','u','x')",[id])).rows[0]?.n
    if(pk.length!==1||pk[0]?.ok!==true||unique.length!==expected.unique.length||expected.unique.some(e=>!unique.some(u=>u.ok&&same(u.columns,e)))||foreign.length!==expected.foreign.length||logical!==1+expected.unique.length+expected.foreign.length||expected.foreign.some(e=>!foreign.some(f=>f.ok&&f.target===e.target&&same(f.columns,e.columns)&&same(f.references,e.references))))return refuse()
  }
  const history=(await db.query<{ok:boolean}>("SELECT count(*)=1 AND bool_and(t.tgrelid='agentstudio.agent_specs'::regclass AND t.tgname='native_agent_optimization_history' AND t.tgfoid='agentstudio.agent_optimization_role_history()'::regprocedure AND t.tgtype=17 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND "+
    "t.tgattr::text=(SELECT string_agg(a.attnum::text,' ' ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid='agentstudio.agent_specs'::regclass AND a.attname IN('name','spec') AND NOT a.attisdropped)) AS ok FROM pg_catalog.pg_trigger t WHERE t.tgname='native_agent_optimization_history' OR t.tgfoid='agentstudio.agent_optimization_role_history()'::regprocedure")).rows[0]?.ok
  if(history!==true)return refuse()
  return true
}
export async function inspectAgentOptimizationSchema(pool:SqlPool):Promise<boolean>{
  const db=await pool.connect()
  try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");return await verifyAgentOptimizationCredentials(db)}
  finally{await db.query("ROLLBACK").catch(()=>{});db.release()}
}
