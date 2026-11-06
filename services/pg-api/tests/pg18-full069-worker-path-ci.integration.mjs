// Genuine complete069 owned-target admission precedes every effectful import.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireCompleteProfileFixtureCi} from './helpers/pg18-complete-install-ci-guard.mjs'
import {requirePathCiApproval} from './helpers/pg18-full069-worker-path-ci-contract.mjs'
export async function runFull069WorkerPathCiFixture(argv,env=process.env){
 if(argv.length!==1||argv[0]!=='--run')throw Error('full069_path_ci_refused:arguments')
 const permit=requireCompleteProfileFixtureCi(env);requirePathCiApproval(env)
 const {runOwnedFull069WorkerPathCi}=await import('./helpers/pg18-full069-worker-path-ci-fixture.mjs')
 return runOwnedFull069WorkerPathCi(permit)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(await runFull069WorkerPathCiFixture(process.argv.slice(2))))}catch(error){const message=Object.getOwnPropertyDescriptor(error??{},'message')?.value;console.error(JSON.stringify({event:'full069_worker_path_ci_failure',code:typeof message==='string'&&/^(?:full069_path_ci_refused:[a-z_]+|refuse_non_ephemeral_pg18_ci)$/.test(message)?message:'owned_path_operation_failed',qualifies_run:false,qualifying_window_started:false,BEGIN_or_END_receipt_issued:false,production_cutover_allowed:false}));process.exitCode=1}
