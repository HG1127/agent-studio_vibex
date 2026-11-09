// Source-boundary proof only. Never import the backend fixture or load pg.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
const ts=createRequire(import.meta.url)('typescript')
const reference=JSON.parse(fs.readFileSync(new URL('./helpers/original-create-owned-pg-source-reference.json',import.meta.url),'utf8'))
const source=fs.readFileSync(new URL('./helpers/pg-original-agent-create-backend-fixture.mjs',import.meta.url),'utf8')
function all(node,predicate,out=[]){if(predicate(node))out.push(node);ts.forEachChild(node,child=>{all(child,predicate,out)});return out}
function checkOwnedPgSource(raw){
 const tree=ts.createSourceFile('fixture.mjs',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),text=node=>node.getText(tree)
 assert.equal(tree.parseDiagnostics.length,0,'fixture_syntax')
 const functions=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='startOriginalAgentCreateBackendFixture')
 assert.equal(functions.length,1,'fixture_interface');const fn=functions[0]
 assert(fn.modifiers?.some(n=>n.kind===ts.SyntaxKind.ExportKeyword));assert(fn.modifiers?.some(n=>n.kind===ts.SyntaxKind.AsyncKeyword));assert.deepEqual(fn.parameters.map(text),reference.parameters,'fixture_parameters')
 const imports=tree.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='node:module')
 assert.equal(imports.length,1,'owned_module_import');const named=imports[0].importClause?.namedBindings
 assert(named&&ts.isNamedImports(named));assert.equal(named.elements.length,1);assert.equal(named.elements[0].name.text,'createRequire');assert.equal(named.elements[0].propertyName,undefined)
 const declarations=all(fn,n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='serviceRequire')
 assert.equal(declarations.length,1,'owned_require_declaration');const declaration=declarations[0];assert(declaration.parent.flags&ts.NodeFlags.Const,'owned_require_const')
 const init=declaration.initializer;assert(init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&init.expression.text==='createRequire');assert.equal(init.arguments.length,1)
 const anchor=init.arguments[0];assert(ts.isNewExpression(anchor)&&ts.isIdentifier(anchor.expression)&&anchor.expression.text==='URL');assert.equal(anchor.arguments.length,2);assert(ts.isStringLiteral(anchor.arguments[0]),'owned_anchor_literal');assert.equal(anchor.arguments[0].text,'../../services/pg-api/package.json','owned_api_package');assert.equal(text(anchor.arguments[1]),'import.meta.url','owned_anchor_base')
 const decls=all(fn,n=>ts.isVariableDeclaration(n)&&text(n.name)===reference.promise_binding);assert.equal(decls.length,1,'driver_binding_interface');const first=decls[0]
 assert(first.initializer&&ts.isAwaitExpression(first.initializer));const call=first.initializer.expression;assert(ts.isCallExpression(call)&&text(call.expression)==='Promise.all');const elements=call.arguments[0].elements
 assert.deepEqual(elements.map(text),reference.promise_elements.map(value=>value==="import('pg')"?"serviceRequire('pg')":value),'unrelated_dependencies_unchanged')
 const driver=elements.find(n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='serviceRequire');assert(driver,'owned_driver_call');assert.equal(driver.arguments.length,1);assert(ts.isStringLiteral(driver.arguments[0]));assert.equal(driver.arguments[0].text,'pg')
 const pgCalls=all(tree,n=>ts.isCallExpression(n)&&n.arguments.length>0&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='pg');assert.equal(pgCalls.length,1,'single_real_driver_load');assert.equal(pgCalls[0],driver,'unowned_driver_load');assert.equal(tree.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='pg').length,0)
 for(const guard of ['requireOriginalAgentCreateFreshCi','verifyOriginalAgentCreateSources']){const calls=all(fn,n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text===guard);assert.equal(calls.length,1);assert(calls[0].pos<driver.pos,'driver_after_guard')}
 const pools=all(fn,n=>ts.isNewExpression(n)&&text(n.expression)==='pg.Pool');assert.equal(pools.length,1,'real_driver_pool');assert.deepEqual(pools[0].arguments.map(text),reference.pool_arguments,'pool_options_unchanged')
 const assertions=all(fn,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&text(n.expression.expression)==='assert').map(text);assert.deepEqual(assertions,reference.assertions,'original_assertions_unchanged')
 return {anchor:anchor.arguments[0].text,driver:'pg',originalAssertions:assertions.length}
}
test('Create backend fixture owns pg resolution in API workspace while retaining original interfaces and assertions',()=>assert.equal(checkOwnedPgSource(source).originalAssertions,56))
test('actual API package declares the driver used by the anchor',()=>{const pkg=JSON.parse(fs.readFileSync(new URL('../services/pg-api/package.json',import.meta.url),'utf8'));assert.equal(typeof pkg.dependencies.pg,'string');assert(pkg.dependencies.pg)})
for(const [label,change]of [
 ['bare root import',s=>s.replace("serviceRequire('pg')","import('pg')")],
 ['root package owner',s=>s.replace('../../services/pg-api/package.json','../../package.json')],
 ['different workspace owner',s=>s.replace('../../services/pg-api/package.json','../../desktop/package.json')],
 ['cwd base',s=>s.replace("new URL('../../services/pg-api/package.json',import.meta.url)","new URL('../../services/pg-api/package.json',process.cwd())")],
 ['computed owner anchor',s=>s.replace("'../../services/pg-api/package.json'","['../../services/pg-api/package.json'].join('')")],
 ['unowned require function',s=>s.replace("serviceRequire('pg')","require('pg')")],
 ['different driver',s=>s.replace("serviceRequire('pg')","serviceRequire('pg-mock')")],
 ['fake driver object',s=>s.replace("serviceRequire('pg')","({Pool:class SyntheticPool{}})")],
 ['incorrect CJS namespace',s=>s.replace('new pg.Pool(','new pg.default.Pool(')],
 ['changed pool options',s=>s.replace('connectionTimeoutMillis:5000','connectionTimeoutMillis:1')],
 ['changed original assertion',s=>s.replace(reference.assertions[0],reference.assertions[0].replace('assert.','assert.__changed__'))],
 ['mutable resolver',s=>s.replace('const serviceRequire=','let serviceRequire=')],
])test('owned driver source contract rejects '+label,()=>{const changed=change(source);assert.notEqual(changed,source);assert.throws(()=>checkOwnedPgSource(changed),assert.AssertionError)})
for(const base of ['file:///workspace/agent/tests/helpers/fixture.mjs','file:///D:/Agent%20Studio/tests/helpers/fixture.mjs','file:///D:/%E7%89%88%E6%9C%AC/tests/helpers/fixture.mjs'])test('owning package URL is independent of cwd '+base,()=>assert.equal(new URL(checkOwnedPgSource(source).anchor,base).href,new URL('../../',base).href+'services/pg-api/package.json'))
test('owned driver source suite reached final registration without executing pg or a fixture',()=>assert.equal(checkOwnedPgSource(source).driver,'pg'))
