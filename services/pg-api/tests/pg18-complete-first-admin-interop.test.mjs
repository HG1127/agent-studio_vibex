// Pure CJS/ESM namespace regression. The fixture is an inert class with no pg
// driver, connections, constructor calls, original CLI run or mock auditor.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import {completeServiceActualCliDiagnostic as project} from './helpers/pg18-complete-service-cli-diagnostic.mjs'
import {completeServiceRefusal} from '../src/pg18-complete-service-plan.mjs'
function selectedPool(source,namespace){
 const tree=ts.createSourceFile('first-admin.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0)
 const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='run');assert.ok(fn)
 const statements=fn.body.statements;const at=statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.initializer&&ts.isAwaitExpression(d.initializer)&&ts.isCallExpression(d.initializer.expression)&&d.initializer.expression.expression.kind===ts.SyntaxKind.ImportKeyword&&d.initializer.expression.arguments[0]?.text==='pg'));assert.ok(at>=0)
 const first=statements[at].getText(tree).replace(/await import\("pg"\)/,'namespace'),second=statements[at+1].getText(tree)
 const body=first+(second==='const {Pool}=pg'?'\n'+second:'')+'\nreturn Pool'
 return Function('namespace',body)(namespace)
}
test('whole original first-admin run selects the same Pool from actual CJS and normal ESM namespaces',async()=>{
 const cjs=fs.readFileSync(new URL('../node_modules/pg/lib/index.js',import.meta.url),'utf8'),esm=fs.readFileSync(new URL('../node_modules/pg/esm/index.mjs',import.meta.url),'utf8')
 assert.match(cjs,/this\.Pool = poolFactory\(this\.Client\)/);assert.match(cjs,/module\.exports = new PG\(clientConstructor\)/)
 assert.match(esm,/export const Pool = pg\.Pool/);assert.match(esm,/export default pg/)
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'first-admin-interop-')),file=path.join(dir,'inert.cjs')
 try{
  fs.writeFileSync(file,"const PG=function(){this.Pool=class BoundPool{}};module.exports=new PG()\n",{flag:'wx'})
  const namespace=await import(pathToFileURL(file).href),source=fs.readFileSync(new URL('../src/native-first-admin-cli.mjs',import.meta.url),'utf8')
  assert.equal(namespace.Pool,undefined);assert.equal(typeof namespace.default.Pool,'function')
  assert.equal(selectedPool(source,namespace),namespace.default.Pool)
  assert.equal(selectedPool(source,{default:namespace.default,Pool:namespace.default.Pool}),namespace.default.Pool)
 }finally{fs.unlinkSync(file);fs.rmdirSync(dir)}
})
test('closed CI projection exposes phase/exit/refusal and never returns raw child fields or accessors',()=>{
 const secret='private employee email SQL and password',args=['--prepare','--profile','complete069','--action','first-admin']
 const value={verified:false,commit_acknowledged:false,refusal_code:'complete_service_first_admin_native_auth_insert_grants_missing',password:secret,raw:secret},result={code:1,value,refusal:null,stdout:secret,stderr:secret}
 const p=project('pg18-complete-service-cli.mjs',args,result)
 assert.equal(p.phase,'first-admin');assert.equal(p.exit,1);assert.equal(p.reported_refusal,value.refusal_code);assert.equal(JSON.stringify(p).includes(secret),false)
 const hostile={get code(){throw Error('accessor')},get value(){throw Error('accessor')}};assert.equal(project('unknown',[],hostile).exit,null)
 assert.equal(project('pg18-complete-service-cli.mjs',args,{code:1,refusal:secret,value:{refusal_code:secret}}).refusal,null)
})
test('only original closed first-admin refusal names survive; unknown errors remain generic',()=>{
 for(const value of ['native_auth_insert_grants_missing','first_admin_inputs_invalid','native_admin_already_initialized'])assert.equal(completeServiceRefusal(Error(value)),'complete_service_first_admin_'+value)
 assert.equal(completeServiceRefusal(Error('private profile SQL password')),'complete_service_operation_refused')
 assert.equal(completeServiceRefusal(Object.assign(Error('raw SQL'),{code:'42501'})),'complete_service_sqlstate_42501')
})
