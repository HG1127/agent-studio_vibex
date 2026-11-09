// Genuine source-only closure check. Reads existing SQL, no database/driver,
// mock positive auditor, role creation, application CLI or environment secrets.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {captureCompleteProfileSources,completeProfileAdditionalRoles} from '../src/pg18-complete-profile-source.mjs'
import {completeServiceRefusal} from '../src/pg18-complete-service-plan.mjs'
test('full069 fixed additional roles equal all literal role declarations in actual051..069 SQL',async()=>{
 const snapshot=await captureCompleteProfileSources(),declared=new Set()
 for(const step of snapshot.steps)for(const m of step.sql.matchAll(/^\s*CREATE ROLE\s+(agentstudio_[a-z_]+)\b/gm))declared.add(m[1])
 assert.deepEqual([...completeProfileAdditionalRoles].sort(),[...declared].sort())
 assert.ok(declared.has('agentstudio_company_metadata_reader'))
 assert.ok(snapshot.roles.includes('agentstudio_company_metadata_reader'))
 assert.equal(snapshot.roles.length,30)
 assert.equal(snapshot.roles.includes('agentstudio_review_worker_login'),false)
 assert.equal(snapshot.roles.includes('agentstudio_local_executor_login'),false)
 assert.equal(snapshot.manifest.sql_sources.length,53);assert.equal(snapshot.steps.length,19);assert.equal(snapshot.tables.length,133);assert.equal(snapshot.versions.length+2,57)
 assert.equal(snapshot.generated.source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')
 assert.equal(snapshot.descriptive.source_sha256,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
})
test('known role/HBA refusal codes remain exact and CI HBA literals are actual newlines',()=>{
 for(const code of ['complete_service_role_catalog_refused','complete_service_hba_refused'])assert.equal(completeServiceRefusal(Error(code)),code)
 const file=new URL('./helpers/pg18-complete-install-ci-containers.mjs',import.meta.url),text=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile('helper.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 const literals=[]
 const visit=node=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='join'&&node.expression.expression.getText(tree)==='lines')for(const a of node.arguments)if(ts.isStringLiteral(a))literals.push(a.text);ts.forEachChild(node,visit)};visit(tree)
 assert.deepEqual(literals,['\n'])
})
