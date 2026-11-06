import test from 'node:test'
import assert from 'node:assert/strict'
import {final13FixtureBudget as budget,inspectFinal13ActorAnnouncement,runOwnedFinal13Fixture,final13FixtureContainersMayClose,inspectFinal13ActorExecutable,inspectFinal13GroupAbsence} from '../ops/pg18-full069-final-fixture-process.mjs'
const fixture={fixture_pid:101,fixture_start_ticks:'500',stage_nonce:'a'.repeat(64)},message=()=>({format:'full069_final13_owned_actor_group_v1',phase:'spawned',...fixture,actor_pid:102,actor_start_ticks:'600',node_sha256:'b'.repeat(64),qualifies_run:false,production_GO:false}),kernel=()=>({pid:102,parent_pid:101,start_ticks:'600',process_group:102,session:102,uids:[0,0,0,0],gids:[0,0,0,0]})
test('new fixture stop budget retains all original C and seven Worker budgets',()=>{assert.equal(budget.original_qualification_minimum_ms,86400000);assert.equal(budget.original_reader_ms,5000);assert.equal(budget.original_native_ms,8000);assert.equal(budget.original_worker_heartbeat_ms,30000);assert.equal(budget.original_send_ms,5000);const minimum=7*17000+5*75000+17000+12000+5000+8000+30000+5000;assert.ok(budget.actor_stop_ms>=minimum);assert.ok(budget.fixture_stop_ms>=budget.actor_stop_ms+36*10000+30*10000+17000+150000);assert.ok(56*60000>=budget.fixture_run_ms+budget.fixture_stop_ms+budget.post_kill_ms);assert.ok(budget.job_minutes*60000>=15*60000+56*60000+15*60000+20*60000)})
test('actual birth comparison yields data only and cannot mint container cleanup authority',()=>{const v=inspectFinal13ActorAnnouncement(message(),fixture,kernel());assert.equal(v.record_only,true);assert.equal(v.runtime_authorization,false);assert.equal(v.qualifies_run,false);assert.equal(final13FixtureContainersMayClose(v),false);assert.equal(final13FixtureContainersMayClose(Error('fake')),false)})
for(const field of ['fixture_pid','fixture_start_ticks','stage_nonce','actor_pid','actor_start_ticks','node_sha256','qualifies_run','production_GO'])test('IPC closed record rejects substituted '+field,()=>{const v=message();v[field]=typeof v[field]==='number'?999:typeof v[field]==='boolean'?true:'invalid';assert.throws(()=>inspectFinal13ActorAnnouncement(v,fixture,kernel()))})
for(const field of ['parent_pid','start_ticks','process_group','session','uids','gids'])test('actual measured birth rejects '+field,()=>{const k=kernel();k[field]=Array.isArray(k[field])?[0,0,1001,0]:typeof k[field]==='number'?999:'700';assert.throws(()=>inspectFinal13ActorAnnouncement(message(),fixture,k))})
test('settled record remains data and rejects unknown or caller authority fields',()=>{const v=message();v.phase='settled';assert.equal(inspectFinal13ActorAnnouncement(v,fixture,null).runtime_authorization,false);v.cleanup_authorized=true;assert.throws(()=>inspectFinal13ActorAnnouncement(v,fixture,null))})
test('caller DTO cannot start a fixture or obtain a private cleanup proof',async()=>{await assert.rejects(runOwnedFinal13Fixture({}, {}, {}));assert.equal(final13FixtureContainersMayClose({fixture:{pid:1},actor:{pid:2}}),false)})

function executableEvidence(){const actor={...kernel(),argv:['private-node','fixed-script']},node={dev:41n,ino:9001n,size:128n,mtimeNs:5000001n,ctimeNs:5000002n,mode:0o100555n,uid:0n,gid:0n,nlink:1n};return {actor,before:structuredClone(actor),after:structuredClone(actor),nodeBefore:structuredClone(node),nodeAfter:structuredClone(node),nodePath:structuredClone(node),exeBefore:{dev:node.dev,ino:node.ino},exeAfter:{dev:node.dev,ino:node.ino}}}
const inspectExecutable=e=>inspectFinal13ActorExecutable(e.actor,e.before,e.after,e.nodeBefore,e.nodeAfter,e.nodePath,e.exeBefore,e.exeAfter)
test('same actual actor and exact private Node inode comparison stays record-only',()=>{const evidence=executableEvidence(),result=inspectExecutable(evidence);assert.equal(result.actual_executable_bound,true);assert.equal(result.record_only,true);assert.equal(result.runtime_authorization,false);assert.equal(result.qualifies_run,false);assert.equal(final13FixtureContainersMayClose(result),false)})
for(const [name,edit]of[
 ['same argv and claimed SHA with different actual executable inode',e=>e.exeBefore.ino++],
 ['same inode number on a different device before reading',e=>e.exeBefore.dev++],
 ['actual executable inode changes while Node FD is read',e=>e.exeAfter.ino++],
 ['actual executable device changes while Node FD is read',e=>e.exeAfter.dev++],
 ['before PID substituted',e=>e.before.pid++],
 ['before PID generation substituted',e=>e.before.start_ticks='601'],
 ['after PID substituted',e=>e.after.pid++],
 ['after PID generation substituted',e=>e.after.start_ticks='601'],
 ['actor parent changes during inspection',e=>e.after.parent_pid++],
 ['actor process group changes during inspection',e=>e.after.process_group++],
 ['actor session changes during inspection',e=>e.after.session++],
 ['stable FD metadata changes at nanosecond precision',e=>e.nodeAfter.mtimeNs++],
 ['private Node path is replaced by a different inode',e=>e.nodePath.ino++],
 ['lossy numeric dev/inode claims replace exact bigint metadata',e=>e.nodeBefore.dev=41]
])test('executable binding refuses '+name,()=>{const evidence=executableEvidence();edit(evidence);assert.throws(()=>inspectExecutable(evidence),/actor_node_executable/)})

test('only exact kernel ESRCH confirms absence even when enumeration is stale',()=>{for(const pids of[[],[102]]){const result=inspectFinal13GroupAbsence(pids,{status:'error',code:'ESRCH'});assert.equal(result.absent,true);assert.equal(result.kernel_result,'ESRCH');assert.equal(result.record_only,true);assert.equal(result.runtime_authorization,false);assert.equal(final13FixtureContainersMayClose(result),false)}})
test('empty enumeration with successful kernel probe keeps the group present',()=>{const result=inspectFinal13GroupAbsence([],{status:'success',code:null});assert.equal(result.absent,false);assert.equal(result.kernel_present,true);assert.equal(result.kernel_result,'present_not_enumerated');assert.equal(result.observed_member_count,0)})
test('enumerated members with successful kernel probe remain present',()=>{const result=inspectFinal13GroupAbsence([102,103],{status:'success',code:null});assert.equal(result.absent,false);assert.equal(result.kernel_result,'present')})
for(const code of['EPERM','EACCES','EINVAL','UNKNOWN','ESRCH_OTHER'])test('empty enumeration and '+code+' never confirm absence',()=>{const result=inspectFinal13GroupAbsence([],{status:'error',code});assert.equal(result.absent,false);assert.equal(result.kernel_present,false);assert.equal(result.kernel_result,'unknown');assert.equal(final13FixtureContainersMayClose(result),false)})
for(const [name,pids,probe]of[
 ['success with an ESRCH claim',[],{status:'success',code:'ESRCH'}],
 ['caller-supplied retired flag',[],{status:'error',code:'ESRCH',retired:true}],
 ['missing error code',[],{status:'error',code:null}],
 ['non-array enumeration',null,{status:'error',code:'ESRCH'}],
 ['invalid enumerated PID',[0],{status:'error',code:'ESRCH'}],
 ['duplicate enumerated PID',[102,102],{status:'error',code:'ESRCH'}]
])test('kernel absence comparison refuses '+name,()=>assert.throws(()=>inspectFinal13GroupAbsence(pids,probe),/group_probe_shape/))
