// This entry is plain Node, not a test runner: the genuine cold controller
// rejects loader/test flags and never accepts this CI proof as its authority.
import {requireWorkerHeartbeatActivationControlCi} from './helpers/worker-heartbeat-activation-control-ci-guard.mjs'

const proof=requireWorkerHeartbeatActivationControlCi()
if(process.argv.length!==3||process.argv[2]!=='--run')throw Error('refuse_non_ephemeral_telemetry_control_ci')
const {default:assert}=await import('node:assert/strict')
const {publishWorkerHeartbeatControlCiStages}=await import('./helpers/worker-heartbeat-activation-control-ci-stage.mjs')
const {createWorkerHeartbeatActivationControlCiFixture}=await import('./helpers/worker-heartbeat-activation-control-ci-fixture.mjs')
const {parseWorkerHeartbeatSnapshot}=await import('../src/worker-heartbeat-contract.ts')
let fixture,count=0,failed=false
const check=async(name,run)=>{await run();count++;process.stdout.write(JSON.stringify({event:'genuine_telemetry_control_case_pass',case:name})+'\n')}
const snapshot=value=>{const s=parseWorkerHeartbeatSnapshot(value);assert.equal(s.workers.length,8);return s}
const unavailable=value=>{assert.equal(value.error?.status,503);assert.equal(value.error?.code,'company_worker_heartbeats_unavailable')}
try{
 const stages=await publishWorkerHeartbeatControlCiStages(proof)
 fixture=await createWorkerHeartbeatActivationControlCiFixture(proof,stages)
 await check('actual_dormant_catalog_boot_is_closed',async()=>{const s=await fixture.inspect();assert.equal(s.phase,'closed');assert.equal(s.read_gate,'closed');assert.equal(s.is_activation_capability,false)})
 await check('native_missing_cookie_is_401',async()=>{assert.equal((await fixture.nativeReadMissing()).error?.status,401)})
 await check('native_real_employee_is_403',async()=>{assert.equal((await fixture.nativeReadEmployee()).error?.status,403)})
 await check('native_real_admin_has_no_snapshot_before_activation',async()=>unavailable(await fixture.nativeReadAdmin()))
 await check('signed_actual_first_activation_commits_and_publishes',async()=>{const r=await fixture.activateFirst();assert.equal(r.commit_acknowledged,true);assert.equal(r.after_verified,true);assert.equal(r.automatic_retry_authorized,false);assert.equal((await fixture.inspect()).read_gate,'open')})
 await check('controlled_reader_has_eight_truthful_initial_rows',async()=>{const s=snapshot(await fixture.controlledRead());assert.equal(s.workers[0].reason,'not_observed');for(const r of s.workers.slice(1)){assert.equal(r.state,'unknown');assert.equal(r.reason,'not_instrumented')}})
 await check('actual_scoped_writer_records_first_sequence',async()=>{assert.deepEqual(await fixture.recordFirst({sequence:1,state:'ready',reason:'startup_checks_complete'}),{accepted:true,sequence:1})})
 await check('nonroot_native_admin_reads_actual_ready_snapshot',async()=>{const r=await fixture.nativeReadAdmin(),s=snapshot(r.snapshot);assert.equal(s.workers[0].state,'ready');assert.equal(s.workers[0].reason,'fresh_ready_report');assert.equal(r.local.timedOut,0)})
 await check('finished_socket_read_is_one_use',()=>fixture.assertReplayRefused())
 await check('writer_rotation_fences_prepared_old_epoch_read',async()=>{const old=await fixture.openRead();try{await old.prepare();await fixture.rotateFirst();await assert.rejects(()=>old.finish())}finally{await old.close();await fixture.waitReadersClean()}})
 await check('new_writer_generation_starts_unobserved',async()=>{assert.equal(snapshot(await fixture.controlledRead()).workers[0].reason,'not_observed')})
 await check('new_generation_accepts_sequence_one_and_reports_draining',async()=>{await fixture.recordFirst({sequence:1,state:'draining',reason:'new_claims_closed'});const s=snapshot((await fixture.nativeReadAdmin()).snapshot);assert.equal(s.workers[0].state,'draining');assert.equal(s.workers[0].reason,'fresh_draining_report')})
 await check('actual_reader_capacity_two_and_lease_expiry',()=>fixture.assertCapacityAndExpiry())
 await check('reader_nologin_with_real_active_history_remains_manageable',async()=>{await fixture.disableReader();assert.equal((await fixture.inspect()).read_gate,'closed');unavailable(await fixture.nativeReadAdmin());await fixture.verify()})
 await check('signed_reader_reenable_keeps_real_history',async()=>{await fixture.enableReader();assert.equal((await fixture.inspect()).read_gate,'open');assert.equal(snapshot((await fixture.nativeReadAdmin()).snapshot).workers[0].state,'draining')})
 await check('actual_committed_transaction_with_dropped_ack_requires_readonly_recovery_and_new_signed_resume',async()=>{const r=await fixture.rotateFirstWithCommitAckLoss();assert.equal(r.recovery.observed,'after_matches');assert.equal(r.recovery.original_commit_acknowledged,false);assert.equal(r.recovery.automatic_retry_authorized,false);assert.equal(r.recovery.read_gate_opened,false);assert.equal(r.resumed.read_gate,'open')})
 await check('recovered_rotation_has_no_fabricated_new_generation_heartbeat',async()=>{const s=snapshot((await fixture.nativeReadAdmin()).snapshot);assert.equal(s.workers[0].state,'unknown');assert.equal(s.workers[0].reason,'not_observed')})
 await check('retired_writer_is_disabled_without_false_liveness',async()=>{await fixture.retireFirst();const r=snapshot((await fixture.nativeReadAdmin()).snapshot).workers[0];assert.equal(r.state,'unknown');assert.equal(r.reason,'component_disabled')})
 await check('restart_with_signed_closed_profile_keeps_read_gate_closed',async()=>{const old=(await fixture.inspect()).instance_id,s=await fixture.restart();assert.notEqual(s.instance_id,old);assert.equal(s.phase,'closed');assert.equal(s.read_gate,'closed');unavailable(await fixture.nativeReadAdmin())})
 await check('untouched_native_schema_and_synthetic_accounts_jobs_runs',()=>fixture.final())
}catch(error){failed=true;const e={event:'genuine_telemetry_control_failed',completed_cases:count,name:error?.name??'Error',message:String(error?.message??'unknown').slice(0,180)};process.stderr.write(JSON.stringify(e)+'\n');process.exitCode=1}
finally{
 if(fixture)try{await fixture.close();process.stdout.write(JSON.stringify({event:'genuine_telemetry_control_owned_cleanup_pass'})+'\n')}catch{failed=true;process.stderr.write(JSON.stringify({event:'genuine_telemetry_control_owned_cleanup_failed'})+'\n');process.exitCode=1}
 process.stdout.write(JSON.stringify({event:'genuine_telemetry_control_summary',passed:count,failed,production_cutover_allowed:false,synthetic_only:true})+'\n')
}
