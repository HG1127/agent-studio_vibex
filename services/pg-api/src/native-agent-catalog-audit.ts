import type {SqlClient,SqlPool} from './contracts.ts'
import {originalHome070PresenceSql,verifyNativeHomeAuthoringSchema} from './native-home-authoring-audit.ts'
const table='agentstudio.agent_spec_favorites',api='agentstudio_api'
const fail=():never=>{throw Error('unsafe_original_agent_catalog_schema')}
const canonical=(value:string)=>value.replace(/\s+/g,'')
// PG18 stores every column NOT NULL (including the implicit PK NOT NULL)
// in pg_constraint. Names/definition follow upstream REL_18_STABLE
// heap.c AddRelationNotNullConstraints and ruleutils.c CONSTRAINT_NOTNULL.
const favoriteColumns=['agent_spec_id','owner_user_id','favorite','created_at','updated_at'] as const
const authoringColumns=['agent_spec_id','owner_user_id','authoring','created_at','updated_at'] as const
const expected071=[
 'migration:pg_v9_071','relation:agent_spec_favorites','related_relation:agent_spec_favorites_pkey',
 'type:agent_spec_favorites','type:_agent_spec_favorites','constraint:agent_spec_favorites_pkey',
 'constraint:agent_spec_favorites_owner_fk','policy:agent_spec_favorites_owner',
 ...favoriteColumns.map(column=>'constraint:agent_spec_favorites_'+column+'_not_null'),
].sort()
//071 is a separately selected successor of the frozen070 schema, never a
// relabeling or filtered view of the original050/069 installation receipt.
const expected070=[
 'migration:pg_v9_070','relation:agent_spec_authoring','related_relation:agent_spec_authoring_pkey',
 'type:agent_spec_authoring','type:_agent_spec_authoring','function:home_authoring_utf16_length','function:home_authoring_valid',
 'constraint:agent_spec_authoring_pkey','constraint:agent_spec_authoring_owner_fk','constraint:agent_spec_authoring_valid_ck','policy:agent_spec_authoring_owner',
 ...authoringColumns.map(column=>'constraint:agent_spec_authoring_'+column+'_not_null'),
].sort()
function exact(rows:{kind:string;name:string}[],expected:string[]){if(!Array.isArray(rows)||rows.some(r=>typeof r.kind!=='string'||typeof r.name!=='string')||JSON.stringify(rows.map(r=>r.kind+':'+r.name).sort())!==JSON.stringify(expected))fail()}
export const originalAgentCatalog071PresenceSql="SELECT 'migration' AS kind,version AS name FROM agentstudio.schema_migrations WHERE version='pg_v9_071' UNION ALL "+
 "SELECT CASE WHEN c.relname='agent_spec_favorites' THEN 'relation' ELSE 'related_relation' END,c.relname::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND (c.relname='agent_spec_favorites' OR starts_with(c.relname,'agent_spec_favorites_') OR c.oid IN(SELECT indexrelid FROM pg_catalog.pg_index WHERE indrelid=to_regclass('agentstudio.agent_spec_favorites'))) UNION ALL "+
 "SELECT 'type',t.typname::text FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='agentstudio' AND (t.typname IN('agent_spec_favorites','_agent_spec_favorites') OR starts_with(t.typname,'agent_spec_favorites_')) UNION ALL "+
 "SELECT 'constraint',c.conname::text FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='agentstudio' AND (starts_with(c.conname,'agent_spec_favorites_') OR c.conrelid=to_regclass('agentstudio.agent_spec_favorites') OR c.confrelid=to_regclass('agentstudio.agent_spec_favorites')) UNION ALL "+
 "SELECT 'policy',p.polname::text FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND (starts_with(p.polname,'agent_spec_favorites_') OR c.oid=to_regclass('agentstudio.agent_spec_favorites')) UNION ALL "+
 "SELECT 'trigger',t.tgname::text FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='agentstudio' AND (starts_with(t.tgname,'agent_spec_favorites_') OR c.oid=to_regclass('agentstudio.agent_spec_favorites')) UNION ALL "+
 "SELECT 'function',p.proname::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND (starts_with(p.proname,'agent_catalog_') OR starts_with(p.proname,'agent_spec_favorites_')) UNION ALL "+
 "SELECT 'event_trigger',evtname::text FROM pg_catalog.pg_event_trigger WHERE starts_with(evtname,'agent_catalog_') OR starts_with(evtname,'agent_spec_favorites_')"

export async function verifyNativeAgentCatalogSchema(db:SqlClient):Promise<void>{
 const state=(await db.query<{ok:boolean;api_oid:number}>(
  "SELECT c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND c.relforcerowsecurity AND owner.rolsuper AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AND "+
  "has_table_privilege($2,c.oid,'SELECT') AND NOT has_table_privilege($2,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE NOT r.rolsuper AND r.rolname NOT IN($2,'pg_read_all_data','pg_write_all_data') AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AND "+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)) OR a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND (a.is_grantable OR a.grantor<>c.relowner)) AS ok,"+
  "(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AS api_oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner WHERE c.oid=to_regclass($1)",[table,api])).rows[0]
 if(!state)return fail()
 if(state.ok!==true||!Number.isSafeInteger(Number(state.api_oid))||Number(state.api_oid)<1)fail()
 const columns=(await db.query<{name:string;type:string;required:boolean;default_expr:string|null;read:boolean;insert:boolean;update:boolean;reference:boolean;acl_safe:boolean}>(
  "SELECT a.attname AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr,"+
  "has_column_privilege($2,a.attrelid,a.attnum,'SELECT') AS read,has_column_privilege($2,a.attrelid,a.attnum,'INSERT') AS insert,has_column_privilege($2,a.attrelid,a.attnum,'UPDATE') AS update,has_column_privilege($2,a.attrelid,a.attnum,'REFERENCES') AS reference,"+
  "NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(a.attacl,'{}'::aclitem[])) x WHERE x.grantee NOT IN(c.relowner,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2)) OR x.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2) AND (x.is_grantable OR x.grantor<>c.relowner)) AS acl_safe "+
  "FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[table,api])).rows
 const names=['agent_spec_id','owner_user_id','favorite','created_at','updated_at'];if(columns.length!==names.length)fail()
 for(let i=0;i<columns.length;i++){const c=columns[i]!,name=names[i]!,time=i>=3;if(c.name!==name||c.type!==(time?'timestamp with time zone':i===2?'boolean':'uuid')||c.required!==true||c.default_expr!==(time?'clock_timestamp()':i===2?'false':null)||c.read!==true||c.insert!==(i<=2)||c.update!==['favorite','updated_at'].includes(name)||c.reference!==false||c.acl_safe!==true)fail()}
 const policies=(await db.query<{name:string;command:string;permissive:boolean;roles:number[];using_expr:string;check_expr:string}>(
  'SELECT polname AS name,polcmd AS command,polpermissive AS permissive,polroles AS roles,pg_get_expr(polqual,polrelid) AS using_expr,pg_get_expr(polwithcheck,polrelid) AS check_expr FROM pg_catalog.pg_policy WHERE polrelid=to_regclass($1)',[table])).rows
 const policy=policies[0],expression='(owner_user_id=agentstudio.actor_id())';if(policies.length!==1||!policy||policy.name!=='agent_spec_favorites_owner'||policy.command!=='*'||policy.permissive!==true||policy.roles.length!==1||Number(policy.roles[0])!==Number(state.api_oid)||canonical(policy.using_expr)!==expression||canonical(policy.check_expr)!==expression)fail()
 const constraints=(await db.query<{name:string;type:string;valid:boolean;enforced:boolean;deferrable:boolean;deferred:boolean;definition:string;keys:number[];local:boolean;inheritance_count:number;parent_id:string;index_id:string;foreign_relation:string;domain_id:string;no_inherit:boolean}>(
  'SELECT conname AS name,contype AS type,convalidated AS valid,conenforced AS enforced,condeferrable AS deferrable,condeferred AS deferred,conkey AS keys,conislocal AS local,coninhcount AS inheritance_count,conparentid::text AS parent_id,conindid::text AS index_id,confrelid::text AS foreign_relation,contypid::text AS domain_id,connoinherit AS no_inherit,pg_get_constraintdef(oid,true) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass($1)',[table])).rows
 const expected:Record<string,[string,string,number[]]>={agent_spec_favorites_pkey:['p','PRIMARYKEY(agent_spec_id)',[1]],agent_spec_favorites_owner_fk:['f','FOREIGNKEY(agent_spec_id,owner_user_id)REFERENCESagentstudio.agent_specs(id,owner_user_id)ONUPDATERESTRICTONDELETERESTRICT',[1,2]]}
 for(const [i,column] of favoriteColumns.entries())expected['agent_spec_favorites_'+column+'_not_null']=['n','NOTNULL'+column,[i+1]]
 // Exact seven records, not a filter over p/f or a blanket exception for n.
 if(constraints.length!==7||new Set(constraints.map(c=>c.name)).size!==7)fail()
 for(const c of constraints){const e=expected[c.name];if(!e||c.type!==e[0]||c.valid!==true||c.enforced!==true||c.deferrable!==false||c.deferred!==false||c.local!==true||Number(c.inheritance_count)!==0||c.parent_id!=='0'||c.domain_id!=='0'||JSON.stringify(c.keys)!==JSON.stringify(e[2])||canonical(c.definition)!==e[1])fail();if(c.type==='n'&&(c.index_id!=='0'||c.foreign_relation!=='0'||c.no_inherit!==false))fail()}
 const indexes=(await db.query<{name:string;ok:boolean}>("SELECT ci.relname AS name,i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indexprs IS NULL AND i.indpred IS NULL AND a.amname='btree' AND pg_get_indexdef(i.indexrelid,1,true)='agent_spec_id' AS ok FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid JOIN pg_catalog.pg_am a ON a.oid=ci.relam WHERE i.indrelid=to_regclass($1)",[table])).rows
 const index=indexes[0];if(indexes.length!==1||!index||index.name!=='agent_spec_favorites_pkey'||index.ok!==true)fail()
}
export async function inspectOptionalNativeAgentCatalogSchema(pool:SqlPool):Promise<'absent'|'installed'>{
 const db=await pool.connect();let primary:unknown,discard=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog')
  const presence=(await db.query<{kind:string;name:string}>(originalAgentCatalog071PresenceSql)).rows
  if(!Array.isArray(presence))fail();if(presence.length===0)return'absent';exact(presence,expected071)
  // The predecessor and successor checks share this same real catalog snapshot.
  exact((await db.query<{kind:string;name:string}>(originalHome070PresenceSql)).rows,expected070)
  await verifyNativeHomeAuthoringSchema(db);await verifyNativeAgentCatalogSchema(db);return'installed'
 }catch(error){primary=error;throw error}
 finally{try{await db.query('ROLLBACK')}catch{discard=true;if(primary===undefined)throw Error('original_agent_catalog_schema_rollback_required')}finally{if(discard)Reflect.apply(db.release,db,[true]);else db.release()}}
}
