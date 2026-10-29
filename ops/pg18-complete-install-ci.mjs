// New-purpose, disposable hosted CI only. No automatic import-time execution.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireCompleteProfileProvisionCi} from '../services/pg-api/tests/helpers/pg18-complete-install-ci-guard.mjs'
const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'..')
const phase=name=>console.log(JSON.stringify({event:'complete066_ci_phase',phase:name,synthetic_only:true,production_GO:false}))
export async function runCompleteInstallCi(argv,env=process.env){
 if(argv.length!==1||argv[0]!=='--run')throw Error('complete_install_ci_refused:arguments')
 const permit=requireCompleteProfileProvisionCi(env)
 phase('admitted_new_disposable_job')
 const [{buildCompleteProfileStage,loadVerifiedCompleteProfileStage},{createCompleteProfileContainers,closeCompleteProfileContainers},{spawn}]=await Promise.all([import('../services/pg-api/tests/helpers/pg18-complete-install-ci-stage.mjs'),import('../services/pg-api/tests/helpers/pg18-complete-install-ci-containers.mjs'),import('node:child_process')])
 phase('build_protected_stage')
 const stage=await buildCompleteProfileStage(permit)
 phase('load_verified_stage')
 const loaded=await loadVerifiedCompleteProfileStage(permit,stage)
 let owned
 try{
  phase('create_owned_empty_clusters')
  owned=await createCompleteProfileContainers(permit,loaded)
  phase('run_actual_cli_fixture')
  const keys=['PATH','HOME','LANG','CI','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME']
  const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>keys.includes(key)||key.startsWith('AGENT_STUDIO_PG18_CI_')||key.startsWith('AGENT_STUDIO_COMPLETE_PROFILE_CI_')))
  const prefix='AGENT_STUDIO_COMPLETE_PROFILE_CI_'
  for(const [key,value]of Object.entries({PROFILE_SHA256:stage.profileSha,NONCE:stage.nonce,MAIN_CONTAINER_ID:owned.mainId,RESTORE_CONTAINER_ID:owned.restoreId,IMAGE_ID:owned.imageId,SOURCE_SHA256:'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67',SOURCE_MANIFEST_SHA256:stage.sourceManifestSha,RUNTIME_MANIFEST_SHA256:stage.runtimeManifestSha,LOCK_SHA256:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',PACKAGE_SHA256:'90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'}))childEnv[prefix+key]=value
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/tests/pg18-complete-install-ci.integration.mjs'),'--run'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],detached:true,windowsHide:true})
   let bytes=0,stopping=false,killTimer
   // This Linux-only process group was created by this invocation. Wait for
   // its close before touching owned containers; never act on a discovered PID.
   const stop=()=>{if(stopping)return;stopping=true;if(Number.isSafeInteger(child.pid)&&child.pid>1){try{process.kill(-child.pid,'SIGTERM')}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},5000)}}
   const timer=setTimeout(stop,900000)
   for(const [stream,dest]of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576){stop();return}dest.write(chunk)})
   child.once('error',()=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);reject(Error('complete_install_ci_refused:owned_fixture_start'))});child.once('close',code=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);code===0&&!stopping&&bytes<=1048576?resolve():reject(Error('complete_install_ci_refused:owned_fixture_failed'))})
  })
  return {profile:'complete066',actual_genuine_fixture_completed:true,synthetic_only:true,production_GO:false}
 }finally{if(owned){phase('close_owned_clusters');await closeCompleteProfileContainers(owned.lease);phase('owned_clusters_closed')}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){try{console.log(JSON.stringify(await runCompleteInstallCi(process.argv.slice(2))))}catch(error){const text=Object.getOwnPropertyDescriptor(error??{},'message')?.value;console.error(typeof text==='string'&&/^(?:complete_install_(?:ci|stage|container)_refused:[a-z_]+|descriptive_patch_operator_(?:runtime|source)_refused|refuse_non_ephemeral_pg18_ci)$/.test(text)?text:'complete_install_ci_refused:operation_failed');process.exitCode=1}}
