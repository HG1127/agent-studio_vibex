// Actual startup source fragment + original auditor negative comparisons only.
// No SQL, privilege grant, Worker, Broker or real catalog success is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {verifyNativeLocalDeviceSchema} from '../src/native-local-device-audit.ts'
const ts=createRequire(import.meta.url)('typescript'),text=fs.readFileSync(new URL('../src/workflow-v2-worker-loop.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('worker.ts',text,ts.ScriptTarget.Latest,true),nodes=(predicate)=>{const out=[];function visit(n){if(predicate(n))out.push(n);ts.forEachChild(n,visit)}visit(tree);return out},blocks=nodes(n=>ts.isIfStatement(n)&&n.expression.getText(tree)==='localDeviceExecutionApproved');assert.equal(blocks.length,1);const block=blocks[0].getText(tree),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,execute=(adapter,enabled=true)=>AsyncFunction('adapter','verifyNativeLocalDeviceSchema','localDeviceExecutionApproved',block)(adapter,verifyNativeLocalDeviceSchema,enabled)
function model({failRole=false}={}){const trace=[],db={async query(sql){trace.push(sql);if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};if(sql.startsWith('SET LOCAL ROLE ')){if(failRole)throw Error('actual_role_switch_refused');return {rows:[]}}if(sql.startsWith("SELECT current_setting('server_version_num')"))return {rows:[{version:170000,owner:1,defaults_safe:true}]};throw Error('unexpected_symbolic_query')},release(){trace.push('RELEASE')}};return {trace,adapter:{async connect(){trace.push('CONNECT');return db}}}}
test('optional startup uses API only inside the original read-only transaction and keeps the original auditor argument',()=>{
 assert.ok(block.includes('await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");await verifyNativeLocalDeviceSchema(db)'));assert.ok(block.includes('finally{try{await db.query("ROLLBACK")}finally{db.release()}}'));assert.equal(block.includes('agentstudio_local_executor'),false);assert.equal(block.includes('GRANT'),false)
})
test('actual original auditor still refuses an invalid schema; rollback and release are mandatory',async()=>{
 const m=model();await assert.rejects(execute(m.adapter),/unsafe_native_local_device_schema/);assert.deepEqual(m.trace.slice(0,3),['CONNECT','BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api']);assert.deepEqual(m.trace.slice(-2),['ROLLBACK','RELEASE']);assert.equal(m.trace.filter(v=>v.startsWith('SELECT current_setting(')).length,1)
})
test('a real role-switch rejection propagates before catalog reads, without fallback or retry',async()=>{
 const m=model({failRole:true});await assert.rejects(execute(m.adapter),/actual_role_switch_refused/);assert.deepEqual(m.trace,['CONNECT','BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api','ROLLBACK','RELEASE'])
})
test('disabled local-device execution performs no optional connection or audit',async()=>{const m=model();await execute(m.adapter,false);assert.deepEqual(m.trace,[])})
test('the original prerequisite already proves both memberships/role switches before the optional audit; actual business construction stays after it',()=>{
 const boundary=fs.readFileSync(new URL('../src/worker-role-preflight.ts',import.meta.url),'utf8');assert.ok(boundary.includes('workerLoginCanJoinApi!==true'));assert.ok(boundary.includes('for(const expected of ["agentstudio_worker","agentstudio_api"])'));assert.ok(text.indexOf('await verifyPgWorkerRoleBoundary(adapter,target)')<blocks[0].getStart(tree));assert.ok(blocks[0].end<text.indexOf('const {WorkflowV2Worker}=await import("./workflow-v2-worker.ts")'));assert.ok(text.includes('new WorkflowV2Worker(adapter,'))
})
test('the full31 routine/body/ACL checks and API ledger marker remain in the original auditor',()=>{
 const audit=fs.readFileSync(new URL('../src/native-local-device-audit.ts',import.meta.url),'utf8');assert.ok(audit.includes('if(actual.length!==Object.keys(expected).length'));assert.ok(audit.includes("createHash('sha256').update(r.source)"));assert.ok(audit.includes('!same(r.grants,e.grant?'));assert.ok(audit.indexOf("createHash('sha256').update(r.source)")<audit.indexOf('const installed='));assert.ok(audit.includes("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_067')"))
})
