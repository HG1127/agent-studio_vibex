import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import ts from 'typescript'

const repo=path.resolve(import.meta.dirname,'..'),file='ops/build-pg18-native-api-preflight-bundle.mjs'
const tree=ts.createSourceFile(file,fs.readFileSync(path.join(repo,file),'utf8'),ts.ScriptTarget.Latest,true)
assert.equal(tree.parseDiagnostics.length,0)
const functionSource=name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n);return n.getText(tree)}
const assetDeclaration=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='nativeWorkerSqlAssets'))
assert(assetDeclaration)
function collector(io=fs){
 const included=new Set(),visited=new Set(),foundExternals=new Set()
 const actual=vm.runInNewContext([assetDeclaration.getText(tree),...['refuse','validatedPath','includeSource'].map(functionSource),'({includeSource,validatedPath})'].join('\n'),{fs:io,path,ts,repo,included,visited,foundExternals,hash:b=>createHash('sha256').update(b).digest('hex'),employeeUi078ReviewedPaths:new Set()},{timeout:1000})
 return {...actual,included,visited,foundExternals}
}
test('the actual Native collector resolves original business interaction and optional operator dependencies without executing modules',()=>{
 const c=collector()
 c.includeSource('services/pg-api/src/native-server.ts')
 for(const entry of ['knowledge-index-service.ts','agent-assessment-service.ts','native-local-executor-service-preflight-cli.mjs'])assert(!c.visited.has('services/pg-api/src/'+entry),entry+' remains opt-in')
 for(const entry of ['knowledge-index-service.ts','agent-assessment-service.ts','native-local-executor-service-preflight-cli.mjs','native-local-executor-service-preflight.ts','native-local-executor-operator-plan.mjs','native-local-executor-operator-plan.d.mts'])c.includeSource('services/pg-api/src/'+entry)
 for(const name of ['business-schemas.mjs','monitor-semantics.mjs','monitor-execution-budget.mjs','ordinary-case-run-contract.ts','original-run-interaction-contract.ts'])assert(c.included.has('shared/'+name),name)
 for(const name of ['008_claim_workflow_v2.sql','009_claim_autonomous_agent.sql'])assert(c.included.has('db/postgres/'+name),name)
 assert.deepEqual([...c.foundExternals].sort(),['ajv','jszip','mammoth','pdfjs-dist','pg'])
 assert(!c.visited.has('services/pg-api/src/pg18-employee-ui078-source.mjs'))
})
test('the default Native bundle still refuses arbitrary shared files, SQL and traversal',()=>{
 const c=collector()
 for(const p of ['shared/unreviewed-contract.ts','shared/other-original.ts','shared/../.env','/shared/business-schemas.mjs','db/postgres/001_stage_schema.sql','db/postgres/010_unreviewed.sql','db/postgres/../postgres/008_claim_workflow_v2.sql'])assert.throws(()=>c.validatedPath(p),/native_preflight_bundle_refused/)
})
test('both existing Worker SQL assets accept their actual committed LF bytes as checked data',()=>{
 for(const name of ['008_claim_workflow_v2.sql','009_claim_autonomous_agent.sql']){
  const relative='db/postgres/'+name,target=path.join(repo,relative),committed=execFileSync('git',['show','HEAD:'+relative],{cwd:repo,maxBuffer:1024*1024}),io={...fs,readFileSync(file,...args){return file===target?committed:fs.readFileSync(file,...args)}}
  const c=collector(io);c.includeSource(relative);assert(c.included.has(relative))
 }
})
for(const name of ['008_claim_workflow_v2.sql','009_claim_autonomous_agent.sql'])test('changed Worker SQL data is refused before packaging: '+name,()=>{
 const target=path.join(repo,'db/postgres',name),io={...fs,readFileSync(file,...args){const value=fs.readFileSync(file,...args);return file===target?Buffer.concat([value,Buffer.from('\n-- drift\n')]):value}}
 assert.throws(()=>collector(io).includeSource('db/postgres/'+name),/native_preflight_bundle_refused:worker_sql_asset_changed/)
})
