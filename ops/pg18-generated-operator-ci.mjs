#!/usr/bin/env node
// Hosted synthetic operator orchestration only. Default is a side-effect-free
// plan; the explicit GHA/root guard precedes imports, paths, Docker and installs.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {createHash,randomBytes} from 'node:crypto'
import {execFileSync,spawnSync} from 'node:child_process'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const prefix='AGENT_STUDIO_GENERATED_OPERATOR_CI_',image='pgvector/pgvector:0.8.7-pg18'
const workflow='Agent Studio PG18 generated operator isolated verification',job='pg18-generated-operator'
const pgVersion='8.23.1',pgIntegrity='sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ=='
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const sum=bytes=>createHash('sha256').update(bytes).digest('hex')
const fail=reason=>{throw Error('generated_operator_ci_setup_refused:'+reason)}
const json=value=>JSON.stringify(value,null,2)+'\n'
const positive=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)
const safeRelative=value=>typeof value==='string'&&/^[A-Za-z0-9_@./+-]+$/.test(value)&&!value.startsWith('/')&&value.split('/').every(p=>p&&p!=='.'&&p!=='..')

export function generatedOperatorCiPlan(){return {mode:'plan',synthetic_only:true,workflow,job,image,main:{host:'127.0.0.1',port:5333,database:'agent_studio'},restore:{host:'127.0.0.1',port:5334,database:'agent_studio_restore'},pg_version:pgVersion,parser_version:'5.9.3',source_guard_unchanged:true,dependency_installation_performed:false,network_used:false,secret_read:false,containers_started:false,production_cutover_allowed:false}}
export function requireGeneratedOperatorProvisionCi(env=process.env){
 const allowed=['EPHEMERAL','PURPOSE','WRITE_APPROVED']
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||
  env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
  env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||
  !['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!positive(env.GITHUB_RUN_ID)||!positive(env.GITHUB_RUN_ATTEMPT)||
  env[prefix+'EPHEMERAL']!=='true'||env[prefix+'PURPOSE']!=='GENERATED_059_OPERATOR_SYNTHETIC_ONLY'||env[prefix+'WRITE_APPROVED']!=='YES_DISPOSABLE_GENERATED_OPERATOR_ONLY'||
  Object.keys(env).some(k=>env[k]!==undefined&&(k==='DATABASE_URL'||/^PG[A-Z_]/.test(k)||k.startsWith(prefix)&&!allowed.includes(k.slice(prefix.length))||
   ['NODE_OPTIONS','NODE_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DOCKER_HOST','DOCKER_CONTEXT','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH'].includes(k))))fail('environment')
 return Object.freeze({run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT})
}
function yamlParser(){
 const base=path.join(root,'node_modules/.pnpm'),file=path.join(base,'yaml@1.10.3','node_modules/yaml'),require=createRequire(import.meta.url)
 if(!/^  yaml@1\.10\.3:/m.test(fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8')))fail('locked_yaml_parser')
 const pkg=JSON.parse(fs.readFileSync(path.join(file,'package.json'),'utf8'))
 if(pkg.name!=='yaml'||pkg.version!=='1.10.3')fail('locked_yaml_parser')
 return require(file)
}
export function projectGeneratedOperatorPgRuntime(packageBytes,lockBytes){
 if(!Buffer.isBuffer(packageBytes)||!Buffer.isBuffer(lockBytes)||sum(lockBytes)!==lockSha)fail('original_lock')
 const pkg=JSON.parse(packageBytes.toString('utf8')),yaml=yamlParser(),lock=yaml.parse(lockBytes.toString('utf8'),{uniqueKeys:true})
 const selected=lock.importers?.['.']?.dependencies?.pg
 if(pkg.type!=='module'||pkg.dependencies?.pg!=='^8.23.1'||lock.lockfileVersion!=='9.0'||Object.keys(lock.importers).join(',')!=='.'||
  selected?.specifier!==pkg.dependencies.pg||selected.version!==pgVersion||lock.packages?.['pg@'+pgVersion]?.resolution?.integrity!==pgIntegrity||!lock.snapshots?.['pg@'+pgVersion])fail('locked_pg_projection')
 const projected=structuredClone(lock);projected.importers={'.':{dependencies:{pg:structuredClone(selected)}}}
 return {packageBytes:Buffer.from(json({name:'agentstudio-generated-operator-ci-runtime',private:true,type:'module',dependencies:{pg:pkg.dependencies.pg}})),
  lockBytes:Buffer.from(yaml.stringify(projected,{lineWidth:0})),originalLockSha256:sum(lockBytes),pgVersion,pgIntegrity}
}
export function copyGeneratedOperatorPgRuntime(from,to){
 const source=path.resolve(from),destination=path.resolve(to),records=[];let bytes=0
 if(!fs.lstatSync(source).isDirectory()||fs.lstatSync(source).isSymbolicLink()||!fs.lstatSync(destination).isDirectory()||fs.lstatSync(destination).isSymbolicLink())fail('runtime_directory')
 function walk(relative=''){
  const current=path.join(source,relative),stat=fs.lstatSync(current)
  if(stat.isSymbolicLink()||!stat.isDirectory())fail('runtime_symlink')
  for(const item of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!relative&&item.name.startsWith('.'))continue
   const next=relative?relative+'/'+item.name:item.name
   if(!safeRelative(next))fail('runtime_path')
   const input=path.join(source,next),output=path.join(destination,next),st=fs.lstatSync(input)
   if(st.isSymbolicLink())fail('runtime_symlink')
   if(st.isDirectory()){
    if(fs.existsSync(output))fail('runtime_collision')
    fs.mkdirSync(output,{mode:0o755});walk(next);continue
   }
   if(!st.isFile()||st.nlink!==1||st.size>8*1024*1024||/\.(?:node|wasm|exe|dll|so|dylib|pem|key)$/i.test(next))fail('runtime_file')
   const value=fs.readFileSync(input);bytes+=value.length
   if(bytes>32*1024*1024||value.includes(0)||!Buffer.from(value.toString('utf8')).equals(value))fail('runtime_binary')
   fs.writeFileSync(output,value,{flag:'wx',mode:0o644})
   // NTFS does not expose Unix permission bits. The hosted entry requires
   // Linux/root, and its independent privateStat rechecks ownership and modes.
   const copied=fs.lstatSync(output);if(!copied.isFile()||copied.isSymbolicLink()||copied.nlink!==1||process.platform!=='win32'&&(copied.mode&0o022)!==0)fail('runtime_copy')
   records.push({path:'services/pg-api/node_modules/'+next,sha256:sum(value),bytes:value.length})
  }
 }
 walk();if(!records.some(r=>r.path==='services/pg-api/node_modules/pg/package.json'))fail('runtime_pg_missing')
 return records.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
}
function privateDirectory(directory,create=false){
 const parent='/root/agentstudio-generated-operator-ci'
 if(!path.isAbsolute(directory)||path.normalize(directory)!==directory||directory!==parent&&!directory.startsWith(parent+'/'))fail('private_root')
 if(create){privateDirectory(path.dirname(directory));if(fs.existsSync(directory))fail('private_exists');fs.mkdirSync(directory,{mode:0o700})}
 let current='/'
 for(const part of directory.split('/').filter(Boolean)){current=path.join(current,part);const st=fs.lstatSync(current);if(st.isSymbolicLink()||!st.isDirectory()||st.uid!==0||st.gid!==0||(st.mode&0o022)!==0)fail('private_owner')}
}
function writePrivate(file,bytes){privateDirectory(path.dirname(file));fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});const st=fs.lstatSync(file);if(st.uid!==0||st.gid!==0||st.nlink!==1||!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('private_file')}
const baseEnv=()=>({PATH:path.dirname(process.execPath)+':/usr/local/bin:/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8'})
function command(binary,args,{timeout=120000,...options}={}){
 try{return execFileSync(binary,args,{env:baseEnv(),timeout,maxBuffer:32*1024*1024,windowsHide:true,...options})}
 catch(error){
  const detail=Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8'):String(error?.stderr??'')
  if(detail)process.stderr.write(detail.replace(/synthetic-generated-operator-[0-9]+-[0-9]+/g,'[synthetic-password]').slice(-3000)+'\n')
  fail('command_'+path.basename(binary))
 }
}
function containerSpec(proof,nonce,purpose){
 const port=purpose==='main'?5333:5334,db=purpose==='main'?'agent_studio':'agent_studio_restore'
 return {purpose,port,db,name:'agentstudio-generated-operator-'+purpose+'-'+proof.run+'-'+proof.attempt+'-'+nonce.slice(0,12),pgdata:'/var/lib/postgresql/generated-operator-'+purpose+'-'+nonce.slice(0,16),cluster:'ci-generated-'+purpose+'-'+nonce.slice(0,32)}
}
function stopOwnedContainer(id,spec,proof,nonce){
 if(!/^[a-f0-9]{64}$/.test(id))fail('cleanup_id')
 const values=JSON.parse(command('/usr/bin/docker',['inspect',id],{encoding:'utf8'}));if(values.length!==1)fail('cleanup_count')
 const value=values[0],labels=value.Config?.Labels??{}
 if(value.Id!==id||value.Name!=='/'+spec.name||value.Config.Image!==image||value.HostConfig.NetworkMode!=='host'||
  labels['org.agentstudio.generated-operator.run']!==proof.run||labels['org.agentstudio.generated-operator.attempt']!==proof.attempt||labels['org.agentstudio.generated-operator.nonce']!==nonce||labels['org.agentstudio.generated-operator.purpose']!==spec.purpose)fail('cleanup_identity')
 command('/usr/bin/docker',['rm','--force','--volumes',id],{encoding:'utf8'})
}
async function waitReady(id,spec){
 const end=Date.now()+120000
 while(Date.now()<end){
  const value=JSON.parse(command('/usr/bin/docker',['inspect',id],{encoding:'utf8'}))[0]
  if(!value?.State?.Running)fail('container_stopped')
  const ready=spawnSync('/usr/bin/docker',['exec',id,'pg_isready','--host=127.0.0.1','--port='+spec.port,'--username=postgres','--dbname='+spec.db],{env:baseEnv(),encoding:'utf8',timeout:5000,windowsHide:true})
  if(ready.status===0)return
  await new Promise(resolve=>setTimeout(resolve,1000))
 }
 fail('container_timeout')
}
export async function runGeneratedOperatorCi(pnpm,env=process.env){
 const proof=requireGeneratedOperatorProvisionCi(env)
 if(!path.isAbsolute(pnpm)||!fs.statSync(pnpm).isFile()||command(pnpm,['--version'],{encoding:'utf8'}).trim()!=='11.23.0')fail('pnpm_version')
 const nonce=randomBytes(32).toString('hex'),parent='/root/agentstudio-generated-operator-ci'
 if(!fs.existsSync(parent))fs.mkdirSync(parent,{mode:0o700});privateDirectory(parent)
 const directory=parent+'/'+proof.run+'-'+proof.attempt+'-'+nonce;privateDirectory(directory,true)
 const {buildGeneratedOperatorReview,verifyGeneratedOperatorReviewArchive,extractGeneratedOperatorReviewArchive,verifyGeneratedOperatorReviewDirectory}=await import('./build-pg18-generated-operator-review-bundle.mjs')
 const output=directory+'/review';privateDirectory(output,true)
 const reviewed=await buildGeneratedOperatorReview(output)
 if(!reviewed.review_only||!reviewed.offline_plan_verified||!reviewed.no_ancestor_dependency_fallback_verified||reviewed.pg_runtime_install_verified!==false)fail('review_artifact')
 await verifyGeneratedOperatorReviewArchive(reviewed.archive,{expectedSha256:reviewed.sha256})
 const staged=directory+'/source';privateDirectory(staged,true)
 await extractGeneratedOperatorReviewArchive(reviewed.archive,staged,{expectedSha256:reviewed.sha256});await verifyGeneratedOperatorReviewDirectory(staged)
 const archive=directory+'/operator-review.tar.gz';writePrivate(archive,fs.readFileSync(reviewed.archive))
 const sourceManifestSha=sum(fs.readFileSync(staged+'/REVIEW_MANIFEST.json'))
 const originalLock=fs.readFileSync(staged+'/services/pg-api/pnpm-lock.yaml'),projection=projectGeneratedOperatorPgRuntime(fs.readFileSync(staged+'/services/pg-api/package.json'),originalLock)
 const install=directory+'/runtime-install';privateDirectory(install,true)
 writePrivate(install+'/package.json',projection.packageBytes);writePrivate(install+'/pnpm-lock.yaml',projection.lockBytes)
 writePrivate(install+'/.user.npmrc','registry=https://registry.npmjs.org/\n');writePrivate(install+'/.global.npmrc','')
 command(pnpm,['--dir',install,'install','--ignore-workspace','--frozen-lockfile','--ignore-scripts','--prod','--config.node-linker=hoisted','--config.package-import-method=copy','--config.ignore-pnpmfile=true'],{timeout:300000,env:{...baseEnv(),NPM_CONFIG_USERCONFIG:install+'/.user.npmrc',NPM_CONFIG_GLOBALCONFIG:install+'/.global.npmrc'},stdio:['ignore','pipe','pipe']})
 if(!fs.readFileSync(install+'/pnpm-lock.yaml').equals(projection.lockBytes))fail('runtime_lock_rewritten')
 const runtime=copyGeneratedOperatorPgRuntime(install+'/node_modules',staged+'/services/pg-api/node_modules')
 const runtimeText=runtime.map(f=>f.sha256+'  '+f.path+'\n').join('')
 writePrivate(staged+'/RUNTIME_SHA256SUMS',runtimeText);writePrivate(staged+'/RUNTIME_PNPM_LOCK.yaml',originalLock)
 writePrivate(staged+'/RUNTIME_INSTALL_PACKAGE.json',projection.packageBytes);writePrivate(staged+'/RUNTIME_INSTALL_LOCK.yaml',projection.lockBytes)
 process.stdout.write(json({stage:'trusted_artifact_and_locked_pg_staged',source_sha256:reviewed.source_sha256,packed_files:reviewed.packed_files,pg_version:pgVersion,pg_files:runtime.length,original_lock_sha256:projection.originalLockSha256}))
 command('/usr/bin/docker',['pull',image],{timeout:300000})
 const imageId=JSON.parse(command('/usr/bin/docker',['image','inspect',image],{encoding:'utf8'}))[0]?.Id
 if(!/^sha256:[a-f0-9]{64}$/.test(imageId??''))fail('image_id')
 const password='synthetic-generated-operator-'+proof.run+'-'+proof.attempt,containers=[]
 try{
  for(const purpose of ['main','restore']){
   const spec=containerSpec(proof,nonce,purpose),args=['run','--detach','--name',spec.name,'--network','host','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,size=512m','--tmpfs','/run:rw,nosuid,nodev,size=32m',
    '--label','org.agentstudio.generated-operator.run='+proof.run,'--label','org.agentstudio.generated-operator.attempt='+proof.attempt,'--label','org.agentstudio.generated-operator.job='+job,'--label','org.agentstudio.generated-operator.nonce='+nonce,'--label','org.agentstudio.generated-operator.purpose='+purpose,
    '--env','POSTGRES_USER=postgres','--env','POSTGRES_DB='+spec.db,'--env','POSTGRES_PASSWORD','--env','PGDATA='+spec.pgdata,image,'postgres','-p',String(spec.port),'-c','listen_addresses=127.0.0.1','-c','cluster_name='+spec.cluster]
   const id=command('/usr/bin/docker',args,{encoding:'utf8',env:{...baseEnv(),POSTGRES_PASSWORD:password}}).trim()
   if(!/^[a-f0-9]{64}$/.test(id))fail('container_id');containers.push({id,spec});await waitReady(id,spec)
  }
  const testEnv={...baseEnv(),CI:'true',GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted'}
  for(const key of ['GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME'])testEnv[key]=env[key]
  Object.assign(testEnv,{[prefix+'EPHEMERAL']:'true',[prefix+'PURPOSE']:'GENERATED_059_OPERATOR_SYNTHETIC_ONLY',[prefix+'WRITE_APPROVED']:'YES_DISPOSABLE_GENERATED_OPERATOR_ONLY',[prefix+'NONCE']:nonce,
   [prefix+'MAIN_CONTAINER_ID']:containers[0].id,[prefix+'RESTORE_CONTAINER_ID']:containers[1].id,[prefix+'IMAGE_ID']:imageId,[prefix+'ARCHIVE_SHA256']:reviewed.sha256,[prefix+'SOURCE_MANIFEST_SHA256']:sourceManifestSha,[prefix+'RUNTIME_MANIFEST_SHA256']:sum(Buffer.from(runtimeText)),[prefix+'ADMIN_PASSWORD']:password})
  const tested=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1',root+'/services/pg-api/tests/agent-generated-operator-tcp.integration.mjs'],{cwd:root,env:testEnv,encoding:'utf8',timeout:1500000,maxBuffer:32*1024*1024,windowsHide:true})
  process.stdout.write((tested.stdout??'').replaceAll(password,'[synthetic-password]'));process.stderr.write((tested.stderr??'').replaceAll(password,'[synthetic-password]'))
  if(tested.error||tested.status!==0)fail('actual_operator_tests')
  const result={stage:'actual_operator_tests_passed',source_sha256:reviewed.source_sha256,archive_sha256:reviewed.sha256,runtime_manifest_sha256:sum(Buffer.from(runtimeText)),pg_version:pgVersion,pg_runtime_install_verified:true,synthetic_only:true,real_target_initialized:false,production_cutover_allowed:false}
  writePrivate(directory+'/CI_RESULT.json',json(result));return result
 }finally{
  for(const {id,spec}of containers.reverse())stopOwnedContainer(id,spec,proof,nonce)
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2)
  if(args.length===0||args.length===1&&args[0]==='--plan')process.stdout.write(json(generatedOperatorCiPlan()))
  else if(args.length===3&&args[0]==='--run'&&args[1]==='--pnpm')process.stdout.write(json(await runGeneratedOperatorCi(args[2])))
  else fail('arguments')
 }catch(error){process.stderr.write((error instanceof Error&&error.message.startsWith('generated_operator_ci_setup_refused:')?error.message:'generated_operator_ci_setup_failed')+'\n');process.exitCode=1}
}
