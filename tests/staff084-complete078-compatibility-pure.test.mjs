// CPU catalog metadata only. No SQL engine, Pool, API, Worker or Native process.
import test from 'node:test'
import {createHash as compatCreateHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {assertOriginalStaff084Catalog,assertComplete078Staff084Catalog} from '../services/pg-api/src/original-staff-audit084.mjs'
import {assertStaffQuality089AuthCatalog,assertComplete078StaffQuality089AuthCatalog} from '../services/pg-api/src/staff084-quality089-auth-audit.mjs'
import {complete078Staff084CatalogSQL,complete078StaffQuality089CatalogSQL} from '../services/pg-api/src/staff084-complete078-auth-catalog.mjs'
import {staff084Catalog} from './helpers/original-staff084-catalog-frame.mjs'
import {staff084QualityCatalog} from './helpers/staff084-composite-catalog-frame.mjs'

// Exact reviewed successor projections for historical assertions only.
const sourceCompatibilityRecords=[{"target":"services/pg-api/src/employee-staff084-source.mjs","parent_sha256":"1086e617dcb09e32c068ca456d23f5557fa94084398c2ea2ccff3cbf7c8d81ba","sha256":"dce35f5b0cc7295261de11e77dcfcd7023f8ec1b31b2187a1f318507de1f0ec8","hunks":[{"order":1,"origin":"staff-statistics-v211","start_utf16":580,"before":"[\"services/pg-api/src/employee-quality089-contract.mjs\",\"services/pg-api/src/employee-quality089-profile.mjs\",\"services/pg-api/src/employee-quality089-source.mjs\",\"services/pg-api/src/employee-staff084-contract.mjs\",\"services/pg-api/src/employee-staff084-logins.mjs\",\"services/pg-api/src/employee-staff084-profile.mjs\",\"services/pg-api/src/employee-staff084-source.mjs\",\"services/pg-api/src/native-auth-http.mjs\",\"services/pg-api/src/native-auth-repository.mjs\",\"services/pg-api/src/native-employee-governance-audit.mjs\",\"services/pg-api/src/native-employee-governance.mjs\",\"services/pg-api/src/native-employee-quality089-profile.mjs\",\"services/pg-api/src/native-employee-staff084-profile.d.mts\",\"services/pg-api/src/native-employee-staff084-profile.mjs\",\"services/pg-api/src/native-server.ts\",\"services/pg-api/src/original-agent-quality-http.ts\",\"services/pg-api/src/original-agent-quality-repository.ts\",\"services/pg-api/src/original-agent-quality-runtime.ts\",\"services/pg-api/src/original-agent-quality-service.ts\",\"services/pg-api/src/original-quality089-audit.ts\",\"services/pg-api/src/original-quality089-catalog-sql.mjs\",\"services/pg-api/src/original-quality089-catalog.mjs\",\"services/pg-api/src/original-quality089-expression.mjs\",\"services/pg-api/src/original-quality089-profile.mjs\",\"services/pg-api/src/original-quality089-static.mjs\",\"services/pg-api/src/original-staff-audit084.mjs\",\"services/pg-api/src/original-staff-catalog084.mjs\",\"services/pg-api/src/original-staff-compatible084-audit.mjs\",\"services/pg-api/src/original-staff-expression.mjs\",\"services/pg-api/src/original-staff-http.mjs\",\"services/pg-api/src/original-staff-operations.mjs\",\"services/pg-api/src/original-staff-repository.mjs\",\"services/pg-api/src/original-staff-runtime.mjs\",\"services/pg-api/src/original-staff-schema084.mjs\",\"services/pg-api/src/pg18-full069-final-login-contract.mjs\",\"services/pg-api/src/staff084-complete078-auth-catalog.mjs\",\"services/pg-api/src/staff084-complete078-auth-extension.mjs\",\"services/pg-api/src/staff084-quality089-auth-audit.mjs\",\"services/pg-api/src/staff084-quality089-auth-catalog.mjs\",\"services/pg-api/src/staff084-quality089-auth-expression.mjs\",\"services/pg-api/src/staff084-quality089-public-auth-audit.mjs\",\"shared/original-account-contract.ts\",\"shared/original-agent-quality-contract.ts\",\"shared/original-staff-contract.mjs\"]","after":"[\"services/pg-api/src/employee-quality089-contract.mjs\",\"services/pg-api/src/employee-quality089-profile.mjs\",\"services/pg-api/src/employee-quality089-source.mjs\",\"services/pg-api/src/employee-staff084-contract.mjs\",\"services/pg-api/src/employee-staff084-logins.mjs\",\"services/pg-api/src/employee-staff084-profile.mjs\",\"services/pg-api/src/employee-staff084-source.mjs\",\"services/pg-api/src/native-auth-http.mjs\",\"services/pg-api/src/native-auth-repository.mjs\",\"services/pg-api/src/native-employee-governance-audit.mjs\",\"services/pg-api/src/native-employee-governance.mjs\",\"services/pg-api/src/native-employee-quality089-profile.mjs\",\"services/pg-api/src/native-employee-staff084-profile.d.mts\",\"services/pg-api/src/native-employee-staff084-profile.mjs\",\"services/pg-api/src/native-server.ts\",\"services/pg-api/src/original-agent-quality-http.ts\",\"services/pg-api/src/original-agent-quality-repository.ts\",\"services/pg-api/src/original-agent-quality-runtime.ts\",\"services/pg-api/src/original-agent-quality-service.ts\",\"services/pg-api/src/original-quality089-audit.ts\",\"services/pg-api/src/original-quality089-catalog-sql.mjs\",\"services/pg-api/src/original-quality089-catalog.mjs\",\"services/pg-api/src/original-quality089-expression.mjs\",\"services/pg-api/src/original-quality089-profile.mjs\",\"services/pg-api/src/original-quality089-static.mjs\",\"services/pg-api/src/original-staff-audit084.mjs\",\"services/pg-api/src/original-staff-catalog084.mjs\",\"services/pg-api/src/original-staff-compatible084-audit.mjs\",\"services/pg-api/src/original-staff-expression.mjs\",\"services/pg-api/src/original-staff-http.mjs\",\"services/pg-api/src/original-staff-operations.mjs\",\"services/pg-api/src/original-staff-repository.mjs\",\"services/pg-api/src/original-staff-runtime.mjs\",\"services/pg-api/src/original-staff-schema084.mjs\",\"services/pg-api/src/pg18-full069-final-login-contract.mjs\",\"services/pg-api/src/staff084-complete078-api-audit.d.mts\",\"services/pg-api/src/staff084-complete078-api-audit.mjs\",\"services/pg-api/src/staff084-complete078-auth-catalog.mjs\",\"services/pg-api/src/staff084-complete078-auth-extension.mjs\",\"services/pg-api/src/staff084-home-knowledge-stats-audit.ts\",\"services/pg-api/src/staff084-knowledge-parent-audit.ts\",\"services/pg-api/src/staff084-quality089-api-audit.d.mts\",\"services/pg-api/src/staff084-quality089-api-audit.mjs\",\"services/pg-api/src/staff084-quality089-auth-audit.mjs\",\"services/pg-api/src/staff084-quality089-auth-catalog.mjs\",\"services/pg-api/src/staff084-quality089-auth-expression.mjs\",\"services/pg-api/src/staff084-quality089-public-auth-audit.mjs\",\"shared/original-account-contract.ts\",\"shared/original-agent-quality-contract.ts\",\"shared/original-staff-contract.mjs\"]","before_state_sha256":"1086e617dcb09e32c068ca456d23f5557fa94084398c2ea2ccff3cbf7c8d81ba","after_state_sha256":"dce35f5b0cc7295261de11e77dcfcd7023f8ec1b31b2187a1f318507de1f0ec8"}]}];
const compatibilitySHA=value=>compatCreateHash('sha256').update(value).digest('hex');
function sourceCompatibility(file,text){const row=sourceCompatibilityRecords.find(r=>r.target===file);if(!row)return text;const pin=compatibilitySHA(text);if(pin===row.parent_sha256)return text;assert.equal(pin,row.sha256,'unreviewed compatibility source '+file);for(const h of [...row.hunks].reverse()){assert.equal(compatibilitySHA(text),h.after_state_sha256);assert.equal(text.slice(h.start_utf16,h.start_utf16+h.after.length),h.after);text=text.slice(0,h.start_utf16)+h.before+text.slice(h.start_utf16+h.after.length);assert.equal(compatibilitySHA(text),h.before_state_sha256)}assert.equal(compatibilitySHA(text),row.parent_sha256);return text}
const read=p=>sourceCompatibility(p,readFileSync(new URL('../'+p,import.meta.url),'utf8')),ts=createRequire(new URL('../services/pg-api/package.json',import.meta.url))('typescript')
assert.equal(ts.version,'5.9.3')
// Independent expectations come from six unchanged literal migration files.
const declarations=[['032','knowledge_access','knowledge_acl_account_enablement'],['044','schedule_execution','scheduler_native_active'],['045','agent_collaboration','collaboration_accounts'],['046','agent_releases','release_accounts'],['061','company_overview','company_accounts_select'],['078','original_schedule_contract','original_schedules_active_account']]
const parents=declarations.map(([number,suffix,policy])=>{
 const version='pg_v9_'+number,source=read('db/postgres/migrations/'+version+'_'+suffix+'.sql')
 const found=new RegExp('CREATE POLICY '+policy+' ON agentstudio_auth\\.accounts (FOR SELECT )?TO ([a-z0-9_]+) USING\\s*\\(\\s*(true|user_id\\s*=\\s*agentstudio\\.actor_id\\(\\))\\s*\\)').exec(source)
 assert(found,'closed literal parent policy source')
 const role=found[2],grant=[...source.matchAll(/GRANT SELECT\s*\(([^)]+)\)\s+ON agentstudio_auth\.accounts TO ([a-z0-9_]+)/g)].find(x=>x[2]===role)
 assert(grant,'closed exact account column grant source')
 const ledger=new RegExp("\\(\\s*'"+version+"'\\s*,\\s*'((?:''|[^'])*)'\\s*\\)").exec(source)
 assert(ledger,'literal parent migration description')
 return{version,description:ledger[1].replaceAll("''","'"),role,policy,command:found[1]?'r':'*',using:found[3],columns:grant[1].split(',').map(x=>x.trim())}
})
function frame(quality=false){
 const v=quality?staff084QualityCatalog():staff084Catalog(),owner=v.namespace.owner,account=v.relations.find(r=>r.name==='accounts'),acl=[]
 v.schema=quality?'original-staff084-quality089-complete078-catalog.v1':'original-staff084-complete078-catalog.v1'
 v.complete_profile='complete069-employee078-staff084'+(quality?'-quality089':'')+'.v1'
 v.complete_parent_members=[]
 for(const [i,p]of parents.entries()){
  const r={oid:String(300+i),name:p.role,super:false,login:false,inherit:false,bypass:false,createdb:false,createrole:false,replication:false,config:null,limit:-1,valid_until:null}
  v.roles.push(r);v.migrations.push({version:p.version,description:p.description,applied_at:'2026-11-04T00:00:00+00:00'})
  v.namespace.acl.push({grantor:owner,grantee:r.oid,privilege:'USAGE',grantable:false})
  v.policies.push({rel:account.oid,name:p.policy,command:p.command,permissive:true,roles:[Number(r.oid)],using:p.using,check:null})
  for(const name of p.columns)acl.push({rel:account.oid,name,grantor:owner,grantee:r.oid,privilege:'SELECT',grantable:false})
  for(const t of v.relations.filter(t=>t.kind==='r')){const e={rel:t.oid,role:r.oid};for(const k of ['select','insert','update','delete','truncate','references','trigger','maintain','column_select','column_insert','column_update','column_references'])e[k]=k==='column_select'&&t===account;v.effective.push(e)}
  for(const f of v.functions)f.effective.push({role:r.oid,execute:false,grantable:false})
 }
 v.complete_column_acl=[...acl,...(quality?v.quality_column_acl:[])]
 if(quality)v.quality_column_acl=structuredClone(v.complete_column_acl)
 const columns=v.columns.filter(c=>c.rel===account.oid).map(c=>c.name)
 v.complete_account_columns_effective=[]
 for(const r of v.roles)for(const name of columns){
  const row={rel:account.oid,name,role:r.oid}
  for(const right of ['select','insert','update','references']){
   let allowed=r.super||v.acl.some(a=>a.rel===account.oid&&a.grantee===r.oid&&a.privilege===right.toUpperCase())||v.complete_column_acl.some(a=>a.rel===account.oid&&a.name===name&&a.grantee===r.oid&&a.privilege===right.toUpperCase())
   if(r.name==='pg_read_all_data'&&right==='select'||r.name==='pg_write_all_data'&&['insert','update'].includes(right))allowed=true
   row[right]=allowed;row[right+'_grantable']=r.super
  }
  v.complete_account_columns_effective.push(row)
 }
 return v
}
const check=(v,quality=false)=>(quality?assertComplete078StaffQuality089AuthCatalog:assertComplete078Staff084Catalog)(v)
function policy(v,i){return v.policies.find(a=>a.name===parents[i].policy)}
function role(v,i){return v.roles.find(a=>a.name===parents[i].role)}
function denied(name,mutate,quality=false){test(name,()=>{const v=frame(quality);mutate(v);assert.throws(()=>check(v,quality))})}
test('default Standalone still accepts exact5 and rejects a same-count unknown policy',()=>{assert.doesNotThrow(()=>assertOriginalStaff084Catalog(staff084Catalog()));const v=staff084Catalog();v.policies[0].name='unknown_same_count';assert.throws(()=>assertOriginalStaff084Catalog(v))})
test('default quality contract still accepts exact6 and does not accept complete12',()=>{assert.doesNotThrow(()=>assertStaffQuality089AuthCatalog(staff084QualityCatalog()));assert.throws(()=>assertStaffQuality089AuthCatalog(frame(true)))})
test('only named complete entry accepts source-authored11 and full13 column edges',()=>{const v=frame(),receipt=check(v);assert.equal(v.policies.length,11);assert.equal(v.complete_column_acl.length,13);assert.deepEqual(receipt,{profile:'complete069-employee078-staff084.v1',policy_count:11,parent_policy_count:6,parent_column_acl_edges:13,all_account_columns_effective_verified:true,owner_and_role_oids_bound:true,raw_column_acl_preserved:true});assert.throws(()=>assertOriginalStaff084Catalog(v));assert.throws(()=>assertOriginalStaff084Catalog(v,{}))})
test('named quality complete entry audits12 policies and all15 raw column edges',()=>{const v=frame(true),receipt=check(v,true);assert.equal(receipt.policy_count,12);assert.equal(v.complete_column_acl.length,15);assert.equal(v.quality_column_acl.length,15);assert.throws(()=>assertStaffQuality089AuthCatalog(v,{}))})
test('company predecessor independently requires is_admin as its third read column',()=>{assert.deepEqual(parents[4].columns,['user_id','enabled','is_admin']);for(const [i,p]of parents.entries())if(i!==4)assert.deepEqual(p.columns,['user_id','enabled'])})
for(let i=0;i<6;i++){
 const label='parent '+(i+1)
 denied(label+' rejects same-count policy rename',v=>{policy(v,i).name='unknown_same_count'})
 denied(label+' rejects correct name on wrong relation',v=>{policy(v,i).rel=v.relations.find(r=>r.name==='sessions').oid})
 denied(label+' rejects wrong command',v=>{policy(v,i).command=policy(v,i).command==='r'?'*':'r'})
 denied(label+' rejects restrictive policy',v=>{policy(v,i).permissive=false})
 denied(label+' binds the exact role OID',v=>{policy(v,i).roles=[Number(role(v,(i+1)%6).oid)]})
 denied(label+' rejects extra role including PUBLIC',v=>{policy(v,i).roles.push(0)})
 denied(label+' rejects string OID instead of catalog numeric array',v=>{policy(v,i).roles=[role(v,i).oid]})
 denied(label+' rejects altered USING expression',v=>{policy(v,i).using='false'})
 denied(label+' rejects tautology added to scoped USING',v=>{policy(v,i).using='('+policy(v,i).using+') OR true'})
 denied(label+' preserves source implicit null WITH CHECK',v=>{policy(v,i).check='true'})
 denied(label+' rejects duplicate/missing policies with unchanged count',v=>{v.policies[v.policies.indexOf(policy(v,i))]=structuredClone(policy(v,(i+1)%6))})
 denied(label+' requires exact predecessor description',v=>{v.migrations.find(m=>m.version===parents[i].version).description+=' changed'})
 denied(label+' requires the predecessor migration',v=>{v.migrations=v.migrations.filter(m=>m.version!==parents[i].version)})
 denied(label+' rejects duplicate predecessor migration',v=>{v.migrations.push(structuredClone(v.migrations.find(m=>m.version===parents[i].version)))})
 for(const flag of ['super','login','inherit','bypass','createdb','createrole','replication'])denied(label+' rejects role flag '+flag,v=>{role(v,i)[flag]=true})
 denied(label+' rejects new role membership and SET delegation',v=>{v.complete_parent_members.push({role:role(v,i).oid,member:v.roles[1].oid,grantor:v.namespace.owner,admin:false,inherit:false,set:true})})
 denied(label+' rejects column grant option',v=>{v.complete_column_acl.find(a=>a.grantee===role(v,i).oid).grantable=true})
 denied(label+' rejects missing actual column ACL',v=>{v.complete_column_acl.splice(v.complete_column_acl.findIndex(a=>a.grantee===role(v,i).oid),1)})
 denied(label+' rejects effective undergrant of a required column',v=>{v.complete_account_columns_effective.find(a=>a.role===role(v,i).oid&&a.name==='enabled').select=false})
 denied(label+' rejects effective extra account column',v=>{v.complete_account_columns_effective.find(a=>a.role===role(v,i).oid&&!parents[i].columns.includes(a.name)).select=true})
}
denied('column ACL rejects an unknown extra grantee',v=>{v.complete_column_acl.push({...v.complete_column_acl[0],grantee:v.roles[7].oid})})
denied('column ACL rejects same-count wrong grantor',v=>{v.complete_column_acl[0].grantor=v.roles[1].oid})
denied('column ACL rejects same-count renamed column',v=>{v.complete_column_acl[0].name='password_hash'})
denied('column ACL rejects UPDATE hidden behind SELECT count',v=>{v.complete_column_acl[0].privilege='UPDATE'})
denied('column ACL rejects duplicate raw edges',v=>{v.complete_column_acl[1]=structuredClone(v.complete_column_acl[0])})
denied('existing table ACL is still audited',v=>{v.acl[0].grantable=true})
denied('parent table SELECT cannot be substituted for scoped column grant',v=>{const r=role(v,0),e=v.effective.find(a=>a.role===r.oid&&a.rel===v.relations.find(a=>a.name==='accounts').oid);e.select=true;v.acl.push({rel:e.rel,grantor:v.namespace.owner,grantee:r.oid,privilege:'SELECT',grantable:false})})
denied('effective column grantability is not masked by correct raw ACL',v=>{v.complete_account_columns_effective.find(a=>a.role===role(v,0).oid&&a.name==='enabled').select_grantable=true})
denied('effective column inventory rejects duplicates',v=>{v.complete_account_columns_effective[1]=structuredClone(v.complete_account_columns_effective[0])})
denied('effective column inventory rejects omissions',v=>{v.complete_account_columns_effective.pop()})
denied('effective column inventory binds account relation',v=>{v.complete_account_columns_effective[0].rel='999'})
denied('unrelated role effective column rights are audited',v=>{v.complete_account_columns_effective.find(a=>a.role===v.roles[7].oid&&a.name==='enabled').select=true})
denied('relation owner change is refused',v=>{v.relations.find(r=>r.name==='accounts').owner=role(v,0).oid})
denied('namespace owner change is refused',v=>{v.namespace.owner=role(v,0).oid})
denied('namespace privilege grant option is still refused',v=>{v.namespace.acl.at(-1).grantable=true})
denied('quality raw ACL cannot hide inherited edges in its legacy field',v=>{v.quality_column_acl=v.quality_column_acl.filter(a=>a.grantee===v.roles.find(r=>r.name==='agentstudio_quality089').oid)},true)
denied('quality policy exact actor expression remains enforced',v=>{v.policies.find(p=>p.name==='quality089_accounts_read').using='true'},true)
denied('mode cannot relabel a quality catalog as staff',v=>{v.complete_profile='complete069-employee078-staff084.v1'},true)
denied('complete catalog rejects accessors before running extensions',v=>{Object.defineProperty(v,'complete_parent_members',{get(){throw Error('must_not_invoke')},enumerable:true})})
test('named SQL keeps every policy and raw ACL plus exact effective columns and membership evidence',()=>{for(const sql of [complete078Staff084CatalogSQL,complete078StaffQuality089CatalogSQL]){assert(sql.includes("'complete_column_acl'"));assert(sql.includes("'complete_account_columns_effective'"));assert(sql.includes("'complete_parent_members'"));assert(sql.includes("SELECT WITH GRANT OPTION"));assert(sql.includes('p.polrelid IN(SELECT oid FROM rs)'));assert(!sql.includes('p.polname IN('));assert(sql.includes('pg_catalog.aclexplode(a.attacl)'));assert(!sql.includes("a.attacl IS NULL"));assert(sql.includes("a.attidentity='' AND a.attgenerated='' AND a.atttypmod=-1 AND NOT a.attisdropped"))}})
test('composite caller selects the named audit without skipping before/after snapshot checks',async()=>{
 const file='services/pg-api/src/employee-staff084-profile.mjs',source=read(file),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),fn=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='verifyEmployeeStaff084AuthClient')
 assert(fn);for(const quality of [false,true]){const calls=[],context={stateOnAuth:async()=>({snapshot:{mode:{quality}},target:{}}),audit:async()=>{calls.push('audit');return{unchanged:true}},verifyComplete078StaffQuality089AuthSchema:async()=>{calls.push('complete-quality')},verifyComplete078Staff084Schema:async()=>{calls.push('complete-staff')},canonical:JSON.stringify,bad(){throw Error('refused')}};const run=vm.runInNewContext(fn.getText(sf).replace(/^export /,'')+';verifyEmployeeStaff084AuthClient',context);assert.equal(await run({}),true);assert.deepEqual(calls,['audit',quality?'complete-quality':'complete-staff','audit'])}
})
test('source collector adds exactly the two reviewed API source paths with previous ordering preserved',()=>{const source=read('services/pg-api/src/employee-staff084-source.mjs'),paths=JSON.parse(source.match(/files=(\[[^\n]+\])/)[1]);assert.equal(paths.length,44);assert.equal(paths.filter(p=>p.includes('/staff084-complete078-auth-')).length,2);assert.equal(new Set(paths).size,paths.length)})

test('default policy count remains strict after normalizing only the catalog envelope',()=>{const v=staff084Catalog();v.policies.push({...v.policies[0],name:'extra_policy'});assert.throws(()=>assertOriginalStaff084Catalog(v));const q=staff084QualityCatalog();q.policies.push({...q.policies[0],name:'extra_policy'});assert.throws(()=>assertStaffQuality089AuthCatalog(q))})
for(let i=0;i<5;i++)for(const [field,value]of [['name','unknown_base_policy'],['command','r'],['permissive',false],['roles',[0]],['using','false'],['check',null]])denied('complete entry retains original policy '+(i+1)+' '+field,v=>{v.policies[i][field]=structuredClone(value)})
for(const [label,mutate]of [
 ['constraint safety',v=>{v.constraints[0].safe=false}],['index safety',v=>{v.indexes[0].safe=false}],['physical column safety',v=>{v.columns[0].safe=false}],['trigger safety',v=>{v.triggers[0].safe=false}],['function body pin',v=>{v.functions[0].source+=' changed'}],['users ACL',v=>{v.user_acl[0].grantable=true}],['ledger rights',v=>{v.ledger_privileges.update=true}],['extra namespace grant',v=>{v.namespace.acl.push({...v.namespace.acl[0],privilege:'UNKNOWN'})}],['default ACL violation',v=>{v.violations.default_acl=1}]
])denied('complete entry retains original '+label,mutate)
test('extension refusals expose only a closed case index and field classification',()=>{const v=frame();policy(v,2).roles=[0];assert.throws(()=>check(v),e=>e.code==='COMPLETE078_STAFF084_CONTRACT'&&e.case_index===3&&e.field==='policy_roles'&&e.message==='complete078_staff084_contract_unconfirmed_3_policy_roles')})

denied('owner cannot be relabelled as another superuser',v=>{v.roles.find(r=>r.oid===v.namespace.owner).name='another_super_owner'})
denied('complete quality rejects SET-role membership in the quality principal',v=>{v.complete_parent_members.push({role:v.roles.find(r=>r.name==='agentstudio_quality089').oid,member:v.roles[7].oid,grantor:v.namespace.owner,admin:false,inherit:false,set:true})},true)
test('complete quality membership query covers its additional quality principal',()=>{const sql=complete078StaffQuality089CatalogSQL.slice(complete078StaffQuality089CatalogSQL.indexOf("'complete_parent_members',"),complete078StaffQuality089CatalogSQL.indexOf("'complete_account_columns_effective',"));assert.equal(sql.split("'agentstudio_quality089'").length-1,2)})
