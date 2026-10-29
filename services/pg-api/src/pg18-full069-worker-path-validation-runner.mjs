// Same genuine warm-launch capabilities and exact collector as --run. This
// independent caller never invokes runFull069WorkerLive, BEGIN, END or its clock.
import {performance} from 'node:perf_hooks'
import {setTimeout as delay} from 'node:timers/promises'
import {openFull069WorkerLiveTrust,liveContext,openLiveRunStore,retireLiveTrust} from './pg18-full069-worker-live-trust.mjs'
import {openFull069WorkerLiveRuntime,full069WorkerLivePreflight,observeFull069WorkerLiveRuntime,closeFull069WorkerLiveRuntime} from './pg18-full069-worker-live-runtime.mjs'
import {openFull069OwnedProcesses,launchFull069OwnedProcess,waitFull069NativeListening,stopFull069OwnedWorkers,stopFull069OwnedNative} from './pg18-full069-worker-live-processes.mjs'
import {openFull069OwnedNative,closeFull069OwnedNative} from './pg18-full069-worker-live-native.mjs'
import {collectFull069WorkerLiveSample} from './pg18-full069-worker-live-runner.mjs'
import {liveEntries,liveFail} from './pg18-full069-worker-live-contract.mjs'
import {assertPathValidationHost,openPathValidationGuard,assertPathValidationStable,pathValidationProvenance,writePathValidationRecord} from './pg18-full069-worker-path-validation-guard.mjs'
import {pathValidationLimits,pathValidationResult} from './pg18-full069-worker-path-validation-contract.mjs'
const code=e=>typeof e?.message==='string'&&/^full069_worker_live_[a-z_]{1,80}$/.test(e.message)?e.message:'full069_worker_live_path_validation_dependency_refused'
export async function runFull069WorkerPathValidation(){
 assertPathValidationHost();let trust,guard,runtime,processes,native,ctx,warm,last,preflight,workerStop=[],nativeStop,proxyStop,cleanup,reason=null,completed=false,interrupted=false,recordSha=null
 const signal=()=>{interrupted=true};process.on('SIGTERM',signal);process.on('SIGINT',signal)
 try{
  trust=await openFull069WorkerLiveTrust(true);ctx=liveContext(trust);guard=openPathValidationGuard(trust);openLiveRunStore(trust);runtime=await openFull069WorkerLiveRuntime(trust);preflight=full069WorkerLivePreflight(runtime);processes=openFull069OwnedProcesses(trust)
  assertPathValidationStable(guard);await launchFull069OwnedProcess(processes,'native');await waitFull069NativeListening(processes);native=await openFull069OwnedNative(trust,processes)
  for(const entry of liveEntries){if(interrupted)liveFail('path_validation_interrupted');assertPathValidationStable(guard);await launchFull069OwnedProcess(processes,entry.id)}
  const until=performance.now()+pathValidationLimits.warmMs;while(performance.now()<until){if(interrupted)liveFail('path_validation_interrupted');assertPathValidationStable(guard);const current=await collectFull069WorkerLiveSample(trust,runtime,processes,native,{ready:false});if(current.native.workers.every(w=>w.state==='ready'&&w.reason==='fresh_ready_report')){warm=await collectFull069WorkerLiveSample(trust,runtime,processes,native,{ready:true,initial:true});break}await delay(2000)}if(!warm)liveFail('path_validation_warmup')
  assertPathValidationStable(guard);writePathValidationRecord(guard,'validation-warm.json',pathValidationResult(ctx.profile.run_id,false,null,{phase:'warm',provenance:pathValidationProvenance(guard),preflight,observation:warm}))
  const start=performance.now(),wall=Date.now();while(performance.now()-start<pathValidationLimits.holdMs||Date.now()-wall<pathValidationLimits.holdMs){if(interrupted)liveFail('path_validation_interrupted');if(performance.now()-start>60000)liveFail('path_validation_clock');await delay(250)}
  assertPathValidationStable(guard);last=await collectFull069WorkerLiveSample(trust,runtime,processes,native,{ready:true});if(last.runtime.bindings.some((b,i)=>b.generation!==warm.runtime.bindings[i].generation||BigInt(b.sequence)<=BigInt(warm.runtime.bindings[i].sequence)))liveFail('path_validation_original_reporter_missing')
  workerStop=await stopFull069OwnedWorkers(processes);if(workerStop.length!==7||workerStop.some(r=>!r.graceful||!r.absent||!r.supervisor_absent||!r.identity_verified||r.forced))liveFail('path_validation_worker_stop')
  const cleanupUntil=performance.now()+12000;while(true){try{cleanup=await observeFull069WorkerLiveRuntime(runtime,{ready:false,ended:true,finalAudit:true});break}catch(error){if(!['full069_worker_live_backend_end_missing','full069_worker_live_telemetry_backends_remain'].includes(code(error))||performance.now()>=cleanupUntil)throw error;await delay(100)}}
  if(cleanup.telemetry_backend_count!==0||cleanup.readers_in_flight!==0)liveFail('path_validation_backend_remains');proxyStop=await closeFull069OwnedNative(native);native=null;nativeStop=await stopFull069OwnedNative(processes);if(!proxyStop.graceful||!nativeStop?.graceful||!nativeStop.absent||!nativeStop.supervisor_absent)liveFail('path_validation_native_stop');await closeFull069WorkerLiveRuntime(runtime);runtime=null;assertPathValidationStable(guard);completed=true
 }catch(error){reason=code(error)}finally{
  if(processes&&!workerStop.length)try{workerStop=await stopFull069OwnedWorkers(processes)}catch{reason??='full069_worker_live_path_validation_cleanup'}
  if(native)try{proxyStop=await closeFull069OwnedNative(native)}catch{reason??='full069_worker_live_path_validation_cleanup'}
  if(processes&&!nativeStop)try{nativeStop=await stopFull069OwnedNative(processes)}catch{reason??='full069_worker_live_path_validation_cleanup'}
  if(runtime&&!cleanup)try{cleanup=await observeFull069WorkerLiveRuntime(runtime,{ready:false});if(cleanup.telemetry_backend_count!==0||cleanup.readers_in_flight!==0)reason??='full069_worker_live_path_validation_cleanup'}catch{reason??='full069_worker_live_path_validation_cleanup_unverified'}
  if(runtime)try{await closeFull069WorkerLiveRuntime(runtime)}catch{reason??='full069_worker_live_path_validation_pool_close'}
  if(reason)completed=false
  if(guard&&ctx)try{recordSha=writePathValidationRecord(guard,'validation-result.json',pathValidationResult(ctx.profile.run_id,completed,reason,{source_sha256:ctx.profile.source_sha256,complete_source_sha256:ctx.profile.complete_source_sha256,warm:warm??null,last:last??null,worker_stop:workerStop,native_stop:nativeStop??null,proxy_stop:proxyStop??null,cleanup:cleanup??null}))}catch{completed=false;reason??='full069_worker_live_path_validation_record_unavailable'}
  if(trust)retireLiveTrust(trust);process.off('SIGTERM',signal);process.off('SIGINT',signal)
 }
 // A guard failure before the signed run context exists yields no success DTO.
 if(!ctx)throw Error(reason??'full069_worker_live_path_validation_not_started');return pathValidationResult(ctx.profile.run_id,completed,reason,{record_sha256:recordSha})
}
