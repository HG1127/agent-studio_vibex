// Pure source-boundary assertions. No CI permit, credential, driver or SQL.
import test from'node:test'
import assert from'node:assert/strict'
import fs from'node:fs'
import{createRequire}from'node:module'
import{captureComplete069PlanWorkflowSources,assertComplete069PlanWorkflowSources,complete069PlanWorkflowModules}from'../src/pg18-complete-plan-workflow-sources.mjs'
const require=createRequire(new URL('../package.json',import.meta.url)),ts=require('typescript'),source=fs.readFileSync(new URL('pg18-complete-service-ci.integration.mjs',import.meta.url),'utf8'),sf=ts.createSourceFile('fixture.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const all=[];function visit(node){all.push(node);ts.forEachChild(node,visit)}visit(sf)
const callNamed=name=>all.filter(n=>ts.isCallExpression(n)&&n.expression.getText(sf)===name)
function value(node,context){if(ts.isStringLiteral(node))return node.text;if(ts.isIdentifier(node)&&Object.hasOwn(context,node.text))return context[node.text];if(ts.isPropertyAccessExpression(node))return value(node.expression,context)[node.name.text];if(ts.isElementAccessExpression(node))return value(node.expression,context)[value(node.argumentExpression,context)];if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return value(node.left,context)+value(node.right,context);throw Error('nonliteral_predecessor_path')}
test('F05 continuation consumes fixed12 existing private files after C actual success, under its own purpose',()=>{
 assert.deepEqual(sf.parseDiagnostics,[])
 const calls=callNamed('verifyComplete069PlanWorkflowCi');assert.equal(calls.length,1);const call=calls[0],earlier=callNamed('verifyComplete069ReviewStackCi');assert.equal(earlier.length,1);assert.ok(earlier[0].end<call.pos)
 let branch=call.parent;while(branch&&!ts.isIfStatement(branch))branch=branch.parent;assert.ok(branch);assert.equal(branch.expression.getText(sf),'env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE!==undefined');assert.match(branch.thenStatement.getText(sf),/assert\.equal\(env\.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE,'YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY'\)/)
 assert.equal(call.arguments.length,3);assert.equal(call.arguments[0].getText(sf),'loaded');assert.equal(call.arguments[1].getText(sf),'targets.main');assert.equal(call.arguments[2].getText(sf),'{predecessorFiles}')
 const declarations=all.filter(n=>ts.isVariableDeclaration(n)&&n.name.getText(sf)==='predecessorFiles');assert.equal(declarations.length,1);const array=declarations[0].initializer;assert.ok(ts.isArrayLiteralExpression(array));const files={api:'/owned/api','native-auth':'/owned/auth',worker:'/owned/worker',identity:'/owned/identity',broker:'/owned/broker','index-worker':'/owned/index-worker','index-broker':'/owned/index-broker'},stage={input:'/owned/stage'}
 const actual=array.elements.map(row=>{assert.ok(ts.isObjectLiteralExpression(row));assert.equal(row.properties.length,2);return Object.fromEntries(row.properties.map(p=>{assert.ok(ts.isPropertyAssignment(p));return[p.name.getText(sf),value(p.initializer,{files,stage})]}))})
 const logins=['stage_login','native_login','stage_worker','bound_dispatch_login','model_broker_login','knowledge_index_worker_login','knowledge_index_broker_login','review_worker_login','local_executor_login','review_dispatch_login','design_worker_login','design_dispatch_login'].map(n=>'agentstudio_'+n),paths=[files.api,files['native-auth'],files.worker,files.identity,files.broker,files['index-worker'],files['index-broker'],stage.input+'/review-worker.secret',stage.input+'/executor.secret',stage.input+'/review-stack-review_dispatch.secret',stage.input+'/review-stack-design_worker.secret',stage.input+'/review-stack-design_dispatch.secret']
 assert.deepEqual(actual,logins.map((login,i)=>({login,secret_file:paths[i]})));assert.equal(new Set(paths).size,12)
 const body=branch.thenStatement.getText(sf);for(const key of ['actual_case_count,9','actual_predecessor_login_count,12','actual_F05_login_count,2'])assert.ok(body.includes('planWorkflow.'+key));for(const key of ['original_nonroot_worker_preflight_verified','original_nonroot_broker_preflight_verified','actual_postgres_future_SELECT_negative_verified','all133_table_images_unchanged','ledger57_unchanged'])assert.ok(body.includes("'"+key+"'"));assert.ok(body.includes("event:'complete069_plan_workflow_actual_summary'"));assert.doesNotMatch(body,/caseCounter\.|step\(/)
})
test('common complete snapshot binds original service and new preparer roots in the same genuine cohort',async()=>{
 const snapshot=await captureComplete069PlanWorkflowSources();assert.equal(assertComplete069PlanWorkflowSources(snapshot,snapshot.source_sha256),true)
 for(const name of [...complete069PlanWorkflowModules,'services/pg-api/src/agent-plan-workflow-service.ts','services/pg-api/src/agent-plan-workflow-service-config.ts'])assert.ok(snapshot.complete.manifest.sources.some(r=>r.path===name),name)
 assert.equal(snapshot.manifest.complete_source_sha256,snapshot.complete.source_sha256)
 const yaml=fs.readFileSync(new URL('../../../.github/workflows/pg18-complete-install-ci.yml',import.meta.url),'utf8'),installLine=yaml.split('\n').find(l=>l.includes('ops/pg18-complete-install-ci.mjs --run')),serviceLine=yaml.split('\n').find(l=>l.includes('ops/pg18-complete-service-ci.mjs --run'))
 assert.doesNotMatch(installLine,/AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE/);assert.match(serviceLine,/AGENT_STUDIO_COMPLETE_PROFILE_CI_WRITE_APPROVED,AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE /)
 assert.doesNotMatch(yaml,/^\s*<<:/m)
 const environment=name=>{
  const at=yaml.indexOf('      - name: '+name+'\n');assert.ok(at>=0,name)
  const block=yaml.slice(at).split('        env:\n')[1]?.split('        run: |\n')[0];assert.ok(block,name)
  const rows=block.trimEnd().split('\n').map(line=>{const m=/^          ([A-Z0-9_]+): (.+)$/.exec(line);assert.ok(m,line);return[m[1],m[2]]});assert.equal(new Set(rows.map(([key])=>key)).size,rows.length);return Object.fromEntries(rows)
 }
 const original=environment('Own empty PG18 clusters and actual complete069 install'),pair=environment('Fresh full069 fixed service preparation and original first-admin CLI')
 assert.deepEqual(pair,{...original,AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE:'YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY'})
})
