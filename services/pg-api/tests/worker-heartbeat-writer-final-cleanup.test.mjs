// Pure comparisons execute the ORIGINAL profile, makeApi/writerCiApi, stop and
// cleanup function bodies. Only terminal FS/process/SQL observations are fake.
// No fixture import, driver, real process, SQL, network or genuine CI execution.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const previousV17Final="async final(){\n  // The fixed integration already stopped this exact two-kind child. A child\n  // exit precedes Root cleanup. Reuse the ORIGINAL read-only 5s observation,\n  // with its staged/claimed/bound instance and both original generations.\n  const children=[...s.writerStoppedChildren].filter(c=>c.mode==='entry'&&c.batch&&Array.isArray(c.selected)&&c.selected.length===2&&c.selected[0]==='knowledge_index'&&c.selected[1]==='knowledge_query')\n  writerFinalInvariantObservation('shared_knowledge_child_selection',children.length===1);assert.equal(children.length,1)\n  try{await writerWaitStoppedCleanup(s,children);writerFinalInvariantObservation('shared_knowledge_cleanup',true)}catch(error){writerFinalInvariantObservation('shared_knowledge_cleanup',false);throw error}\n  const backends=await writerBackendRows(s);writerFinalInvariantObservation('owned_backend_absence',backends.length===0);assert.equal(backends.length,0)\n  const issued=writerJournal(s).filter(v=>v.phase==='writer_boot_issued');writerFinalInvariantObservation('issued_boot_uid_ceiling',issued.length<=128);assert.ok(issued.length<=128);return true\n }"
const ts=createRequire(import.meta.url)('typescript'),fixture=fs.readFileSync(new URL('./helpers/worker-heartbeat-writer-ci-fixture.mjs',import.meta.url),'utf8'),integration=fs.readFileSync(new URL('./worker-heartbeat-writer-ci.integration.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('fixture.mjs',fixture,ts.ScriptTarget.Latest,true)
assert.equal(tree.parseDiagnostics.length,0)
const functions=new Map(tree.statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>[n.name.text,n.getText(tree)])),actual=names=>names.map(n=>{assert.ok(functions.has(n),n);return functions.get(n)}).join('\n')
const kindsDeclaration=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='kinds')).getText(tree)
const instance='00000000-0000-4000-8000-000000000001',boot='00000000-0000-4000-8000-000000000002',uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v),gen=i=>'00000000-0000-4000-8000-'+String(i+10).padStart(12,'0')
function model(options={}){
 const selected=['knowledge_index','knowledge_query'],roles=selected.map((kind,i)=>({name:'studio_telemetry_tx_'+kind+'_1',oid:400+i})),items=selected.map((kind,i)=>({kind,slot_no:1,generation:gen(i)})),journal=[],queries=[],output=[],killSignals=[],lifecycle=[]
 let polls=0,live=2,backendReads=0,resolveStop
 const stopGate=new Promise(resolve=>{resolveStop=resolve}),state={workspace:{uid:61001,gid:61002},writerVariant:'v2_on',binding:{roles,database_oid:71},children:new Set(),nativeAdmin:{async query(sql){assert.match(sql,/AS jobs/);return {rows:[{jobs:0,runs:0,reviews:0,queries:0}]}}},telemetry:{async query(sql,args){queries.push({sql,args});assert.match(sql,/AS exact_gone,NOT EXISTS/);assert.ok(bound.some(b=>JSON.stringify(args)===JSON.stringify([b.backend.pid,b.backend.started,71,b.role_oid])));return {rows:[{exact_gone:options.exactGone!==false,role_gone:options.roleGone!==false}]}}}}
 const fail=label=>{throw Error(label)},until=async(check,label,ms)=>{
  if(label==='own_child_term_timeout'){assert.equal(ms,12000);lifecycle.push('original_stop_wait');if(options.deferStop)await stopGate;if(!await check())fail(label);return}
  assert.equal(label,'writer_stopped_owned_cleanup');assert.equal(ms,5000);for(let i=0;i<4;i++){polls++;if(i===1&&!options.neverEnded){journal.push(...ended);live=0}if(await check())return}fail(label)
 }
 const globals={s:state,fail,uuid,until,fs:{readFileSync(file,encoding){assert.equal(file,'/etc/passwd');assert.equal(encoding,'utf8');return 'root:x:0:0:root:/root:/bin/sh\n'}},writerObservationJournal:()=>journal,process:{stdout:{write:line=>output.push(line)}},assert,writerBackendRows:async()=>{backendReads++;return Array.from({length:options.liveAfterCleanup?1:live},()=>({query:'PRIVATE_SQL_MUST_NOT_APPEAR'}))},writerJournal:()=>Array.from({length:options.issued??7},()=>({phase:'writer_boot_issued'})),observeWriterEntryPhase:()=>{}}
 const names=['fields','writerCiProfile','writerSameEnded','writerBackendAbsent','writerWaitStoppedCleanup','writerFinalInvariantObservation','stopProcess','writerStop','writerCiApi','makeApi'],load=Function(...Object.keys(globals),kindsDeclaration+'\n'+actual(names)+'\nwriterCiProfile(s,{protocol:"worker_heartbeat_control_profile_v2"});return {api:makeApi(s).writer,rawStop:writerStop,legacy:({'+previousV17Final+'}).final,observe:writerFinalInvariantObservation}')(...Object.values(globals))
 // Do not create, populate or replace writerStoppedChildren in this harness.
 // The genuine writerCiProfile body above must initialize its real WeakSet.
 assert.equal(state.writerStoppedChildren instanceof WeakSet,true);assert.equal(state.writerStoppedChildren[Symbol.iterator],undefined)
 const uid=state.writerSettings.boot_uids[0],batch={boot_id:boot,uid,items},bound=items.map((item,i)=>({backend_id:gen(i+2),...item,role_oid:roles[i].oid,database_oid:71,backend:{pid:100+i,started:'2026-10-29 10:55:00+00'}}))
 journal.push({sequence:0,phase:'writer_boot_staged',instance_id:instance,data:{boot_id:boot,uid,bindings:items.map((r,i)=>({...r,role_oid:roles[i].oid}))}})
 for(const data of bound){journal.push({sequence:journal.length,phase:'writer_boot_claimed',instance_id:instance,data:{boot_id:boot,uid,kind:data.kind,slot_no:1,generation:data.generation,role_oid:data.role_oid}});journal.push({sequence:journal.length,phase:'writer_backend_bound',instance_id:instance,data:structuredClone(data)})}
 const ended=bound.map((data,i)=>({sequence:5+i,phase:'writer_backend_ended',instance_id:instance,data:structuredClone(data)}))
 const makeChild=(extra={})=>{const c={uid,exited:false,exit:null,kernelUidVerified:true,mode:'entry',selected:[...selected],batch,snapshot:{lifecycle:'closed',io:'uncertain'},...extra};c.p={kill(signal){killSignals.push(signal);lifecycle.push('original_process_kill');if(!options.deferStop){c.exited=true;c.exit={code:options.exitCode??0,signal:options.signal??null}}}};state.children.add(c);state.writerChildren.add(c);return c},child=makeChild()
 if(options.mutate)options.mutate({journal,ended,child,bound})
 return {state,child,queries,output,journal,ended,bound,killSignals,lifecycle,api:load.api,addChild:makeChild,stop:c=>load.api.stop(c??child),rawStop:c=>load.rawStop(state,c??child),final:()=>load.api.final(),legacy:()=>load.legacy(),businessCounts:()=>load.api.businessCounts(),observe:load.observe,polls:()=>polls,backendReads:()=>backendReads,unchanged:()=>structuredClone(child.snapshot),releaseStop(){child.exited=true;child.exit={code:0,signal:null};resolveStop()}}
}
async function stopped(options){const m=model(options);await m.stop();return m}
test('fixed integration, real factory WeakSet and original stop provenance are retained',async()=>{
 assert.equal(createHash('sha256').update(integration).digest('hex'),'d15cc0c671d7d057d687fc6b0c3747a2abfd7b3a163d9405ddb8debcfee6f158')
 assert.ok(integration.includes('finally{await fixture.writer.stop(child)}'));assert.ok(integration.includes('await fixture.writer.final();assert.deepEqual(await fixture.writer.businessCounts(),{jobs:0,runs:0,reviews:0,queries:0});await fixture.final()'))
 const m=model();assert.equal(m.state.writerStoppedChildren.has(m.child),false);await m.stop();assert.equal(m.state.writerStoppedChildren.has(m.child),true);assert.equal(m.state.writerChildren.has(m.child),false);assert.equal(m.state.children.has(m.child),false);assert.deepEqual(m.killSignals,['SIGTERM']);assert.deepEqual(m.lifecycle,['original_process_kill','original_stop_wait']);assert.throws(()=>[...m.state.writerStoppedChildren],TypeError)
})
test('exact v17 final reproduces TypeError before diagnostics on the actual factory WeakSet; real new API observes original cleanup',async()=>{
 const m=await stopped(),before=m.unchanged();await assert.rejects(m.legacy(),TypeError);assert.equal(m.output.length,0);assert.equal(m.queries.length,0);await m.final();assert.equal(m.polls(),2);assert.equal(m.queries.length,2);assert.equal(new Set(m.queries.map(q=>q.args[3])).size,2);assert.equal(m.backendReads(),1);assert.deepEqual(m.unchanged(),before);assert.equal(m.output.join('').includes('PRIVATE_SQL'),false)
})
test('stop wrapper records no observation before original stop settles successfully',async()=>{
 const m=model({deferStop:true}),pending=m.stop();assert.equal(m.state.writerStoppedChildren.has(m.child),false);await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION');assert.equal(m.queries.length,0);m.releaseStop();await pending;assert.equal(m.state.writerStoppedChildren.has(m.child),true);await m.final();assert.equal(m.backendReads(),1)
})
test('WeakSet membership from a raw stop cannot invent the API observation reference',async()=>{
 const m=model();await m.rawStop();assert.equal(m.state.writerStoppedChildren.has(m.child),true);await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION');assert.equal(m.queries.length,0);assert.equal(m.backendReads(),0)
})
test('unowned, failed, non-shared and unissued stops never populate shared final observations',async()=>{
 for(const option of [{exitCode:1},{signal:'SIGKILL'}]){const m=model(option);await assert.rejects(m.stop(),/writer_actual_entry_did_not_exit_gracefully/);assert.equal(m.state.writerStoppedChildren.has(m.child),false);await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION')}
 const unowned=model();unowned.state.writerChildren.delete(unowned.child);await assert.rejects(unowned.stop(),/writer_ci_owned_writer_stop/);await assert.rejects(unowned.final(),e=>e.code==='ERR_ASSERTION');assert.equal(unowned.killSignals.length,0)
 for(const mutate of [({child})=>{child.mode='component'},({child})=>{child.selected=['knowledge_index']},({child})=>{child.batch=null}]){const m=await stopped({mutate});await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION');assert.equal(m.queries.length,0)}
})
test('two observed actual stopped shared entries remain an ambiguity, without overwrite or arbitrary child selection',async()=>{
 const m=await stopped(),second=m.addChild();await m.stop(second);assert.equal(m.state.writerStoppedChildren.has(second),true);await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION');assert.equal(m.queries.length,0);assert.equal(m.backendReads(),0)
})
test('original fixed 5s observation still requires both sibling ends and the actual original instance',async()=>{
 for(const options of [{mutate:({ended})=>ended.pop()},{mutate:({ended})=>{ended[1].instance_id=gen(90)}},{neverEnded:true}]){const m=await stopped(options),before=m.unchanged();await assert.rejects(m.final(),/writer_stopped_owned_cleanup/);assert.equal(m.polls(),4);assert.deepEqual(m.unchanged(),before);assert.equal(m.backendReads(),0);assert.ok(m.output.map(line=>JSON.parse(line)).some(e=>e.phase==='shared_knowledge_cleanup'&&e.code==='failed'))}
})
test('original generation, exact backend identity, original stop WeakSet, journal order and SQL absence stay mandatory',async()=>{
 for(const mutate of [({ended})=>{ended[1].data.generation=gen(90)},({ended})=>{ended[1].data.backend.pid=999},({ended})=>{ended[1].data.role_oid=999},({ended})=>{ended[1].data.database_oid=999},({ended})=>{ended[1].data.backend.started='different'},({ended})=>{ended[1].sequence=1},({ended})=>{ended.push(structuredClone(ended[1]))}]){const m=await stopped({mutate});await assert.rejects(m.final(),/writer_ci_/)}
 for(const options of [{exactGone:false},{roleGone:false},{mutate:({child})=>{child.kernelUidVerified=false}}]){const m=await stopped(options);await assert.rejects(m.final(),/writer_ci_/)}
 const revoked=await stopped();revoked.state.writerStoppedChildren.delete(revoked.child);await assert.rejects(revoked.final(),/writer_ci_owned_stopped_child/)
})
test('global backend zero remains a single original assertion without a new global retry',async()=>{
 const m=await stopped({liveAfterCleanup:true});await assert.rejects(m.final(),e=>e.code==='ERR_ASSERTION');assert.equal(m.backendReads(),1);assert.equal(m.polls(),2);assert.ok(m.output.map(line=>JSON.parse(line)).some(e=>e.phase==='owned_backend_absence'&&e.code==='failed'))
})
test('closed phase diagnostics, exact 128 UID ceiling, four zero queues and uncertain child state remain intact',async()=>{
 const m=await stopped(),before=m.unchanged();m.observe('untrusted_private_path',false);m.observe('owned_backend_absence','secret');assert.equal(m.output.length,0);await m.final();assert.deepEqual(await m.businessCounts(),{jobs:0,runs:0,reviews:0,queries:0});assert.deepEqual(m.unchanged(),before)
 for(const line of m.output){const v=JSON.parse(line);if(v.event==='genuine_writer_ci_stopped_owned_cleanup')continue;assert.deepEqual(Object.keys(v).sort(),['code','event','observed_data_only','phase']);assert.equal(v.event,'genuine_writer_ci_final_invariant_observation');assert.ok(['shared_knowledge_child_selection','shared_knowledge_cleanup','owned_backend_absence','issued_boot_uid_ceiling','empty_business_queues'].includes(v.phase));assert.ok(['passed','failed'].includes(v.code));assert.equal(v.observed_data_only,true)}
 const over=await stopped({issued:129});await assert.rejects(over.final(),e=>e.code==='ERR_ASSERTION');await (await stopped({issued:128})).final()
})
