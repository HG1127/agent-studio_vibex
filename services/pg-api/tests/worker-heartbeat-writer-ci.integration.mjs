// Plain Node entry: the genuine Controller rejects node --test/loader flags.
// No statement below means the authored cases have passed hosted execution.
import {requireWorkerHeartbeatActivationControlCi} from './helpers/worker-heartbeat-activation-control-ci-guard.mjs'
const initialProof=requireWorkerHeartbeatActivationControlCi()
if(process.argv.length!==3||process.argv[2]!=='--run')throw Error('refuse_non_ephemeral_writer_ci')
const {default:assert}=await import('node:assert/strict')
const {performance}=await import('node:perf_hooks')
const {publishWorkerHeartbeatControlCiStages}=await import('./helpers/worker-heartbeat-activation-control-ci-stage.mjs')
const {createWorkerHeartbeatWriterCiFixture}=await import('./helpers/worker-heartbeat-writer-ci-fixture.mjs')
const {parseWorkerHeartbeatSnapshot}=await import('../src/worker-heartbeat-contract.ts')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
let fixture,passed=0,failed=false,cleanupPassed=0,activeCase=null
const until=async(check,label,ms=15000)=>{const end=performance.now()+ms;do{if(await check())return;await wait(25)}while(performance.now()<end);throw Error('writer_ci_timeout_'+label)}
async function check(name,body){activeCase=name;process.stdout.write(JSON.stringify({event:'genuine_writer_ci_case_start',case:name})+'\n');const start=performance.now();await body();passed++;process.stdout.write(JSON.stringify({event:'genuine_writer_ci_case_pass',case:name,duration_ms:Math.round(performance.now()-start),component_only:name.startsWith('component_')})+'\n');activeCase=null}
const changes=action=>kinds.map(kind=>({kind,slot_no:1,action})),row=async kind=>(await fixture.writer.rows()).find(r=>r.kind===kind&&r.slot_no===1)
async function batch(kind){const current=await row(kind),value=fixture.writer.deliveries().find(d=>d.items.some(v=>v.kind===kind&&v.generation===current.generation));assert.ok(value,'actual current completed-publication delivery required');return value}
async function closeFixture(){if(!fixture)return;try{await fixture.close();cleanupPassed++;process.stdout.write(JSON.stringify({event:'genuine_writer_ci_owned_cleanup_pass'})+'\n')}finally{fixture=null}}
async function open(variant,proof){const actual=proof??requireWorkerHeartbeatActivationControlCi(),stages=await publishWorkerHeartbeatControlCiStages(actual);fixture=await createWorkerHeartbeatWriterCiFixture(actual,stages,variant)}
async function stopAll(children){for(const child of children)await fixture.writer.stop(child);await until(async()=>(await fixture.writer.backends()).length===0,'actual_owned_writer_backend_absence')}
try{
 for(const [i,variant]of ['v1','v2_omitted','v2_off'].entries()){
  await open(variant,i===0?initialProof:undefined)
  await check(variant+'_actual_root_publication_has_zero_writer_io',async()=>{await fixture.writer.change(changes('activate'));await fixture.writer.noIo();const snapshot=parseWorkerHeartbeatSnapshot(await fixture.controlledRead());assert.equal(snapshot.workers.length,8);assert.ok(snapshot.workers.every(r=>r.reason==='not_observed'))})
  await check(variant+'_actual_default_off_lifecycle_returns_null_without_credential',async()=>{const child=await fixture.writer.launch({selected:['prepare'],enabled:false});try{const r=await fixture.writer.command(child,{op:'open_lifecycle'});assert.equal(r.ok,true);assert.equal(r.disabled_count,1);await fixture.writer.noIo()}finally{await fixture.writer.stop(child)}})
  await check(variant+'_seven_actual_entry_plan_paths_ignore_enabled_heartbeat',async()=>{for(const selected of [['prepare'],['model'],['workflow_safe'],['workflow_v2'],['agent_autonomous'],['knowledge_index','knowledge_query'],['assessment']]){const child=await fixture.writer.launch({selected,mode:'plan',enabled:true});try{await until(()=>child.messages.some(v=>v.event==='entry_metadata'&&v.plan),'actual_plan_metadata');assert.equal(child.messages.find(v=>v.event==='entry_metadata'&&v.plan).worker_started,false)}finally{await fixture.writer.stop(child)}}await fixture.writer.noIo()})
  await fixture.final();await closeFixture()
 }
 await open('v2_on')
 await check('actual_eight_kind_publication_burns_seven_unique_boot_uids_and_atomic_knowledge_batch',async()=>{
  await fixture.writer.change(changes('activate'));const deliveries=fixture.writer.deliveries();assert.equal(deliveries.length,7);assert.equal(new Set(deliveries.map(v=>v.uid)).size,7)
  const knowledge=await batch('knowledge_index');assert.equal(knowledge.boot_id,(await batch('knowledge_query')).boot_id);assert.equal(knowledge.items.length,2);assert.notEqual(knowledge.items[0].generation,knowledge.items[1].generation)
  assert.equal(fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued').length,7);assert.equal((await fixture.writer.rows()).filter(v=>v.enabled&&v.sequence==='0').length,8)
 })
 await check('actual_native_uid_without_writer_groups_cannot_read_any_boot_leaf_or_connect_any_kind',async()=>{
  const own=await batch('prepare'),others=fixture.writer.deliveries().filter(v=>v.boot_id!==own.boot_id),result=await fixture.writer.kernelAccess({selected:['prepare'],batch:own,extraBatches:others,groups:[],native:true})
  assert.equal(result.capabilities_zero,true);assert.equal(result.no_new_privs,true);assert.ok(result.result.every(v=>!v.readable&&!v.connected))
 })
 await check('actual_per_kind_gid_and_uid0400_file_isolate_prepare_from_all_other_kinds',async()=>{
  const own=await batch('prepare'),others=fixture.writer.deliveries().filter(v=>v.boot_id!==own.boot_id),result=await fixture.writer.kernelAccess({selected:['prepare'],batch:own,extraBatches:others,groups:[62000]})
  assert.equal(result.result.find(v=>v.kind==='prepare').readable,true);assert.equal(result.result.find(v=>v.kind==='prepare').connected,true);assert.ok(result.result.filter(v=>v.kind!=='prepare').every(v=>!v.readable&&!v.connected))
 })
 await check('actual_all_eight_kind_groups_reach_only_their_socket_and_boot_uid_scope',async()=>{
  for(const [index,kind]of kinds.entries()){
   const own=await batch(kind),others=fixture.writer.deliveries().filter(v=>v.boot_id!==own.boot_id),result=await fixture.writer.kernelAccess({selected:[kind],batch:own,extraBatches:others,groups:[62000+index]}),readable=new Set(own.items.map(v=>v.kind))
   for(const item of result.result){assert.equal(item.connected,item.kind===kind);assert.equal(item.readable,readable.has(item.kind))}
  }
 })
 const bound=[]
 await check('component_sequential_eight_real_worker_factories_authenticate_exact_root_issued_tokens',async()=>{
  const start=performance.now();for(const kind of kinds){const child=await fixture.writer.launch({selected:[kind],batch:await batch(kind)});bound.push(child);const kernel=await fixture.writer.command(child,{op:'kernel_credential'});assert.equal(kernel.owner_matches,true);assert.equal(kernel.mode0400,true);assert.equal(kernel.readonly,true);const opened=await fixture.writer.command(child,{op:'open_binding'});assert.equal(opened.ok,true);process.stdout.write(JSON.stringify({event:'genuine_writer_ci_bind_timing',...(await fixture.writer.timing(child)),sequence_policy:'explicit_serial_launcher'})+'\n')}
  const actual=await fixture.writer.backends();assert.equal(actual.length,8);assert.equal(new Set(actual.map(v=>v.usename)).size,8);assert.ok(actual.every(v=>v.usename.startsWith('studio_telemetry_tx_')&&v.role_oid>0));process.stdout.write(JSON.stringify({event:'genuine_writer_ci_eight_bind_elapsed',elapsed_ms:Math.round(performance.now()-start)})+'\n')
 })
 await check('component_eight_real_record_calls_use_minimal_writer_session_never_su',async()=>{
  for(const [i,kind]of kinds.entries()){
   const hold=await fixture.writer.rowLock(kind),work=fixture.writer.command(bound[i],{op:'report',sequence:1});let identity
   try{identity=await fixture.writer.waitWriterRecord(kind);assert.equal(identity.login,'studio_telemetry_tx_'+kind+'_1');assert.equal(identity.record_called_as_su,false)}finally{await hold.release()}
   const result=await work;assert.equal(result.ok,true);assert.equal(result.snapshot.outcome,'acknowledged');const actual=await row(kind);assert.equal(actual.sequence,'1');assert.equal(actual.state,'ready')
  }
  const result=parseWorkerHeartbeatSnapshot(await fixture.controlledRead());assert.ok(result.workers.every(r=>r.state==='ready'&&r.reason==='fresh_ready_report'))
 })
 await check('component_actual_late_committed_ack_keeps_one_uncertain_slot_and_rejects_higher_sequence_and_rebind',async()=>{
  const child=bound[0],result=await fixture.writer.command(child,{op:'late_report',sequence:2},12000)
  assert.equal(result.ok,true);assert.ok(result.actual_block_ms>=6500);assert.equal(result.settled,false);assert.equal(result.snapshot.lifecycle,'closed');assert.equal(result.snapshot.io,'uncertain');const before=await row('prepare');assert.equal(before.sequence,'2')
  assert.equal((await fixture.writer.command(child,{op:'report',sequence:3})).ok,false);assert.equal((await fixture.writer.command(child,{op:'rebind'})).ok,false);assert.deepEqual(await row('prepare'),before)
 })
 await check('actual_mutation_cancels_inflight_record_and_observes_owned_backend_absence_before_publication',async()=>{
  const prepared=await fixture.writer.prepareRotate('model'),hold=await fixture.writer.rowLock('model'),child=bound[1],pending=fixture.writer.command(child,{op:'report',sequence:2},8000).catch(()=>({test_control_reply_missing:true}));let mutation
  try{await fixture.writer.waitWriterRecord('model');mutation=fixture.apply(prepared);await until(async()=>!(await fixture.writer.backends()).some(v=>v.usename==='studio_telemetry_tx_model_1'),'mutating_writer_actual_backend_gone',5000);assert.equal((await fixture.writer.command(child,{op:'snapshot'})).snapshot.io,'uncertain')}finally{await hold.release()}
  const result=await mutation;assert.equal(result.publication_completed,true);assert.equal((await fixture.writer.command(child,{op:'snapshot'})).snapshot.io,'uncertain');assert.equal((await row('model')).sequence,'0');await pending
 })
 await stopAll(bound.slice(1)) // Keep the actual old UID process alive for fencing.
 await check('actual_knowledge_partial_rotation_does_not_rebind_consumed_sibling_to_new_uid',async()=>{
  const count=fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued').length;await fixture.writer.change([{kind:'knowledge_index',slot_no:1,action:'rotate'}]);assert.equal(fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued').length,count)
  const changed=await row('knowledge_index');assert.ok(!fixture.writer.deliveries().some(v=>v.items.some(item=>item.generation===changed.generation)))
  await fixture.writer.change([{kind:'knowledge_index',slot_no:1,action:'rotate'},{kind:'knowledge_query',slot_no:1,action:'rotate'}]);assert.equal((await batch('knowledge_index')).boot_id,(await batch('knowledge_query')).boot_id)
 })
 await check('actual_root_restart_preserves_consumed_uid_and_generation_even_at_sequence_zero',async()=>{
  const own=await batch('knowledge_index'),child=await fixture.writer.launch({selected:['knowledge_index'],batch:own});try{assert.equal((await fixture.writer.command(child,{op:'open_binding'})).ok,true);assert.equal((await row('knowledge_index')).sequence,'0');const issuedBefore=fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued').map(v=>JSON.stringify(v.data));await fixture.writer.restartServing();assert.equal((await fixture.writer.command(child,{op:'rebind'})).ok,false);assert.deepEqual(fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued').map(v=>JSON.stringify(v.data)),issuedBefore)}finally{await fixture.writer.stop(child)}
  const all=fixture.writer.journal().filter(v=>v.phase==='writer_boot_issued');assert.equal(new Set(all.map(v=>v.data.uid)).size,all.length);assert.equal(new Set(all.flatMap(v=>v.data.bindings.map(r=>r.generation))).size,all.reduce((n,v)=>n+v.data.bindings.length,0))
 })
 await fixture.writer.change(changes('rotate'))
 await check('actual_living_old_uid_cannot_read_new_uid0400_mount_or_rebind_new_generation',async()=>{
  const child=bound[0];await fixture.writer.replaceOldMountedCredential(child,'prepare',await batch('prepare'));const actual=await fixture.writer.command(child,{op:'kernel_credential'})
  assert.equal(actual.readable,false);assert.equal(actual.owner_matches,false);assert.equal(actual.mode0400,true);assert.equal(actual.readonly,true);assert.equal((await fixture.writer.command(child,{op:'rebind'})).ok,false);await fixture.writer.stop(child)
 })
 await check('component_concurrent_eight_bind_attempts_have_known_refusals_no_retry_and_no_backend_leak',async()=>{
  const children=await Promise.all(kinds.map(async kind=>fixture.writer.launch({selected:[kind],batch:await batch(kind)}))),hold=await fixture.writer.tableLock(),claimed=fixture.writer.journal().filter(v=>v.phase==='writer_boot_claimed').length,start=performance.now();let first,rest
  try{first=fixture.writer.command(children[0],{op:'open_binding'});await fixture.writer.waitBindBlocked();rest=await Promise.all(children.slice(1).map(c=>fixture.writer.command(c,{op:'open_binding'})));assert.ok(rest.every(v=>v.ok===false));assert.equal(fixture.writer.journal().filter(v=>v.phase==='writer_boot_claimed').length,claimed+1)}finally{await hold.release()}
  assert.equal((await first).ok,true);process.stdout.write(JSON.stringify({event:'genuine_writer_ci_concurrent_bind_result',attempts:8,accepted:1,refused:7,elapsed_ms:Math.round(performance.now()-start),automatic_reconnect:false,launcher_must_serialize:true})+'\n');await stopAll(children)
 })
 await check('seven_actual_business_entries_default_heartbeat_off_start_and_stop_without_any_writer_binding',async()=>{
  await fixture.writer.businessSetup();const before=fixture.writer.journal().filter(v=>v.phase==='writer_boot_claimed').length,counts=await fixture.writer.businessCounts()
  for(const selected of [['prepare'],['model'],['workflow_safe'],['workflow_v2'],['agent_autonomous'],['knowledge_index','knowledge_query'],['assessment']]){const child=await fixture.writer.launch({selected,mode:'entry',enabled:false});try{await fixture.writer.entryReady(child);assert.equal((await fixture.writer.backends()).length,0)}finally{await fixture.writer.stop(child)}}
  assert.equal(fixture.writer.journal().filter(v=>v.phase==='writer_boot_claimed').length,before);assert.deepEqual(await fixture.writer.businessCounts(),counts)
 })
 await fixture.writer.change(changes('rotate'))
 const entries=[],initialTimes=new Map()
 await check('six_actual_entry_launches_complete_real_startup_then_original_30s_reporter_reaches_reader_ready',async()=>{
  const counts=await fixture.writer.businessCounts()
  for(const kind of ['prepare','model','workflow_safe','workflow_v2','agent_autonomous','assessment']){
   const child=await fixture.writer.launch({selected:[kind],mode:'entry',batch:await batch(kind)});entries.push(child);await fixture.writer.entryReady(child);await until(async()=>Number((await row(kind)).sequence)>=1,'entry_actual_initial_report',15000);const first=await row(kind);assert.equal(first.sequence,'1');assert.equal(first.state,'unknown');assert.equal(first.reason,'startup_checks_pending');initialTimes.set(kind,Date.parse(first.observed_at));await wait(1500);process.stdout.write(JSON.stringify({event:'genuine_writer_ci_entry_start',...(await fixture.writer.timing(child)),actual_entry:true})+'\n')
  }
  await fixture.writer.waitReady(entries.map(c=>c.selected[0]));const snapshot=parseWorkerHeartbeatSnapshot(await fixture.controlledRead());for(const c of entries){const kind=c.selected[0],value=snapshot.workers.find(v=>v.kind===kind);assert.equal(value.state,'ready');assert.equal(value.reason,'fresh_ready_report');const delta=Date.parse((await row(kind)).observed_at)-initialTimes.get(kind);assert.ok(delta>=29000);process.stdout.write(JSON.stringify({event:'genuine_writer_ci_actual_reporter_interval',kind,db_observed_delta_ms:delta,configured_interval_ms:30000,send_budget_ms:5000})+'\n')}
  assert.deepEqual(await fixture.writer.businessCounts(),counts)
 })
 await check('six_actual_entry_sigterm_paths_close_and_leave_no_owned_writer_backend',async()=>{await stopAll(entries)})
 await check('actual_shared_knowledge_entry_uses_one_atomic_boot_and_both_actual_startup_hooks',async()=>{
  const own=await batch('knowledge_index');assert.equal(own.items.length,2);const child=await fixture.writer.launch({selected:['knowledge_index','knowledge_query'],mode:'entry',batch:own})
  try{await fixture.writer.entryReady(child);await fixture.writer.waitReady(['knowledge_index','knowledge_query']);const snapshot=parseWorkerHeartbeatSnapshot(await fixture.controlledRead());for(const kind of ['knowledge_index','knowledge_query'])assert.equal(snapshot.workers.find(v=>v.kind===kind).state,'ready')}
  finally{await fixture.writer.stop(child)}
 })
 await check('actual_final_owned_backend_absence_and_unchanged_empty_business_queues',async()=>{await fixture.writer.final();assert.deepEqual(await fixture.writer.businessCounts(),{jobs:0,runs:0,reviews:0,queries:0});await fixture.final()})
}catch(error){failed=true;process.exitCode=1;process.stderr.write(JSON.stringify({event:'genuine_writer_ci_failed',case:activeCase,completed_cases:passed,message:/^(writer_ci_|telemetry_control_ci_fixture_refused:)/.test(String(error?.message))?String(error.message).slice(0,180):'runtime_assertion_failed',production_cutover_allowed:false})+'\n')}
finally{try{await closeFixture()}catch{failed=true;process.exitCode=1;process.stderr.write(JSON.stringify({event:'genuine_writer_ci_owned_cleanup_failed'})+'\n')}process.stdout.write(JSON.stringify({event:'genuine_writer_ci_summary',passed,failed,owned_cleanups:cleanupPassed,production_cutover_allowed:false,synthetic_only:true,real_execution_required:true})+'\n')}
