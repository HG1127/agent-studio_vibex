// Literal read-only metadata contracts. No parsed DATA grants a capability.
import {createHash} from 'node:crypto'
import {types} from 'node:util'
const fail=()=>{throw Error('employee_ui078_catalog_refused')}
export function employeeUi078Canonical(value){
 if(types.isProxy(value))fail()
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(Array.isArray(value)){
  const d=Object.getOwnPropertyDescriptors(value)
  if(Reflect.ownKeys(d).length!==value.length+1||!d.length||!('value'in d.length))fail()
  const items=[];for(let i=0;i<value.length;i++){const v=d[String(i)];if(!v||!('value'in v)||!v.enumerable)fail();items.push(employeeUi078Canonical(v.value))}
  return '['+items.join(',')+']'
 }
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)fail()
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors)
 if(keys.some(k=>typeof k!=='string'||!('value'in descriptors[k])||!descriptors[k].enumerable))fail()
 return '{'+keys.sort().map(k=>JSON.stringify(k)+':'+employeeUi078Canonical(descriptors[k].value)).join(',')+'}'
}
export const employeeUi078CatalogDigest=value=>createHash('sha256').update(employeeUi078Canonical(value)).digest('hex')
/** Full application catalog, including OIDs, bodies, dependencies and ACLs.
 * Excludes table statistics/storage counters, passwords and business rows.
 * A receipt fingerprint complements the original semantic auditors; it cannot
 * replace them. Every verification rereads the real catalogs. */
export const employeeUi078CatalogSql=`WITH app_objects(classid,objid) AS (
 SELECT 'pg_catalog.pg_namespace'::regclass::oid,n.oid FROM pg_catalog.pg_namespace n WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_class'::regclass::oid,c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_proc'::regclass::oid,p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_type'::regclass::oid,t.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_constraint'::regclass::oid,c.oid FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_policy'::regclass::oid,p.oid FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_trigger'::regclass::oid,t.oid FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
 UNION ALL SELECT 'pg_catalog.pg_rewrite'::regclass::oid,r.oid FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')
) SELECT jsonb_build_object(
 'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_catalog.pg_depend d WHERE EXISTS(SELECT 1 FROM app_objects a WHERE a.classid=d.classid AND a.objid=d.objid OR a.classid=d.refclassid AND a.objid=d.refobjid)),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_extension e),
 'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.nspname COLLATE "C") FROM pg_catalog.pg_namespace n WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'classes',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'namespace',c.relnamespace,'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,'owner',c.relowner,'am',c.relam,'type',c.reltype,'of_type',c.reloftype,'natts',c.relnatts,'checks',c.relchecks,'has_rules',c.relhasrules,'has_triggers',c.relhastriggers,'has_subclass',c.relhassubclass,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'replica_identity',c.relreplident,'partition',c.relispartition,'part_bound',c.relpartbound,'acl',c.relacl,'options',c.reloptions) ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C") FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND a.attnum>0),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_class c ON c.oid=d.adrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'rewrites',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),
 'default_acls',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.oid) FROM pg_catalog.pg_default_acl a WHERE a.defaclnamespace=0 OR a.defaclnamespace IN(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth'))),
 'event_triggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_event_trigger e),
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,'bypass_rls',r.rolbypassrls,'connection_limit',r.rolconnlimit,'config',r.rolconfig,'valid_until',r.rolvaliduntil) ORDER BY r.rolname COLLATE "C") FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'agentstudio_')),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_catalog.pg_auth_members m WHERE m.member IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_')) OR m.roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_'))),
 'role_settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole) FROM pg_catalog.pg_db_role_setting s WHERE s.setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) OR s.setrole IN(SELECT oid FROM pg_catalog.pg_roles WHERE starts_with(rolname,'agentstudio_'))),
 'database_acl',(SELECT jsonb_build_object('oid',d.oid,'owner',d.datdba,'acl',d.datacl) FROM pg_catalog.pg_database d WHERE d.datname=current_database())
) AS catalog`
export const employeeUi078LedgerRpcSql='SELECT system_identifier,database_oid,version,description FROM agentstudio.employee_ui078_catalog_ledger() ORDER BY version COLLATE "C"'
// Resolve exact identities by catalog fields with search_path=pg_catalog.
// Name-input regprocedure lookup would additionally require USAGE on private
// agentstudio_auth; this metadata reader never widens that existing ACL.
export const employeeUi078FunctionOidsSql=`SELECT wanted.signature,p.oid::text AS oid
 FROM unnest($1::text[]) WITH ORDINALITY AS wanted(signature,ord)
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=split_part(wanted.signature,'.',1)
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.prokind='f'
  AND p.proname=split_part(split_part(wanted.signature,'(',1),'.',2)
  AND replace(coalesce((SELECT string_agg(pg_catalog.format_type(arg.oid,NULL),',' ORDER BY arg.ord)
   FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS arg(oid,ord)),''),' ','')=
   replace(substr(wanted.signature,strpos(wanted.signature,'(')+1,length(wanted.signature)-strpos(wanted.signature,'(')-1),' ','')
 ORDER BY wanted.ord`
export const employeeUi078LedgerRpcAuditSql=`SELECT p.oid::text AS oid,p.prokind='f' AND p.prosecdef AND p.provolatile='s' AND NOT p.proisstrict AND p.proretset AND p.pronargs=0 AND p.pronargdefaults=0 AND p.provariadic=0 AND p.prosupport=0 AND NOT p.proleakproof AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] AND l.lanname='sql' AND owner.rolname='postgres' AND owner.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,p.proowner,'MEMBER')) AND p.prorettype='record'::regtype AND p.proargmodes=ARRAY['t','t','t','t']::"char"[] AND p.proargnames=ARRAY['system_identifier','database_oid','version','description']::text[] AND p.proallargtypes=ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'text'::regtype]::oid[] AND p.prosqlbody IS NULL AND has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR a.grantor<>p.proowner OR a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_api')) OR a.grantee<>p.proowner AND a.is_grantable) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname<>'agentstudio_api' AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS ok,p.prosrc AS source FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner WHERE n.nspname='agentstudio' AND p.proname='employee_ui078_catalog_ledger'`
export function employeeUi078LiteralLedger(sql){
 if(typeof sql!=='string'||sql.includes('\0'))fail()
 const rows=[]
 // Pins fix the complete SQL inputs; this accepts literal version/description
 // pairs only. Unknown/duplicate/missing versions refuse source capture.
 for(const m of sql.matchAll(/\(\s*'(pg_v[89]_[0-9]{3}|pg18_native_auth_001|pg18_employee_ui078_catalog_001)'\s*,\s*'((?:''|[^'])*)'\s*\)/g))rows.push({version:m[1],description:m[2].replace(/''/g,"'")})
 return rows
}
/** Closed source inventory, resolved against actual pg_catalog OIDs later.
 * No SQL is executed here. Unexpected syntax refuses capture. */
export function employeeUi078FunctionSignatures(sql){
 const out=[]
 for(const m of sql.matchAll(/\b(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(agentstudio(?:_auth)?\.[a-z_][a-z_0-9]*)\s*\(([^;]*?)\)\s*(?=RETURNS\b|CASCADE\b|RESTRICT\b|;)/gi)){
  const chunks=[];let start=0,depth=0,quote=false
  for(let i=0;i<m[3].length;i++){const c=m[3][i];if(c==="'"){if(quote&&m[3][i+1]==="'"){i++;continue}quote=!quote}if(quote)continue;if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(c===','&&depth===0){chunks.push(m[3].slice(start,i));start=i+1}if(depth<0)fail()}
  if(quote||depth!==0)fail();if(m[3].trim())chunks.push(m[3].slice(start))
  const args=chunks.map(raw=>{let s=raw.replace(/\s+DEFAULT\s+[\s\S]*$/i,'').trim().replace(/\s+/g,' ');if(/^IN\s+/i.test(s))s=s.replace(/^IN\s+/i,'');if(/^(?:OUT|INOUT|VARIADIC)\s/i.test(s))fail();const parts=s.split(' ');if(parts.length>1&&!/^(?:double precision|timestamp(?: with(?:out)? time zone)?|time(?: with(?:out)? time zone)?|character varying)(?:\[\])?$/i.test(s))s=parts.slice(1).join(' ');s=s.toLowerCase().replace(/^int4(?=\[|$)|^int(?=\[|$)/,'integer').replace(/^int8(?=\[|$)/,'bigint').replace(/^bool(?=\[|$)/,'boolean').replace(/^timestamptz(?=\[|$)/,'timestamp with time zone');if(!/^[a-z_][a-z_0-9. ]*(?:\[\])?$/.test(s))fail();return s})
  out.push({action:m[1].toUpperCase().startsWith('DROP')?'drop':'create',signature:m[2].toLowerCase()+'('+args.join(',')+')'})
 }
 return out
}
