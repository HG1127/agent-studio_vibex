// Actual close function bodies in pure state models. No PostgreSQL/Root grant.
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const ts=createRequire(import.meta.url)('../node_modules/typescript/lib/typescript.js')
const strip=s=>s.replace(/\/\* OWNED_WRITER_TERMINATION_BEGIN \*\/[\s\S]*?\/\* OWNED_WRITER_TERMINATION_END \*\//g,'')
const candidate=fs.readFileSync(new URL('../src/worker-heartbeat-activation-control.ts',import.meta.url),'utf8')
// A transport-only counterexample removes this scoped termination addition.
// This reference creates no runtime capability or database permission.
const base=strip(candidate).replace(',a.application_name AS application_name FROM',' FROM')
const fixture=fs.readFileSync(new URL('./helpers/worker-heartbeat-writer-ci-fixture.mjs',import.meta.url),'utf8')
const contract=await import('../src/worker-heartbeat-activation-control-contract.ts')
function fn(text,name){const tr=ts.createSourceFile('x.ts',text,ts.ScriptTarget.Latest,true),n=tr.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);return n.getText(tr)}
function model(text,{identity=true,terminate='signal',absence='normal',endError=false,runtimeError=false,wrongPrivateRole=false,wrongApplication=false,privateIdentity=true}={}){
 const trace=[],diagnostics=[],original={pid:71,started:'2026-10-29 04:00:00+00',database_oid:81,role_oid:91,role_name:'studio_telemetry_tx_model_1',application_name:'fixture-owned-writer'},handle={},cap={},rawFailure=Error('original end failure'),runtimeFailure=Error('original runtime failure'),s={writerCleanups:0,writerBackends:new Set(),binding:{database_oid:original.database_oid},runtimeCap:cap},b={s,handle,slot:{kind:'model',slot_no:1,generation:'00000000-0000-4000-8000-000000000001',role_oid:wrongPrivateRole?999:original.role_oid,role_name:original.role_name},backend:identity?{pid:original.pid,started:original.started}:undefined,ownedIdentity:identity&&privateIdentity?Object.freeze({pid:original.pid,started:original.started,database_oid:original.database_oid,role_oid:original.role_oid,login:original.role_name,application_name:original.application_name}):undefined,id:'00000000-0000-4000-8000-000000000002',closed:false}
 let serverAlive=true,signals=0
 const writerFail=code=>{throw Object.assign(Error(code),{code})},backendMap=new WeakMap([[handle,b]]),closedMap=new WeakMap()
 s.writerBackends.add(b);s.runtime={assertWorkerHeartbeatActivationControlRuntime:v=>{assert.equal(v,cap);trace.push('runtime');if(runtimeError)throw runtimeFailure}}
 b.raw={async end(){trace.push('client_end');if(endError)throw rawFailure;/* Ending transport need not stop a blocked server statement. */}}
 s.raw={async query(sql,values){trace.push('terminate_query');assert.match(sql,/SELECT pg_terminate_backend\(a\.pid\)/);assert.match(sql,/a\.pid=\$1/);assert.match(sql,/a\.backend_start=\$2::timestamptz/);assert.match(sql,/a\.datid=\$3::oid/);assert.match(sql,/r\.oid=\$4::oid/);assert.match(sql,/r\.rolname=\$5::text/);assert.match(sql,/a\.usename=\$5::text/);assert.match(sql,/a\.application_name=\$6::text/);assert.match(sql,/a\.pid<>pg_backend_pid\(\)/);assert.deepEqual([...values],[original.pid,original.started,original.database_oid,b.slot.role_oid,original.role_name,original.application_name]);
  if(terminate==='error')throw Object.assign(Error('query failed'),{code:'EIO'})
  if(terminate==='false')return {rows:[{stopped:false}]}
  const exact=values[0]===original.pid&&values[1]===original.started&&values[2]===original.database_oid&&values[3]===original.role_oid&&values[4]===original.role_name&&values[5]===(wrongApplication?'different-application':original.application_name)
  if(terminate==='gone'){serverAlive=false;return {rows:[]}}
  if(!exact)return {rows:[]}
  signals++;serverAlive=false;return {rows:[{stopped:true}]}
 }}
 const ctx=vm.createContext({host:()=>trace.push('host'),rootWriterBackends:backendMap,rootWriterClosedBackends:closedMap,writerFail,observeRootControlFailure:(site,error)=>diagnostics.push({site,error}),
  rootWriterObserver:async(_s,body)=>{trace.push('discover');return body({query:async()=>({rows:[{pid:original.pid,started:original.started}]})})},
  waitRootWriterBackendGone:async(_s,backend)=>{trace.push('actual_absence');assert.deepEqual({pid:backend.pid,started:backend.started},{pid:original.pid,started:original.started});if(absence==='unknown'||serverAlive)writerFail('writer_uncertain')},
  append:(_s,phase,_action,data)=>{trace.push('journal:'+phase);assert.equal(serverAlive,false);assert.equal(data.backend.pid,original.pid);assert.deepEqual(Object.keys(data.backend).sort(),['pid','started'])},
 })
 const code=[fn(text,'rootWriterCleanupCheck'),fn(text,'rootWriterCleanupAwait'),fn(text,'closeRootWriterBackend')].join('\n')
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.close=closeRootWriterBackend',ctx)
 return {ctx,s,b,trace,diagnostics,original,rawFailure,runtimeFailure,backendMap,closedMap,signals:()=>signals,serverAlive:()=>serverAlive}
}
test('owned-backend cleanup retains the existing 2s absence barrier and Reader5s/Native8s budgets',()=>{
 assert.equal(contract.controlLimits.leaseMs,5000);assert.equal(contract.controlLimits.nativeBudgetMs,8000)
 assert.ok(fn(candidate,'waitRootWriterBackendGone').includes('performance.now()+2000'))
 const close=fn(candidate,'closeRootWriterBackend')
 assert.ok(close.indexOf('await waitRootWriterBackendGone')<close.indexOf("append(s,'writer_backend_ended'"))
 assert.ok(close.includes('rootWriterCleanupAwait(s,'));assert.ok(candidate.includes('observeRootReaderFailure'))
})

test('actual identity function captures the verified application privately, rechecks every query and preserves two-field journal identity',async()=>{
 const slot={role_name:'studio_telemetry_tx_model_1',role_oid:91},binding={database:'agent_studio_telemetry',database_oid:81,server_addr:'127.0.0.1',server_port:5333},row={database:binding.database,database_oid:'81',login:slot.role_name,actor:slot.role_name,role_oid:'91',login_enabled:true,inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:1,config:null,expires:null,no_memberships:true,address:binding.server_addr,port:binding.server_port,version:180006,encoding:'UTF8',primary:true,pid:71,backend_start:'2026-10-29 04:00:00+00',application_name:'fixture-owned-writer'}
 const sql=candidate.split('\n').find(line=>line.startsWith('const writerIdentitySQL='));assert.ok(sql.includes('a.application_name AS application_name FROM'))
 let queries=0,guards=0,current={...row}
 const b={raw:{async query(text){queries++;assert.ok(text.includes('a.application_name AS application_name FROM'));return {rows:[current]}}}},op={slot,s:{binding}},writerFail=code=>{throw Object.assign(Error(code),{code})}
 const ctx=vm.createContext({writerFail,rootWriterAwait:async(_op,body)=>{assert.equal(_op,op);guards++;const value=await body();guards++;return value}})
 vm.runInContext(ts.transpileModule(sql+'\n'+fn(candidate,'verifyRootWriterIdentity'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.verify=verifyRootWriterIdentity',ctx)
 const identity=await ctx.verify(op,b);assert.deepEqual(Object.keys(identity).sort(),['pid','started']);assert.equal(identity.pid,71);assert.equal(Object.isFrozen(b.ownedIdentity),true);assert.deepEqual(Object.keys(b.ownedIdentity).sort(),['application_name','database_oid','login','pid','role_oid','started']);assert.equal(b.ownedIdentity.application_name,row.application_name)
 b.backend=identity;const first=b.ownedIdentity;await ctx.verify(op,b);assert.equal(b.ownedIdentity,first);assert.equal(queries,2);assert.equal(guards,4)
 current={...row,application_name:'changed'};await assert.rejects(ctx.verify(op,b),e=>e.code==='writer_not_enrolled');assert.equal(b.ownedIdentity,first)
 current={...row,application_name:undefined};await assert.rejects(ctx.verify(op,b),e=>e.code==='writer_not_enrolled')
 for(const change of [{login:'other'},{actor:'other'},{role_oid:'92'},{database_oid:'82'},{pid:72},{backend_start:'different'},{super:true},{config:[]},{no_memberships:false}]){current={...row,...change};await assert.rejects(ctx.verify(op,b),e=>e.code==='writer_not_enrolled');assert.equal(b.ownedIdentity,first)}
 assert.equal(queries,13);assert.equal(guards,26)
})
test('counterexample: actual old close body cannot prove absence when transport closes but server statement stays active; new body signals exact original backend',async()=>{
 const old=model(base);await assert.rejects(old.ctx.close(old.s,old.b),e=>e.code==='writer_uncertain');assert.equal(old.s.writerCleanups,1);assert.equal(old.b.closed,false);assert.equal(old.signals(),0)
 const next=model(candidate);await next.ctx.close(next.s,next.b);assert.equal(next.signals(),1);assert.equal(next.s.writerCleanups,0);assert.equal(next.b.closed,true);assert.equal(next.s.writerBackends.size,0);assert.equal(next.backendMap.has(next.b.handle),false);assert.equal(next.closedMap.get(next.b.handle),next.s)
 const t=next.trace;assert.ok(t.indexOf('client_end')<t.indexOf('terminate_query'));assert.ok(t.indexOf('terminate_query')<t.indexOf('actual_absence'));assert.ok(t.indexOf('actual_absence')<t.indexOf('journal:writer_backend_ended'))
})
test('success reuses original cached close; no second termination, generation/sequence reset or query retry',async()=>{
 const m=model(candidate);await m.ctx.close(m.s,m.b);const first=m.trace.slice();await m.ctx.close(m.s,m.b);assert.deepEqual(m.trace,first);assert.equal(m.signals(),1);assert.equal(m.b.slot.generation,'00000000-0000-4000-8000-000000000001')
})
test('zero-row signal result still requires actual absence; false/error/absence failure retains original unknown occupancy and cached rejection',async()=>{
 const gone=model(candidate,{terminate:'gone'});await gone.ctx.close(gone.s,gone.b);assert.equal(gone.signals(),0);assert.ok(gone.trace.includes('actual_absence'));assert.equal(gone.b.closed,true)
 for(const option of [{terminate:'false'},{terminate:'error'},{absence:'unknown'}]){const m=model(candidate,option);let original;try{await m.ctx.close(m.s,m.b)}catch(e){original=e}assert.ok(original);assert.equal(m.s.writerCleanups,1);assert.equal(m.b.closed,false);assert.equal(m.s.writerBackends.has(m.b),true);assert.equal(m.trace.some(x=>x.startsWith('journal:')),false);const before=m.trace.slice();await assert.rejects(m.ctx.close(m.s,m.b),e=>e===original);assert.deepEqual(m.trace,before)}
})
test('role-only backend discovered after end never supplies termination authority',async()=>{
 const m=model(candidate,{identity:false});await assert.rejects(m.ctx.close(m.s,m.b),e=>e.code==='writer_uncertain');assert.ok(m.trace.includes('discover'));assert.ok(m.trace.includes('actual_absence'));assert.equal(m.trace.includes('terminate_query'),false);assert.equal(m.signals(),0);assert.equal(m.s.writerCleanups,1)
})
test('mismatched private role cannot terminate a different role session even with matchingPID/start/database',async()=>{
 const m=model(candidate,{wrongPrivateRole:true});await assert.rejects(m.ctx.close(m.s,m.b),e=>e.code==='writer_uncertain');assert.equal(m.signals(),0);assert.equal(m.serverAlive(),true);assert.equal(m.b.closed,false);assert.equal(m.s.writerCleanups,1)
})

test('missing prior private identity or changed actual application prevents signalling and retains the real absence barrier',async()=>{
 for(const options of [{privateIdentity:false},{wrongApplication:true}]){const m=model(candidate,options);await assert.rejects(m.ctx.close(m.s,m.b),e=>e.code==='writer_uncertain');assert.equal(m.signals(),0);assert.equal(m.serverAlive(),true);assert.equal(m.b.closed,false);assert.equal(m.s.writerCleanups,1);assert.ok(m.trace.includes('actual_absence'));assert.equal(m.trace.some(x=>x.startsWith('journal:')),false)}
})
test('original source/runtime or end failure prevents new termination and never releases cleanup',async()=>{
 const end=model(candidate,{endError:true});await assert.rejects(end.ctx.close(end.s,end.b),e=>e===end.rawFailure);assert.equal(end.trace.includes('terminate_query'),false);assert.equal(end.s.writerCleanups,1)
 const runtime=model(candidate,{runtimeError:true});await assert.rejects(runtime.ctx.close(runtime.s,runtime.b),e=>e===runtime.runtimeFailure);assert.equal(runtime.trace.includes('client_end'),false);assert.equal(runtime.trace.includes('terminate_query'),false);assert.equal(runtime.s.writerCleanups,1)
})
test('the one new cleanup site is accepted by the original strict Writer collector and extra/stdout/private fields stay rejected',()=>{
 const ctx=vm.createContext({fields:contract.controlObject});vm.runInContext(fn(fixture,'writerControlFailureObservation')+'\nglobalThis.project=writerControlFailureObservation',ctx)
 const record={event:'worker_heartbeat_control_failure_observation',site:'cleanup_terminate_owned',kind:'writer_uncertain',observed_data_only:true}
 assert.equal(ctx.project(record,'stderr').site,record.site);assert.equal(ctx.project(record,'stdout'),null);assert.equal(ctx.project({...record,pid:71},'stderr'),null);assert.equal(ctx.project({...record,kind:'secret'},'stderr'),null)
 const observation=candidate.slice(candidate.indexOf('const rootFailureObservationSites'),candidate.indexOf('const rootFailureObservationKinds'))
 assert.ok(observation.includes('cleanup_terminate_owned'))
})
