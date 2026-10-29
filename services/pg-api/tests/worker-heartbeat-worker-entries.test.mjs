// Integrated entry checks; author-only overlays preserve existing D entries.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import * as ts from 'typescript'
const overlayFile=process.env.AGENT_STUDIO_WORKER_WRITER_TEST_OVERLAYS,overlays=overlayFile?JSON.parse(readFileSync(overlayFile,'utf8')):[]
const text=name=>readFileSync(overlays.find(row=>row.path.endsWith('/'+name))?.candidate??new URL('../src/'+name,import.meta.url),'utf8')
test('all seven integrated entries parse, including executable shebangs and the shared autonomous wrapper',()=>{
 for(const name of ['worker-loop.ts','model-worker-loop.ts','workflow-worker-loop.ts','workflow-v2-worker-loop.ts','autonomous-agent-worker-loop.ts','knowledge-index-service.ts','agent-assessment-service.ts']){
  const tree=ts.createSourceFile(name,text(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(tree.parseDiagnostics.length,0)
 }
 assert.match(text('autonomous-agent-worker-loop.ts'),/runV2WorkerCli\(true\)/)
})
test('prepare/model/safe startup readiness follows actual Worker construction and stop recheck; shutdown closes gate before event',()=>{
 for(const [file,constructor,stopped]of [['worker-loop.ts','AgentPrepareWorker','stopping'],['model-worker-loop.ts','AgentModelWorker','stop'],['workflow-worker-loop.ts','WorkflowSafeWorker','stop']]){
  const source=text(file),open=source.indexOf('.openWorkerHeartbeatWorkerLifecycle('),constructed=source.indexOf('new '+constructor),ready=source.indexOf('heartbeat?.startupChecksComplete()')
  assert.ok(open>0&&open<constructed&&constructed<ready);assert.ok(source.indexOf('if('+stopped+'){closeNewClaims();return}')<ready)
  assert.match(source,/worker\.closeNewClaims\(\);if\(worker\.claimAdmissionSnapshot\(\)\.closed\)heartbeat\?\.newClaimsClosed\(\)/)
  assert.match(source,/finally\{heartbeat\?\.close\(\);await pool\.end\(\)\}/)
  assert.ok(source.includes('heartbeat?.loopUnavailable()'))
 }
})
test('V2 mode maps autonomous separately and closes both actual Worker and optional scheduler before draining',()=>{
 const source=text('workflow-v2-worker-loop.ts')
 assert.ok(source.includes("openWorkerHeartbeatWorkerLifecycle(autonomous?'agent_autonomous':'workflow_v2')"))
 assert.ok(source.includes('worker.claimAdmissionSnapshot().closed&&(!scheduler||scheduler.claimAdmissionSnapshot().closed)'))
 assert.match(source,/closeWorkerClaims\?\.\(\);closeScheduleClaims\?\.\(\);if\(claimsClosed\?\.\(\)\)heartbeat\?\.newClaimsClosed/)
 assert.ok(source.indexOf('const scheduler=')<source.indexOf('heartbeat?.startupChecksComplete()'))
 assert.match(text('autonomous-agent-worker-loop.ts'),/runV2WorkerCli\(true\)/)
})
test('knowledge service binds only enabled actual Worker components and closes both manual-tick gates at first stop',()=>{
 const source=text('knowledge-index-service.ts'),branch=source.indexOf('if(kind==="worker"){'),broker=source.indexOf('const transport=createKnowledgeEmbeddingTransport',branch)
 const mounted=source.slice(branch,broker)
 assert.match(mounted,/openKnowledgeWorkerHeartbeatLifecycles\(\{index:cfg\.approved,query:cfg\.queryApproved\},controller\.signal\)/);assert.match(mounted,/indexHeartbeat=pair\.index;queryHeartbeat=pair\.query/)
 assert.match(mounted,/closeWorkerClaims=\(\)=>\{index\?\.closeNewClaims\(\);query\?\.closeNewClaims\(\)\}/)
 assert.ok(mounted.indexOf('if(controller.signal.aborted){stop();return')<mounted.indexOf('startupChecksComplete()'))
 assert.ok(source.indexOf('if(mode==="preflight")return')<source.indexOf('openKnowledgeWorkerHeartbeatLifecycles'))
 assert.match(source,/const stop=\(\)=>\{closeWorkerClaims\?\.\(\);if\(claimsClosed\?\.\(\)\)/)
 assert.doesNotMatch(source.slice(broker),/openKnowledgeWorkerHeartbeatLifecycles/)
})
test('assessment first-signal hook invokes synchronous actual close before its promise cleanup, retaining repeated-signal latch',async()=>{
 // Invoke the exact hook body only, with event/timer bookkeeping. This proves
 // ordering, not Worker/DB/POSIX authority or completion of actual paid work.
 const source=text('agent-assessment-service.ts'),tree=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='attachAgentAssessmentShutdown')
 const body=ts.transpileModule(node.getText().replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
 const hook=Function(body+';return attachAgentAssessmentShutdown')(),signals=new EventEmitter();let calls=0,finish,exited=0
 const pending=new Promise(resolve=>{finish=resolve}),control={signals,timer:()=>1,clear:()=>{},exit:()=>{exited++},reportFailure:()=>{}}
 hook(()=>{calls++;return pending},control);signals.emit('SIGTERM');assert.equal(calls,1);signals.emit('SIGTERM');signals.emit('SIGINT');assert.equal(calls,1);assert.equal(exited,0)
 finish();await Promise.resolve();await Promise.resolve()
 assert.match(source,/shutdown=\(\)=>\{stopping=true;closeWorkerClaims\(\);stopDelay\.abort\(\)/)
 assert.match(source,/worker\.closeNewClaims\(\);designWorker\?\.closeNewClaims\(\);if\(worker\.claimAdmissionSnapshot\(\)\.closed&&\(!designWorker\|\|designWorker\.claimAdmissionSnapshot\(\)\.closed\)\)heartbeat\?\.newClaimsClosed/)
 assert.ok(source.indexOf('if(mode==="preflight")')<source.indexOf('.openWorkerHeartbeatWorkerLifecycle('))
})
