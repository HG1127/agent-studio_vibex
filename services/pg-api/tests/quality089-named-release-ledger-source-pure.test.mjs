const inverse=[
  {
    "before": "import {isProxy} from 'node:util/types'",
    "after": "import {isProxy} from 'node:util/types'\nimport {createHash} from 'node:crypto'\nimport {employeeUi078LedgerRpcAuditSql} from './pg18-employee-ui078-catalog.mjs'\nconst quality089ParentLedgerRpcBodySha256='ec9b8350a95564a7400db3a8923f4d3cfebebc5f7fbb07eabaf46f7c3f5d421d'"
  },
  {
    "before": "FROM agentstudio.schema_migrations)",
    "after": "FROM agentstudio.employee_ui078_catalog_ledger())"
  },
  {
    "before": "export async function inspectQuality089ReleaseParentCatalog(db:SqlClient):Promise<Readonly<{qualityRoleOid:string}>>{const rows=(await db.query<{value:unknown}>(quality089ReleaseParentCatalogSQL)).rows;if(!Array.isArray(rows)||rows.length!==1)quality089ParentRefuse('query_shape');return assertQuality089ReleaseParentCatalog(rows[0]?.value)}",
    "after": "export async function inspectQuality089ReleaseParentCatalog(db:SqlClient):Promise<Readonly<{qualityRoleOid:string}>>{\n const rpc=(await db.query<{ok:boolean;source:string}>(employeeUi078LedgerRpcAuditSql)).rows\n if(!Array.isArray(rpc)||rpc.length!==1)quality089ParentRefuse('ledger_rpc')\n const marker=rpc[0]\n if(!marker||marker.ok!==true||typeof marker.source!=='string'||marker.source.length!==269||createHash('sha256').update(marker.source).digest('hex')!==quality089ParentLedgerRpcBodySha256)quality089ParentRefuse('ledger_rpc')\n const rows=(await db.query<{value:unknown}>(quality089ReleaseParentCatalogSQL)).rows;if(!Array.isArray(rows)||rows.length!==1)quality089ParentRefuse('query_shape');return assertQuality089ReleaseParentCatalog(rows[0]?.value)\n}"
  }
];
const acceptedLedgerBody="\n SELECT c.system_identifier::text,d.oid::text,m.version,m.description\n FROM pg_catalog.pg_control_system() AS c\n JOIN pg_catalog.pg_database AS d ON d.datname=pg_catalog.current_database()\n CROSS JOIN agentstudio.schema_migrations AS m\n ORDER BY m.version COLLATE \"C\"\n";
const oldCatalogSqlSha="d1c5827b3104c9a7c5263b0d28e7fbe73b34e7cb23c7fef9ee3fcbb487143412";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const ts=createRequire(new URL('../package.json',import.meta.url))('typescript');assert.equal(ts.version,'5.9.3');
const actualNamedReleaseSource=readFileSync(new URL('../src/quality089-release-parent-audit.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
// Explicitly inverse only v207's numeric OID projection before the original v206 checks.
const policyOidBefore="'roles',p.polroles,",policyOidAfter="'roles',p.polroles::bigint[],";
const source=actualNamedReleaseSource.includes(policyOidAfter)?(assert.equal(actualNamedReleaseSource.split(policyOidAfter).length-1,1),actualNamedReleaseSource.replace(policyOidAfter,policyOidBefore)):actualNamedReleaseSource;
const sha=s=>createHash('sha256').update(s).digest('hex'),tree=ts.createSourceFile('named.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fun=name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);
const literal=name=>tree.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(tree)===name).initializer.text;
function eraseTypeOnly(text){
 const parsed=ts.createSourceFile('selected.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),edits=[];
 const annotation=type=>{let start=type.getStart(parsed);while(/\s/.test(text[start-1]??''))start--;assert.equal(text[start-1],':');edits.push([start-1,type.end])};
 function walk(n){if((ts.isParameter(n)||ts.isFunctionDeclaration(n))&&n.type)annotation(n.type);if(ts.isCallExpression(n)&&n.typeArguments){assert.equal(text[n.typeArguments.pos-1],'<');assert.equal(text[n.typeArguments.end],'>');edits.push([n.typeArguments.pos-1,n.typeArguments.end+1])}for(const m of n.modifiers??[])if(m.kind===ts.SyntaxKind.ExportKeyword)edits.push([m.getStart(parsed),m.end]);ts.forEachChild(n,walk)}walk(parsed);
 let body=text;for(const [start,end]of edits.sort((a,b)=>b[0]-a[0]))body=body.slice(0,start)+body.slice(end);assert.equal(ts.createSourceFile('selected.mjs',body,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);return body;
}
const sql=literal('quality089ReleaseParentCatalogSQL'),markerSha=literal('quality089ParentLedgerRpcBodySha256'),oldSql=sql.replace('FROM agentstudio.employee_ui078_catalog_ledger())','FROM agentstudio.schema_migrations)');
const auditSource=readFileSync(new URL('../src/pg18-employee-ui078-catalog.mjs',import.meta.url),'utf8'),at=ts.createSourceFile('audit.mjs',auditSource,ts.ScriptTarget.Latest,true);
const rpcAuditSql=at.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(at)==='employeeUi078LedgerRpcAuditSql').initializer.text;
const inspector=eraseTypeOnly(fun('inspectQuality089ReleaseParentCatalog').getText(tree)),refuse=eraseTypeOnly(fun('quality089ParentRefuse').getText(tree));
function subject(assertCatalog=()=>Object.freeze({qualityRoleOid:'synthetic_role_oid'}),ports={}){return runInNewContext(refuse+'\n'+inspector+'\ninspectQuality089ReleaseParentCatalog',{Object,Array,createHash,employeeUi078LedgerRpcAuditSql:rpcAuditSql,quality089ReleaseParentCatalogSQL:sql,quality089ParentLedgerRpcBodySha256:markerSha,assertQuality089ReleaseParentCatalog:assertCatalog,...ports},{timeout:1000})}
const good=()=>({rows:[{ok:true,source:acceptedLedgerBody}]});
test('fixed source SHA and explicit inverse preserve the original named module',()=>{
 assert.equal(sha(source),'b4c92c7dcb7ea7a9ab6e8f57106a0961a638b7a0dc757444d5e8ccc0a69661e3');let restored=source;for(const edit of [...inverse].reverse()){assert.equal(restored.split(edit.after).length-1,1);restored=restored.replace(edit.after,edit.before)}assert.equal(sha(restored),'875c919e81b218e3a46f1bd5c018db0f48ea0cb0fc215d97f8ba5cce629f83b9');
});
test('complete catalog assertion body is byte-identical to the reviewed parent',()=>{assert.equal(sha(fun('assertQuality089ReleaseParentCatalog').getText(tree)),'a5e2370d00fa1ebff97003b52d0c77c01622cddbbcf562c80aaee1ddbf44eee0')});
test('only full migration read source changes without filtering the ledger',()=>{
 assert.equal(sql.split('FROM agentstudio.employee_ui078_catalog_ledger())').length-1,1);assert.equal(sql.split('FROM agentstudio.schema_migrations').length-1,0);
 assert.equal(sha(oldSql),oldCatalogSqlSha);assert(sql.includes("'version',version,'description',description"));assert(!sql.includes("WHERE version="));
});
test('accepted269-byte RPC body is a fixed original reviewed seal',()=>{assert.equal(acceptedLedgerBody.length,269);assert.equal(sha(acceptedLedgerBody),'ec9b8350a95564a7400db3a8923f4d3cfebebc5f7fbb07eabaf46f7c3f5d421d');assert.equal(markerSha,'ec9b8350a95564a7400db3a8923f4d3cfebebc5f7fbb07eabaf46f7c3f5d421d')});
test('fresh metadata audit precedes the full read and preserves raw identity',async()=>{
 const raw={synthetic:'unprojected'},expected={qualityRoleOid:'synthetic_role_oid'},queries=[];let checks=0;
 const inspect=subject(value=>{checks++;assert.equal(value,raw);return expected});
 const result=await inspect({query:async(...args)=>{queries.push(args);return queries.length===1?good():{rows:[{value:raw}]}}});
 assert.equal(result,expected);assert.equal(checks,1);assert.equal(queries.length,2);assert.deepEqual(queries.map(a=>a.length),[1,1]);assert.equal(queries[0][0],rpcAuditSql);assert.equal(queries[1][0],sql);
});
for(const [name,rpc]of [
 ['missing rows',{rows:[]}],['duplicate rows',{rows:[{ok:true,source:acceptedLedgerBody},{ok:true,source:acceptedLedgerBody}]}],['not an array',{rows:{}}],['null marker',{rows:[null]}],['false audit',{rows:[{ok:false,source:acceptedLedgerBody}]}],['truthy audit',{rows:[{ok:'true',source:acceptedLedgerBody}]}],['source absent',{rows:[{ok:true}]}],['source type',{rows:[{ok:true,source:269}]}],['source length',{rows:[{ok:true,source:acceptedLedgerBody+' '}]}],['source digest',{rows:[{ok:true,source:'x'.repeat(269)}]}]
])test('RPC guard refuses '+name+' before catalog SQL',async()=>{
 let queries=0,checks=0;const inspect=subject(()=>{checks++;throw Error('unexpected_catalog_assert')});await assert.rejects(()=>inspect({query:async sql=>{queries++;assert.equal(sql,rpcAuditSql);return rpc}}),/ledger_rpc_unconfirmed/);assert.equal(queries,1);assert.equal(checks,0);
});
test('no cached success transfers to the next independent invocation',async()=>{
 let queries=0;const inspect=subject();const db={query:async sql=>{queries++;if(sql===rpcAuditSql)return queries===1?good():{rows:[{ok:false,source:acceptedLedgerBody}]};return{rows:[{value:{synthetic:true}}]}}};await inspect(db);await assert.rejects(()=>inspect(db),/ledger_rpc_unconfirmed/);assert.equal(queries,3);
});
test('both audit and catalog query errors retain identity without retry',async()=>{
 for(const failAt of [1,2]){let queries=0;const error=Object.assign(new Error('inert_query_refusal'),{code:'42501'});await assert.rejects(()=>subject()({query:async()=>{queries++;if(queries===failAt)throw error;return good()}}),e=>e===error);assert.equal(queries,failAt)}
});
test('the original full semantic refusal is preserved unchanged',async()=>{
 const error=new Error('inert_complete_semantic_refusal');let calls=0,checks=0;await assert.rejects(()=>subject(()=>{checks++;throw error})({query:async()=>++calls===1?good():{rows:[{value:{synthetic:true}}]}}),e=>e===error);assert.equal(calls,2);assert.equal(checks,1);
});
test('the original full result-row shape gate remains mandatory',async()=>{
 for(const rows of [[],[{},{}],null]){let calls=0,checks=0;await assert.rejects(()=>subject(()=>{checks++;return{}})({query:async()=>++calls===1?good():{rows}}),/query_shape_unconfirmed/);assert.equal(calls,2);assert.equal(checks,0)}
});
test('inert permission model reproduces old raw-ledger refusal and admits the guarded RPC',async()=>{
 const permission=Object.assign(new Error('inert_raw_ledger_forbidden'),{code:'42501'}),parentInspector=eraseTypeOnly(inverse[2].before);
 const old=runInNewContext(refuse+'\n'+parentInspector+'\ninspectQuality089ReleaseParentCatalog',{Object,Array,quality089ReleaseParentCatalogSQL:oldSql,assertQuality089ReleaseParentCatalog:()=>({qualityRoleOid:'synthetic_role_oid'})},{timeout:1000});
 const db={query:async statement=>{if(statement===rpcAuditSql)return good();if(statement.includes('FROM agentstudio.schema_migrations'))throw permission;return{rows:[{value:{synthetic:true}}]}}};
 await assert.rejects(()=>old(db),e=>e===permission);assert.equal((await subject()(db)).qualityRoleOid,'synthetic_role_oid');
});
test('selected source guard and reader have no external-effect ports',async()=>{
 const counters={SQL:0,Pool:0,network:0,process:0,filesystem:0,child:0,Worker:0,listener:0},ports={};for(const [name,kind]of [['pg','SQL'],['Pool','Pool'],['fetch','network'],['process','process'],['fs','filesystem'],['spawn','child'],['Worker','Worker'],['createServer','listener']])Object.defineProperty(ports,name,{enumerable:true,get(){counters[kind]++;throw Error('external_effect_refused')}});
 // Build a new realm explicitly; spreading accessor ports would itself read them.
 const context={Object,Array,createHash,employeeUi078LedgerRpcAuditSql:rpcAuditSql,quality089ReleaseParentCatalogSQL:sql,quality089ParentLedgerRpcBodySha256:markerSha,assertQuality089ReleaseParentCatalog:()=>({qualityRoleOid:'synthetic_role_oid'})};Object.defineProperties(context,Object.getOwnPropertyDescriptors(ports));
 const inspect=runInNewContext(refuse+'\n'+inspector+'\ninspectQuality089ReleaseParentCatalog',context,{timeout:1000});let calls=0;await inspect({query:async()=>++calls===1?good():{rows:[{value:{synthetic:true}}]}});assert.equal(calls,2);assert.deepEqual(counters,{SQL:0,Pool:0,network:0,process:0,filesystem:0,child:0,Worker:0,listener:0});
});
