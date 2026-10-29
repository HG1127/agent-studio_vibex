// Source call-boundary regression only; never opens a PostgreSQL connection.
import test from'node:test'
import assert from'node:assert/strict'
import fs from'node:fs'
import ts from'typescript'
const base=new URL('../src/',import.meta.url)
function body(file,name){const source=fs.readFileSync(new URL(file,base),'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node?.body,file+':'+name);return node.body.getText(tree)}
test('every original auditor selected by the lock-held predecessor callback avoids whole-profile and old operation inspectors',()=>{
 const forbidden=/\b(?:verifyCompleteProfile|inspectCompleteProfile|inspectComplete069ReviewWorker|inspectComplete069Executor|completeServiceCatalog)\s*\(/
 for(const[file,name]of [['pg18-complete-service-core.mjs','completeServiceActualLogin'],['agent-assessment-service.ts','inspectAgentAssessmentOperatorPool'],['agent-assessment-service.ts','inspectAgentDesignOperatorPool'],['native-local-executor-service-preflight.ts','inspectNativeLocalExecutorPreflight'],['pg18-complete-plan-workflow-core.mjs','actualApi'],['pg18-complete-plan-workflow-predecessors.mjs','verifyComplete069PlanWorkflowPredecessors']])assert.doesNotMatch(body(file,name),forbidden,file+':'+name)
 const prepare=body('pg18-complete-plan-workflow-core.mjs','prepareComplete069PlanWorkflowPair');assert.doesNotMatch(prepare,forbidden);assert.ok(prepare.indexOf('await actualApi(api)')<prepare.indexOf('await start('));assert.match(prepare,/await db\.query\('COMMIT'\)/)
})
