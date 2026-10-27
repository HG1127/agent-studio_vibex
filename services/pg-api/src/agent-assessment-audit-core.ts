import type {SqlClient} from "./contracts.ts"

// Independent057 validator: no import or modification of frozen056 contracts.
const prefix="agent_assessment_",worker="agentstudio_review_worker",dispatch="agentstudio_review_dispatch"
const roles=[worker,dispatch],builtins=["pg_read_all_data","pg_write_all_data","pg_maintain"]
const refuse=():never=>{throw Error("unsafe_agent_assessment_privileges")}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
type Routine={args:string;returns:string;language:string;volatility:string;strict:boolean;definer:boolean;worker:boolean;dispatch:boolean;sha:string}
// Exact offline $fn$ SHA-256; no SQL is executed or loaded by the auditor.
const functions:Record<string,Routine>={
  agent_assessment_text_valid:{args:"text, integer, boolean",returns:"boolean",language:"plpgsql",volatility:"i",strict:true,definer:false,worker:false,dispatch:false,sha:"31c33b30e227795aadcefe136e7a42083e8a93c46f10246e100819f2998ad656"},
  agent_assessment_result_valid:{args:"text, jsonb",returns:"boolean",language:"plpgsql",volatility:"i",strict:true,definer:false,worker:false,dispatch:false,sha:"374300d4e57f7f34687a22c9ca0a7c238d2379522f1772e54969a2797d3a5d5b"},
  agent_assessment_claim:{args:"uuid",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,worker:true,dispatch:false,sha:"9a2002a21da33e33c69beb09897e5a4463c074397430b0d876f9b0f27dd973fb"},
  agent_assessment_context:{args:"uuid, uuid, bigint, uuid",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,worker:false,dispatch:true,sha:"65717f398c45e9c3d34627a0b24846e3d6baccdd576780dba068875c651ad195"},
  agent_assessment_reserve:{args:"uuid, uuid, bigint, uuid",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,worker:false,dispatch:true,sha:"931af3081168ee9aa34c4ab87e77c3703859a517159ef4a0aec791ca4fcf0051"},
  agent_assessment_finish:{args:"uuid, uuid, bigint, uuid, jsonb",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,worker:false,dispatch:true,sha:"3d3de42c16becc6f41204f2db2d2e14e21834fb6d37ca29fd5a89268c8f242bc"},
  agent_assessment_pause:{args:"uuid, uuid, bigint, uuid",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,worker:true,dispatch:false,sha:"4f2abc21cbdebf3bba45d93b41172549b02f794790d12e21b76acdcb90558947"},
}
type Foreign={name?:string;target:string;columns:string[];references:string[];delete_action:string}
type Table={fields:Record<string,string>;nullable:string[];pk:string[];unique:string[][];foreign:Foreign[]}
const reference=(target:string,columns:string[],references:string[],delete_action="r",name?:string):Foreign=>({...(name?{name}:{}),target:"agentstudio."+target,columns,references,delete_action})
const key={owner_user_id:"uuid",request_id:"uuid"},created={created_at:"timestamp with time zone"},proof={worker_id:"uuid",lease_token:"uuid",lease_version:"bigint"}
const foreign=(name:string)=>reference(name,["owner_user_id","request_id"],["owner_user_id","request_id"])
const effect=()=>reference("agent_assessment_effects",["effect_id"],["effect_id"])
const tables:Record<string,Table>={
  agent_assessment_leases:{fields:{...key,...proof,lease_expires_at:"timestamp with time zone",state:"text",...created},nullable:[],pk:["owner_user_id","request_id"],unique:[["lease_token"]],foreign:[foreign("agent_review_requests")]},
  agent_assessment_effects:{fields:{...key,effect_id:"uuid",...proof,request_sha256:"text",input_sha256:"text",content_sha256:"text",...created},nullable:[],pk:["owner_user_id","request_id"],unique:[["effect_id"]],foreign:[foreign("agent_assessment_leases")]},
  agent_assessment_outcomes:{fields:{...key,effect_id:"uuid",status:"text",completion_sha256:"text",result_sha256:"text",failure_code:"text",...created},nullable:["result_sha256","failure_code"],pk:["owner_user_id","request_id"],unique:[],foreign:[foreign("agent_assessment_effects"),effect()]},
  // Two different targets use the same local columns. Give both FKs explicit
  // names; requiring one generated name for both can never match.
  agent_assessment_outputs:{fields:{...key,effect_id:"uuid",result:"jsonb",result_sha256:"text",...created},nullable:[],pk:["owner_user_id","request_id"],unique:[],foreign:[reference("agent_review_inputs",["owner_user_id","request_id"],["owner_user_id","request_id"],"c","agent_assessment_outputs_input_fkey"),reference("agent_assessment_outcomes",["owner_user_id","request_id"],["owner_user_id","request_id"],"r","agent_assessment_outputs_outcome_fkey"),effect()]},
}
export async function verifyAgentAssessmentCore(db:SqlClient):Promise<boolean>{
  const objects=(await db.query<{name:string;id:number;kind:string}>("SELECT c.relname AS name,c.oid::integer AS id,c.relkind AS kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,17)=$1",[prefix])).rows
  const groups=(await db.query<{name:string;ok:boolean}>(
    "SELECT r.rolname AS name,NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AND has_schema_privilege(r.oid,'agentstudio','USAGE') AND NOT has_schema_privilege(r.oid,'agentstudio','CREATE') AND NOT has_schema_privilege(r.oid,'agentstudio_auth','USAGE,CREATE') AND "+
    "has_column_privilege(r.oid,'agentstudio.schema_migrations','version','SELECT') AND NOT has_table_privilege(r.oid,'agentstudio.schema_migrations','SELECT') AND "+
    "(SELECT count(*)=1 AND bool_and(grant_row.grantor=c.relowner AND grant_row.privilege_type='SELECT' AND NOT grant_row.is_grantable) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) grant_row WHERE a.attrelid='agentstudio.schema_migrations'::regclass AND a.attname='version' AND NOT a.attisdropped AND grant_row.grantee=r.oid) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member WHERE m.roleid=r.oid AND "+
      "(m.admin_option OR m.inherit_option OR NOT m.set_option OR NOT member.rolcanlogin OR member.rolinherit OR member.rolsuper OR member.rolbypassrls OR member.rolcreaterole OR member.rolcreatedb OR member.rolreplication OR "+
      "member.rolname IN('agentstudio_stage_login','agentstudio_worker_login','agentstudio_prepare_worker_login','agentstudio_model_worker_login','agentstudio_native_auth_login','agentstudio_model_broker_login','agentstudio_bound_dispatch_login') OR "+
      "(SELECT count(*) FROM pg_catalog.pg_auth_members other WHERE other.member=member.oid)<>1)) AS ok FROM pg_catalog.pg_roles r WHERE rolname=ANY($1::text[])",[roles])).rows
  const routines=(await db.query<Routine&{name:string;safe:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,p.prorettype::regtype::text AS returns,l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS definer,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS worker,has_function_privilege($3,p.oid,'EXECUTE') AS dispatch,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND p.proallargtypes IS NULL AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))=CASE WHEN p.proname IN('agent_assessment_text_valid','agent_assessment_result_valid') THEN 1 ELSE 2 END AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=p.proowner)=1 AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR "+
      "a.grantee<>p.proowner AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=CASE WHEN p.proname IN('agent_assessment_claim','agent_assessment_pause') THEN $2 WHEN p.proname IN('agent_assessment_context','agent_assessment_reserve','agent_assessment_finish') THEN $3 END)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN($2,$3) AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,17)=$1",[prefix,worker,dispatch])).rows
  const mounts=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE left(t.tgname,17)=$1 OR n.nspname='agentstudio' AND left(p.proname,17)=$1",[prefix])).rows[0]?.n
  const types=(await db.query<{name:string;table:string;ok:boolean}>(
    "SELECT t.typname AS name,c.relname AS table,t.typowner=c.relowner AND NOT t.typnotnull AND t.typdefault IS NULL AND t.typdefaultbin IS NULL AND "+
    "(t.typtype='c' AND t.oid=c.reltype AND t.typrelid=c.oid OR t.typtype='b' AND t.typrelid=0 AND t.typelem=c.reltype AND t.oid=(SELECT typarray FROM pg_catalog.pg_type WHERE oid=c.reltype)) AS ok "+
    "FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=t.typrelid OR t.typelem<>0 AND c.reltype=t.typelem WHERE n.nspname='agentstudio' AND (left(t.typname,17)=$1 OR left(t.typname,18)='_'||$1)",[prefix])).rows
  const auxiliary=(await db.query<{ok:boolean}>(
    "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=x.conrelid WHERE n.nspname='agentstudio' AND left(x.conname,17)=$1 AND (c.relname IS NULL OR c.relname<>ALL($2::text[]) OR x.contype NOT IN('p','u','f','n'))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(p.polname,17)=$1) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,17)=$1) AS ok",[prefix,Object.keys(tables)])).rows[0]?.ok
  if(auxiliary!==true||!Number.isSafeInteger(mounts))return refuse()
  const absent=!objects.length&&!routines.length&&!groups.length&&!types.length&&mounts===0
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(absent)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_057') AS ok")).rows[0]?.ok
  if(stamp===false&&absent)return false
  if(stamp!==true||objects.length!==10||routines.length!==7||groups.length!==2||types.length!==8||mounts!==0||groups.some(g=>!roles.includes(g.name)||g.ok!==true))return refuse()
  for(const r of routines){const expected=functions[r.name];if(!expected||r.safe!==true||Object.entries(expected).some(([k,v])=>r[k as keyof typeof r]!==v))return refuse()}
  const indexNames=Object.entries(tables).flatMap(([name,t])=>[name+"_pkey",...t.unique.map(u=>name+"_"+u.join("_")+"_key")])
  for(const o of objects)if(o.kind==='r'?!tables[o.name]:o.kind!=='i'||!indexNames.includes(o.name))return refuse()
  for(const t of types){const name=t.name.startsWith('_')?t.name.slice(1):t.name;if(!tables[name]||t.table!==name||t.ok!==true)return refuse()}
  const boundaries=(await db.query<{ok:boolean}>(
    "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles builtin WHERE builtin.rolname=ANY($1::text[]) AND (builtin.rolcanlogin OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND member.oid<>builtin.oid AND pg_has_role(member.oid,builtin.oid,'MEMBER')))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname=ANY($2::text[]) AND n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p','v','m','f') AND "+
      "(has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES') OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AND NOT(n.nspname='agentstudio' AND c.relname='schema_migrations' AND a.attname='version')))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname=ANY($2::text[]) AND n.nspname IN('agentstudio','agentstudio_auth') AND left(p.proname,17)<>$3 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname=ANY($2::text[]) AND n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'SELECT,UPDATE,USAGE')) AS ok",[builtins,roles,prefix])).rows[0]?.ok
  if(boundaries!==true)return refuse()
  for(const [name,expected] of Object.entries(tables)){
    const object=objects.find(o=>o.name===name&&o.kind==='r');if(!object)return refuse();const id=object.id
    const relation=(await db.query<{ok:boolean}>(
      "WITH relation AS (SELECT * FROM pg_catalog.pg_class WHERE oid=$1::oid),actual AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a),expected AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r',c.relowner)) a),difference AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) "+
      "SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND NOT EXISTS(SELECT 1 FROM difference) AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname<>ALL($2::text[]) AND (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN'))) AS ok FROM relation c",[id,builtins])).rows[0]?.ok
    if(relation!==true)return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;clean:boolean}>(
      "SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,NOT a.attisdropped AND a.atttypmod=-1 AND a.attndims=0 AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasmissing AND coalesce(cardinality(a.attacl),0)=0 AND CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS clean "+
      "FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0",[id])).rows
    if(columns.length!==Object.keys(expected.fields).length||columns.some(c=>c.type!==expected.fields[c.name]||c.required===expected.nullable.includes(c.name)||c.clean!==true))return refuse()
    const decorations=(await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=$1::oid) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal) AS ok",[id])).rows[0]?.ok
    if(decorations!==true)return refuse()
    const indexes=(await db.query<{name:string;primary:boolean;columns:string[];ok:boolean}>(
      "SELECT c.relname AS name,i.indisprimary AS primary,i.indisunique AND NOT i.indisexclusion AND NOT i.indisreplident AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts AND c.relkind='i' AND c.relpersistence='p' AND c.relowner=t.relowner AND c.relnamespace=t.relnamespace AND am.amname='btree' AND "+
      "NOT EXISTS(SELECT 1 FROM unnest(i.indoption) o WHERE o<>0) AND NOT EXISTS(SELECT 1 FROM unnest(i.indcollation) col WHERE col<>0::oid) AND NOT EXISTS(SELECT 1 FROM unnest(i.indclass) op JOIN pg_catalog.pg_opclass oc ON oc.oid=op WHERE oc.opcmethod<>c.relam OR NOT oc.opcdefault OR oc.opcintype<>'uuid'::regtype OR oc.opcnamespace<>'pg_catalog'::regnamespace) AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_class t ON t.oid=i.indrelid JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE i.indrelid=$1::oid",[id])).rows
    if(indexes.length!==1+expected.unique.length||!indexes.some(i=>i.ok&&i.primary&&i.name===name+"_pkey"&&same(i.columns,expected.pk))||expected.unique.some(u=>!indexes.some(i=>i.ok&&!i.primary&&i.name===name+"_"+u.join("_")+"_key"&&same(i.columns,u))))return refuse()
    const keys=(await db.query<{name:string;kind:string;columns:string[];ok:boolean}>(
      "SELECT conname AS name,contype::text AS kind,convalidated AND coalesce((to_jsonb(x)->>'conenforced')::boolean,true) AND NOT coalesce((to_jsonb(x)->>'conperiod')::boolean,false) AND NOT condeferrable AND NOT condeferred AND conislocal AND coninhcount=0 AND conparentid=0 AND contypid=0 AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_constraint x WHERE conrelid=$1::oid AND contype IN('p','u')",[id])).rows
    if(keys.length!==1+expected.unique.length||!keys.some(k=>k.ok&&k.kind==='p'&&k.name===name+"_pkey"&&same(k.columns,expected.pk))||expected.unique.some(u=>!keys.some(k=>k.ok&&k.kind==='u'&&k.name===name+"_"+u.join("_")+"_key"&&same(k.columns,u))))return refuse()
    const references=(await db.query<Foreign&{name:string;ok:boolean}>(
      "SELECT conname AS name,confrelid::regclass::text AS target,confdeltype::text AS delete_action,convalidated AND coalesce((to_jsonb(x)->>'conenforced')::boolean,true) AND NOT coalesce((to_jsonb(x)->>'conperiod')::boolean,false) AND NOT condeferrable AND NOT condeferred AND conislocal AND coninhcount=0 AND conparentid=0 AND contypid=0 AND confmatchtype='s' AND confupdtype='a' AND confdeltype IN('r','c') AND "+
      "(SELECT count(*)=4 AND count(DISTINCT p.proname)=4 AND bool_and(t.tgisinternal AND n.nspname='pg_catalog' AND p.proargtypes::text='' AND t.tgenabled='O' AND t.tgparentid=0 AND t.tgconstrindid=x.conindid AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND "+
        "CASE p.proname WHEN 'RI_FKey_check_ins' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=5 WHEN 'RI_FKey_check_upd' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=17 "+
        "WHEN 'RI_FKey_restrict_del' THEN x.confdeltype='r' AND t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=9 WHEN 'RI_FKey_cascade_del' THEN x.confdeltype='c' AND t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=9 "+
        "WHEN 'RI_FKey_noaction_upd' THEN t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=17 ELSE false END) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgconstraint=x.oid) AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint x WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    const logical=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype<>'n'",[id])).rows[0]?.n
    if(references.length!==expected.foreign.length||logical!==1+expected.unique.length+expected.foreign.length||expected.foreign.some(e=>!references.some(f=>f.ok&&f.name===(e.name??name+"_"+e.columns.join("_")+"_fkey")&&f.target===e.target&&f.delete_action===e.delete_action&&same(f.columns,e.columns)&&same(f.references,e.references))))return refuse()
  }
  return true
}
