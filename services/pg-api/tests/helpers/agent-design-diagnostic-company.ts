// TEST ONLY exact-source diagnostic. Never import from product runtime.
import {requireAgentDesignDatabaseCi} from "./agent-design-database-ci.mjs"
requireAgentDesignDatabaseCi()
// Catalog-only061 verifier. No SQL source loading, data projection or authority
// inference from a browser/admin flag. Literal pins change only after review.
import type {SqlClient} from "../../src/contracts.ts"

const role="agentstudio_company_metadata_reader",prefix="company_",rolePrefix="agentstudio_company_"
const fail=(site:string="helper",predicates:boolean[]=[],context:Record<string,string>={}):never=>{const error=new Error("unsafe_company_overview_privileges");Object.assign(error,{diagnostic_site:site,diagnostic_predicates:predicates,diagnostic_context:context});throw error}
type Row=Record<string,unknown>
type Column={type:string;required:boolean}
const tables:Record<string,Record<string,Column>>={
 "agentstudio.users":{id:{type:"uuid",required:true},external_issuer:{type:"text",required:true},display_name:{type:"text",required:true},status:{type:"text",required:true}},
 "agentstudio_auth.accounts":{user_id:{type:"uuid",required:true},enabled:{type:"boolean",required:true},is_admin:{type:"boolean",required:true}},
 "agentstudio.runs":{owner_user_id:{type:"uuid",required:true},kind:{type:"text",required:true},status:{type:"text",required:true},created_at:{type:"timestamp with time zone",required:true}},
 "agentstudio.schedules":{owner_user_id:{type:"uuid",required:true},enabled:{type:"boolean",required:true},deleted_at:{type:"timestamp with time zone",required:false},next_at:{type:"timestamp with time zone",required:false}},
 "agentstudio.knowledge_bases":{owner_user_id:{type:"uuid",required:true}},
}
const routines:Record<string,{args:string;sha:string}>={
 company_overview:{args:"",sha:"db392df51b3033d09558f196fc4fe94a54ce6bca48e9fe01877eb1818b3330ed"},
 company_employee_stats:{args:"integer, uuid",sha:"ac6b0eedcb87d0e9c60ab68217c4e3ec11f35003b7daa428a90d8340f31989b8"},
}
const actorSha="084b38798ae2c68f4165ee40800b909c874e8765372d357ee41845f92ec80555"
// Ordinary PUBLIC-readable catalogs (for example pg_roles) stay usable. These
// two credential-bearing relations must have no read/write authority for this
// owner, whether table-wide, per-column, direct or inherited from PUBLIC.
const sensitiveCatalogs:Record<string,string>={"pg_catalog.pg_authid":"r","pg_catalog.pg_shadow":"v"}
const nativeQual="(external_issuer = 'urn:agentstudio:local:v1'::text)"
const policyNames:Record<string,string>={"agentstudio.users":"company_users_select","agentstudio_auth.accounts":"company_accounts_select","agentstudio.runs":"company_runs_select","agentstudio.schedules":"company_schedules_select","agentstudio.knowledge_bases":"company_knowledge_select"}
const apiPolicies:Record<string,{name:string;expression:string}>={
 "agentstudio.users":{name:"users_owner",expression:"(id = agentstudio.actor_id())"},
 "agentstudio.runs":{name:"owner_runs",expression:"(owner_user_id = agentstudio.actor_id())"},
 "agentstudio.schedules":{name:"owner_schedules",expression:"(owner_user_id = agentstudio.actor_id())"},
 "agentstudio.knowledge_bases":{name:"owner_knowledge_bases",expression:"(owner_user_id = agentstudio.actor_id())"},
}
const oid=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0
const list=(v:unknown):v is unknown[]=>Array.isArray(v)
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
async function read(db:SqlClient,sql:string,args:unknown[]=[]):Promise<Row[]>{const r=await db.query<Row>(sql,args);if(!Array.isArray(r.rows))return fail("company-overview-audit-core.ts:36:150",[Boolean(!Array.isArray(r.rows))],{});return r.rows}
async function one(db:SqlClient,sql:string,args:unknown[]=[]):Promise<Row>{const r=await read(db,sql,args);if(r.length!==1)return fail("company-overview-audit-core.ts:37:131",[Boolean(r.length!==1)],{});return r[0]!}
function exactIds(rows:Row[],field:string):number[]{const ids=rows.map(r=>r[field]);if(ids.some(v=>!oid(v))||new Set(ids).size!==ids.length)return fail("company-overview-audit-core.ts:38:148",[Boolean(ids.some(v=>!oid(v))),Boolean(new Set(ids).size!==ids.length)],{});return ids as number[]}

async function verify(db:SqlClient):Promise<boolean>{
 const stamp=await one(db,"/* company061:stamp */ SELECT has_column_privilege(current_user,'agentstudio.schema_migrations','version','SELECT') AS readable,"+
  "EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_061') AS installed,EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_060') AS predecessor")
 if(stamp.readable!==true||typeof stamp.installed!=="boolean"||typeof stamp.predecessor!=="boolean")return fail("company-overview-audit-core.ts:43:108",[Boolean(stamp.readable!==true),Boolean(typeof stamp.installed!=="boolean"),Boolean(typeof stamp.predecessor!=="boolean")],{})
 const roles=await read(db,"/* company061:roles */ SELECT oid::integer AS id,rolname AS name,rolcanlogin AS login,rolinherit AS inherit,rolsuper AS super,rolbypassrls AS bypass,"+
  "rolcreaterole AS create_role,rolcreatedb AS create_db,rolreplication AS replication,rolconnlimit AS connection_limit,rolconfig AS config,"+
  "(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS memberships FROM pg_catalog.pg_roles r WHERE starts_with(rolname,$1)",[rolePrefix])
 const funcs=await read(db,"/* company061:routines */ SELECT n.nspname AS schema,p.oid::integer AS id,p.proname AS name,p.proowner::integer AS owner_id,oidvectortypes(p.proargtypes) AS args,"+
  "format_type(p.prorettype,NULL) AS result,l.lanname AS language,p.provolatile AS volatility,p.prosecdef AS definer,p.proisstrict AS strict,p.proleakproof AS leakproof,p.proparallel AS parallel,p.prokind AS kind,"+
  "p.pronargdefaults AS defaults,p.proargmodes AS modes,p.proargnames AS argnames,p.provariadic=0 AND p.prosupport=0 AND NOT p.proretset AS ordinary,p.proconfig AS config,"+
  "encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE starts_with(p.proname,$1)",[prefix])
 const policies=await read(db,"/* company061:policies */ SELECT p.oid::integer AS id,n.nspname||'.'||c.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,"+
  "p.polroles::integer[] AS roles,pg_get_expr(p.polqual,p.polrelid) AS qual,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE starts_with(p.polname,$1)",[prefix])
 const clean=await one(db,"/* company061:orphans */ SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE starts_with(relname,$1)) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE starts_with(typname,$1) OR starts_with(typname,'_'||$1)) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE starts_with(conname,$1)) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE starts_with(tgname,$1)) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,$1)) AS ok",[prefix])
 if(clean.ok!==true)return fail("company-overview-audit-core.ts:57:28",[Boolean(clean.ok!==true)],{})
 if(!stamp.installed){if(roles.length||funcs.length||policies.length)return fail("company-overview-audit-core.ts:58:77",[Boolean(roles.length),Boolean(funcs.length),Boolean(policies.length)],{});return false}
 if(!stamp.predecessor||roles.length!==1||funcs.length!==2||policies.length!==5)return fail("company-overview-audit-core.ts:59:88",[Boolean(!stamp.predecessor),Boolean(roles.length!==1),Boolean(funcs.length!==2),Boolean(policies.length!==5)],{})
 const owner=roles[0]!
 if(owner.name!==role||!oid(owner.id)||owner.login!==false||owner.inherit!==false||owner.super!==false||owner.bypass!==false||owner.create_role!==false||owner.create_db!==false||owner.replication!==false||owner.connection_limit!==-1||owner.config!==null||owner.memberships!==0)return fail("company-overview-audit-core.ts:61:285",[Boolean(owner.name!==role),Boolean(!oid(owner.id)),Boolean(owner.login!==false),Boolean(owner.inherit!==false),Boolean(owner.super!==false),Boolean(owner.bypass!==false),Boolean(owner.create_role!==false),Boolean(owner.create_db!==false),Boolean(owner.replication!==false),Boolean(owner.connection_limit!==-1),Boolean(owner.config!==null),Boolean(owner.memberships!==0)],{})
 const api=await one(db,"/* company061:api */ SELECT oid::integer AS id,current_user=rolname AS current_role,NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AND NOT has_schema_privilege(r.oid,'agentstudio_auth','USAGE,CREATE') AND "+
  "NOT has_any_column_privilege(r.oid,(SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio_auth' AND c.relname='accounts'),'SELECT,INSERT,UPDATE,REFERENCES') AS ok,current_setting('server_version_num')::integer AS version FROM pg_catalog.pg_roles r WHERE rolname='agentstudio_api'")
 if(!oid(api.id)||api.current_role!==true||api.ok!==true||typeof api.version!=="number"||api.version<170000||api.version>=190000)return fail("company-overview-audit-core.ts:65:137",[Boolean(!oid(api.id)),Boolean(api.current_role!==true),Boolean(api.ok!==true),Boolean(typeof api.version!=="number"),Boolean(api.version<170000),Boolean(api.version>=190000)],{})
 const fnIds=exactIds(funcs,"id")
 if(new Set(funcs.map(f=>f.name)).size!==2)return fail("company-overview-audit-core.ts:67:51",[Boolean(new Set(funcs.map(f=>f.name)).size!==2)],{})
 for(const f of funcs){const expected=routines[String(f.name)];if(!expected||f.schema!=="agentstudio"||f.owner_id!==owner.id||f.args!==expected.args||f.result!=="jsonb"||f.language!=="plpgsql"||f.volatility!=="s"||f.definer!==true||f.strict!==false||f.leakproof!==false||f.parallel!=="u"||f.kind!=="f"||f.defaults!==0||f.modes!==null||f.argnames!==null||f.ordinary!==true||!same(f.config,["search_path=pg_catalog"])||f.sha!==expected.sha)return fail("company-overview-audit-core.ts:68:446",[Boolean(!expected),Boolean(f.schema!=="agentstudio"),Boolean(f.owner_id!==owner.id),Boolean(f.args!==expected.args),Boolean(f.result!=="jsonb"),Boolean(f.language!=="plpgsql"),Boolean(f.volatility!=="s"),Boolean(f.definer!==true),Boolean(f.strict!==false),Boolean(f.leakproof!==false),Boolean(f.parallel!=="u"),Boolean(f.kind!=="f"),Boolean(f.defaults!==0),Boolean(f.modes!==null),Boolean(f.argnames!==null),Boolean(f.ordinary!==true),Boolean(!same(f.config,["search_path=pg_catalog"])),Boolean(f.sha!==expected.sha)],{"f":String(f.name??"catalog-object")})}
 const grants=await read(db,"/* company061:function_acl */ SELECT p.oid::integer AS function_id,a.grantor::integer AS grantor,a.grantee::integer AS grantee,a.privilege_type AS privilege,a.is_grantable AS grantable "+
  "FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE p.oid=ANY($1::oid[])",[fnIds])
 if(grants.length!==4)return fail("company-overview-audit-core.ts:71:30",[Boolean(grants.length!==4)],{})
 for(const id of fnIds){const g=grants.filter(g=>g.function_id===id);if(g.length!==2||new Set(g.map(g=>g.grantee)).size!==2||g.some(g=>g.grantor!==owner.id||![owner.id,api.id].includes(g.grantee)||g.privilege!=="EXECUTE"||g.grantable!==false))return fail("company-overview-audit-core.ts:72:251",[Boolean(g.length!==2),Boolean(new Set(g.map(g=>g.grantee)).size!==2),Boolean(g.some(g=>g.grantor!==owner.id||![owner.id,api.id].includes(g.grantee)||g.privilege!=="EXECUTE"||g.grantable!==false))],{})}
 const effective=await read(db,"/* company061:function_effective */ SELECT p.oid::integer AS id,has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS api,"+
  "ARRAY(SELECT rolname::text FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.oid NOT IN($2::oid,$3::oid) AND has_function_privilege(r.oid,p.oid,'EXECUTE') ORDER BY rolname) AS other_roles FROM pg_catalog.pg_proc p WHERE p.oid=ANY($1::oid[])",[fnIds,owner.id,api.id])
 if(effective.length!==2||!same(exactIds(effective,"id").sort((a,b)=>a-b),[...fnIds].sort((a,b)=>a-b))||effective.some(e=>e.api!==true||!same(e.other_roles,[])))return fail("company-overview-audit-core.ts:75:169",[Boolean(effective.length!==2),Boolean(!same(exactIds(effective,"id").sort((a,b)=>a-b),[...fnIds].sort((a,b)=>a-b))),Boolean(effective.some(e=>e.api!==true||!same(e.other_roles,[])))],{})
 const surface=await one(db,"/* company061:owner_surface */ SELECT has_schema_privilege($1::oid,'agentstudio','USAGE') AND has_schema_privilege($1::oid,'agentstudio_auth','USAGE') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND has_schema_privilege($1::oid,n.oid,'CREATE')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=$1::oid) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=$1::oid AND d.deptype='o' AND NOT(d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND d.classid='pg_proc'::regclass AND d.objsubid=0 AND d.objid=ANY($2::oid[]))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND p.prosecdef AND NOT(p.oid=ANY($2::oid[])) AND has_function_privilege($1::oid,p.oid,'EXECUTE')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND ((c.relkind IN('r','p','v','m','f') AND has_table_privilege($1::oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) OR(c.relkind='S' AND has_sequence_privilege($1::oid,c.oid,'SELECT,UPDATE,USAGE')))) AS ok",[owner.id,fnIds])
 if(surface.ok!==true)return fail("company-overview-audit-core.ts:82:30",[Boolean(surface.ok!==true)],{})
 const sensitive=await read(db,"/* company061:sensitive_catalogs */ SELECT n.nspname||'.'||c.relname AS name,c.oid::integer AS id,c.relkind AS kind,"+
  "has_table_privilege($1::oid,c.oid,'SELECT') AS table_read,has_any_column_privilege($1::oid,c.oid,'SELECT') AS column_read,"+
  "has_table_privilege($1::oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_write,has_any_column_privilege($1::oid,c.oid,'INSERT,UPDATE,REFERENCES') AS column_write,"+
  // System-table write protection can mask granted UPDATE in has_* predicates.
  // Reject non-default owner/PUBLIC ACL entries too; never reject the normal
  // catalog owner's own ACL or select any credential-bearing catalog rows.
  "EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) g WHERE g.grantee IN($1::oid,0::oid) AND g.privilege_type IN('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) AS table_acl_grant,"+
  "EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) g WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND g.grantee IN($1::oid,0::oid) AND g.privilege_type IN('SELECT','INSERT','UPDATE','REFERENCES')) AS column_acl_grant "+
  "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pg_catalog' AND c.relname=ANY($2::text[])",[owner.id,["pg_authid","pg_shadow"]])
 if(sensitive.length!==2||new Set(sensitive.map(c=>c.name)).size!==2||exactIds(sensitive,"id").length!==2||sensitive.some(c=>c.kind!==sensitiveCatalogs[String(c.name)]||!sensitiveCatalogs[String(c.name)]||c.table_read!==false||c.column_read!==false||c.table_write!==false||c.column_write!==false||c.table_acl_grant!==false||c.column_acl_grant!==false))return fail("company-overview-audit-core.ts:92:360",[Boolean(sensitive.length!==2),Boolean(new Set(sensitive.map(c=>c.name)).size!==2),Boolean(exactIds(sensitive,"id").length!==2),Boolean(sensitive.some(c=>c.kind!==sensitiveCatalogs[String(c.name)]||!sensitiveCatalogs[String(c.name)]||c.table_read!==false||c.column_read!==false||c.table_write!==false||c.column_write!==false||c.table_acl_grant!==false||c.column_acl_grant!==false))],{})
 const schemas=await read(db,"/* company061:schema_acl */ SELECT n.nspname AS name,a.grantor::integer=n.nspowner::integer AS owner_grant,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_catalog.pg_namespace n "+
  "CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE a.grantee=$1::oid",[owner.id])
 if(schemas.length!==2||!same(schemas.map(s=>s.name).sort(),["agentstudio","agentstudio_auth"])||schemas.some(s=>s.owner_grant!==true||s.privilege!=="USAGE"||s.grantable!==false))return fail("company-overview-audit-core.ts:95:187",[Boolean(schemas.length!==2),Boolean(!same(schemas.map(s=>s.name).sort(),["agentstudio","agentstudio_auth"])),Boolean(schemas.some(s=>s.owner_grant!==true||s.privilege!=="USAGE"||s.grantable!==false))],{})
 const bases=await read(db,"/* company061:bases */ SELECT n.nspname||'.'||c.relname AS name,c.oid::integer AS id,c.relowner::integer AS owner_id,"+
  "c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND c.relforcerowsecurity AND NOT c.relispartition AND NOT c.relhasrules AND c.relam=(SELECT oid FROM pg_catalog.pg_am WHERE amname='heap') AND coalesce(cardinality(c.reloptions),0)=0 AND "+
  "(SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=c.relowner) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,c.relowner,'MEMBER')) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AS ok FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[])",[Object.keys(tables)])
 if(bases.length!==5||new Set(bases.map(b=>b.name)).size!==5||bases.some(b=>!tables[String(b.name)]||!oid(b.id)||!oid(b.owner_id)||b.ok!==true))return fail("company-overview-audit-core.ts:100:152",[Boolean(bases.length!==5),Boolean(new Set(bases.map(b=>b.name)).size!==5),Boolean(bases.some(b=>!tables[String(b.name)]||!oid(b.id)||!oid(b.owner_id)||b.ok!==true))],{})
 const baseIds=exactIds(bases,"id")
 const identityNames=["agentstudio.users","agentstudio_auth.accounts"]
 const identityKeys=await read(db,"/* company061:identity_keys */ SELECT n.nspname||'.'||t.relname AS relation,t.oid::integer AS relation_id,i.indexrelid::integer AS id,"+
  "ARRAY(SELECT a.attname::text FROM unnest(x.conkey) WITH ORDINALITY k(num,pos) JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.pos) AS columns,"+
  "x.convalidated AND NOT x.condeferrable AND NOT x.condeferred AND i.indisprimary AND i.indisunique AND NOT i.indisexclusion AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indnullsnotdistinct AND "+
  "i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indkey[0]=x.conkey[1] AND i.indcollation[0]=0 AND i.indoption[0]=0 AND "+
  "(SELECT opcnamespace='pg_catalog'::regnamespace AND opcname='uuid_ops' AND opcdefault FROM pg_catalog.pg_opclass WHERE oid=i.indclass[0]) AND "+
  "c.relkind='i' AND c.relpersistence='p' AND c.relowner=t.relowner AND c.relam=(SELECT oid FROM pg_catalog.pg_am WHERE amname='btree') AND coalesce(cardinality(c.reloptions),0)=0 AS ok "+
  "FROM pg_catalog.pg_constraint x JOIN pg_catalog.pg_class t ON t.oid=x.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace JOIN pg_catalog.pg_index i ON i.indexrelid=x.conindid JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid "+
  "WHERE x.contype='p' AND x.conrelid=ANY($1::oid[])",[bases.filter(b=>identityNames.includes(String(b.name))).map(b=>b.id)])
 if(identityKeys.length!==2||exactIds(identityKeys,"id").length!==2||new Set(identityKeys.map(k=>k.relation)).size!==2||identityKeys.some(k=>!identityNames.includes(String(k.relation))||k.relation_id!==bases.find(b=>b.name===k.relation)?.id||k.ok!==true||!same(k.columns,[k.relation==="agentstudio.users"?"id":"user_id"])))return fail("company-overview-audit-core.ts:111:331",[Boolean(identityKeys.length!==2),Boolean(exactIds(identityKeys,"id").length!==2),Boolean(new Set(identityKeys.map(k=>k.relation)).size!==2),Boolean(identityKeys.some(k=>!identityNames.includes(String(k.relation))||k.relation_id!==bases.find(b=>b.name===k.relation)?.id||k.ok!==true||!same(k.columns,[k.relation==="agentstudio.users"?"id":"user_id"])))],{})
 const columns=await read(db,"/* company061:columns */ SELECT n.nspname||'.'||c.relname AS relation,c.oid::integer AS relation_id,c.relowner::integer AS owner_id,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,"+
  "a.attidentity='' AND a.attgenerated='' AND NOT a.atthasmissing AND a.attndims=0 AND a.attcollation=(SELECT typcollation FROM pg_catalog.pg_type WHERE oid=a.atttypid) AS plain,has_column_privilege($1::oid,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1::oid,c.oid,a.attnum,'INSERT') AS insert,"+
  "has_column_privilege($1::oid,c.oid,a.attnum,'UPDATE') AS update,has_column_privilege($1::oid,c.oid,a.attnum,'REFERENCES') AS reference FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
  "WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped",[owner.id])
 const seen=new Set<string>()
 for(const c of columns){const key=String(c.relation)+":"+String(c.name);if(seen.has(key)||c.insert!==false||c.update!==false||c.reference!==false)return fail("company-overview-audit-core.ts:117:155",[Boolean(seen.has(key)),Boolean(c.insert!==false),Boolean(c.update!==false),Boolean(c.reference!==false)],{"c":String(c.name??"catalog-object")});seen.add(key)
  const expected=tables[String(c.relation)]?.[String(c.name)],base=bases.find(b=>b.name===c.relation)
  if(c.read!==Boolean(expected)||expected&&(c.type!==expected.type||c.required!==expected.required||c.plain!==true||c.relation_id!==base?.id||c.owner_id!==base?.owner_id))return fail("company-overview-audit-core.ts:119:179",[Boolean(c.read!==Boolean(expected)),Boolean(expected&&(c.type!==expected.type||c.required!==expected.required||c.plain!==true||c.relation_id!==base?.id||c.owner_id!==base?.owner_id))],{"c":String(c.name??"catalog-object")})
 }
 for(const [name,cols] of Object.entries(tables))for(const column of Object.keys(cols))if(!seen.has(name+":"+column))return fail("company-overview-audit-core.ts:121:125",[Boolean(!seen.has(name+":"+column))],{})
 const columnAcl=await read(db,"/* company061:column_acl */ SELECT n.nspname||'.'||c.relname AS relation,a.attname AS name,x.grantor::integer=c.relowner::integer AS owner_grant,x.privilege_type AS privilege,x.is_grantable AS grantable "+
  "FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x WHERE a.attnum>0 AND NOT a.attisdropped AND x.grantee=$1::oid",[owner.id])
 const aclKeys=columnAcl.map(c=>String(c.relation)+":"+String(c.name))
 if(columnAcl.length!==16||new Set(aclKeys).size!==16||columnAcl.some(c=>!tables[String(c.relation)]?.[String(c.name)]||c.owner_grant!==true||c.privilege!=="SELECT"||c.grantable!==false))return fail("company-overview-audit-core.ts:125:195",[Boolean(columnAcl.length!==16),Boolean(new Set(aclKeys).size!==16),Boolean(columnAcl.some(c=>!tables[String(c.relation)]?.[String(c.name)]||c.owner_grant!==true||c.privilege!=="SELECT"||c.grantable!==false))],{})
 exactIds(policies,"id")
 for(const [relation,name] of Object.entries(policyNames)){const rows=policies.filter(p=>p.relation===relation&&p.name===name)
  if(rows.length!==1)return fail("company-overview-audit-core.ts:128:29",[Boolean(rows.length!==1)],{});const p=rows[0]!
  if(p.command!=="r"||p.permissive!==true||!same(p.roles,[owner.id])||p.qual!==(relation==="agentstudio.users"?nativeQual:"true")||p.check!==null)return fail("company-overview-audit-core.ts:129:154",[Boolean(p.command!=="r"),Boolean(p.permissive!==true),Boolean(!same(p.roles,[owner.id])),Boolean(p.qual!==(relation==="agentstudio.users"?nativeQual:"true")),Boolean(p.check!==null)],{})
 }
 const applicable=await read(db,"/* company061:applicable_policies */ SELECT c.oid::integer AS relation_id,n.nspname||'.'||c.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,p.polroles::integer[] AS roles,"+
  "pg_get_expr(p.polqual,p.polrelid) AS qual,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
  "WHERE c.oid=ANY($1::oid[]) AND (0=ANY(p.polroles) OR $2::oid=ANY(p.polroles) OR $3::oid=ANY(p.polroles))",[baseIds,owner.id,api.id])
 if(applicable.length!==9)return fail("company-overview-audit-core.ts:134:34",[Boolean(applicable.length!==9)],{})
 for(const b of bases){const expectedNew=policies.find(p=>p.relation===b.name)!,rows=applicable.filter(p=>p.relation===b.name)
  const p=apiPolicies[String(b.name)]
  if(rows.length!==(p?2:1)||rows.some(r=>r.relation_id!==b.id))return fail("company-overview-audit-core.ts:137:71",[Boolean(rows.length!==(p?2:1)),Boolean(rows.some(r=>r.relation_id!==b.id))],{})
  const own=rows.find(r=>r.name===expectedNew.name)
  if(!own||own.command!=="r"||own.permissive!==true||!same(own.roles,[owner.id])||own.qual!==expectedNew.qual||own.check!==null)return fail("company-overview-audit-core.ts:139:136",[Boolean(!own),Boolean(own.command!=="r"),Boolean(own.permissive!==true),Boolean(!same(own.roles,[owner.id])),Boolean(own.qual!==expectedNew.qual),Boolean(own.check!==null)],{})
  if(p){const apiPolicy=rows.find(r=>r.name===p.name);if(!apiPolicy||apiPolicy.command!=="*"||apiPolicy.permissive!==true||!same(apiPolicy.roles,[api.id])||apiPolicy.qual!==p.expression||apiPolicy.check!==p.expression)return fail("company-overview-audit-core.ts:140:226",[Boolean(!apiPolicy),Boolean(apiPolicy.command!=="*"),Boolean(apiPolicy.permissive!==true),Boolean(!same(apiPolicy.roles,[api.id])),Boolean(apiPolicy.qual!==p.expression),Boolean(apiPolicy.check!==p.expression)],{})}
 }
 const actor=await one(db,"/* company061:actor */ SELECT p.oid::integer AS id,n.nspname AS schema,p.proname AS name,oidvectortypes(p.proargtypes) AS args,format_type(p.prorettype,NULL) AS result,l.lanname AS language,p.provolatile AS volatility,p.prosecdef AS definer,p.proisstrict AS strict,p.proleakproof AS leakproof,p.proconfig AS config,"+
  "encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha,p.prokind='f' AND p.proparallel='u' AND p.provariadic=0 AND p.prosupport=0 AND NOT p.proretset AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.proargnames IS NULL AS ordinary,has_function_privilege($1::oid,p.oid,'EXECUTE') AS executable,"+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0) AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE oid=p.proowner) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,p.proowner,'MEMBER')) AS owner_safe FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('agentstudio.actor_id()')",[owner.id])
 if(!oid(actor.id)||actor.schema!=="agentstudio"||actor.name!=="actor_id"||actor.args!==""||actor.result!=="uuid"||actor.language!=="sql"||actor.volatility!=="s"||actor.definer!==false||actor.strict!==false||actor.leakproof!==false||actor.config!==null||actor.sha!==actorSha||actor.ordinary!==true||actor.executable!==true||actor.owner_safe!==true)return fail("company-overview-audit-core.ts:146:356",[Boolean(!oid(actor.id)),Boolean(actor.schema!=="agentstudio"),Boolean(actor.name!=="actor_id"),Boolean(actor.args!==""),Boolean(actor.result!=="uuid"),Boolean(actor.language!=="sql"),Boolean(actor.volatility!=="s"),Boolean(actor.definer!==false),Boolean(actor.strict!==false),Boolean(actor.leakproof!==false),Boolean(actor.config!==null),Boolean(actor.sha!==actorSha),Boolean(actor.ordinary!==true),Boolean(actor.executable!==true),Boolean(actor.owner_safe!==true)],{})
 return true
}

export async function verifyCompanyOverviewCore(db:SqlClient):Promise<boolean>{try{return await verify(db)}catch{return fail("company-overview-audit-core.ts:150:121",[],{})}}

export async function runDiagnosticCore(db:SqlClient):Promise<boolean>{requireAgentDesignDatabaseCi();return verify(db)}
