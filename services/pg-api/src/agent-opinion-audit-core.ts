import type {SqlClient} from "./contracts.ts"

// Standalone058 inventory/ACL validator. Never imports a predecessor auditor
// or loads/executes migration SQL; the full wrapper separately validates057.
const api="agentstudio_api",prefix="agent_opinion_"
const refuse=():never=>{throw Error("unsafe_agent_opinion_privileges")}
type Routine={args:string;returns:string;language:string;volatility:string;strict:boolean;definer:boolean;execute:boolean;sha:string}
// Exact offline SHA-256 of each $fn$ body, including whitespace.
const functions:Record<string,Routine>={
  agent_opinion_anchor:{args:"uuid",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,execute:true,sha:"1a292a01e3a9400b9b84495193661c7802ba089e3811d0d4a8058832b204589b"},
  agent_opinion_body:{args:"uuid, text, text",returns:"jsonb",language:"plpgsql",volatility:"v",strict:false,definer:true,execute:true,sha:"e2d90c52786809d94fd56c5d64a126a941e1ee0bfa50c37a5d3c4160db5dc764"},
}
async function audit(db:SqlClient):Promise<boolean>{
  const routines=(await db.query<Routine&{name:string;safe:boolean}>(
    "SELECT p.proname AS name,oidvectortypes(p.proargtypes) AS args,p.prorettype::regtype::text AS returns,l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS definer,"+
    "has_function_privilege($2,p.oid,'EXECUTE') AS execute,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,"+
    "NOT p.proleakproof AND NOT p.proretset AND p.proparallel='u' AND p.prosupport::oid=0::oid AND p.prokind='f' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND p.proallargtypes IS NULL AND p.protrftypes IS NULL AND p.probin IS NULL AND p.prosqlbody IS NULL AND p.procost=100 AND p.prorows=0 AND "+
    "(SELECT r.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles member WHERE NOT member.rolsuper AND pg_has_role(member.oid,r.oid,'MEMBER')) FROM pg_catalog.pg_roles r WHERE r.oid=p.proowner) AND "+
    "p.proowner=(SELECT q.proowner FROM pg_catalog.pg_proc q JOIN pg_catalog.pg_namespace qn ON qn.oid=q.pronamespace WHERE qn.nspname='agentstudio' AND q.proname='agent_assessment_finish' AND oidvectortypes(q.proargtypes)='uuid, uuid, bigint, uuid, jsonb') AND "+
    "p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))=2 AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=p.proowner)=1 AND "+
    "(SELECT count(*) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))=1 AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname<>$2 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS safe "+
    "FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='agentstudio' AND left(p.proname,14)=$1",[prefix,api])).rows
  // No058 relation/type/role/trigger/policy/constraint is authorized, including
  // orphan indexes or a mount on a relation in any other schema.
  const inventory=(await db.query<{clean:boolean}>(
    "SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,14)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (left(t.typname,14)=$1 OR left(t.typname,15)='_'||$1)) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,14)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE left(t.tgname,14)=$1 OR n.nspname='agentstudio' AND left(p.proname,14)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE left(evtname,14)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace WHERE n.nspname='agentstudio' AND left(x.conname,14)=$1) AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(p.polname,14)=$1) AS clean",[prefix])).rows[0]?.clean
  if(inventory!==true)return refuse()
  const canRead=(await db.query<{ok:boolean}>("SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS ok")).rows[0]?.ok
  if(typeof canRead!=="boolean")return refuse()
  if(!canRead){if(!routines.length)return false;return refuse()}
  const stamp=(await db.query<{installed:boolean;predecessor:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_058') AS installed,EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_057') AS predecessor")).rows[0]
  if(stamp?.installed===false&&!routines.length)return false
  if(stamp?.installed!==true||stamp.predecessor!==true||routines.length!==2||new Set(routines.map(r=>r.name)).size!==2)return refuse()
  for(const r of routines){const expected=functions[r.name];if(!expected||r.safe!==true||Object.entries(expected).some(([k,v])=>r[k as keyof typeof r]!==v))return refuse()}
  const role=(await db.query<{ok:boolean}>(
    "SELECT NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND "+
    "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AND has_schema_privilege(r.oid,'agentstudio','USAGE') AND NOT has_schema_privilege(r.oid,'agentstudio','CREATE') AND NOT has_schema_privilege(r.oid,'agentstudio_auth','USAGE,CREATE') AS ok "+
    "FROM pg_catalog.pg_roles r WHERE r.rolname=$1",[api])).rows[0]?.ok
  if(role!==true)return refuse()
  return true
}
export async function verifyAgentOpinionCore(db:SqlClient):Promise<boolean>{
  try{return await audit(db)}catch{return refuse()}
}
