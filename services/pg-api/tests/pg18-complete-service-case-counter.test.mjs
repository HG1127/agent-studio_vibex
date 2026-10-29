// Pure accounting and source-path policy. Never run a fixture or app process.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {completeServiceActualCaseSet as cases,createCompleteServiceActualCaseCounter as counter} from './helpers/pg18-complete-service-case-counter.mjs'
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
function ast(p){const code=read(p),tree=ts.createSourceFile(p,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0);return tree}
function find(tree,predicate){const found=[];const walk=n=>{if(predicate(n))found.push(n);ts.forEachChild(n,walk)};walk(tree);return found}
test('summary counts only the exact completed original8 or combined9 groups and refuses omissions/duplicates',()=>{
 assert.equal(cases().length,8);assert.equal(cases(true).length,9)
 for(const review of [false,true]){const c=counter(review),expected=cases(review);assert.throws(()=>c.finish(),/case_set_refused/);for(const name of expected){const p=c.pass(name);assert.equal(p.case,name);assert.equal(p.production_GO,false)}assert.equal(c.finish(),expected.length);assert.throws(()=>c.pass(expected.at(-1)),/case_set_refused/)}
 const duplicate=counter();duplicate.pass(cases()[0]);assert.throws(()=>duplicate.pass(cases()[0]),/case_set_refused/)
 assert.throws(()=>counter().pass('invented_pass'),/case_set_refused/);assert.throws(()=>counter('true'),/case_set_refused/)
})
test('combined fixture has exactly the fixed9 literal assertion groups and obtains summary from finish()',()=>{
 const tree=ast('./pg18-complete-service-ci.integration.mjs'),steps=find(tree,n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='step')
 assert.ok(steps.every(n=>n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])))
 assert.deepEqual(steps.map(n=>n.arguments[0].text),cases(true))
 const factories=find(tree,n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='createCompleteServiceActualCaseCounter');assert.equal(factories.length,1);assert.equal(factories[0].arguments[0].kind,ts.SyntaxKind.TrueKeyword)
 const reports=find(tree,n=>ts.isObjectLiteralExpression(n)&&n.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='event'&&p.initializer.text==='complete069_service_actual_summary'));assert.equal(reports.length,1)
 assert.equal(reports[0].properties.find(p=>p.name?.getText(tree)==='passed').initializer.getText(tree),'caseCounter.finish()')
})
test('both nonroot runtime copies use fresh var/lib descendants with strict root/run ancestors and no opt relaxation',()=>{
 const native=read('./helpers/pg18-complete-native-entry-smoke.mjs'),review=read('./helpers/pg18-complete-review-worker-ci.mjs')
 assert.match(native,/const dest='\/var\/lib\/agentstudio-complete-service-'/);assert.match(review,/const dest='\/var\/lib\/agentstudio-complete-review-preflight-'/)
 assert.match(native,/\['\/','\/var','\/var\/lib','\/run'\]/);assert.match(review,/\['\/','\/var','\/var\/lib','\/run','\/run\/credentials'\]/)
 for(const code of [native,review]){assert.doesNotMatch(code,/\/opt\/agentstudio|chmodSync\(['"]\/(?:opt|var|var\/lib|run)['"]/);assert.match(code,/s\.uid!==0\|\|s\.gid!==0/);assert.match(code,/s\.mode&0o022/)}
 assert.match(native,/\(s\.mode&0o7777\)!==mode/);assert.match(review,/\(s\.mode&0o7777\)!==0o755/)
})
