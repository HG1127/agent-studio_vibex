import fs from 'node:fs'
import {createHash} from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {originalHome070InitializationContract} from '../../../ops/pg18-original-home070-review-plan.mjs'

test('separate070 review contract cannot claim execution, installation or original-page acceptance',()=>{
 const p=originalHome070InitializationContract()
 assert.equal(p.profile,'original-home070');assert.equal(p.predecessor_profile,'complete069');assert.equal(p.latest_migration,'pg_v9_070')
 for(const field of ['executor_provided','network_used','SQL_executed','secrets_read','writes_performed','services_started','actual_login_verified','original_page_accepted','production_cutover_allowed','old133_table_evidence_reusable_as070','filtering070_out_of_old_ledger'])assert.equal(p.boundaries[field],false)
 assert.equal(p.boundaries.default050_unchanged,true);assert.equal(p.boundaries.frozen059_060_unchanged,true);assert.equal(p.boundaries.complete069_unchanged,true)
 assert(Object.isFrozen(p)&&Object.isFrozen(p.required_order)&&Object.isFrozen(p.expected_additions))
})
test('070 SQL raw pin and original outer transaction are retained by the review contract',()=>{
 const p=originalHome070InitializationContract(),raw=fs.readFileSync(new URL('../../../'+p.sql_step.path,import.meta.url))
 assert.equal(createHash('sha256').update(raw).digest('hex'),p.sql_step.sha256)
 assert.equal((raw.toString('utf8').match(/^BEGIN;$/gm)||[]).length,1);assert.equal((raw.toString('utf8').match(/^COMMIT;$/gm)||[]).length,1)
 assert.equal(p.sql_step.preserve_original_transaction,true);assert.deepEqual(p.expected_additions.roles,[]);assert.deepEqual(p.expected_additions.logins,[])
})
test('Native source collector admits explicit original UI contracts and refuses unreviewed shared paths',()=>{
 const source=fs.readFileSync(new URL('../../../ops/build-pg18-native-api-preflight-bundle.mjs',import.meta.url),'utf8')
  const ts=createRequire(import.meta.url)('typescript'),tree=ts.createSourceFile('builder.mjs',source,ts.ScriptTarget.Latest,true),take=name=>{const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node);return node.getText(tree)}
  const validate=Function(take('refuse')+'\n'+take('validatedPath')+'\nreturn validatedPath')()
  for(const path of ['shared/original-home-authoring.ts','shared/original-agent-catalog.ts','shared/original-internal-overview-contract.ts'])assert.equal(validate(path),path)
  for(const path of ['shared/other-original.ts','shared/unreviewed-contract.ts','shared/../.env','/shared/original-agent-catalog.ts','shared/original-agent-catalog.ts/../private'])assert.throws(()=>validate(path),/unexpected_dependency/)
 assert(!source.includes('rel.startsWith("shared/")'))
 assert(!source.includes('pg_v9_070_home_authoring.sql'))
})
