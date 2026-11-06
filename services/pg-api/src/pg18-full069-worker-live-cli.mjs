#!/usr/bin/env node
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {liveEntries,liveLimits,freeze} from './pg18-full069-worker-live-contract.mjs'
export function full069WorkerLivePlan(){return freeze({format:'pg18_full069_worker_live_plan_v2',database:'agent_studio',telemetry_database:'agent_studio_telemetry',target:'postgres@127.0.0.1:5333',workers:liveEntries,limits:liveLimits,original_seven_serve_entries:true,knowledge_pair_one_process:true,assessment_independent_login_required:true,executor_preflight:'separate_original_operator_when_enabled',C_preparation:'immutable_record_only_not_live_readiness',start_end:'independent_operator_Ed25519_acknowledgements',automatic_restart:false,automatic_rebind:false,uid_reuse:false,old_protocols_changed:false,old_success_receipts_reused:false,network_used:false,secrets_read:false,writes_performed:false,qualifying_window_started:false,qualifies_run:false,production_cutover_allowed:false})}
export async function full069WorkerLiveCli(argv){
 if(argv.length!==1||!['--plan','--inspect-live','--run'].includes(argv[0]))throw Error('full069_worker_live_arguments')
 if(argv[0]==='--plan')return full069WorkerLivePlan()
 // Refuse an ordinary host before loading a runtime, reading a profile or driver.
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(x=>x!=='--experimental-strip-types')||process.env.AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED!=='true'||argv[0]==='--run'&&process.env.AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED!=='RUN_DISPOSABLE_FULL069_WORKER_QUALIFICATION_ONLY')throw Error('full069_worker_live_host')
 const {inspectFull069WorkerLive,runFull069WorkerLive}=await import('./pg18-full069-worker-live-runner.mjs');return argv[0]==='--run'?runFull069WorkerLive():inspectFull069WorkerLive()
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const result=await full069WorkerLiveCli(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');if(result.qualifies_run===false&&process.argv[2]==='--run')process.exitCode=1}catch{process.stderr.write('FULL069_WORKER_LIVE_REFUSED\n');process.exitCode=1}
