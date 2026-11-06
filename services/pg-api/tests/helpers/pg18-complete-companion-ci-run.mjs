#!/usr/bin/env node
// Actual hosted-CI entry in the DEPLOYED readonly final tree. It opens B's real
// final trust/runtime itself, never a caller context/Pool/PID or fake adapter.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'
import {requireCompleteProfileFixtureCi} from './pg18-complete-install-ci-guard.mjs'
import {companionCiPurpose,companionCiF05Purpose,parseFinalCompanionCiArgs,companionCiReportShape,companionCiFail as fail} from './pg18-complete-companion-ci-contract.mjs'
import {openFull069FinalTrust,finalContext,assertFinalStable,openFinalRunStore,retireFinalTrust} from '../../src/pg18-full069-final-trust.mjs'
import {openFull069FinalRuntime,full069FinalPreflight,closeFull069FinalRuntime} from '../../src/pg18-full069-final-runtime.mjs'
import {openFull069FinalCompanions,preflightFull069FinalCompanions,startFull069FinalCompanions,observeFull069FinalCompanions,stopFull069FinalCompanions} from '../../src/pg18-full069-final-companions.mjs'
function admission(){requireCompleteProfileFixtureCi();if(process.env.AGENT_STUDIO_COMPANION_CI_PURPOSE!==companionCiPurpose||process.env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE!==companionCiF05Purpose)fail('new_purpose_required')}
export async function runActualFiveCompanionCi(argv){
 const cfg=parseFinalCompanionCiArgs(argv);admission();let trust,runtime,handle,stops
 try{
  trust=await openFull069FinalTrust(true);const ctx=finalContext(trust);assertFinalStable(trust)
  if(ctx.source.complete.source_sha256!==cfg.completeSha||ctx.source.source_sha256!==cfg.finalSha||JSON.stringify(ctx.bindings.business_target)!==JSON.stringify(cfg.target))fail('signed_source_or_target_mismatch')
  openFinalRunStore(trust);runtime=await openFull069FinalRuntime(trust);const fourteen=full069FinalPreflight(runtime);if(fourteen.actual_service_logins!==14||fourteen.full069_current_catalog!==true||fourteen.assessment_design_independent_logins!==true||fourteen.executor_independent_login!==true||fourteen.qualifies_run!==false)fail('genuine_final_runtime')
  handle=openFull069FinalCompanions(trust);const preflights=await preflightFull069FinalCompanions(handle),startup=await startFull069FinalCompanions(handle)
  const before=await observeFull069FinalCompanions(handle,{ready:false});await delay(5000);const current=await observeFull069FinalCompanions(handle,{ready:true}),after=await observeFull069FinalCompanions(handle,{ready:false}),identity=rows=>JSON.stringify(rows.map(({id,pid,start_ticks,supervisor_pid,supervisor_start_ticks,uid,gid})=>({id,pid,start_ticks,supervisor_pid,supervisor_start_ticks,uid,gid})))
  if(identity(before)!==identity(current)||identity(current)!==identity(after))fail('actual_identity_changed');assertFinalStable(trust)
  stops=await stopFull069FinalCompanions(handle);handle=null
  if(stops.length!==5||stops.some(s=>!s.graceful||s.forced||!s.identity_verified||!s.absent||!s.supervisor_absent||s.profile_stable!==true))fail('actual_stop')
  await closeFull069FinalRuntime(runtime);runtime=null;assertFinalStable(trust)
  const result={format:'complete069_five_companion_actual_v1',complete_source_sha256:cfg.completeSha,final_source_sha256:cfg.finalSha,target:cfg.target,actual_preflights:preflights.length,actual_original_processes:startup.length,fresh_TLS_brokers:current.filter(r=>r.readiness?.TLS_verified===true).length,actual_F05_worker:current.some(r=>r.id==='plan_workflow_worker'&&r.readiness?.original_serve_worker_report===true&&r.current_readiness===true),preflights,startup:current,stops,all_graceful:stops.every(s=>s.graceful),no_forced_stop:stops.every(s=>!s.forced),all_owned_processes_absent:stops.every(s=>s.absent&&s.supervisor_absent),qualification_started:false,minimum_duration_observed:false,qualifies_run:false,production_GO:false}
  companionCiReportShape(result);return result
 }finally{if(handle)try{stops=await stopFull069FinalCompanions(handle)}catch{}if(runtime)await closeFull069FinalRuntime(runtime).catch(()=>{});if(trust)retireFinalTrust(trust)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{process.stdout.write(JSON.stringify(await runActualFiveCompanionCi(process.argv.slice(2)))+'\n')}catch(error){const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof v==='string'&&/^(?:complete_companion_ci_[a-z_]+|full069_final_[a-z0-9_]{1,120}|full069_worker_live_[a-z0-9_]{1,120}|complete_install_ci_refused:[a-z_]+|refuse_non_ephemeral_pg18_ci)$/.test(v)?v+'\n':'complete_companion_ci_actual_failed\n');process.exitCode=1}
