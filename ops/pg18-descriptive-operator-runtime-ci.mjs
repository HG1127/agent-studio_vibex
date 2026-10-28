// Hosted synthetic dependency-load publisher. No database or production secret.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'

const here=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(here),'..')
const prefix='AGENT_STUDIO_DESCRIPTIVE_OPERATOR_RUNTIME_CI_'
const sourceSha='daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247'
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const image='node:24-bookworm-slim'
const github=['GITHUB_ACTIONS','CI','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']
const markers={EPHEMERAL:'true',PURPOSE:'DESCRIPTIVE_060_RUNTIME_DEPENDENCIES_ONLY',APPROVED:'YES_DISPOSABLE_DEPENDENCY_LOAD_ONLY'}
const parserPins={'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675','package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6','LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47','ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c'}
const harnessPins={
 'services/pg-api/tests/agent-descriptive-patch-operator-runtime-ci.integration.mjs':'21a34d4446284d71a874422e6bda325ef7b9d9c70a03f27862f2c646676ea73a',
 'services/pg-api/tests/helpers/agent-descriptive-patch-operator-runtime-ci-fixture.mjs':'b1ed3d3a25fa717ae0007a1971dfc9716122b25aed64c313747833d0deb82962',
}
const sha=b=>createHash('sha256').update(b).digest('hex')
const fail=reason=>{throw Error('descriptive_operator_runtime_ci_refused:'+reason)}
function gate(){
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(a=>a!=='--experimental-strip-types'))fail('host')
 if(process.argv.length!==3||process.argv[2]!=='--run')fail('arguments')
 const e=process.env
 if(e.GITHUB_ACTIONS!=='true'||e.CI!=='true'||e.RUNNER_OS!=='Linux'||e.RUNNER_ENVIRONMENT!=='github-hosted'||e.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||e.GITHUB_WORKFLOW!=='Agent Studio PG18 descriptive operator isolated verification'||e.GITHUB_JOB!=='pg18-descriptive-operator-runtime'||!/^\d{1,32}$/.test(e.GITHUB_RUN_ID??'')||!/^\d{1,32}$/.test(e.GITHUB_RUN_ATTEMPT??''))fail('environment')
 for(const[k,v]of Object.entries(markers))if(e[prefix+k]!==v)fail('approval')
 for(const key of Object.keys(e))if(key==='DATABASE_URL'||/^PG(?:[A-Z_]|$)|^NODE_PG_/.test(key)||/PASSWORD|SECRET|CREDENTIAL|BACKUP|RESTORE|TOKEN|APPROVAL/.test(key)||key.startsWith(prefix)&&!Object.hasOwn(markers,key.slice(prefix.length))||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','DOCKER_HOST','DOCKER_CONTEXT','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key))fail('environment_key')
 return Object.freeze({run:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT})
}
function privateDirectory(file,create=false){
 if(!file.startsWith('/root/agentstudio-descriptive-runtime-')||path.normalize(file)!==file)fail('private_path')
 if(create)fs.mkdirSync(file,{recursive:true,mode:0o700})
 let at='/'
 for(const part of file.split('/').filter(Boolean)){at=path.join(at,part);const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7022)!==0){process.stderr.write(JSON.stringify({phase:'private_ancestor',path:at,uid:s.uid,gid:s.gid,mode:s.mode&0o7777})+'\n');fail('private_ancestor')}}
}
function read(file,expected){
 const a=fs.lstatSync(file)
 if(!a.isFile()||a.size<1||a.size>16*1024*1024)fail('input_file')
 const b=fs.readFileSync(file),z=fs.lstatSync(file)
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])if(a[k]!==z[k])fail('input_changed')
 if(expected&&sha(b)!==expected||b.length!==a.size||b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b))fail('input_hash_or_encoding')
 return b
}
function write(file,bytes,mode=0o444){
 privateDirectory(path.dirname(file),true)
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,mode)
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const s=fs.lstatSync(file);if(s.uid!==0||s.gid!==0||s.nlink!==1||sha(fs.readFileSync(file))!==sha(bytes))fail('output_integrity')
}
const posix=relative=>typeof relative==='string'&&/^[a-zA-Z0-9_@./+-]+$/.test(relative)&&!relative.startsWith('/')&&!relative.split('/').some(s=>!s||s==='.'||s==='..')
async function publish(proof){
 // The guard precedes every source capture, read, directory, Docker call and
 // runtime import. Only offline capture/policy exports are used on this host.
 const source=await import(pathToFileURL(path.join(root,'services/pg-api/src/agent-descriptive-patch-operator-source.mjs')).href)
 const {descriptivePatchOperatorRuntimePolicy:policy}=await import(pathToFileURL(path.join(root,'services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs')).href)
 const snapshot=await source.captureDescriptivePatchOperatorSources()
 source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
 if(policy.lock_sha256!==lockSha||snapshot.manifest.predecessor.source_sha256!=='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'||snapshot.manifest.default_fresh_latest!=='pg_v9_050')fail('source_binding')
 const nonce=randomBytes(32).toString('hex'),label=proof.run+'-'+proof.attempt+'-'+nonce
 // Host staging uses a new private root directory. The container has its own
 // /opt ancestry and receives only the two readonly, reviewed bind mounts.
 const input='/root/agentstudio-descriptive-runtime-input/'+label,harness='/root/agentstudio-descriptive-runtime-harness/'+label,tools='/root/agentstudio-descriptive-runtime-tools/'+label
 for(const dir of [input,harness,tools]){if(fs.existsSync(dir))fail('existing_stage');privateDirectory(dir,true)}
 const tree=input+'/tree',records=new Map()
 const add=(relative,bytes,expected)=>{
  if(!posix(relative)||expected&&sha(bytes)!==expected)fail('source_record')
  const old=records.get(relative);if(old){if(old.sha256!==sha(bytes))fail('duplicate_record');return}
  records.set(relative,{path:relative,sha256:sha(bytes),bytes:bytes.length});write(tree+'/'+relative,bytes)
 }
 for(const r of [...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql,snapshot.manifest.predecessor.manifest.sql])add(r.path,read(path.join(root,r.path),r.sha256),r.sha256)
 add('services/pg-api/package.json',read(path.join(root,'services/pg-api/package.json'),packageSha),packageSha)
 add('services/pg-api/pnpm-lock.yaml',read(path.join(root,'services/pg-api/pnpm-lock.yaml'),lockSha),lockSha)
 const apiRequire=createRequire(path.join(root,'services/pg-api/package.json'))
 const tsEntry=apiRequire.resolve('typescript');let tsRoot=path.dirname(tsEntry)
 while(!fs.existsSync(path.join(tsRoot,'package.json'))){const parent=path.dirname(tsRoot);if(parent===tsRoot)fail('parser_metadata');tsRoot=parent}
 for(const[relative,pin]of Object.entries(parserPins))add('services/pg-api/node_modules/typescript/'+relative,read(path.join(tsRoot,relative),pin),pin)
 const packages=new Map(),pending=[{name:'pg',require:apiRequire}]
 while(pending.length){
  const {name,require}=pending.pop(),p=policy.packages[name];if(!p)fail('unreviewed_dependency')
  const entry=fs.realpathSync(require.resolve(name));let dir=path.dirname(entry)
  while(true){const candidate=path.join(dir,'package.json');if(fs.existsSync(candidate)&&JSON.parse(read(candidate)).name===name)break;const parent=path.dirname(dir);if(parent===dir)fail('dependency_metadata');dir=parent}
  dir=fs.realpathSync(dir)
  const old=packages.get(name);if(old){if(old!==dir)fail('ambiguous_dependency');continue}
  const pkg=JSON.parse(read(path.join(dir,'package.json')))
  if(pkg.name!==name||pkg.version!==p.version)fail('dependency_version')
  const deps={...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies};if(name==='pg')delete deps['pg-native']
  if(Object.keys(deps).sort().join('\0')!==[...p.dependencies].sort().join('\0'))fail('dependency_graph')
  packages.set(name,dir);const child=createRequire(path.join(dir,'package.json'))
  for(const dependency of p.dependencies)pending.push({name:dependency,require:child})
 }
 if(packages.size!==14)fail('dependency_count')
 const runtimeFiles=[]
 for(const[name,dir]of [...packages].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const walk=relative=>{
   for(const item of fs.readdirSync(path.join(dir,relative)).sort()){
    const next=relative?relative+'/'+item:item,file=path.join(dir,next),st=fs.lstatSync(file)
    if(st.isSymbolicLink())fail('dependency_link')
    if(st.isDirectory()){walk(next);continue}
    if(!st.isFile()||!posix(next)||next.split('/').includes('node_modules')||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(next)||!fs.realpathSync(file).startsWith(dir+path.sep))fail('dependency_file')
    const bytes=read(file),target='services/pg-api/node_modules/'+name+'/'+next
    add(target,bytes);runtimeFiles.push(records.get(target))
   }
  };walk('')
 }
 runtimeFiles.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
 const manifest={format:policy.format,lock_sha256:lockSha,pg_version:'8.23.1',packages:Object.keys(policy.packages).sort().map(name=>({name,version:policy.packages[name].version})),files:runtimeFiles}
 const sourceBytes=Buffer.from(JSON.stringify(snapshot.manifest)),runtimeBytes=Buffer.from(JSON.stringify(manifest))
 if(sha(sourceBytes)!==sourceSha)fail('source_manifest')
 write(input+'/source-manifest.json',sourceBytes,0o600);write(input+'/runtime-manifest.json',runtimeBytes,0o600)
 for(const[relative,pin]of Object.entries(harnessPins))write(harness+'/'+relative,read(path.join(root,relative),pin))
 return {input,harness,tools,nonce,sourceManifestSha:sha(sourceBytes),runtimeManifestSha:sha(runtimeBytes),runtimeFiles:runtimeFiles.length}
}
function runContainer(proof,stage){
 const dockerConfig=stage.tools+'/docker-config';privateDirectory(dockerConfig,true)
 const command=(args,timeout=120000)=>execFileSync('/usr/bin/docker',['--config',dockerConfig,...args],{
  env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:stage.tools,LANG:'C.UTF-8'},encoding:'utf8',timeout,maxBuffer:16*1024*1024,windowsHide:true,
 })
 command(['pull',image])
 const images=JSON.parse(command(['image','inspect',image])),imageId=images[0]?.Id
 if(images.length!==1||!/^sha256:[a-f0-9]{64}$/.test(imageId??''))fail('image_identity')
 const name='agentstudio-descriptive-runtime-'+proof.run+'-'+proof.attempt+'-'+stage.nonce.slice(0,16)
 const env=Object.fromEntries(github.map(k=>[k,process.env[k]]))
 for(const[k,v]of Object.entries(markers))env[prefix+k]=v
 Object.assign(env,{[prefix+'NONCE']:stage.nonce,[prefix+'SOURCE_MANIFEST_SHA256']:stage.sourceManifestSha,[prefix+'RUNTIME_MANIFEST_SHA256']:stage.runtimeManifestSha})
 const harnessTarget='/opt/agentstudio-descriptive-runtime-harness/'+proof.run+'-'+proof.attempt+'-'+stage.nonce
 const inputTarget='/opt/agentstudio-descriptive-runtime-input/'+proof.run+'-'+proof.attempt+'-'+stage.nonce
 const args=['create','--name',name,'--label','org.agentstudio.descriptive-runtime.nonce='+stage.nonce,
  // DAC_OVERRIDE permits intentional edits to this test's own0444/0555 stage.
  // Readonly input mounts remain readonly; no administrative/network caps.
  '--network','none','--user','0:0','--cap-drop','ALL','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges','--pids-limit','256','--memory','2g','--cpus','2',
  '--mount','type=bind,src='+stage.input+',dst='+inputTarget+',readonly',
  '--mount','type=bind,src='+stage.harness+',dst='+harnessTarget+',readonly']
 for(const[k,v]of Object.entries(env))args.push('--env',k+'='+v)
 args.push(imageId,'node','--experimental-strip-types',harnessTarget+'/services/pg-api/tests/agent-descriptive-patch-operator-runtime-ci.integration.mjs')
 const id=command(args).trim();if(!/^[a-f0-9]{64}$/.test(id))fail('container_id')
 const inspect=()=>{
  const rows=JSON.parse(command(['inspect',id])),c=rows[0],host=c?.HostConfig
  if(rows.length!==1||c.Id!==id||c.Name!=='/'+name||c.Image!==imageId||c.Config?.Image!==imageId||c.Config?.User!=='0:0'||c.Config?.Labels?.['org.agentstudio.descriptive-runtime.nonce']!==stage.nonce||host?.NetworkMode!=='none'||host.Privileged!==false||(host.Binds??[]).length||(host.Devices??[]).length||(host.VolumesFrom??[]).length||JSON.stringify(host.CapAdd)!==JSON.stringify(['DAC_OVERRIDE'])||JSON.stringify(host.CapDrop)!==JSON.stringify(['ALL'])||!host.SecurityOpt?.includes('no-new-privileges')||Object.keys(host.PortBindings??{}).length||!Array.isArray(c.Mounts)||c.Mounts.length!==2)fail('container_configuration')
  const expected=new Map([[inputTarget,stage.input],[harnessTarget,stage.harness]])
  for(const mount of c.Mounts)if(mount.Type!=='bind'||mount.RW!==false||expected.get(mount.Destination)!==mount.Source)fail('container_mount')
  if(!Object.entries(env).every(([k,v])=>c.Config.Env.includes(k+'='+v)))fail('container_environment')
  return c
 }
 try{
  inspect() // Actual fixed image, network-none, root and readonly own mounts.
  const output=command(['start','--attach',id],15*60*1000)
  const final=inspect()
  if(final.State?.Running||final.State?.ExitCode!==0||!/tests 28\b/.test(output)||!/pass 28\b/.test(output)||!/fail 0\b/.test(output))fail('runtime_cases_failed')
  process.stdout.write(output)
  process.stdout.write(JSON.stringify({format:'descriptive_runtime_ci_publisher_result_v1',source_sha256:sourceSha,source_manifest_sha256:stage.sourceManifestSha,runtime_manifest_sha256:stage.runtimeManifestSha,runtime_files:stage.runtimeFiles,image_id:imageId,container_id:id,network:'none',database_calls:0,installer_executed:false,production_cutover_allowed:false})+'\n')
 }catch(error){
  // This container only holds reviewed public source and synthetic markers.
  // Keep bounded case diagnostics so a genuine failure is actionable.
  for(const bytes of [error?.stdout,error?.stderr])if(bytes)process.stderr.write(String(bytes).slice(0,16000)+'\n')
  throw error
 }finally{
  // Only the full container ID created here and revalidated by nonce/name.
  // Source directories are left to this disposable hosted runner's cleanup.
  inspect();command(['rm','--force',id],45000)
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 try{const proof=gate();const stage=await publish(proof);runContainer(proof,stage)}
 catch(error){
  const message=error instanceof Error&&/^descriptive_operator_runtime_ci_refused:[a-z_]+$/.test(error.message)?error.message:'descriptive_operator_runtime_ci_refused:bounded_operation_failed'
  process.stderr.write(message+'\n');process.exitCode=1
 }
}
