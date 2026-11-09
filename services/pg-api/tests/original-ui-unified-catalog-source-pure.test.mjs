const roleInverse=[
  {
    "before": "import {isProxy} from 'node:util/types'",
    "after": "import {isProxy} from 'node:util/types'\nimport {assertUnifiedOriginalRoleLoginCatalog} from './original-ui-unified-role-login-catalog.mjs'",
    "occurrences": 1
  },
  {
    "before": "for(const r of v.roles){shape(r,['name','login','super','bypass','inherit','createdb','createrole','replication','config','limit','valid_until']);if(r.super&&r.name!=='postgres')bad();if(r.name.startsWith('agentstudio_')&&(r.super||r.bypass||r.inherit||r.createdb||r.createrole||r.replication||r.config!==null||r.limit!==-1||r.valid_until!==null))bad()}\n for(const name of ['agentstudio_api','agentstudio_worker','agentstudio_stage_login','agentstudio_stage_worker']){const r=one(v.roles,r=>r.name===name);if(r.login!==name.startsWith('agentstudio_stage_'))bad()}\n set(v.members,[['agentstudio_api','agentstudio_stage_login'],['agentstudio_api','agentstudio_stage_worker'],['agentstudio_worker','agentstudio_stage_worker']].map(([role,member])=>({role,member,grantor:'postgres',admin:false,inherit:false,set:true})))",
    "after": "assertUnifiedOriginalRoleLoginCatalog(v.roles,v.members)",
    "occurrences": 1
  },
  {
    "before": "WHERE m.member IN(SELECT oid FROM pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker','agentstudio_api','agentstudio_worker')) OR m.roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('agentstudio_api','agentstudio_worker'))",
    "after": "WHERE m.member IN(SELECT oid FROM pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_native_login','agentstudio_stage_worker','agentstudio_bound_dispatch_login','agentstudio_model_broker_login','agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_broker_login','agentstudio_review_worker_login','agentstudio_local_executor_login','agentstudio_review_dispatch_login','agentstudio_design_worker_login','agentstudio_design_dispatch_login','agentstudio_plan_workflow_worker_login','agentstudio_plan_workflow_dispatch_login','agentstudio_api','agentstudio_worker')) OR m.roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_native_login','agentstudio_stage_worker','agentstudio_bound_dispatch_login','agentstudio_model_broker_login','agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_broker_login','agentstudio_review_worker_login','agentstudio_local_executor_login','agentstudio_review_dispatch_login','agentstudio_design_worker_login','agentstudio_design_dispatch_login','agentstudio_plan_workflow_worker_login','agentstudio_plan_workflow_dispatch_login','agentstudio_api','agentstudio_worker'))",
    "occurrences": 1
  },
  {
    "before": "return Object.freeze({database_oid:c.database_oid,source_sha256:originalRoleSchemaHash})",
    "after": "return Object.freeze({database_oid:c.database_oid,source_sha256:originalRoleSchemaHash,original_14_LOGIN_metadata_verified:true,profile_component_only:true,whole_final_profile_verified:false,actual_LOGIN_connections_verified:false,authorizes_install:false,production_GO:false})",
    "occurrences": 1
  },
  {
    "before": "originalRoleCatalogSQL",
    "after": "unifiedOriginalRoleCatalogSQL",
    "all": true,
    "occurrences": 2
  },
  {
    "before": "assertOriginalRoleCatalog",
    "after": "assertUnifiedOriginalRoleCatalog",
    "all": true,
    "occurrences": 2
  },
  {
    "before": "verifyOriginalRoleCatalog",
    "after": "verifyUnifiedOriginalRoleCatalog",
    "all": true,
    "occurrences": 1
  }
];
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {runInNewContext} from 'node:vm';
const ts=createRequire(new URL('../package.json',import.meta.url))('typescript');assert.equal(ts.version,'5.9.3');
const read=name=>{let value=readFileSync(new URL('../src/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 // Explicit inverse of v205's SELECT-result alias correction before the original v204 checks.
 if(name==='original-ui-unified-catalog.mjs'&&value.includes("Object.keys(result.rows[0]).join(',')!=='catalog'")){
  const shapeBefore="Object.keys(result.rows[0]).join(',')!=='value'",shapeAfter="Object.keys(result.rows[0]).join(',')!=='catalog'",readBefore='canonicalCatalog(result.rows[0].value)',readAfter='canonicalCatalog(result.rows[0].catalog)';
  assert.equal(value.split(shapeAfter).length-1,1);assert.equal(value.split(readAfter).length-1,1);value=value.replace(shapeAfter,shapeBefore).replace(readAfter,readBefore);
 }return value;};
const sha=s=>createHash('sha256').update(s).digest('hex');
const parse=(name,s)=>ts.createSourceFile(name,s,ts.ScriptTarget.Latest,true,name.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS);
const declaration=(tree,name)=>tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name));
const noExport=s=>s.replace(/^export\s+/,'');
function moduleBody(name){const s=read(name),tree=parse(name,s),edits=[];assert.equal(tree.parseDiagnostics.length,0);for(const n of tree.statements){if(ts.isImportDeclaration(n))edits.push([n.getStart(tree),n.end]);else for(const m of n.modifiers??[])if(m.kind===ts.SyntaxKind.ExportKeyword)edits.push([m.getStart(tree),m.end])}let body=s;for(const [start,end]of edits.sort((a,b)=>b[0]-a[0]))body=body.slice(0,start)+body.slice(end);return body}
const vm=(source,ports)=>runInNewContext(source,{Object,Array,Set,Map,Buffer,...ports},{timeout:1000});
const expectedBindings=[
 ['agentstudio_stage_login',['agentstudio_api'],-1],['agentstudio_native_login',['agentstudio_native_auth'],-1],['agentstudio_stage_worker',['agentstudio_api','agentstudio_worker'],-1],['agentstudio_bound_dispatch_login',['agentstudio_bound_dispatch'],-1],['agentstudio_model_broker_login',['agentstudio_model_broker'],-1],['agentstudio_knowledge_index_worker_login',['agentstudio_knowledge_index_worker'],-1],['agentstudio_knowledge_index_broker_login',['agentstudio_knowledge_index_broker'],-1],['agentstudio_review_worker_login',['agentstudio_review_worker'],3],['agentstudio_local_executor_login',['agentstudio_local_executor'],3],['agentstudio_review_dispatch_login',['agentstudio_review_dispatch'],-1],['agentstudio_design_worker_login',['agentstudio_design_worker'],-1],['agentstudio_design_dispatch_login',['agentstudio_design_dispatch'],-1],['agentstudio_plan_workflow_worker_login',['agentstudio_plan_workflow_worker'],3],['agentstudio_plan_workflow_dispatch_login',['agentstudio_plan_workflow_dispatch'],3]
];
const policy=read('pg18-service-login-policy.mjs'),pt=parse('policy.mjs',policy),final=read('pg18-full069-final-login-contract.mjs'),ft=parse('final.mjs',final);
const actualBindings=vm([declaration(pt,'definitions').getText(pt),noExport(declaration(pt,'serviceLogins').getText(pt)),declaration(ft,'old').getText(ft),noExport(declaration(ft,'finalBusinessLogins').getText(ft)),'finalBusinessLogins'].join('\n'),{freeze:v=>v});
assert.deepEqual(JSON.parse(JSON.stringify(actualBindings.map(d=>[d.login,d.groups,d.connection_limit]))),expectedBindings);
const helperSource=read('original-ui-unified-role-login-catalog.mjs');
const check=vm(moduleBody('original-ui-unified-role-login-catalog.mjs')+'\nassertUnifiedOriginalRoleLoginCatalog',{types,finalBusinessLogins:actualBindings});
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const names=[...new Set(expectedBindings.flatMap(([name,groups])=>[name,...groups]))];
 const roles=names.map(name=>({name,login:expectedBindings.some(d=>d[0]===name),super:false,bypass:false,inherit:false,createdb:false,createrole:false,replication:false,config:null,limit:expectedBindings.find(d=>d[0]===name)?.[2]??-1,valid_until:null}));
 roles.push({name:'postgres',login:true,super:true,bypass:true,inherit:true,createdb:true,createrole:true,replication:true,config:null,limit:-1,valid_until:null});
 const members=expectedBindings.flatMap(([member,groups])=>groups.map(role=>({role,member,grantor:'postgres',admin:false,inherit:false,set:true})));
 return {roles,members};
}
test('actual selected source DATA is the unchanged14 LOGIN matrix',()=>{assert.equal(actualBindings.length,14);assert.equal(actualBindings.filter(d=>d.connection_limit===3).length,4)});
test('unified checker source has a fixed authored digest',()=>{assert.equal(sha(helperSource),'17d996f4add255e139ffee006db81b9c833772dfb6ba0ff2a4fa22f5fbafcad0')});
test('new Role module explicitly inverses to the fixed original auditor',()=>{
 let value=read('original-ui-unified-role-catalog.mjs');assert.equal(sha(value),'cb629583bbea6a74cd4e92df04fd69845eeb66f0a6cd4aa9071387a249ae86a9');
 for(const edit of [...roleInverse].reverse()){assert.equal(value.split(edit.after).length-1,edit.occurrences);value=edit.all?value.replaceAll(edit.after,edit.before):value.replace(edit.after,edit.before)}
 assert.equal(sha(value),'292c68bc41254d81264845474036312867887c8e4b4e80c6ec5e438e5c7e7daa');
});
test('all14 metadata and memberships pass only as a component',()=>{
 const f=fixture(),before=JSON.stringify(f),r=check(f.roles,f.members);assert.equal(r.original_14_LOGIN_metadata_verified,true);for(const key of ['whole_final_profile_verified','actual_LOGIN_connections_verified','authorizes_install','production_GO'])assert.equal(r[key],false);assert.equal(JSON.stringify(f),before);
});
test('unordered genuine rows retain the exact same matrix',()=>{const f=fixture();assert.equal(check(f.roles.reverse(),f.members.reverse()).production_GO,false)});
test('every missing or duplicate final LOGIN is refused',()=>{for(const [name]of expectedBindings){const f=fixture();assert.throws(()=>check(f.roles.filter(r=>r.name!==name),f.members));const r=f.roles.find(r=>r.name===name);assert.throws(()=>check([...f.roles,r],f.members))}});
for(const [key,value]of [['login',false],['super',true],['bypass',true],['inherit',true],['createdb',true],['createrole',true],['replication',true],['config',[]],['valid_until','2099-01-01']])test('each final LOGIN rejects changed '+key,()=>{for(const [name]of expectedBindings){const f=fixture();f.roles.find(r=>r.name===name)[key]=value;assert.throws(()=>check(f.roles,f.members))}});
test('every final LOGIN connection limit is exact',()=>{for(const [name,,limit]of expectedBindings){const f=fixture();f.roles.find(r=>r.name===name).limit=limit===3?-1:3;assert.throws(()=>check(f.roles,f.members))}});
test('old all-minus-one Role topology does not qualify the unified profile',()=>{const f=fixture();for(const r of f.roles)r.limit=-1;assert.throws(()=>check(f.roles,f.members))});
test('unknown LOGIN and altered non-login group safety are refused',()=>{for(const change of [{name:'agentstudio_unknown_login',login:true},{name:'agentstudio_api',limit:3},{name:'agentstudio_api',inherit:true}]){const f=fixture(),r=f.roles.find(r=>r.name===change.name);if(r)Object.assign(r,change);else f.roles.push({...f.roles[0],...change});assert.throws(()=>check(f.roles,f.members))}});
test('each missing group role is refused',()=>{for(const name of new Set(expectedBindings.flatMap(d=>d[1]))){const f=fixture();assert.throws(()=>check(f.roles.filter(r=>r.name!==name),f.members))}});
test('all original memberships are exact including grantor and option flags',()=>{
 for(const change of [{role:'agentstudio_unknown_group'},{member:'agentstudio_unknown_login'},{grantor:'synthetic_other'},{admin:true},{inherit:true},{set:false}]){const f=fixture();Object.assign(f.members[0],change);assert.throws(()=>check(f.roles,f.members))}
 for(const index of [0,7,14]){const f=fixture();f.members.splice(index,1);assert.throws(()=>check(f.roles,f.members))}
 const f=fixture();assert.throws(()=>check(f.roles,[...f.members,f.members[0]]));assert.throws(()=>check(f.roles,[...f.members,{role:expectedBindings[0][0],member:'postgres',grantor:'postgres',admin:false,inherit:false,set:true}]));
});
test('accessors proxies holes and invented columns are refused without reads',()=>{
 let reads=0;const f=fixture(),role={...f.roles[0]};Object.defineProperty(role,'config',{enumerable:true,get(){reads++;return null}});assert.throws(()=>check([role,...f.roles.slice(1)],f.members));assert.equal(reads,0);
 const proxy=new Proxy(f.roles,{get(){reads++;throw Error('not_allowed')}});assert.throws(()=>check(proxy,f.members));assert.equal(reads,0);
 const holes=[...f.roles];delete holes[0];assert.throws(()=>check(holes,f.members));assert.throws(()=>check(f.roles.map((r,i)=>i===0?{...r,extra:true}:r),f.members));
});
const source=read('original-ui-unified-catalog.mjs'),st=parse('new.mjs',source),sqlNode=declaration(st,'unifiedEmployeeCatalogSQL'),sqlStatement=sqlNode.getText(st);
const sections=['dependencies','extensions','schemas','classes','columns','defaults','functions','types','constraints','policies','triggers','indexes','rewrites','default_acls','event_triggers','roles','memberships','role_settings','database_acl'];
test('full catalog SQL inverses to the fixed original SELECT with20 explicit scope expansions',()=>{
 assert.equal(sha(source),'bab8055708cedd6b51b50012bd489fc01c35633c08ff1e5d018ca04a85a68853');
 assert.equal(sha(sqlStatement),'c9db165675b004374b382ba44e722598d61ffda6c768d81324e308528974ac09');
 const re=/\(NOT pg_catalog\.starts_with\(((?:n\.)?nspname),'pg_'\) AND \1<>'information_schema'\)/g;let count=0;
 const old=sqlStatement.replace(re,(_,name)=>{count++;return name+" IN('agentstudio','agentstudio_auth')"}).replace('unifiedEmployeeCatalogSQL','employeeUi078CatalogSql');
 assert.equal(count,20);assert.equal(sha(old),'f9fe1b60029b4ea984cf8fa3c7165d4b8c1d69d0602af9d4893c5126aafdf86f');assert(!sqlStatement.includes("NOT LIKE 'pg_%'"));
});
const parentCatalog=read('pg18-employee-ui078-catalog.mjs'),pct=parse('parent.mjs',parentCatalog),canonicalNode=pct.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='employeeUi078Canonical');
const canonical=vm(noExport(canonicalNode.getText(pct))+'\nemployeeUi078Canonical',{types,fail:()=>{throw Error('canonical_refused')}});
const collector=vm(moduleBody('original-ui-unified-catalog.mjs')+'\n({readUnifiedEmployeeCatalog,assertUnifiedEmployeeCatalogStable,unifiedEmployeeCatalogSQL})',{createHash,employeeUi078Canonical:canonical});
const image=()=>Object.fromEntries(sections.map(k=>[k,null]));
test('collector exposes all19 sections and performs a fresh inert read on every call',async()=>{
 let calls=0;const first=image(),second=image();second.classes=[{oid:42,name:'synthetic_table'}];
 const db={query:async(...args)=>{assert.equal(args.length,1);assert.equal(args[0],collector.unifiedEmployeeCatalogSQL);calls++;return{rows:[{value:calls===1?first:second}]}}};
 const a=await collector.readUnifiedEmployeeCatalog(db),b=await collector.readUnifiedEmployeeCatalog(db);assert.equal(calls,2);assert.deepEqual(Object.keys(a).sort(),[...sections].sort());assert.notEqual(a,first);assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(a,b));
});
test('whole catalog comparison returns a fingerprint without profile authority',()=>{const a=image(),result=collector.assertUnifiedEmployeeCatalogStable(a,clone(a));assert.match(result.catalog_sha256,/^[a-f0-9]{64}$/);assert.equal(result.compared_whole_non_system_catalog,true);assert.equal(result.profile_component_only,true);for(const k of ['whole_final_profile_verified','authorizes_install','production_GO'])assert.equal(result[k],false)});
for(const key of sections)test('whole catalog catches changes in '+key,()=>{const a=image(),b=clone(a);b[key]=[{synthetic_changed:true}];assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(a,b))});
test('collector rejects missing unknown accessor and oversized DATA without normalization',async()=>{
 for(const result of [{rows:[]},{rows:[{value:image()},{value:image()}]},{rows:[{value:image(),extra:true}]}])await assert.rejects(()=>collector.readUnifiedEmployeeCatalog({query:async()=>result}));
 const a=image(),missing=clone(a);delete missing.roles;assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(a,missing));assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(a,{...a,extra:[]}));
 let reads=0;Object.defineProperty(a,'classes',{enumerable:true,get(){reads++;return null}});assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(a,image()));assert.equal(reads,0);
 const bounded=vm(moduleBody('original-ui-unified-catalog.mjs')+'\nassertUnifiedEmployeeCatalogStable',{createHash,employeeUi078Canonical:()=> 'x'.repeat(24*1024*1024+1)});
 assert.throws(()=>bounded(image(),image()));
});
test('inert query refusal identity is preserved and no retry occurs',async()=>{let calls=0;const error=new Error('inert_query_refusal');await assert.rejects(()=>collector.readUnifiedEmployeeCatalog({query:async()=>{calls++;throw error}}),e=>e===error);assert.equal(calls,1)});
test('detached images and comparisons do not retain observed authority',async()=>{const input=image(),first=await collector.readUnifiedEmployeeCatalog({query:async()=>({rows:[{value:input}]})});first.roles=[{changed:true}];assert.equal(input.roles,null);assert.throws(()=>collector.assertUnifiedEmployeeCatalogStable(first,input));assert.equal(collector.assertUnifiedEmployeeCatalogStable(input,image()).whole_final_profile_verified,false)});
test('new Role wrapper forwards the untouched raw row to its auditor port',async()=>{
 const s=read('original-ui-unified-role-catalog.mjs'),tree=parse('role.mjs',s),f=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='verifyUnifiedOriginalRoleCatalog'),query=declaration(tree,'unifiedOriginalRoleCatalogSQL').declarationList.declarations[0].initializer.text;
 const raw={synthetic:'raw_identity'},options={purpose:'startup'},receipt={component:true};let calls=0,audits=0;
 const verify=vm(noExport(f.getText(tree))+'\nverifyUnifiedOriginalRoleCatalog',{unifiedOriginalRoleCatalogSQL:query,bad:()=>{throw Error('bad_shape')},assertUnifiedOriginalRoleCatalog:(value,o)=>{audits++;assert.equal(value,raw);assert.equal(o,options);return receipt}});
 const actual=await verify({query:async sql=>{calls++;assert.equal(sql,query);return{rows:[{value:raw}]}}},options);assert.equal(actual,receipt);assert.equal(calls,1);assert.equal(audits,1);
 assert.equal((query.match(/agentstudio_plan_workflow_dispatch_login/g)||[]).length,2);
});
test('new declaration files parse with API5.9.3 and no compiler',()=>{for(const name of ['original-ui-unified-role-login-catalog.d.mts','original-ui-unified-role-catalog.d.mts','original-ui-unified-catalog.d.mts'])assert.equal(parse(name,read(name)).parseDiagnostics.length,0)});
test('new source components have zero external-effect port calls',async()=>{
 const effects={SQL:0,Pool:0,network:0,process:0,filesystem:0,child:0,Worker:0,listener:0},ports={Object,Array,Set,Map,Buffer,types,finalBusinessLogins:actualBindings,createHash,employeeUi078Canonical:canonical};
 for(const [name,kind]of [['Pool','Pool'],['fetch','network'],['process','process'],['fs','filesystem'],['spawn','child'],['Worker','Worker'],['createServer','listener'],['pg','SQL']])Object.defineProperty(ports,name,{get(){effects[kind]++;throw Error('external_effect_refused')}});
 const descriptors=Object.getOwnPropertyDescriptors(ports),fresh=()=>Object.defineProperties({},descriptors);
 const helper=runInNewContext(moduleBody('original-ui-unified-role-login-catalog.mjs')+'\nassertUnifiedOriginalRoleLoginCatalog',fresh(),{timeout:1000});const f=fixture();assert.equal(helper(f.roles,f.members).production_GO,false);
 const reader=runInNewContext(moduleBody('original-ui-unified-catalog.mjs')+'\nreadUnifiedEmployeeCatalog',fresh(),{timeout:1000});let inertQueries=0;await reader({query:async()=>{inertQueries++;return{rows:[{value:image()}]}}});assert.equal(inertQueries,1);
 runInNewContext(moduleBody('original-ui-unified-role-catalog.mjs'),fresh(),{timeout:1000});
 assert.deepEqual(effects,{SQL:0,Pool:0,network:0,process:0,filesystem:0,child:0,Worker:0,listener:0});
});
