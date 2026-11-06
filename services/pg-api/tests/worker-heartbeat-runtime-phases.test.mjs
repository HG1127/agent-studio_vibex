// Standard source-only regressions. Reuse the existing inert runtime-memory
// ports; never import a controller/runtime module, driver or fullclaim suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {isProxy} from 'node:util/types'
import ts from 'typescript'
import {createRuntimeLayoutMemory,runtimeLayoutFunction} from './helpers/runtime-layout-source-memory.mjs'
import {parseCleanupReaderObservation as parse,parseCleanupReaderObservations as wire} from './helpers/worker-heartbeat-cleanup-reader-observation.mjs'
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8'),runtime=read('services/pg-api/src/worker-heartbeat-activation-control-runtime.mjs'),control=read('services/pg-api/src/worker-heartbeat-activation-control.ts'),controlJs=stripTypeScriptTypes(control,{mode:'strip'}),fields=['runtime_calls','runtime_source_ms','runtime_manifest_ms','runtime_tree_ms','runtime_packages_ms','runtime_cache_ms'],entry='services/pg-api/tests/worker-heartbeat-activation-control-runtime.test.mjs',own='./worker-heartbeat-runtime-phases.test.mjs'
function memory(){const m=createRuntimeLayoutMemory(runtime);m.run(true);m.clear();return m}
function observed(m,token){try{return{value:m.assert(token)}}catch(error){return{error}}}
function controller(m,{sinkFails=false}={}){
 const lines=[],events=[],runtimePort={createWorkerHeartbeatActivationControlRuntimeTiming:m.timing,describeWorkerHeartbeatActivationControlRuntimeTiming:m.describe,assertWorkerHeartbeatActivationControlRuntime:m.assertData},l={peer:{requestStarted:0,open:true},phase:'preparing',epoch:1n,deadline:5000,s:{healthy:true,phase:'serving',epoch:1n,writerOperation:false,writerCleanups:0,runtime:runtimePort,runtimeCap:m.capabilityDataOnly}},start=control.indexOf('type RootReaderTiming='),end=control.indexOf('/* CLEANUP_READER_TIMING_END */',start)
 assert(start>=0&&end>start);const helpers=stripTypeScriptTypes(control.slice(start,end),{mode:'strip'}),functions=['runtimeCheck','leaseCheck'].map(n=>runtimeLayoutFunction(controlJs,n)).join('\n'),deps={isProxy,Buffer,performance:{now:()=>m.clock.at},process:{stderr:{write:line=>{if(sinkFails)throw Error('inert_sink');lines.push(line)}}},host:()=>events.push('host'),controlFail:code=>{events.push(code);throw Error(code)},revoke:()=>events.push('revoke')},api=Function(...Object.keys(deps),helpers+'\n'+functions+'\nreturn {startRootReaderTiming,markRootReaderTiming,observeRootReaderTiming,startRootCleanupTiming,observeRootCleanupTiming,emitRootCleanupReaderTiming,runtimeCheck,leaseCheck}')(...Object.values(deps));return{api,l,lines,events}
}
test('Reader phase observation keeps the entire untimed trace and every fresh repeated runtime guard',()=>{
 const a=memory(),b=memory(),token=b.timing();assert(token);assert.equal(a.assert(),undefined);assert.equal(b.assert(token),undefined);assert.deepEqual(b.trace,a.trace);assert.equal(a.clock.reads,0);assert.equal(b.clock.reads,6)
 assert.equal(b.trace.filter(r=>r[0]==='readBound').length,158);for(const name of ['source','protocol','metadata','lstat','readdir','inventory','packageInfo','cache'])assert(b.trace.some(r=>r[0]===name),name)
 const first=b.describe(token);assert.deepEqual(Object.keys(first),fields);assert(Object.isFrozen(first));assert.equal(first.runtime_calls,1);assert(fields.slice(1).every(k=>Number.isSafeInteger(first[k])&&first[k]>0));const trace=b.trace.slice();a.clear();b.clear();a.assert();b.assert(token);assert.deepEqual(b.trace,trace);assert.deepEqual(b.trace,a.trace);assert.equal(b.describe(token).runtime_calls,2)
})
const terminals=[['source',r=>r[0]==='source'],['manifest',r=>r[0]==='readBound'&&r[1].endsWith('/manifest.json')],['tree',r=>r[0]==='lstat'],['packages',r=>r[0]==='packageInfo'],['cache',r=>r[0]==='cache']]
for(const[phase,match]of terminals)test('Reader '+phase+' phase retains original error object, trace and failed-state priority',()=>{
 const complete=memory();complete.assert();const index=complete.trace.findIndex(match);assert(index>=0);const a=memory(),b=memory(),token=b.timing(),original=Error('inert_original_'+phase);a.refuseAt(index,original);b.refuseAt(index,original);assert.equal(observed(a).error,original);assert.equal(observed(b,token).error,original);assert.deepEqual(b.trace,a.trace);assert.equal(a.stateDataOnly.failed,true);assert.equal(b.stateDataOnly.failed,true);assert.equal(b.describe(token).runtime_calls,1);b.clear();assert.throws(()=>b.assert(token),e=>e===b.original);assert.equal(b.trace.length,0);assert.equal(b.clock.reads,0)
})
test('Reader timing data and clones never substitute verified runtime provenance',()=>{
 const m=memory(),token=m.timing();let traps=0;const proxy=new Proxy(token,{get(){traps++;throw Error('trap')},ownKeys(){traps++;throw Error('trap')}})
 for(const invalid of [token,{},undefined,null,proxy])assert.throws(()=>m.assertData(invalid,token),e=>e===m.original);assert.equal(m.trace.length,0);assert.equal(m.clock.reads,0);assert.equal(m.describe(token).runtime_calls,0)
 assert.equal(m.assert(proxy),undefined);assert.equal(m.describe(proxy),undefined);assert.equal(m.clock.reads,0);assert.equal(traps,0)
})
test('all existing fresh drift refusals survive a valid observation token',()=>{
 for(const kind of ['bytes','metadata','missing','symlink','extra','package_type']){const m=memory(),token=m.timing();m.tamper(kind);assert.throws(()=>m.assert(token),e=>e===m.original,kind);assert.equal(m.trace.filter(r=>r[0]==='source').length,1);assert.equal(m.trace.filter(r=>r[0]==='cache').length,0);assert.equal(m.stateDataOnly.failed,true)}
})
test('observation clock failure cannot change acceptance, original error or complete check trace',()=>{
 for(const mode of ['throw','nonfinite','backward']){const a=memory(),b=memory(),token=b.timing();b.clock.mode=mode;a.assert();assert.equal(b.assert(token),undefined);assert.deepEqual(b.trace,a.trace);assert(fields.slice(1).every(k=>b.describe(token)[k]===null))
  const x=memory(),y=memory(),t=y.timing(),original=Error('inert_original_failure');x.refuseAt(1,original);y.refuseAt(1,original);y.clock.mode=mode;assert.equal(observed(x).error,original);assert.equal(observed(y,t).error,original);assert.deepEqual(y.trace,x.trace)}
})
test('actual Reader lease error priority remains runtime then lease predicates then original5s expiry',()=>{
 const m=memory(),c=controller(m),original=Error('inert_runtime_original');c.api.startRootReaderTiming(c.l);c.l.peer.open=false;c.l.deadline=-1;m.refuseAt(1,original);assert.throws(()=>c.api.leaseCheck(c.l,'preparing'),e=>e===original);assert.deepEqual(c.events,['host']);c.api.observeRootReaderTiming(c.l,'failed');assert(parse(JSON.parse(c.lines[0])))
 for(const code of ['lease_revoked','lease_expired']){const x=memory(),h=controller(x);h.api.startRootReaderTiming(h.l);if(code==='lease_revoked')h.l.peer.open=false;else h.l.deadline=-1;assert.throws(()=>h.api.leaseCheck(h.l,'preparing'),e=>e.message===code);assert(x.trace.some(r=>r[0]==='cache'));assert.deepEqual(h.events,code==='lease_expired'?['host','revoke',code]:['host',code])}
})
test('actual Reader packet aggregates once within unchanged total and reserved failure budgets',()=>{
 const m=memory(),c=controller(m);for(let i=0;i<100;i++){const t=c.api.startRootCleanupTiming('prepare');c.api.observeRootCleanupTiming(t,'ended')}const before=c.lines.length;c.api.emitRootCleanupReaderTiming({event:'worker_heartbeat_registry_read_failure_observation',site:'registry_query',cause:'lease_expired',outcome:'failed',observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false});c.api.startRootReaderTiming(c.l);c.api.leaseCheck(c.l,'preparing');c.api.leaseCheck(c.l,'preparing');c.api.markRootReaderTiming(c.l,'finish_registry');c.api.observeRootReaderTiming(c.l,'failed');c.api.observeRootReaderTiming(c.l,'failed');assert.equal(c.lines.length,before+2);const v=JSON.parse(c.lines.at(-1));assert.equal(v.runtime_calls,2);assert.equal(v.guard_calls,2);assert(parse(v));assert.deepEqual(wire(c.lines.at(-1)),[v]);assert(Buffer.byteLength(c.lines.join(''))<=4096);assert(Buffer.byteLength(c.lines.filter(l=>JSON.parse(l).outcome==='failed').join(''))<=1024);assert(c.lines.every(line=>parse(JSON.parse(line))));assert(!c.lines.join('').includes('/inert/'))
 const x=memory(),failedSink=controller(x,{sinkFails:true});failedSink.api.startRootReaderTiming(failedSink.l);assert.doesNotThrow(()=>failedSink.api.observeRootReaderTiming(failedSink.l,'failed'));assert.equal(failedSink.lines.length,0)
})
test('closed phase packet requires the entire bounded scalar extension and never evaluates getters or proxy traps',()=>{
 const m=memory(),c=controller(m);c.api.startRootReaderTiming(c.l);c.api.leaseCheck(c.l,'preparing');c.api.observeRootReaderTiming(c.l,'failed');const v=JSON.parse(c.lines[0]);assert.deepEqual(parse(v),v);const legacy={...v};for(const k of fields)delete legacy[k];assert.deepEqual(parse(legacy),legacy)
 for(const k of fields){const partial={...v};delete partial[k];assert.equal(parse(partial),null,k)}
 for(const patch of [{runtime_calls:4097},{runtime_calls:null},{runtime_source_ms:Infinity},{runtime_manifest_ms:-1},{runtime_tree_ms:120001},{runtime_packages_ms:'1'},{runtime_cache_ms:NaN},{runtime_authorization:true},{path:'/inert/secret'}])assert.equal(parse({...v,...patch}),null)
 let traps=0;const getter={...v};Object.defineProperty(getter,'runtime_tree_ms',{enumerable:true,get(){traps++;throw Error('secret')}});assert.equal(parse(getter),null);const proxy=new Proxy(v,{get(){traps++;throw Error('trap')},ownKeys(){traps++;throw Error('trap')},getOwnPropertyDescriptor(){traps++;throw Error('trap')}});assert.equal(parse(proxy),null);assert.equal(traps,0)
})
test('existing checked-in Node test and CI commands register this static-import regression without package changes',()=>{
 const text=read(entry),tree=ts.createSourceFile(entry,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0);const imports=tree.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===own);assert.equal(imports.length,1);assert.equal(imports[0].importClause,undefined)
 const ci=read('.github/workflows/pg18-telemetry-control-ci.yml'),commands=[...ci.matchAll(/run: >-\r?\n((?: {10}[^\n]*(?:\r?\n|$))+)/g)].map(m=>m[1].trim().split(/\s+/));assert(commands.some(args=>args[0]==='node'&&args.includes('--test')&&args.includes(entry)))
 const pkg=JSON.parse(read('package.json'));assert(pkg.scripts.test.split(/\s+/).includes(entry));assert(pkg.scripts['test:original-ui-contracts'].split(/\s+/).includes(entry));assert(read('.github/workflows/agent-studio-quality.yml').includes('run: pnpm test:original-ui-contracts'))
})
