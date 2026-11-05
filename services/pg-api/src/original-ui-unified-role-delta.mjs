// Specific Role extension gate. Original parent auditors run before this DDL.
import {originalRoleTables,originalRoleFunctions,originalRoleConstraints} from './original-role-schema.mjs';
import {employeeUi078Canonical as canonical} from './pg18-employee-ui078-catalog.mjs';
import {readUnifiedEmployeeCatalog,assertUnifiedEmployeeCatalogStable} from './original-ui-unified-catalog.mjs';
import {verifyUnifiedOriginalRoleInstallCatalog} from './original-ui-unified-role-install-catalog.mjs';
const fail=()=>{throw Error('original_ui_unified_role_delta_refused')};
const id=v=>{const s=String(v);if(!/^[1-9][0-9]{0,9}$/.test(s)||BigInt(s)>4294967295n)fail();return s};
const same=(a,b)=>canonical(a)===canonical(b),array=v=>{if(v===null)return[];if(!Array.isArray(v)||!v.length||v.length>100000)fail();return v};
const sections=['dependencies','extensions','schemas','classes','columns','defaults','functions','types','constraints','policies','triggers','indexes','rewrites','default_acls','event_triggers','roles','memberships','role_settings','database_acl'];
const classNames=['namespace','relation','type','constraint','function','default','policy','trigger','rewrite'];
const riNames=['check_insert','check_update','parent_delete','parent_update'];
export const unifiedRoleDeltaBindingsSQL=`SELECT jsonb_build_object(
 'classes',jsonb_build_object('namespace','pg_catalog.pg_namespace'::regclass::oid::text,'relation','pg_catalog.pg_class'::regclass::oid::text,'type','pg_catalog.pg_type'::regclass::oid::text,'constraint','pg_catalog.pg_constraint'::regclass::oid::text,'function','pg_catalog.pg_proc'::regclass::oid::text,'default','pg_catalog.pg_attrdef'::regclass::oid::text,'policy','pg_catalog.pg_policy'::regclass::oid::text,'trigger','pg_catalog.pg_trigger'::regclass::oid::text,'rewrite','pg_catalog.pg_rewrite'::regclass::oid::text),
 'ri',jsonb_build_object('check_insert','pg_catalog."RI_FKey_check_ins"()'::regprocedure::oid::text,'check_update','pg_catalog."RI_FKey_check_upd"()'::regprocedure::oid::text,'parent_delete','pg_catalog."RI_FKey_noaction_del"()'::regprocedure::oid::text,'parent_update','pg_catalog."RI_FKey_noaction_upd"()'::regprocedure::oid::text)
) AS value`;
function bindings(value){
 canonical(value);
 if(!value||Object.keys(value).sort().join(',')!=='classes,ri')fail();
 for(const [key,names]of [['classes',classNames],['ri',riNames]]){if(!value[key]||Object.keys(value[key]).sort().join(',')!==[...names].sort().join(','))fail();const values=names.map(name=>id(value[key][name]));if(new Set(values).size!==values.length)fail()}
 return value;
}
export async function readUnifiedRoleDeltaBindings(db){
 const result=await db.query(unifiedRoleDeltaBindingsSQL);
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1||!result.rows[0]||Object.keys(result.rows[0]).join(',')!=='value')fail();
 return JSON.parse(canonical(bindings(result.rows[0].value)));
}
function catalog(value){
 const s=canonical(value);if(Buffer.byteLength(s)>24*1024*1024||!value||Object.keys(value).sort().join(',')!==[...sections].sort().join(','))fail();
 return value;
}
function indexed(raw,identity){const map=new Map();for(const row of array(raw)){const key=identity(row);if(map.has(key))fail();map.set(key,row)}return map}
export function assertUnifiedRoleCatalogDelta(rawBefore,rawAfter,rawBindings){
 const before=catalog(rawBefore),after=catalog(rawAfter),bound=bindings(rawBindings);
 for(const key of ['extensions','default_acls','event_triggers','roles','memberships','role_settings','database_acl'])if(!same(before[key],after[key]))fail();
 const tableDefs=originalRoleTables,indexDefs=tableDefs.flatMap(t=>t.keys.map((keys,i)=>({name:t.name+(i?'_u'+i:'_pkey'),table:t.name,keys}))),constraintDefs=tableDefs.flatMap(t=>originalRoleConstraints(t).map(c=>({...c,table:t.name})));
 const oldNS=indexed(before.schemas,r=>id(r.oid)),newNS=indexed(after.schemas,r=>id(r.oid));
 for(const [key,row]of oldNS)if(!newNS.has(key)||!same(row,newNS.get(key)))fail();
 const namespaces=[...newNS].filter(([key])=>!oldNS.has(key)).map(([,row])=>row);
 if(namespaces.length!==1||namespaces[0].nspname!=='agentstudio_roles')fail();const ns=id(namespaces[0].oid);
 const expectedRelations=new Map([...tableDefs.map(t=>[t.name,{kind:'r',columns:t.columns.map(c=>c.name)}]),...indexDefs.map(i=>[i.name,{kind:'i',columns:i.keys}])]);
 const oldClasses=indexed(before.classes,r=>id(r.oid)),newClasses=indexed(after.classes,r=>id(r.oid)),addedClasses=[...newClasses].filter(([key])=>!oldClasses.has(key)).map(([,row])=>row);
 if(addedClasses.length!==expectedRelations.size)fail();const relationNames=new Map();
 for(const row of addedClasses){const expected=expectedRelations.get(row.name);if(!expected||id(row.namespace)!==ns||row.kind!==expected.kind||row.has_triggers!==(expected.kind==='r')||relationNames.has(row.name))fail();relationNames.set(row.name,row)}
 const tableOid=name=>{const row=relationNames.get(name);if(!row||row.kind!=='r')fail();return id(row.oid)};
 const namespaceName=oid=>newNS.get(id(oid))?.nspname;
 const fullTable=name=>{const [schema,table]=name.split('.');const found=[...newClasses.values()].filter(r=>namespaceName(r.namespace)===schema&&r.name===table&&r.kind==='r');if(found.length!==1)fail();return id(found[0].oid)};
 const externalTargets=new Set(tableDefs.flatMap(t=>t.foreign.map(f=>f.target)).filter(name=>!name.startsWith('agentstudio_roles.')));
 for(const name of externalTargets){const oid=fullTable(name);if(newClasses.get(oid)?.has_triggers!==true)fail()}
 for(const [key,old]of oldClasses){const row=newClasses.get(key);if(!row)fail();if(same(old,row))continue;const qualified=namespaceName(old.namespace)+'.'+old.name;if(!externalTargets.has(qualified)||old.has_triggers!==false||row.has_triggers!==true)fail();const a={...old},b={...row};delete a.has_triggers;delete b.has_triggers;if(!same(a,b))fail()}
 const categories={columns:r=>id(r.attrelid)+':'+r.attnum,defaults:r=>id(r.oid),functions:r=>id(r.oid),types:r=>id(r.oid),constraints:r=>id(r.oid),policies:r=>id(r.oid),triggers:r=>id(r.oid),indexes:r=>id(r.indexrelid),rewrites:r=>id(r.oid)};
 const added={};
 for(const [key,identity]of Object.entries(categories)){const prior=indexed(before[key],identity),current=indexed(after[key],identity);for(const [identity,row]of prior)if(!current.has(identity)||!same(row,current.get(identity)))fail();added[key]=[...current].filter(([identity])=>!prior.has(identity)).map(([,row])=>row)}
 const expectedColumns=new Map([...relationNames].flatMap(([name,row])=>expectedRelations.get(name).columns.map((column,i)=>[id(row.oid)+':'+(i+1),column])));
 if(added.columns.length!==expectedColumns.size)fail();for(const row of added.columns)if(expectedColumns.get(id(row.attrelid)+':'+row.attnum)!==row.attname)fail();
 const expectedDefaults=new Set(tableDefs.flatMap(t=>t.columns.flatMap((c,i)=>c.default!==null?[tableOid(t.name)+':'+(i+1)]:[])));
 if(added.defaults.length!==expectedDefaults.size)fail();for(const row of added.defaults)if(!expectedDefaults.has(id(row.adrelid)+':'+row.adnum))fail();
 const typeNames=new Set(tableDefs.flatMap(t=>[t.name,'_'+t.name]));if(added.types.length!==typeNames.size)fail();for(const row of added.types)if(id(row.typnamespace)!==ns||!typeNames.delete(row.typname))fail();if(typeNames.size)fail();
 const functionNames=new Set(originalRoleFunctions.map(f=>f.name));if(added.functions.length!==functionNames.size)fail();const functionOids=new Map();for(const row of added.functions){if(id(row.pronamespace)!==ns||!functionNames.delete(row.proname))fail();functionOids.set(row.proname,id(row.oid))}if(functionNames.size)fail();
 const expectedConstraints=new Map(constraintDefs.map(c=>[c.name,c]));if(added.constraints.length!==expectedConstraints.size)fail();const fk=[];for(const row of added.constraints){const def=expectedConstraints.get(row.conname);if(!def||id(row.connamespace)!==ns||id(row.conrelid)!==tableOid(def.table)||row.contype!==def.type)fail();expectedConstraints.delete(row.conname);if(def.type==='f'){if(id(row.confrelid)!==fullTable(def.target))fail();fk.push({oid:id(row.oid),child:tableOid(def.table),parent:fullTable(def.target)})}}if(expectedConstraints.size)fail();
 const policies=new Set(tableDefs.map(t=>tableOid(t.name)+':'+t.name+'_owner'));if(added.policies.length!==policies.size)fail();for(const row of added.policies)if(!policies.delete(id(row.polrelid)+':'+row.polname))fail();if(policies.size)fail();
 if(added.indexes.length!==indexDefs.length)fail();const indices=new Set(indexDefs.map(d=>id(relationNames.get(d.name).oid)+':'+tableOid(d.table)));for(const row of added.indexes)if(!indices.delete(id(row.indexrelid)+':'+id(row.indrelid)))fail();if(indices.size||added.rewrites.length)fail();
 const triggers=tableDefs.filter(t=>!t.update).map(t=>({constraint:'0',relation:tableOid(t.name),type:27,function:functionOids.get('immutable'),name:t.name+'_immutable'}));
 for(const f of fk)for(const [key,type,relation]of [['check_insert',5,f.child],['check_update',17,f.child],['parent_delete',9,f.parent],['parent_update',17,f.parent]])triggers.push({constraint:f.oid,relation,type,function:id(bound.ri[key]),name:null});
 if(added.triggers.length!==triggers.length)fail();const unmatched=[...triggers];for(const row of added.triggers){const index=unmatched.findIndex(t=>String(row.tgconstraint)===t.constraint&&id(row.tgrelid)===t.relation&&row.tgtype===t.type&&id(row.tgfoid)===t.function&&(t.name===null||row.tgname===t.name));if(index<0)fail();unmatched.splice(index,1)}if(unmatched.length)fail();
 const newObjects=new Set(),register=(kind,rows,key='oid')=>{for(const row of rows)newObjects.add(id(bound.classes[kind])+':'+id(row[key]))};
 register('namespace',namespaces);register('relation',addedClasses);register('type',added.types);register('constraint',added.constraints);register('function',added.functions);register('default',added.defaults);register('policy',added.policies);register('trigger',added.triggers);
 const oldDependencies=indexed(before.dependencies,row=>canonical(row)),newDependencies=indexed(after.dependencies,row=>canonical(row));for(const key of oldDependencies.keys())if(!newDependencies.has(key))fail();
 for(const [key,row]of newDependencies)if(!oldDependencies.has(key)&&!newObjects.has(id(row.classid)+':'+id(row.objid)))fail();
 return Object.freeze({role_catalog_delta_verified:true,profile_component_only:true,added_tables:tableDefs.length,added_functions:originalRoleFunctions.length,added_constraints:constraintDefs.length,full_new_Role_semantics_verified:false,whole_final_profile_verified:false,authorizes_install:false,production_GO:false});
}
export async function verifyUnifiedRoleCatalogDelta(db,before){
 const bound=await readUnifiedRoleDeltaBindings(db),after=await readUnifiedEmployeeCatalog(db),delta=assertUnifiedRoleCatalogDelta(before,after,bound);
 const semantic=await verifyUnifiedOriginalRoleInstallCatalog(db);if(id(semantic.database_oid)!==id(after.database_acl.oid))fail();const fresh=await readUnifiedEmployeeCatalog(db);assertUnifiedEmployeeCatalogStable(after,fresh);
 const boundAfter=await readUnifiedRoleDeltaBindings(db);if(!same(bound,boundAfter))fail();
 return Object.freeze({catalog:fresh,delta,semantic,profile_component_only:true,whole_final_profile_verified:false,authorizes_install:false,production_GO:false});
}
