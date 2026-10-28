// New synthetic install publisher. Original059 publishers/guards stay untouched.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {requireDescriptivePatchInstallProvisionCi} from '../services/pg-api/tests/helpers/agent-descriptive-patch-operator-install-ci-guard.mjs'
const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'..'),prefix='AGENT_STUDIO_DESCRIPTIVE_INSTALL_CI_'
const fail=code=>{throw Error('descriptive_install_publisher_refused:'+code)}
export async function publishDescriptiveInstallCi(env=process.env){
 const permit=requireDescriptivePatchInstallProvisionCi(env)
 // Every import with staging/Docker/driver effects is below the real gate.
 const stageTools=await import('../services/pg-api/tests/helpers/agent-descriptive-patch-operator-install-ci-stage.mjs'),containers=await import('../services/pg-api/tests/helpers/agent-descriptive-patch-operator-install-ci-containers.mjs')
 const stage=await stageTools.buildDescriptiveInstallStage(permit),loaded=await stageTools.loadVerifiedDescriptiveInstallStage(permit,stage)
 let created
 try{
  created=await containers.createDescriptiveInstallContainers(permit,loaded)
  const childEnv={PATH:path.dirname(process.execPath)+':/usr/local/bin:/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8'}
  for(const key of ['GITHUB_ACTIONS','CI','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','AGENT_STUDIO_PG18_CI_EPHEMERAL','AGENT_STUDIO_PG18_CI_WRITE_APPROVED','AGENT_STUDIO_PG18_CI_HOST','AGENT_STUDIO_PG18_CI_PORT','AGENT_STUDIO_PG18_CI_DATABASE','AGENT_STUDIO_PG18_CI_ADMIN_USER','AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD'])childEnv[key]=env[key]
  Object.assign(childEnv,{[prefix+'EPHEMERAL']:'true',[prefix+'PURPOSE']:'DESCRIPTIVE_060_AUTHENTIC_INSTALL_RESTORE_SYNTHETIC_ONLY',[prefix+'WRITE_APPROVED']:'YES_NEW_DISPOSABLE_CONTAINERS_ONLY',[prefix+'NONCE']:stage.nonce,[prefix+'MAIN_CONTAINER_ID']:created.mainId,[prefix+'RESTORE_CONTAINER_ID']:created.restoreId,[prefix+'IMAGE_ID']:created.imageId,[prefix+'SOURCE_SHA256']:'daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247',[prefix+'SOURCE_MANIFEST_SHA256']:stage.sourceManifestSha,[prefix+'RUNTIME_MANIFEST_SHA256']:stage.runtimeManifestSha,[prefix+'LOCK_SHA256']:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',[prefix+'PACKAGE_SHA256']:'90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'})
  const output=await new Promise((resolve,reject)=>{
   // Plain script: Node --test workers add forbidden execArgv. node:test still
   // runs all tests/reporters when this actual integration script is executed.
   const child=spawn(process.execPath,['--experimental-strip-types',root+'/services/pg-api/tests/agent-descriptive-patch-operator-install-ci.integration.mjs','--run'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true}),chunks=[]
   let size=0;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('descriptive_install_publisher_refused:bounded_test_timeout'))},1200000)
   for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{size+=bytes.length;if(size>4*1024*1024)child.kill('SIGKILL');else chunks.push(bytes)})
   child.once('error',()=>{clearTimeout(timer);reject(Error('descriptive_install_publisher_refused:test_start'))})
   child.once('close',code=>{clearTimeout(timer);const text=Buffer.concat(chunks).toString('utf8');if(code!==0){process.stderr.write(text.slice(-24000));return reject(Error('descriptive_install_publisher_refused:actual_install_tests_failed'))}resolve(text)})
  })
  if(!/tests\s+10\b/.test(output)||!/pass\s+10\b/.test(output)||!/fail\s+0\b/.test(output))fail('expected_real_test_count')
  process.stdout.write(output)
  return Object.freeze({format:'descriptive_install_ci_publisher_result_v2',source_sha256:'daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247',runtime_manifest_sha256:stage.runtimeManifestSha,synthetic_only:true,actual_install_matrix_passed:true,real_target_initialized:false,production_cutover_allowed:false})
 }finally{if(created)await containers.closeDescriptiveInstallContainers(created.lease)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 try{
  // Admission precedes even argument failure, source capture and Docker calls.
  requireDescriptivePatchInstallProvisionCi()
  if(process.argv.length!==3||process.argv[2]!=='--run')fail('arguments')
  process.stdout.write(JSON.stringify(await publishDescriptiveInstallCi())+'\n')
 }catch(error){const code=/^(?:descriptive_install_[a-z_]+(?:_refused|_check)|descriptive_install_ci_refused):[a-zA-Z0-9_]+$/.test(error?.message??'')?error.message:'descriptive_install_publisher_refused:bounded_operation_failed';process.stderr.write(code+'\n');process.exitCode=1}
}
