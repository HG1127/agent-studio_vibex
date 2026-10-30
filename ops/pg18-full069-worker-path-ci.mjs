// Bounded continuation in the original complete-profile isolated CI job.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireCompleteProfileProvisionCi} from '../services/pg-api/tests/helpers/pg18-complete-install-ci-guard.mjs'
import {requirePathCiApproval} from '../services/pg-api/tests/helpers/pg18-full069-worker-path-ci-contract.mjs'
const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'..')
export async function runFull069WorkerPathCi(argv,env=process.env){
 if(argv.length!==1||argv[0]!=='--run')throw Error('full069_path_ci_refused:arguments')
 const permit=requireCompleteProfileProvisionCi(env);requirePathCiApproval(env)
 const [{buildCompleteProfileStage,loadVerifiedCompleteProfileStage},{createCompleteProfileContainers,closeCompleteProfileContainers},{spawn}]=await Promise.all([import('../services/pg-api/tests/helpers/pg18-complete-install-ci-stage.mjs'),import('../services/pg-api/tests/helpers/pg18-complete-install-ci-containers.mjs'),import('node:child_process')])
 const stage=await buildCompleteProfileStage(permit),loaded=await loadVerifiedCompleteProfileStage(permit,stage);let owned
 try{
  owned=await createCompleteProfileContainers(permit,loaded)
  const keys=['PATH','HOME','LANG','CI','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','GITHUB_SHA','AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED']
  const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>keys.includes(key)||key.startsWith('AGENT_STUDIO_PG18_CI_')||key.startsWith('AGENT_STUDIO_COMPLETE_PROFILE_CI_'))),prefix='AGENT_STUDIO_COMPLETE_PROFILE_CI_'
  for(const[key,value]of Object.entries({PROFILE_SHA256:stage.profileSha,NONCE:stage.nonce,MAIN_CONTAINER_ID:owned.mainId,RESTORE_CONTAINER_ID:owned.restoreId,IMAGE_ID:owned.imageId,SOURCE_SHA256:'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67',SOURCE_MANIFEST_SHA256:stage.sourceManifestSha,RUNTIME_MANIFEST_SHA256:stage.runtimeManifestSha,LOCK_SHA256:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',PACKAGE_SHA256:'90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'}))childEnv[prefix+key]=value
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types',root+'/services/pg-api/tests/pg18-full069-worker-path-ci.integration.mjs','--run'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],detached:true,windowsHide:true})
   let bytes=0,stopping=false,killer
   const stop=()=>{if(stopping)return;stopping=true;if(Number.isSafeInteger(child.pid)&&child.pid>1){try{process.kill(-child.pid,'SIGTERM')}catch{}killer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},5000)}}
   const timer=setTimeout(stop,900000)
   const relay=(b,destination)=>{bytes+=b.length;if(bytes>1048576){stop();return}destination.write(b)};child.stdout.on('data',b=>relay(b,process.stdout));child.stderr.on('data',b=>relay(b,process.stderr))
   child.once('error',()=>{clearTimeout(timer);if(killer)clearTimeout(killer);reject(Error('full069_path_ci_refused:owned_fixture_start'))});child.once('close',code=>{clearTimeout(timer);if(killer)clearTimeout(killer);if(code===0&&!stopping&&bytes<=1048576){resolve(undefined);return}
    // This invocation created this detached group. On a failed fixture, finish
    // its owned descendants before the finally block touches owned containers.
    if(Number.isSafeInteger(child.pid)&&child.pid>1)try{process.kill(-child.pid,'SIGTERM')}catch{}
    setTimeout(()=>{if(Number.isSafeInteger(child.pid)&&child.pid>1)try{process.kill(-child.pid,'SIGKILL')}catch{}reject(Error('full069_path_ci_refused:owned_fixture_failed'))},5000)
   })
  })
  return {format:'pg18_full069_worker_path_ci_summary_v1',actual_bounded_worker_path_completed:true,qualifies_run:false,qualifying_window_started:false,BEGIN_or_END_receipt_issued:false,production_cutover_allowed:false}
 }finally{if(owned)await closeCompleteProfileContainers(owned.lease)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here)try{console.log(JSON.stringify(await runFull069WorkerPathCi(process.argv.slice(2))))}catch{console.error('FULL069_WORKER_PATH_CI_REFUSED');process.exitCode=1}
