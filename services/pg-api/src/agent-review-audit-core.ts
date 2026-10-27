import type {SqlClient} from "./contracts.ts"

// Deliberately independent of054/055: feedback's optional privacy extension
// calls this validator, while the full056 validator separately checks055.
const api="agentstudio_api",prefix="agent_review_"
const refuse=():never=>{throw Error("unsafe_agent_review_privileges")}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
type Routine={args:string;returns:string;language:string;volatility:string;strict:boolean;execute:boolean;definer:boolean;sha:string}
// Offline SHA-256 of the exact $fn$ bodies in optional056 (including whitespace).
// SQL is never loaded/executed by this runtime auditor.
const functions:Record<string,Routine>={
  agent_review_digest:{args:"jsonb",returns:"text",language:"sql",volatility:"i",strict:true,execute:false,definer:false,sha:"f7fc6089883b8587db1d354c9783737e496bdad85d0304e16ab32c03545f9e99"},
  agent_review_record:{args:"jsonb, jsonb",returns:"uuid",language:"plpgsql",volatility:"v",strict:false,execute:true,definer:true,sha:"305b440484ddb2ad1415188e61e6c85b58cd0a0c8057a3eb3f3a2d1b4a3d3253"},
  agent_review_control:{args:"jsonb",returns:"uuid",language:"plpgsql",volatility:"v",strict:false,execute:true,definer:true,sha:"da7a739a4de864d6aa53c3ab4d318343133043ecd8b67391356f1f031020ff01"},
  agent_review_feedback_erasure:{args:"",returns:"trigger",language:"plpgsql",volatility:"v",strict:false,execute:false,definer:true,sha:"d367c6c5a57c18fd4db086e20bd4e49e1c28e52f588d300535946d30e768cfa2"},
}
type Foreign={target:string;columns:string[];references:string[]}
type Table={fields:Record<string,string>;pk:string[];foreign:Foreign[];read:boolean}
const reference=(target:string,columns:string[],references:string[]):Foreign=>({target:"agentstudio."+target,columns,references})
const requestReference=()=>reference("agent_review_requests",["owner_user_id","request_id"],["owner_user_id","request_id"])
const key={owner_user_id:"uuid",request_id:"uuid"},created={created_at:"timestamp with time zone"}
const tables:Record<string,Table>={
  agent_review_requests:{fields:{...key,spec_id:"uuid",run_id:"uuid",purpose:"text",request_sha256:"text",input_sha256:"text",content_sha256:"text",owner_epoch:"bigint",source_protocol:"text",...created},pk:["owner_user_id","request_id"],foreign:[reference("agent_specs",["spec_id","owner_user_id"],["id","owner_user_id"]),reference("runs",["run_id","owner_user_id"],["id","owner_user_id"])],read:true},
  agent_review_inputs:{fields:{...key,body:"jsonb",...created},pk:["owner_user_id","request_id"],foreign:[requestReference()],read:false},
  agent_review_feedback_sources:{fields:{...key,feedback_id:"uuid",...created},pk:["owner_user_id","request_id","feedback_id"],foreign:[requestReference(),reference("agent_feedback_receipts",["owner_user_id","feedback_id"],["owner_user_id","request_id"])],read:true},
  agent_review_jobs:{fields:{...key,state:"text",...created},pk:["owner_user_id","request_id"],foreign:[requestReference()],read:true},
  agent_review_controls:{fields:{owner_user_id:"uuid",control_id:"uuid",request_id:"uuid",action:"text",request_sha256:"text",...created},pk:["owner_user_id","control_id"],foreign:[requestReference()],read:true},
  agent_review_tombstones:{fields:{...key,reason:"text",...created},pk:["owner_user_id","request_id"],foreign:[requestReference()],read:true},
}

export async function verifyAgentReviewCore(db:SqlClient):Promise<boolean>{
  // Include indexes in the inventory so even an orphan prefixed index on a
  // different relation cannot masquerade as a completely absent migration.
  const objects=(await db.query<{name:string;id:number;kind:string}>("SELECT c.relname AS name,c.oid::integer AS id,c.relkind AS kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,13)=$1",[prefix])).rows
  const routines=(await db.query<Routine&{name:string;safe:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,p.prorettype::regtype::text AS returns,l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS definer,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS execute,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND p.proallargtypes IS NULL AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL AND "+
    "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))=CASE WHEN p.proname IN('agent_review_record','agent_review_control') THEN 2 ELSE 1 END AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=p.proowner)=1 AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR "+
      "a.grantee<>p.proowner AND (p.proname NOT IN('agent_review_record','agent_review_control') OR a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,13)=$1",[prefix,api])).rows
  // Scan every relation/schema and disabled/internal triggers as well. Checking
  // only feedback_bodies would miss an extra mount of the definer function.
  const mounts=(await db.query<{name:string;schema:string;table:string;fn:string;type:number;ok:boolean}>(
    "SELECT t.tgname AS name,rn.nspname AS schema,c.relname AS table,p.proname AS fn,t.tgtype::integer AS type,"+
    "n.nspname='agentstudio' AND p.proargtypes::text='' AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgparentid=0 AND t.tgconstraint=0 AND t.tgconstrrelid=0 AND t.tgconstrindid=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND "+
    "t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AS ok "+
    "FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace rn ON rn.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE left(t.tgname,13)=$1 OR n.nspname='agentstudio' AND left(p.proname,13)=$1",[prefix])).rows
  const types=(await db.query<{name:string;table:string;ok:boolean}>(
    "SELECT t.typname AS name,c.relname AS table,t.typowner=c.relowner AND NOT t.typnotnull AND t.typdefault IS NULL AND t.typdefaultbin IS NULL AND "+
    "(t.typtype='c' AND t.oid=c.reltype AND t.typrelid=c.oid OR t.typtype='b' AND t.typrelid=0 AND t.typelem=c.reltype AND t.oid=(SELECT typarray FROM pg_catalog.pg_type WHERE oid=c.reltype)) AS ok "+
    "FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=t.typrelid OR t.typelem<>0 AND c.reltype=t.typelem "+
    "WHERE n.nspname='agentstudio' AND (left(t.typname,13)=$1 OR left(t.typname,14)='_'||$1)",[prefix])).rows
  const auxiliary=(await db.query<{ok:boolean}>(
    "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=x.conrelid "+
      "WHERE n.nspname='agentstudio' AND left(x.conname,13)=$1 AND (c.relname IS NULL OR c.relname<>ALL($2::text[]) OR x.contype NOT IN('p','f','n'))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(p.polname,13)=$1 AND c.relname<>ALL($2::text[])) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,13)=$1) AS ok",[prefix,Object.keys(tables)])).rows[0]?.ok
  if(auxiliary!==true)return refuse()
  const absent=!objects.length&&!routines.length&&!mounts.length&&!types.length
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(absent)return false;return refuse()}
  const stamp=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_056') AS ok")).rows[0]?.ok
  if(stamp===false&&absent)return false
  if(stamp!==true||objects.length!==12||routines.length!==4||mounts.length!==1||types.length!==12)return refuse()
  for(const row of routines){const expected=functions[row.name];if(!expected||row.safe!==true||Object.entries(expected).some(([k,v])=>row[k as keyof typeof row]!==v))return refuse()}
  for(const row of objects){if(row.kind==='r'? !tables[row.name]:row.kind!=='i'||!tables[row.name.slice(0,-5)]||!row.name.endsWith('_pkey'))return refuse()}
  for(const row of types){const table=row.name.startsWith('_')?row.name.slice(1):row.name;if(!tables[table]||row.table!==table||row.ok!==true)return refuse()}
  const mount=mounts[0]
  if(!mount||mount.name!=="agent_review_feedback_privacy"||mount.schema!=="agentstudio"||mount.table!=="agent_feedback_bodies"||mount.fn!=="agent_review_feedback_erasure"||mount.type!==9||mount.ok!==true)return refuse()
  const role=(await db.query<{ok:boolean}>(
    "SELECT NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AND "+
    // Predefined all-data roles inherently report access. They are inert only
    // when NOLOGIN and unreachable by any non-superuser, including NOINHERIT
    // memberships that can SET ROLE. Every other role is checked below.
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles all_data WHERE all_data.rolname IN('pg_read_all_data','pg_write_all_data') AND "+
      "(all_data.rolcanlogin OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND member.oid<>all_data.oid AND pg_has_role(member.oid,all_data.oid,'MEMBER')))) AS ok "+
    "FROM pg_catalog.pg_roles r WHERE r.rolname=$1",[api])).rows[0]?.ok
  if(role!==true)return refuse()
  for(const [name,expected] of Object.entries(tables)){
    const object=objects.find(o=>o.name===name&&o.kind==='r');if(!object)return refuse();const id=object.id
    const relation=(await db.query<{ok:boolean}>(
      "WITH relation AS (SELECT c.*,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS api_oid FROM pg_catalog.pg_class c WHERE c.oid=$1::oid),"+
      "actual AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a),"+
      "expected AS (SELECT a.* FROM relation c CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r',c.relowner)) a UNION ALL SELECT c.relowner,c.api_oid,'SELECT'::text,false FROM relation c WHERE $3::boolean),"+
      "difference AS ((SELECT * FROM actual EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)) "+
      "SELECT c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition AND NOT c.relhasrules AND c.relrowsecurity AND c.relforcerowsecurity AND "+
      "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND NOT EXISTS(SELECT 1 FROM difference) AND "+
      "has_table_privilege($2,c.oid,'SELECT')=$3::boolean AND NOT has_any_column_privilege($2,c.oid,'INSERT,UPDATE,REFERENCES') AND NOT has_table_privilege($2,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') AND "+
      "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND "+
        "(has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN'))) AS ok FROM relation c",[id,api,expected.read])).rows[0]?.ok
    if(relation!==true)return refuse()
    const columns=(await db.query<{name:string;type:string;required:boolean;clean:boolean}>(
      "SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,NOT a.attisdropped AND a.atttypmod=-1 AND a.attndims=0 AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasmissing AND coalesce(cardinality(a.attacl),0)=0 AND "+
      "CASE WHEN a.attname='created_at' THEN pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()' ELSE d.adbin IS NULL END AS clean FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::oid AND a.attnum>0",[id])).rows
    if(columns.length!==Object.keys(expected.fields).length||columns.some(c=>c.type!==expected.fields[c.name]||c.required!==true||c.clean!==true))return refuse()
    const policies=(await db.query<{name:string;ok:boolean}>(
      "SELECT polname AS name,polcmd='r' AND polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)]::oid[] AND pg_get_expr(polqual,polrelid)='(owner_user_id = agentstudio.actor_id())' AND polwithcheck IS NULL AS ok FROM pg_catalog.pg_policy WHERE polrelid=$1::oid",[id,api])).rows
    if(expected.read?policies.length!==1||policies[0]?.name!==name+"_read"||policies[0]?.ok!==true:policies.length!==0)return refuse()
    const triggers=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal",[id])).rows[0]?.n
    if(triggers!==0)return refuse()
    const indexes=(await db.query<{name:string;columns:string[];ok:boolean}>(
      "SELECT c.relname AS name,i.indisprimary AND i.indisunique AND NOT i.indisexclusion AND NOT i.indisreplident AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts AND "+
      "c.relkind='i' AND c.relpersistence='p' AND c.relowner=t.relowner AND c.relnamespace=t.relnamespace AND am.amname='btree' AND "+
      "NOT EXISTS(SELECT 1 FROM unnest(i.indoption) o WHERE o<>0) AND NOT EXISTS(SELECT 1 FROM unnest(i.indcollation) c WHERE c<>0::oid) AND "+
      "NOT EXISTS(SELECT 1 FROM unnest(i.indclass) op JOIN pg_catalog.pg_opclass oc ON oc.oid=op WHERE oc.opcmethod<>c.relam OR NOT oc.opcdefault OR oc.opcintype<>'uuid'::regtype OR oc.opcnamespace<>'pg_catalog'::regnamespace) AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns "+
      "FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_class t ON t.oid=i.indrelid JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE i.indrelid=$1::oid",[id])).rows
    if(indexes.length!==1||indexes[0]?.name!==name+"_pkey"||indexes[0]?.ok!==true||!same(indexes[0].columns,expected.pk))return refuse()
    const pk=(await db.query<{name:string;columns:string[];ok:boolean}>(
      "SELECT conname AS name,convalidated AND coalesce((to_jsonb(x)->>'conenforced')::boolean,true) AND NOT coalesce((to_jsonb(x)->>'conperiod')::boolean,false) AND NOT condeferrable AND NOT condeferred AND conislocal AND coninhcount=0 AND conparentid=0 AND contypid=0 AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns FROM pg_catalog.pg_constraint x WHERE conrelid=$1::oid AND contype='p'",[id])).rows
    const foreign=(await db.query<Foreign&{name:string;ok:boolean}>(
      "SELECT conname AS name,confrelid::regclass::text AS target,convalidated AND coalesce((to_jsonb(x)->>'conenforced')::boolean,true) AND NOT coalesce((to_jsonb(x)->>'conperiod')::boolean,false) AND NOT condeferrable AND NOT condeferred AND conislocal AND coninhcount=0 AND conparentid=0 AND contypid=0 AND confmatchtype='s' AND confupdtype='a' AND confdeltype='r' AND "+
      "(SELECT count(*)=4 AND count(DISTINCT p.proname)=4 AND bool_and(t.tgisinternal AND n.nspname='pg_catalog' AND p.proargtypes::text='' AND t.tgenabled='O' AND t.tgparentid=0 AND t.tgconstrindid=x.conindid AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND "+
        "t.tgnargs=0 AND encode(t.tgargs,'hex')='' AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND "+
        "CASE p.proname WHEN 'RI_FKey_check_ins' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=5 "+
        "WHEN 'RI_FKey_check_upd' THEN t.tgrelid=x.conrelid AND t.tgconstrrelid=x.confrelid AND t.tgtype=17 "+
        "WHEN 'RI_FKey_restrict_del' THEN t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=9 "+
        "WHEN 'RI_FKey_noaction_upd' THEN t.tgrelid=x.confrelid AND t.tgconstrrelid=x.conrelid AND t.tgtype=17 ELSE false END) "+
        "FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgconstraint=x.oid) AS ok,"+
      "ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,"+
      "ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(n,o) JOIN pg_catalog.pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n ORDER BY k.o) AS references FROM pg_catalog.pg_constraint x WHERE conrelid=$1::oid AND contype='f'",[id])).rows
    // PG18 represents NOT NULL using separate 'n' catalog constraints too.
    const logical=(await db.query<{n:number}>("SELECT count(*)::integer AS n FROM pg_catalog.pg_constraint WHERE conrelid=$1::oid AND contype<>'n'",[id])).rows[0]?.n
    if(pk.length!==1||pk[0]?.name!==name+"_pkey"||pk[0]?.ok!==true||!same(pk[0].columns,expected.pk)||foreign.length!==expected.foreign.length||logical!==1+expected.foreign.length||expected.foreign.some(e=>!foreign.some(f=>f.ok&&f.name===name+"_"+e.columns.join("_")+"_fkey"&&f.target===e.target&&same(f.columns,e.columns)&&same(f.references,e.references))))return refuse()
  }
  return true
}
