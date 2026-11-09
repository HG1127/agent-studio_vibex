// Source-extracted pure diagnostic tests only. Never import an application
// entry, open a target, spawn a Worker or mint a trust/process capability.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {types} from 'node:util'
const source=fs.readFileSync(new URL('./helpers/pg18-full069-worker-path-ci-contract.mjs',import.meta.url),'utf8'),marker='// Failure observation DATA only, after the fixture\'s original privateRead/json.',start=source.indexOf(marker)
assert(start>=0)
const project=Function('pathCiObservationTypes',source.slice(start).replace('export function pathCiOwnedFailureObservation','function pathCiOwnedFailureObservation')+';return pathCiOwnedFailureObservation')(types)
const runId='11111111-1111-4111-8111-111111111111',reason='full069_worker_live_owned_process_changed',ids=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge','assessment'],clone=structuredClone
const early=id=>({id,graceful:false,forced:false,identity_verified:false}),stopped=id=>({id,graceful:true,forced:false,identity_verified:true,absent:true,supervisor_absent:true})
function record(){return{format:'pg18_full069_worker_path_validation_result_v1',run_id:runId,validation_completed:false,reason,details:{source_sha256:'a'.repeat(64),complete_source_sha256:'b'.repeat(64),warm:null,last:null,worker_stop:[early('prepare')],native_stop:stopped('native'),proxy_stop:{graceful:true,proxy_closed:true,owned_proxy_only:true},cleanup:null},qualifies_run:false,qualifying_window_started:false,BEGIN_or_END_receipt_issued:false,production_cutover_allowed:false}}
function sample(){return{monotonic_ms:1,wall_ms:2,collected_ms:1,processes:['native',...ids].map(id=>({id,pid:123,start_ticks:'456',supervisor_pid:122,supervisor_start_ticks:'455',uid:63000,gid:63000,kinds:[],actual_original_entry:true})),native:{actual_current_admin:true,private_sentinel:'DO_NOT_PRINT_COOKIE_PASSWORD_CODE_PATH_PID_ARGV'},runtime:{policy_sha256:'c'.repeat(64)}}}
function cleanup(){return{ledger_sha256:'a'.repeat(64),roles_sha256:'b'.repeat(64),queues:{jobs:0,runs:0,reviews:0,queries:0},policy_sha256:'c'.repeat(64),root_journal_head_sha256:'d'.repeat(64),root_journal_records:1,used_boot_uids:7,bindings:Array.from({length:8},(_,i)=>({kind:String(i)})),telemetry_backend_count:0,readers_in_flight:0}}
test('early owned failure projects only fixed booleans/nulls and whitelisted entries, never raw metadata',()=>{
 const out=project(record(),runId,reason)
 assert.deepEqual(out,{event:'full069_worker_path_ci_owned_failure_observation',primary_code:'full069_path_ci_refused:short_cli_failed',reason_matches_cli:true,validation_completed:false,warm_collected:false,last_collected:false,worker_stop:[{entry:'prepare',graceful:false,forced:false,identity_verified:false,absent:null,supervisor_absent:null}],native_stop:{entry:'native',graceful:true,forced:false,identity_verified:true,absent:true,supervisor_absent:true},proxy_graceful:true,proxy_closed:true,cleanup_observed:false,telemetry_backends_zero:null,readers_in_flight_zero:null,business_queues_empty:null,observed_data_only:true,qualifies_run:false,production_cutover_allowed:false})
 assert(Object.isFrozen(out)&&Object.isFrozen(out.worker_stop)&&Object.isFrozen(out.worker_stop[0])&&Object.isFrozen(out.native_stop))
})
test('late failure preserves warm/last presence and cleanup booleans without printing samples or identity values',()=>{
 const value=record();value.details.warm=sample();value.details.last=sample();value.details.cleanup=cleanup();value.details.worker_stop=[...ids].reverse().map(stopped)
 const out=project(value,runId,reason);assert(out);assert.equal(out.warm_collected,true);assert.equal(out.last_collected,true);assert.equal(out.telemetry_backends_zero,true);assert.equal(out.readers_in_flight_zero,true);assert.equal(out.business_queues_empty,true);assert.deepEqual(out.worker_stop.map(v=>v.entry),ids)
 const encoded=JSON.stringify(out);for(const secret of ['DO_NOT_PRINT','pid','argv','credential','11111111','source_sha256','complete_source_sha256'])assert(!encoded.includes(secret),secret)
 value.details.cleanup.telemetry_backend_count=1;value.details.cleanup.readers_in_flight=1;value.details.cleanup.queues.jobs=1;const changed=project(value,runId,'other');assert.equal(changed.telemetry_backends_zero,false);assert.equal(changed.readers_in_flight_zero,false);assert.equal(changed.business_queues_empty,false);assert.equal(changed.reason_matches_cli,false)
})
test('foreign runs, success records, qualifier flags and invalid reason/digest/sample shapes refuse observation',()=>{
 const mutations=[v=>v.run_id='22222222-2222-4222-8222-222222222222',v=>v.validation_completed=true,v=>v.qualifies_run=true,v=>v.qualifying_window_started=true,v=>v.BEGIN_or_END_receipt_issued=true,v=>v.production_cutover_allowed=true,v=>v.reason='raw path or error',v=>v.details.source_sha256='bad',v=>v.details.warm={},v=>v.details.last={...sample(),processes:[]}]
 for(const mutate of mutations){const v=record();mutate(v);assert.equal(project(v,runId,reason),null)}
 assert.equal(project(record(),{},reason),null)
})
test('input getters at every relevant depth and Proxy traps never execute',()=>{
 let invoked=0
 for(const target of ['root','details','row','sample']){const v=record();if(target==='sample')v.details.warm=sample();const object=target==='root'?v:target==='details'?v.details:target==='row'?v.details.worker_stop[0]:v.details.warm.native;Object.defineProperty(object,'danger',{enumerable:true,get(){invoked++;throw Error('secret')}});assert.equal(project(v,runId,reason),null)}
 const proxy=new Proxy(record(),{get(){invoked++;throw Error('trap')},ownKeys(){invoked++;throw Error('trap')},getPrototypeOf(){invoked++;throw Error('trap')}});assert.equal(project(proxy,runId,reason),null)
 const nested=record();nested.details.native_stop=new Proxy(stopped('native'),{ownKeys(){invoked++;throw Error('trap')}});assert.equal(project(nested,runId,reason),null);assert.equal(invoked,0)
})
test('foreign prototypes, symbol keys, nonenumerable fields and executable values are rejected',()=>{
 const mutations=[v=>Object.setPrototypeOf(v,{foreign:true}),v=>Object.setPrototypeOf(v.details.worker_stop,{}),v=>v[Symbol('x')]=true,v=>Object.defineProperty(v.details,'hidden',{value:true}),v=>v.details.cleanup=new Date(),v=>v.details.warm=()=>{}]
 for(const mutate of mutations){const v=record();mutate(v);assert.equal(project(v,runId,reason),null)}
 const safe=record();Object.setPrototypeOf(safe,null);Object.setPrototypeOf(safe.details,null);assert(project(safe,runId,reason))
})
test('closed schemas reject unknown fields, foreign/duplicate entries, wrong booleans and malformed cleanup',()=>{
 const mutations=[v=>v.extra=true,v=>v.details.extra=true,v=>v.details.worker_stop[0].extra=true,v=>v.details.worker_stop[0].id='outside',v=>v.details.worker_stop.push(early('prepare')),v=>v.details.worker_stop[0].graceful='false',v=>v.details.native_stop.id='prepare',v=>v.details.proxy_stop.extra=true,v=>v.details.proxy_stop.owned_proxy_only=false,v=>v.details.cleanup={...cleanup(),extra:true},v=>v.details.cleanup={...cleanup(),telemetry_backend_count:-1},v=>v.details.cleanup={...cleanup(),queues:{...cleanup().queues,extra:0}}]
 for(const mutate of mutations){const v=record();mutate(v);assert.equal(project(v,runId,reason),null)}
})
test('cycles, sparse arrays, oversized arrays/strings/graphs and prototype pollution keys refuse within fixed bounds',()=>{
 const mutations=[v=>v.details.loop=v,v=>v.details.worker_stop=Array(2),v=>v.details.worker_stop=Array.from({length:129},()=>early('prepare')),v=>v.reason='x'.repeat(8193),v=>{v.details.warm=sample();v.details.warm.native=Object.fromEntries(Array.from({length:64},(_,i)=>['k'+i,Array.from({length:128},()=>true)]))},v=>Object.defineProperty(v.details,'__proto__',{enumerable:true,value:{}})]
 for(const mutate of mutations){const v=record();mutate(v);assert.equal(project(v,runId,reason),null)}
})
const fixture=fs.readFileSync(new URL('./helpers/pg18-full069-worker-path-ci-fixture.mjs',import.meta.url),'utf8'),begin=fixture.indexOf('if(r.code!==0){\n'),end=fixture.indexOf("\n   }assertPathCiResult(r.value,s.runId)",begin);assert(begin>=0&&end>begin)
const branch=fixture.slice(begin,end+'\n   }'.length)
function failedBranch(mode){const order=[],writes=[],value=record(),r={code:1,value:{reason}},load=Function('r','s','fixed','observeSelectedHostRuntime','json','privateRead','pathCiOwnedFailureObservation','fs','fail',branch)
 const work=()=>load(r,{runId},{liveStore:'/owned-fixed-store'},()=>order.push('host'),bytes=>{order.push('json');if(mode==='json')throw Error('private');return value},()=>{order.push('privateRead');if(mode==='read')throw Error('secret path');return Buffer.from('{}')},(...args)=>{order.push('project');if(mode==='project')throw Error('secret');return mode==='null'?null:project(...args)},{writeSync(fd,text){order.push('write');if(mode==='write')throw Error('EPIPE');writes.push({fd,value:JSON.parse(text)})}},code=>{order.push('primary');throw Error('full069_path_ci_refused:'+code)})
 return{work,order,writes,r}
}
test('actual failure branch projects only after original safe read/json and before the original primary refusal',()=>{
 const run=failedBranch();assert.throws(run.work,error=>error.message==='full069_path_ci_refused:short_cli_failed');assert.deepEqual(run.order,['host','privateRead','json','project','write','primary']);assert.equal(run.writes.length,1);assert.equal(run.writes[0].fd,1);assert.equal(run.writes[0].value.primary_code,'full069_path_ci_refused:short_cli_failed')
})
test('read/json/project/write failures and rejected observations preserve the exact original primary without raw diagnostics',()=>{
 for(const mode of ['read','json','project','write','null']){const run=failedBranch(mode);assert.throws(run.work,error=>error.message==='full069_path_ci_refused:short_cli_failed');assert.equal(run.order.at(-1),'primary');assert.equal(run.writes.length,0)}
})
test('actual successful branch never opens a failure record or produces failure-observation output',()=>{
 const run=failedBranch();run.r.code=0;run.work();assert.deepEqual(run.order,[]);assert.deepEqual(run.writes,[])
})
