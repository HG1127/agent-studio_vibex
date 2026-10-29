// Pure scheduling/catalog models of the actual test helper functions only.
// No fixture import, driver, SQL execution, process launch or genuine CI claim.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
// Exact previous writerCiApi.final source from e837173c, used only as control.
const previousFinalMethod="async final(){assert.equal((await writerBackendRows(s)).length,0);assert.ok(writerJournal(s).filter(v=>v.phase==='writer_boot_issued').length<=128);return true}"
const ts=createRequire(import.meta.url)('typescript'),fixture=fs.readFileSync(new URL('./helpers/worker-heartbeat-writer-ci-fixture.mjs',import.meta.url),'utf8'),integration=fs.readFileSync(new URL('./worker-heartbeat-writer-ci.integration.mjs',import.meta.url),'utf8'),tree=ts.createSourceFile('fixture.mjs',fixture,ts.ScriptTarget.Latest,true)
const functions=new Map(tree.statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>[n.name.text,n.getText(tree)]))
const actual=names=>names.map(n=>{assert.ok(functions.has(n),n);return functions.get(n)}).join('\n')
let finalMethod,businessCountsMethod;function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(tree)==='final')finalMethod=n.getText(tree);if(ts.isMethodDeclaration(n)&&n.name.getText(tree)==='businessCounts')businessCountsMethod=n.getText(tree);ts.forEachChild(n,visit)}visit(tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='writerCiApi'));assert.ok(finalMethod)
const instance='00000000-0000-4000-8000-000000000001',boot='00000000-0000-4000-8000-000000000002',uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v),gen=i=>'00000000-0000-4000-8000-'+String(i+10).padStart(12,'0')
function model(options={}){
 const kinds=['knowledge_index','knowledge_query'],uid=64001,roles=kinds.map((kind,i)=>({name:'studio_telemetry_tx_'+kind+'_1',oid:400+i})),items=kinds.map((kind,i)=>({kind,slot_no:1,generation:gen(i)})),journal=[{sequence:0,phase:'writer_boot_staged',instance_id:instance,data:{boot_id:boot,uid,bindings:items.map((r,i)=>({...r,role_oid:roles[i].oid}))}}],bound=items.map((item,i)=>({backend_id:gen(i+2),...item,role_oid:roles[i].oid,database_oid:71,backend:{pid:100+i,started:'2026-10-29 10:55:00+00'}}))
 for(const [i,data]of bound.entries()){journal.push({sequence:journal.length,phase:'writer_boot_claimed',instance_id:instance,data:{boot_id:boot,uid,kind:data.kind,slot_no:1,generation:data.generation,role_oid:data.role_oid}});journal.push({sequence:journal.length,phase:'writer_backend_bound',instance_id:instance,data:structuredClone(data)})}
 const ended=bound.map((data,i)=>({sequence:5+i,phase:'writer_backend_ended',instance_id:instance,data:structuredClone(data)})),child={uid,exited:true,exit:{code:0,signal:null},kernelUidVerified:true,mode:'entry',selected:kinds,batch:{boot_id:boot,uid,items},snapshot:{lifecycle:'closed',io:'uncertain'}},queries=[],output=[];let polls=0,live=2
 if(options.mutate)options.mutate({journal,ended,child,bound})
 const state={binding:{roles,database_oid:71},writerStoppedChildren:new Set([child]),writerChildren:new Set(),nativeAdmin:{async query(sql){assert.match(sql,/AS jobs/);return {rows:[{jobs:0,runs:0,reviews:0,queries:0}]}}},telemetry:{async query(sql,args){queries.push({sql,args});assert.match(sql,/AS exact_gone,NOT EXISTS/);assert.ok(bound.some(b=>JSON.stringify(args)===JSON.stringify([b.backend.pid,b.backend.started,71,b.role_oid])));return {rows:[{exact_gone:options.exactGone!==false,role_gone:options.roleGone!==false}]}}}}
 const fail=label=>{throw Error(label)},until=async(check,label,ms)=>{assert.equal(label,'writer_stopped_owned_cleanup');assert.equal(ms,5000);for(let i=0;i<4;i++){polls++;if(i===1&&!options.neverEnded){journal.push(...ended);live=0}if(await check())return}fail(label)}
 const globals={s:state,fail,uuid,until,writerObservationJournal:()=>journal,process:{stdout:{write:line=>output.push(line)}},assert,writerBackendRows:async()=>Array.from({length:live},()=>({query:'PRIVATE_SQL_MUST_NOT_APPEAR'})),writerJournal:()=>Array.from({length:options.issued??7},()=>({phase:'writer_boot_issued'})),stopProcess:async(_s,c)=>{c.exited=true;c.exit={code:options.exitCode??0,signal:options.signal??null}},observeWriterEntryPhase:()=>{}}
 const names=['fields','writerSameEnded','writerBackendAbsent','writerWaitStoppedCleanup','writerFinalInvariantObservation','writerStop'],load=Function(...Object.keys(globals),actual(names)+'\nreturn {wait:writerWaitStoppedCleanup,observe:writerFinalInvariantObservation,stop:writerStop,final:({'+finalMethod+'}).final,legacy:({'+previousFinalMethod+'}).final,businessCounts:({'+businessCountsMethod+'}).businessCounts}')(...Object.values(globals))
 return {state,child,queries,output,journal,ended,bound,wait:()=>load.wait(state,[child]),final:()=>load.final(),legacyFinal:()=>load.legacy(),businessCounts:()=>load.businessCounts(),observe:load.observe,stop:()=>load.stop(state,child),polls:()=>polls,setLive:n=>{live=n},unchanged:()=>structuredClone(child.snapshot)}
}
test('fixed integration remains byte identical and still calls final, exact zero queues, then original Native/Reader/source final',()=>{
 assert.equal(createHash('sha256').update(integration).digest('hex'),'9aad3beaa325e6b980d43b3fa8d79ecfa72fb9a0c0017bc10d6b63c85a95d7a9')
 assert.ok(integration.includes("async()=>{await fixture.writer.final();assert.deepEqual(await fixture.writer.businessCounts(),{jobs:0,runs:0,reviews:0,queries:0});await fixture.final()})"))
 assert.ok(finalMethod.indexOf('await writerWaitStoppedCleanup(s,children)')<finalMethod.indexOf('await writerBackendRows(s)'))
})
test('exact previous final reproduces the process-exit race; actual new final observes both original kinds before the unchanged zero assertion',async()=>{
 const m=model(),before=m.unchanged();await assert.rejects(m.legacyFinal(),error=>error.code==='ERR_ASSERTION');assert.equal(m.queries.length,0);await m.final();assert.equal(m.polls(),2);assert.equal(m.queries.length,2);assert.equal(new Set(m.queries.map(q=>q.args[3])).size,2);assert.deepEqual(m.unchanged(),before)
 const events=m.output.map(line=>JSON.parse(line));assert.ok(events.some(e=>e.phase==='shared_knowledge_cleanup'&&e.code==='passed'));assert.ok(events.some(e=>e.phase==='owned_backend_absence'&&e.code==='passed'));assert.equal(m.output.join('').includes('PRIVATE_SQL'),false)
})
test('missing sibling, different instance or no ended journal never substitutes current generation, raises the 5s budget or clears uncertain state',async()=>{
 for(const options of [{mutate:({ended})=>ended.pop()},{mutate:({ended})=>{ended[1].instance_id=gen(90)}},{neverEnded:true}]){const m=model(options),before=m.unchanged();await assert.rejects(m.final(),/writer_stopped_owned_cleanup/);assert.equal(m.polls(),4);assert.deepEqual(m.unchanged(),before);assert.ok(m.output.map(line=>JSON.parse(line)).some(e=>e.phase==='shared_knowledge_cleanup'&&e.code==='failed'));assert.equal(m.output.map(line=>JSON.parse(line)).some(e=>e.phase==='owned_backend_absence'),false)}
})
test('actual original generation, backend pid/start/database/role, ended order and SQL exact plus role absence are still mandatory',async()=>{
 for(const mutate of [({ended})=>{ended[1].data.generation=gen(90)},({ended})=>{ended[1].data.backend.pid=999},({ended})=>{ended[1].data.role_oid=999},({ended})=>{ended[1].data.database_oid=999},({ended})=>{ended[1].data.backend.started='different'},({ended})=>{ended[1].sequence=1},({ended})=>{ended.push(structuredClone(ended[1]))}])await assert.rejects(model({mutate}).final(),/writer_ci_/)
 for(const option of [{exactGone:false},{roleGone:false}])await assert.rejects(model(option).final(),/writer_ci_stopped_backend_live_after_ended/)
})
test('child must be the actual stopped verified shared entry; original stop still refuses nonzero exit and a signal',async()=>{
 const absent=model();absent.state.writerStoppedChildren.clear();await assert.rejects(absent.final(),error=>error.code==='ERR_ASSERTION');assert.equal(absent.queries.length,0)
 await assert.rejects(model({mutate:({child})=>{child.kernelUidVerified=false}}).final(),/writer_ci_owned_stopped_child/)
 for(const option of [{exitCode:1},{signal:'SIGKILL'}]){const m=model(option);m.state.writerChildren.add(m.child);await assert.rejects(m.stop(),/writer_actual_entry_did_not_exit_gracefully/)}
})
test('closed diagnostics distinguish final phases without raw data; exact 128-issued ceiling and four empty queues remain unchanged',async()=>{
 const m=model();m.observe('untrusted_private_path',false);m.observe('owned_backend_absence','secret');assert.equal(m.output.length,0);await m.final();assert.deepEqual(await m.businessCounts(),{jobs:0,runs:0,reviews:0,queries:0})
 for(const line of m.output){const v=JSON.parse(line);if(v.event==='genuine_writer_ci_stopped_owned_cleanup')continue;assert.deepEqual(Object.keys(v).sort(),['code','event','observed_data_only','phase']);assert.equal(v.event,'genuine_writer_ci_final_invariant_observation');assert.ok(['shared_knowledge_child_selection','shared_knowledge_cleanup','owned_backend_absence','issued_boot_uid_ceiling','empty_business_queues'].includes(v.phase));assert.ok(['passed','failed'].includes(v.code));assert.equal(v.observed_data_only,true)}
 await assert.rejects(model({issued:129}).final(),error=>error.code==='ERR_ASSERTION');await model({issued:128}).final()
})
