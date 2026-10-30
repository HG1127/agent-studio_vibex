// Source guard checks and actual forged-capability refusals.
// No scalar model here claims actual pg/OS/source-capability authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as ts from 'typescript'
import {getWorkerHeartbeatWriterBridge} from '../src/worker-heartbeat-activation-control.ts'
import {controlLimits} from '../src/worker-heartbeat-activation-control-contract.ts'
const overlayFile=process.env.AGENT_STUDIO_WORKER_WRITER_TEST_OVERLAYS,overlays=overlayFile?JSON.parse(readFileSync(overlayFile,'utf8')):[]
const candidate=overlays.find(row=>row.path.endsWith('/worker-heartbeat-activation-control.ts'))?.candidate
const source=readFileSync(candidate??new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('control.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),body=name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText()
test('integrated Controller source parses and preserves the original fixed reader and Native budgets',()=>{
 assert.equal(tree.parseDiagnostics.length,0)
 assert.equal(controlLimits.leaseMs,5000);assert.equal(controlLimits.nativeBudgetMs,8000)
})
test('Root bridge only recognizes private genuine State; data/clone/proxy handles cannot inject adapters',()=>{
 let gets=0
 for(const handle of [{},Object.freeze({}),structuredClone({}),new Proxy({},{get(){gets++;throw Error('must_not_read')}})])assert.throws(()=>getWorkerHeartbeatWriterBridge(handle),/untrusted_reference/)
 assert.equal(gets,0);assert.match(body('getWorkerHeartbeatWriterBridge'),/const s=state\(control\),settings=rootWriterSettings\(s\)/)
 assert.doesNotMatch(body('getWorkerHeartbeatWriterBridge'),/pool\s*:|clock\s*:|target\s*:|driver\s*:/)
 assert.match(body('getWorkerHeartbeatWriterBridge'),/rootWriterClosedBackends\.get\(handle\)!==s/)
})
test('Root uses its genuine sealed driver and minimal writer identity; SU is never the record caller',()=>{
 assert.match(body('openRootWriterBackend'),/rootWriterSlots\.get\(reference\)/);assert.match(body('openRootWriterBackend'),/new s\.driver\.Client\(/)
 assert.match(body('openRootWriterBackend'),/user:slot\.role_name,password:slot\.password/)
 assert.ok(body('openRootWriterBackend').indexOf('new s.driver.Client(')<body('openRootWriterBackend').indexOf('const op=rootWriterBegin('),'constructor refusal must not strand the operation gate')
 const record=body('recordRootWriterReport');assert.match(record,/b\.raw\.query\(writerRecordSQL/);assert.doesNotMatch(record,/s\.raw\.query\(writerRecordSQL/)
 for(const text of ['r.role_oid!==String(slot.role_oid)','r.super!==false','r.inherit!==false','r.connection_limit!==1','r.no_memberships!==true'])assert.ok(body('verifyRootWriterIdentity').includes(text),text)
 assert.match(body('verifyRootWriterSelected'),/passwordsMatch/);assert.match(body('verifyRootWriterSelected'),/r\.generation!==op\.slot\.generation/)
})
test('new query wrappers check actual source/activation before and after every owned await and compare exact acknowledgement row',()=>{
 const guarded=body('rootWriterAwait');assert.ok(guarded.indexOf('rootWriterOperationCheck(op)')<guarded.indexOf('await job()'));assert.ok(guarded.lastIndexOf('rootWriterOperationCheck(op)')>guarded.indexOf('await job()'))
 const cleanup=body('rootWriterCleanupAwait');assert.ok(cleanup.indexOf('rootWriterCleanupCheck(s)')<cleanup.indexOf('await job()'));assert.ok(cleanup.lastIndexOf('rootWriterCleanupCheck(s)')>cleanup.indexOf('await job()'))
 for(const text of ["s.phase!=='serving'",'s.published!==s.epoch','s.mutation','runtimeCheck(s)','row.generation!==slot.generation','row.verifier_sha256!==slot.verifier_sha256'])assert.ok(body('rootWriterCheck').includes(text),text)
 assert.match(body('rootWriterOperationCheck'),/op\.epoch!==op\.s\.epoch/);assert.match(body('rootWriterOperationCheck'),/performance\.now\(\)>=op\.deadline/)
 assert.match(body('recordRootWriterReport'),/value\.sequence!==report\.sequence/);assert.match(body('verifyRootWriterSelected'),/r\.observed_at!==ack\.observed_at/)
})
test('mutation quiescence precedes Registry locks and actual backend absence precedes cleanup resource release',()=>{
 const mutate=body('applyWorkerHeartbeatMutation');assert.ok(mutate.indexOf('pauseWorkerHeartbeatWriterBroker')<mutate.indexOf('await lockRegistry(s)'))
 const close=body('closeRootWriterBackend');assert.ok(close.indexOf('waitRootWriterBackendGone')<close.indexOf('b.closed=true'));assert.ok(close.indexOf('b.closed=true')<close.indexOf('s.writerCleanups--'))
 assert.ok(close.indexOf('waitRootWriterBackendGone')<close.indexOf('rootWriterClosedBackends.set(b.handle,s)'),'idempotent closed capability exists only after actual cleanup')
 assert.match(body('rootWriterBegin'),/rootWriterBusy\(s\)\|\|s\.leases\.size\|\|s\.sqlJobs/)
 assert.match(body('prepareWorkerHeartbeatControlRead'),/if\(rootWriterBusy\(s\)\)controlFail\('control_busy'\)/)
 assert.match(body('closeWorkerHeartbeatActivationControl'),/closeWorkerHeartbeatWriterBroker/)
})
test('boot issuance can only use current completed publication and durable UID/generation consumption; backend PID never comes from caller',()=>{
 const current=body('currentRootWriterSlots');assert.match(current,/published\.phase!=='published'/);assert.match(current,/readStaged\(s,published\.action_id\)/)
 assert.doesNotMatch(current,/readdir|latest.*credentials|Date\.now/)
 const persist=body('persistRootWriterEvent');assert.match(persist,/old\.uid===x\.uid/);assert.match(persist,/row\.generation===a\.generation/);assert.match(persist,/r\.instance_id===s\.instance/)
 const backend=body('verifyRootWriterIdentity');assert.match(backend,/pid:r\.pid/);assert.match(backend,/started:r\.backend_start/)
 const cleanup=body('reconcileRootWriters');assert.match(cleanup,/ownedRoles\.has\(row\.role_oid\)/);assert.match(cleanup,/a\.backend_start=\$2::timestamptz AND a\.datid=\$3::oid AND r\.oid=\$4::oid/)
})
