// HOSTED ONLY. Builtins are import-safe; no source/pg import or effect precedes
// the explicit environment + real Docker attestation and private-stage gates.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {createHash,randomBytes} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'

const prefix='AGENT_STUDIO_GENERATED_OPERATOR_CI_',repository='HG1127/agent-studio_vibex'
const workflow='Agent Studio PG18 generated operator isolated verification',job='pg18-generated-operator'
const image='pgvector/pgvector:0.8.7-pg18',sealed=new WeakSet(),sha=v=>createHash('sha256').update(v).digest('hex')
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),positive=v=>typeof v==='string'&&/^[1-9][0-9]{0,31}$/.test(v)
const refuse=reason=>{throw Error('generated_operator_ci_refused:'+reason)}
const extraSteps={
 '051_agent_memory_derived':'2d23d26f11cd2c86e603a59e0355706a76d082a9a97261dfd9aa4522e30d7de1',
 '052_agent_memory_outcome':'ae6d8d0d2d61c8887e4807313d218d4d89f8fdfdf482f5a28907c81ef08642cf',
 '053_agent_memory_failure_source':'c8df98a50f5a22245031bea13182a668016f7b5548fe92e76d6022833bcd25c4',
 '054_agent_feedback':'872510847e8c1a8dfd3043dd89bbc419c5edfca7f4264a6fa06c1e378bc43b9a',
 '055_agent_optimization':'e379316acc119e28c3e4f54108b8f10138e7a485bc75d9753f8a3bc2cc9ae3b0',
 '056_agent_review_ledger':'50e1b8e33b44f8075daaf6bcb9413b932e2127d117d6f37740312822925ac2d5',
 '057_agent_assessment_execution':'c34737b9982429ad79dec0d36420f5186b32bdbb5d2964b202d5c83ec86dc13f',
 '058_agent_opinion_read':'98116d261958358a800754bc631726d373e6d7986dbfb73e700de624f2f5e92e',
}
export function requireGeneratedOperatorCi(env=process.env){
 const keys=['EPHEMERAL','PURPOSE','WRITE_APPROVED','NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','IMAGE_ID','ARCHIVE_SHA256','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256','ADMIN_PASSWORD']
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
  env.GITHUB_REPOSITORY!==repository||env.GITHUB_WORKFLOW!==workflow||env.GITHUB_JOB!==job||!positive(env.GITHUB_RUN_ID)||!positive(env.GITHUB_RUN_ATTEMPT)||
  env[prefix+'EPHEMERAL']!=='true'||env[prefix+'PURPOSE']!=='GENERATED_059_OPERATOR_SYNTHETIC_ONLY'||env[prefix+'WRITE_APPROVED']!=='YES_DISPOSABLE_GENERATED_OPERATOR_ONLY'||
  !['NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','ARCHIVE_SHA256','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256'].every(k=>hex(env[prefix+k]))||
  env[prefix+'MAIN_CONTAINER_ID']===env[prefix+'RESTORE_CONTAINER_ID']||!/^sha256:[a-f0-9]{64}$/.test(env[prefix+'IMAGE_ID']??'')||
  env[prefix+'ADMIN_PASSWORD']!=='synthetic-generated-operator-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT||
  Object.keys(env).some(k=>env[k]!==undefined&&(k==='DATABASE_URL'||/^PG[A-Z_]/.test(k)||k.startsWith(prefix)&&!keys.includes(k.slice(prefix.length))||
    ['NODE_OPTIONS','NODE_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DOCKER_HOST','DOCKER_CONTEXT','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED'].includes(k))))refuse('environment')
 const value=Object.freeze({run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,nonce:env[prefix+'NONCE'],mainId:env[prefix+'MAIN_CONTAINER_ID'],restoreId:env[prefix+'RESTORE_CONTAINER_ID'],
  imageId:env[prefix+'IMAGE_ID'],archiveSha:env[prefix+'ARCHIVE_SHA256'],manifestSha:env[prefix+'SOURCE_MANIFEST_SHA256'],runtimeSha:env[prefix+'RUNTIME_MANIFEST_SHA256'],password:env[prefix+'ADMIN_PASSWORD']})
 sealed.add(value);return value
}
const childEnv={PATH:'/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8'}
function command(binary,args,options={}){try{return execFileSync(binary,args,{env:childEnv,timeout:45000,maxBuffer:32*1024*1024,windowsHide:true,...options})}catch{refuse('bounded_child_failed_'+path.basename(binary))}}
function inspectContainer(proof,purpose){
 if(!sealed.has(proof)||!['main','restore'].includes(purpose))refuse('unsealed')
 const id=purpose==='main'?proof.mainId:proof.restoreId,port=purpose==='main'?5333:5334,db='agent_studio'
 const name='agentstudio-generated-operator-'+purpose+'-'+proof.run+'-'+proof.attempt+'-'+proof.nonce.slice(0,12)
 const pgdata='/var/lib/postgresql/generated-operator-'+purpose+'-'+proof.nonce.slice(0,16),cluster='ci-generated-'+purpose+'-'+proof.nonce.slice(0,32)
 const list=JSON.parse(command('/usr/bin/docker',['inspect',id],{encoding:'utf8'}));if(list.length!==1)refuse('container_count')
 const c=list[0],labels=c.Config?.Labels??{},h=c.HostConfig??{},env=c.Config?.Env??[]
 const expectedLabels={run:proof.run,attempt:proof.attempt,job,nonce:proof.nonce,purpose}
 if(c.Id!==id||c.Name!=='/'+name||!c.State?.Running||c.Image!==proof.imageId||c.Config.Image!==image||h.NetworkMode!=='host'||h.Privileged!==false||h.PublishAllPorts!==false||
  Object.keys(h.PortBindings??{}).length||(h.Binds??[]).length||(h.Devices??[]).length||(h.VolumesFrom??[]).length||(h.CapAdd??[]).length||!['','private'].includes(h.PidMode)||
  !Array.isArray(c.Mounts)||c.Mounts.some(m=>m.Type!=='tmpfs'||!['/var/lib/postgresql','/run'].includes(m.Destination))||
  JSON.stringify(Object.keys(h.Tmpfs??{}).sort())!==JSON.stringify(['/run','/var/lib/postgresql'])||
  JSON.stringify(c.Config.Entrypoint)!==JSON.stringify(['docker-entrypoint.sh'])||
  JSON.stringify(c.Config.Cmd)!==JSON.stringify(['postgres','-p',String(port),'-c','listen_addresses=127.0.0.1','-c','cluster_name='+cluster])||
  !Object.entries(expectedLabels).every(([k,v])=>labels['org.agentstudio.generated-operator.'+k]===v)||
  !['POSTGRES_USER=postgres','POSTGRES_DB='+db,'POSTGRES_PASSWORD='+proof.password,'PGDATA='+pgdata].every(v=>env.includes(v)))refuse('container_identity')
 const control=command('/usr/bin/docker',['exec','--user','postgres','-e','LC_ALL=C','-e','LANG=C',id,'pg_controldata',pgdata],{encoding:'utf8'})
 const systemIdentifier=/^Database system identifier:\s*([1-9][0-9]{0,19})\s*$/m.exec(control)?.[1]
 if(!systemIdentifier)refuse('container_control_identity')
 const target=Object.freeze({id,port,db,pgdata,cluster,created:c.Created,systemIdentifier});sealed.add(target);return target
}
function privateStat(file,directory=false){
 if(!path.isAbsolute(file)||path.normalize(file)!==file)refuse('private_path')
 let current='/'
 for(const part of file.split('/').filter(Boolean)){current=path.join(current,part);const st=fs.lstatSync(current);if(st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o022)!==0)refuse('private_owner')}
 const st=fs.lstatSync(file);if(directory?!st.isDirectory():!st.isFile()||st.nlink!==1)refuse('private_type')
 return st
}
function privateWrite(file,value){if(!file.startsWith('/root/agentstudio-generated-operator-ci/'))refuse('write_path');privateStat(path.dirname(file),true);const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,value);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}const directory=fs.openSync(path.dirname(file),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);try{fs.fsyncSync(directory)}finally{fs.closeSync(directory)}return file}
function verifyManifest(root,file,expected,runtime=false){
 privateStat(file);const bytes=fs.readFileSync(file);if(bytes.length>8*1024*1024||sha(bytes)!==expected)refuse('manifest_hash')
 const seen=new Set()
 for(const line of bytes.toString('utf8').trimEnd().split('\n')){
  const m=/^([a-f0-9]{64})  ([a-zA-Z0-9_@./+-]+)$/.exec(line)
  if(!m||m[2].startsWith('/')||m[2].split('/').some(s=>!s||s==='.'||s==='..')||seen.has(m[2])||runtime&&!/^(?:services\/pg-api\/)?node_modules\//.test(m[2]))refuse('manifest_path')
  const p=path.join(root,m[2]);privateStat(p);if(sha(fs.readFileSync(p))!==m[1])refuse('manifest_content');seen.add(m[2])
 }
 return seen
}
function verifyStagedReview(root,expected){
 const file=root+'/REVIEW_MANIFEST.json';privateStat(file);const bytes=fs.readFileSync(file)
 if(sha(bytes)!==expected)refuse('review_manifest_hash')
 const closed=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key))
 const value=JSON.parse(bytes.toString('utf8'))
 if(!closed(value,['format','review_only','source_sha256','default_fresh_latest','initializes_database','activation_performed','pg_runtime_install_verified','files'])||
  value.format!=='agent_generated_operator_review_v1'||value.review_only!==true||value.source_sha256!=='06f8c7f37824e6866ea1587704afab45546f0cba9988e894f6f73af9eeba8747'||
  value.default_fresh_latest!=='pg_v9_050'||value.initializes_database!==false||value.activation_performed!==false||value.pg_runtime_install_verified!==false||!Array.isArray(value.files)||value.files.length!==91)refuse('review_manifest')
 const files=new Set(['REVIEW_MANIFEST.json'])
 for(const item of value.files){
  if(!closed(item,['path','sha256','bytes'])||typeof item.path!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(item.path)||item.path.startsWith('/')||item.path.split('/').some(s=>!s||s==='.'||s==='..')||files.has(item.path)||!hex(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>16*1024*1024)refuse('review_path')
  const target=root+'/'+item.path;if(privateStat(target).size!==item.bytes)refuse('staged_review_content');const bytes=fs.readFileSync(target);if(bytes.length!==item.bytes||sha(bytes)!==item.sha256)refuse('staged_review_content');files.add(item.path)
 }
 return files
}
const inside=(root,file)=>file.startsWith(root+'/')&&fs.realpathSync(file)===file
function dependency(root,require,name,manifest){
 const file=require.resolve(name);let directory=path.dirname(file),pkg
 for(;;){const candidate=directory+'/package.json';if(fs.existsSync(candidate)&&JSON.parse(fs.readFileSync(candidate,'utf8')).name===name){pkg=candidate;break}if(directory===root||!directory.startsWith(root+'/'))refuse('dependency_metadata');directory=path.dirname(directory)}
 if(!inside(root,file)||!inside(root,pkg)||!manifest.has(path.relative(root,file).replaceAll(path.sep,'/'))||!manifest.has(path.relative(root,pkg).replaceAll(path.sep,'/')))refuse('dependency_fallback')
 return {file,pkg:JSON.parse(fs.readFileSync(pkg,'utf8'))}
}
async function childNode(args,env,cwd){
 return await new Promise((resolve,reject)=>{
  const c=spawn(process.execPath,args,{cwd,env,stdio:['ignore','pipe','pipe'],windowsHide:true}),chunks={out:[],err:[]};let size=0,timer=setTimeout(()=>{c.kill('SIGKILL');reject(Error('generated_operator_ci_child_timeout'))},60000)
  for(const [stream,key]of [[c.stdout,'out'],[c.stderr,'err']])stream.on('data',b=>{size+=b.length;if(size>2*1024*1024){c.kill('SIGKILL');reject(Error('generated_operator_ci_child_output_limit'))}else chunks[key].push(b)})
  c.once('error',e=>{clearTimeout(timer);reject(e)});c.once('close',code=>{clearTimeout(timer);resolve({code,stdout:Buffer.concat(chunks.out).toString(),stderr:Buffer.concat(chunks.err).toString()})})
 })
}
export async function generatedOperatorCiFixture(env=process.env){
 const proof=requireGeneratedOperatorCi(env),main=inspectContainer(proof,'main'),restore=inspectContainer(proof,'restore')
 const privateRoot='/root/agentstudio-generated-operator-ci/'+proof.run+'-'+proof.attempt+'-'+proof.nonce,root=privateRoot+'/source'
 privateStat(privateRoot,true);privateStat(root,true)
 if((fs.lstatSync(privateRoot).mode&0o077)!==0)refuse('private_stage_mode')
 const archive=privateRoot+'/operator-review.tar.gz';privateStat(archive);if(sha(fs.readFileSync(archive))!==proof.archiveSha)refuse('archive_hash')
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
 // Prove the original artifact with the actual independent builder verifier,
 // using a second pristine extraction so installed runtime extras cannot turn
 // an exact archive check into an allow-extra-files source bypass.
 const builder=await import(pathToFileURL(repo+'/ops/build-pg18-generated-operator-review-bundle.mjs').href)
 await builder.verifyGeneratedOperatorReviewArchive(archive,{expectedSha256:proof.archiveSha})
 const pristine=privateRoot+'/archive-verification';fs.mkdirSync(pristine,{mode:0o700})
 await builder.extractGeneratedOperatorReviewArchive(archive,pristine,{expectedSha256:proof.archiveSha})
 await builder.verifyGeneratedOperatorReviewDirectory(pristine)
 const sourceFiles=verifyStagedReview(root,proof.manifestSha),runtimeFiles=verifyManifest(root,root+'/RUNTIME_SHA256SUMS',proof.runtimeSha,true)
 const pristineManifest=fs.readFileSync(pristine+'/REVIEW_MANIFEST.json')
 if(sha(pristineManifest)!==proof.manifestSha||!pristineManifest.equals(fs.readFileSync(root+'/REVIEW_MANIFEST.json')))refuse('staged_source_manifest')
 const lock=fs.readFileSync(repo+'/services/pg-api/pnpm-lock.yaml')
 privateStat(root+'/RUNTIME_PNPM_LOCK.yaml');if(sha(lock)!==sha(fs.readFileSync(root+'/RUNTIME_PNPM_LOCK.yaml')))refuse('runtime_lock')
 const entry=root+'/services/pg-api/src/agent-generated-operator-cli.mjs',require=createRequire(entry),pgEntry=dependency(root,require,'pg',runtimeFiles),parser=dependency(root,require,'typescript',new Set([...sourceFiles,...runtimeFiles]))
 if(pgEntry.pkg.version!=='8.23.1'||parser.pkg.version!=='5.9.3'||sha(fs.readFileSync(parser.file))!=='3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675')refuse('runtime_version')
 // Each actual declared pg dependency must resolve inside the independently
 // installed/hashed runtime tree, never the runner checkout/ancestor modules.
 const checked=new Set(),walk=(pkg,file)=>{
  if(checked.has(file))return;checked.add(file)
  const key=pkg.name+'@'+pkg.version,lockText=lock.toString('utf8')
  if(!lockText.includes('\n  '+key+':')&&!lockText.includes("\n  '"+key+"':"))refuse('dependency_not_in_full_lock')
  for(const name of Object.keys(pkg.dependencies??{})){const child=dependency(root,createRequire(file),name,runtimeFiles);walk(child.pkg,child.file)}
 }
 walk(pgEntry.pkg,pgEntry.file)
 const {default:pg}=await import(pathToFileURL(pgEntry.file).href)
 const from=relative=>import(pathToFileURL(root+'/'+relative).href)
 const [source,core,opinion,generated,fresh,installer,baseline,activation]=await Promise.all([
  from('services/pg-api/src/agent-generated-operator-source.mjs'),from('services/pg-api/src/agent-generated-operator-core.ts'),from('services/pg-api/src/agent-opinion-audit.ts'),from('services/pg-api/src/agent-generated-audit.ts'),
  from('services/pg-api/src/pg18-fresh-runtime-source.mjs'),from('services/pg-api/src/pg18-fresh-runtime-install.ts'),from('services/pg-api/src/baota-pg18-fresh-init.mjs'),from('services/pg-api/src/native-activation-cli.mjs')])
 const snapshot=await source.captureGeneratedOperatorSources();source.assertGeneratedOperatorDeployment(snapshot)
 for(const p of [...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql])if(!sourceFiles.has(p.path))refuse('source_asset_missing')
 const pools=new Set(),passwords=new Map(),systemIds=new Map();let serial=0,baseDump,baseRoles,baseBusiness,baseDatabase,closed=false
 let auditBaseline,diagnosticEmitted=false
 const config=(target,database=target.db,user='postgres',password=proof.password)=>({host:'127.0.0.1',port:target.port,database,user,password,ssl:false,options:'',max:8,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000})
 const connect=(target,database=target.db,user='postgres',password=proof.password)=>{const p=new pg.Pool(config(target,database,user,password));p.on('error',()=>{});pools.add(p);return p}
 let admin=connect(main),restoreAdmin=connect(restore)
 async function freshProof(pool,target){
  const v=(await pool.query(`SELECT current_database() AS db,session_user AS login,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('data_directory') AS pgdata,current_setting('cluster_name') AS cluster,(pg_control_system()).system_identifier::text AS system_id,pg_postmaster_start_time() AS started,
   (SELECT count(*)::integer FROM pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,
   (SELECT coalesce(jsonb_agg(rolname ORDER BY rolname),'[]'::jsonb) FROM pg_roles WHERE rolname !~ '^pg_') AS roles,
   (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS objects,
   (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS functions,
   (SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions`)).rows[0]
  const start=Date.parse(v?.started),created=Date.parse(target.created)
  if(!v||v.db!==target.db||v.login!=='postgres'||v.role!=='postgres'||v.address!=='127.0.0.1'||v.port!==target.port||v.version<180000||v.version>=190000||v.pgdata!==target.pgdata||v.cluster!==target.cluster||v.system_id!==target.systemIdentifier||!positive(v.system_id)||
   !Number.isFinite(start)||start<created-5000||start>Date.now()+2000||Date.now()-start>300000||v.schemas!==0||JSON.stringify(v.roles)!=='["postgres"]'||v.objects!==0||v.functions!==0||v.extensions!==0)refuse('fresh_empty_cluster')
  systemIds.set(target.id,v.system_id)
 }
 const auditLayers=[
  ['045','agent-collaboration-audit.ts','verifyAgentCollaborationCredentials'],['049','agent-memory-audit.ts','verifyAgentMemoryCredentials'],
  ['050','agent-memory-context-audit.ts','verifyAgentMemoryContextCredentials'],['051','agent-memory-derived-audit.ts','verifyAgentMemoryDerivedCredentials'],
  ['052','agent-memory-outcome-audit.ts','verifyAgentMemoryOutcomeCredentials'],['053','agent-memory-failure-source-audit.ts','verifyAgentMemoryFailureSourceCredentials'],
  ['054','agent-feedback-audit.ts','verifyAgentFeedbackCredentials'],['055','agent-optimization-audit.ts','verifyAgentOptimizationCredentials'],
  ['056','agent-review-audit-core.ts','verifyAgentReviewCore'],['057','agent-assessment-audit-core.ts','verifyAgentAssessmentCore'],['058','agent-opinion-audit-core.ts','verifyAgentOpinionCore'],
 ]
 const identifier=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_. ,\[\]=]{0,127}$/.test(v)
 function auditFrame(sql,values,rows,objects){
  for(const row of rows)if(Number.isSafeInteger(row.id)&&identifier(row.name))objects.set(row.id,row.name)
  const clean=rows.map(row=>Object.fromEntries(Object.entries(row).flatMap(([key,value])=>{
   if(typeof value==='boolean'||value===null||identifier(value)||hex(value)||['n','count'].includes(key)&&Number.isSafeInteger(value))return [[key,value]]
   if(Array.isArray(value)&&value.length<=32&&value.every(identifier))return [[key,value]]
   if(typeof value==='number')return /(?:^id$|oid$|owner$)/.test(key)?[[key+'_name',objects.get(value)??'unreported_oid']]:[[key,value]]
   if(typeof value==='string')return [[key+'_sha256',sha(value)],...(key==='expression'?[[key,value.slice(0,512)]]:[])]
   return [[key+'_sha256',sha(JSON.stringify(value)??String(value))]]
  }))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'))
  const failed=clean.find(row=>['ok','safe','clean','valid'].some(key=>row[key]===false))
  const targets=values.flatMap(value=>Array.isArray(value)?value.filter(identifier):identifier(value)?[value]:objects.has(value)?[objects.get(value)]:[]).slice(0,3)
  const frame={query_sha256:sha(sql),targets,row_count:rows.length,result_sha256:sha(JSON.stringify(clean)),sample:failed??clean[0]??null}
  Object.defineProperty(frame,'rows',{value:clean});return frame
 }
 async function auditProfile(pool){
  const layers=[]
  for(const [layer,file,method]of auditLayers){
   const c=await pool.connect(),queries=[],objects=new Map();let ok=false,code,session
   try{
    await c.query('BEGIN READ ONLY');await c.query('SET LOCAL ROLE agentstudio_api')
    if(layer==='051')session=(await c.query("SELECT session_user,current_user,current_setting('search_path') AS search_path")).rows[0]
    const module=await from('services/pg-api/src/'+file)
    // Transparent read-only tracing: all original validator queries/results
    // go to/from this real driver connection. No positive result is supplied.
    ok=await module[method]({async query(sql,values=[]){
     let result
     try{result=await c.query(sql,values)}catch(error){queries.push({...auditFrame(sql,values,[],objects),row_count:null,error_code:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'query_error'});throw error}
     queries.push(auditFrame(sql,values,result.rows,objects));return result
    }})===true
   }catch(error){code=/^unsafe_[a-z_]+$/.test(error.message??'')?error.message:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'diagnostic_error'}
   finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
   layers.push({layer,ok,code,queries,session})
  }
  const row=await databaseMetadata(pool)
  // Only digests of DB-level configuration/ACL leave this diagnostic probe.
  const database={owner:row.owner,acl_sha256:sha(JSON.stringify(row.acl)),settings_sha256:sha(JSON.stringify(row.settings)),locale_sha256:sha(JSON.stringify(row.locale))}
  return {layers,database}
 }
 async function diagnoseRestore(pool,stage){
  if(diagnosticEmitted)return;diagnosticEmitted=true
  try{
   const observed=await auditProfile(pool),differences=[]
   for(const current of observed.layers.filter(layer=>!layer.ok)){
    const previous=auditBaseline?.layers.find(item=>item.layer===current.layer)
    if(!previous)continue
    for(let i=0;i<current.queries.length&&differences.length<4;i++){
     const before=previous.queries[i],after=current.queries[i]
     if(!before||before.query_sha256!==after.query_sha256||before.result_sha256!==after.result_sha256){
      const changed=after.rows?.find(row=>JSON.stringify(row)!==JSON.stringify(before?.rows?.find(old=>old.name===row.name)))
      differences.push({layer:current.layer,query:i+1,before:before?{...before,sample:changed?before.rows?.find(row=>row.name===changed.name)??null:before.sample}:null,after:{...after,sample:changed??after.sample}})
     }
    }
   }
   const terminal=profile=>{const item=profile?.layers.find(row=>row.layer==='051');return item?{ok:item.ok,code:item.code,session:item.session,query_count:item.queries.length,last_queries:item.queries.slice(-3).map((q,i)=>({...q,query:Math.max(0,item.queries.length-3)+1+i,rows:q.rows?.slice(0,12)}))}:null}
   const value={stage,baseline_layers:auditBaseline?.layers.map(({layer,ok,code})=>({layer,ok,code})),layers:observed.layers.map(({layer,ok,code})=>({layer,ok,code})),derived051:{before:terminal(auditBaseline),after:terminal(observed)},database_before:auditBaseline?.database,database_after:observed.database,differences}
   while(JSON.stringify(value).length>10000&&value.differences.length)value.differences.pop()
   if(JSON.stringify(value).length>14000){for(const side of [value.derived051.before,value.derived051.after])if(side)side.last_queries=side.last_queries.slice(-1)}
   process.stderr.write('GENERATED_OPERATOR_RESTORE_DIAGNOSTIC:'+JSON.stringify(value)+'\n')
  }catch{process.stderr.write('GENERATED_OPERATOR_RESTORE_DIAGNOSTIC:'+JSON.stringify({stage,status:'diagnostic_probe_failed_original_failure_preserved'})+'\n')}
 }
 async function full(pool,installed=false,stage='full'){
  const c=await pool.connect();let failure
  try{await c.query('BEGIN READ ONLY');await c.query('SET LOCAL ROLE agentstudio_api');assert.equal(await opinion.verifyAgentOpinionCredentials(c),true);assert.equal(await generated.verifyAgentGeneratedCredentials(c),installed)}catch(error){failure=error}
  finally{await c.query('ROLLBACK');c.release()}
  if(failure){await diagnoseRestore(pool,stage);throw failure}
 }
 async function business(pool){return sha(JSON.stringify((await pool.query("SELECT jsonb_build_object('users',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,external_issuer,external_subject,display_name,status) ORDER BY id),'[]'::jsonb) FROM agentstudio.users),'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_array(user_id,enabled,governance_revision) ORDER BY user_id),'[]'::jsonb) FROM agentstudio_auth.accounts)) AS value")).rows[0].value))}
 async function databaseMetadata(pool){
  const c=await pool.connect()
  try{
   await c.query('BEGIN READ ONLY')
   const row=(await c.query(`SELECT d.datname AS name,owner.rolname AS owner,t.spcname AS tablespace,d.datistemplate AS is_template,d.datallowconn AS allow_connections,d.datconnlimit AS connection_limit,
    coalesce((SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END,grantor.rolname,a.privilege_type,a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END,grantor.rolname,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=a.grantee JOIN pg_catalog.pg_roles grantor ON grantor.oid=a.grantor),'[]'::jsonb) AS acl,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN s.setrole=0 THEN 'ALL' ELSE r.rolname END,ARRAY(SELECT value FROM pg_catalog.unnest(s.setconfig) AS config(value) ORDER BY value)) ORDER BY CASE WHEN s.setrole=0 THEN 'ALL' ELSE r.rolname END),'[]'::jsonb) FROM pg_catalog.pg_db_role_setting s LEFT JOIN pg_catalog.pg_roles r ON r.oid=s.setrole WHERE s.setdatabase=d.oid) AS settings,
    jsonb_build_object('encoding',pg_catalog.pg_encoding_to_char(d.encoding),'provider',d.datlocprovider,'collate',d.datcollate,'ctype',d.datctype,'locale',d.datlocale,'icu_rules',d.daticurules,'version',d.datcollversion) AS locale,
    pg_catalog.shobj_description(d.oid,'pg_database') AS comment
    FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles owner ON owner.oid=d.datdba JOIN pg_catalog.pg_tablespace t ON t.oid=d.dattablespace WHERE d.datname=current_database()`)).rows[0]
   assert.equal(row?.name,'agent_studio');return row
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release()}
 }
 async function owned(target){
  const again=inspectContainer(proof,target===main?'main':'restore');assert.equal(again.id,target.id)
  const p=connect(target,'postgres');try{const v=(await p.query("SELECT (pg_control_system()).system_identifier::text AS id,inet_server_port() AS port,current_setting('cluster_name') AS cluster,session_user AS login")).rows[0];assert.equal(v.id,systemIds.get(target.id));assert.equal(v.port,target.port);assert.equal(v.cluster,target.cluster);assert.equal(v.login,'postgres')}finally{await p.end();pools.delete(p)}
 }
 function dockerPg(target,program,args,input){if(!sealed.has(target)||!systemIds.has(target.id))refuse('unowned_dump_restore');return command('/usr/bin/docker',['exec','-i','--user','postgres','-e','PGPASSWORD='+proof.password,target.id,program,'--host=127.0.0.1','--port='+target.port,'--username=postgres',...args],input===undefined?{}:{input})}
 async function recreate(target,dump){
  await owned(target)
  assert.equal(target.db,'agent_studio')
  const p=connect(target,'postgres')
  try{await p.query('DROP DATABASE "agent_studio" WITH (FORCE)')}
  finally{await p.end();pools.delete(p)}
  // The real archive creates its original database and restores DB-level
  // owner/ACL/settings; never synthesize a replacement DB or rewrite the dump.
  dockerPg(target,'pg_restore',['--exit-on-error','--create','--dbname=postgres'],dump)
 }
 const allGroups={agentstudio_stage_login:['agentstudio_api'],agentstudio_stage_worker:['agentstudio_api','agentstudio_worker'],agentstudio_bound_dispatch_login:['agentstudio_bound_dispatch'],agentstudio_model_broker_login:['agentstudio_model_broker'],
  agentstudio_knowledge_index_worker_login:['agentstudio_knowledge_index_worker'],agentstudio_knowledge_index_broker_login:['agentstudio_knowledge_index_broker'],agentstudio_review_worker_login:['agentstudio_review_worker'],agentstudio_review_dispatch_login:['agentstudio_review_dispatch'],
  ci_custom_review_worker:['agentstudio_review_worker'],ci_custom_review_dispatch:['agentstudio_review_dispatch'],ci_custom_api:['agentstudio_api'],ci_nested_api:['ci_runtime_bridge']}
 async function login(db,name,groups,existing=false){
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(name)||groups.some(g=>!/^[a-z][a-z0-9_]{0,62}$/.test(g)))refuse('fixture_role')
  const password=randomBytes(40).toString('hex');passwords.set(name,password)
  await db.query((existing?'ALTER':'CREATE')+' ROLE '+name+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(password)+"'")
  for(const group of groups)await db.query('GRANT '+group+' TO '+name+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
 }
 async function reset(){
  for(const p of [...pools]){await p.end();pools.delete(p)}
  await recreate(main,baseDump);admin=connect(main);restoreAdmin=connect(restore)
  await full(admin,false,'main_restore058');assert.equal(await business(admin),baseBusiness)
  assert.deepEqual(await databaseMetadata(admin),baseDatabase,'main archive restore must preserve named database metadata')
 }
 async function evidence(){
  await owned(main);await full(admin,false)
  const state=(await admin.query(core.generatedOperatorTargetSql)).rows[0],catalog=(await admin.query(core.generatedOperatorCatalogSql)).rows[0].catalog,beforeDatabase=await databaseMetadata(admin)
  assert.deepEqual(beforeDatabase,baseDatabase,'source database metadata must match the validated baseline')
  const catalogSha=sha(JSON.stringify(catalog)),n=String(++serial),directory=privateRoot+'/evidence-'+n
  fs.mkdirSync(directory,{mode:0o700});privateStat(directory,true)
  const capturedAt=new Date().toISOString(),dump=dockerPg(main,'pg_dump',['--format=custom','--create','--dbname='+main.db]),roles=dockerPg(main,'pg_dumpall',['--roles-only','--no-role-passwords'])
  const dumpFile=privateWrite(directory+'/database.dump',dump),rolesFile=privateWrite(directory+'/roles.sql',roles)
  command('/usr/bin/tar',['-cf',directory+'/backup.tar','-C',directory,'database.dump','roles.sql']);fs.chmodSync(directory+'/backup.tar',0o600);privateStat(directory+'/backup.tar')
  // Recreate only the second attested disposable DB. Roles were actually
  // restored once below; later source/global role catalogs must remain equal.
  await restoreAdmin.end();pools.delete(restoreAdmin);await recreate(restore,dump);restoreAdmin=connect(restore)
  await full(restoreAdmin,false,'independent_restore058');assert.equal(await business(restoreAdmin),await business(admin))
  assert.deepEqual(await databaseMetadata(restoreAdmin),beforeDatabase,'independent archive restore must preserve named database metadata')
  assert.deepEqual(await databaseMetadata(admin),beforeDatabase,'source database metadata must remain unchanged')
  assert.equal(sha(fs.readFileSync(dumpFile)),sha(dump));assert.equal(sha(fs.readFileSync(rolesFile)),sha(roles))
  const globals=async p=>({roles:(await p.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconfig FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname")).rows,
   memberships:(await p.query("SELECT parent.rolname AS parent,child.rolname AS child,grantor.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE parent.rolname !~ '^pg_' OR child.rolname !~ '^pg_' ORDER BY parent.rolname,child.rolname,grantor.rolname")).rows})
  assert.deepEqual(await globals(restoreAdmin),await globals(admin))
  const archiveSha=sha(fs.readFileSync(directory+'/backup.tar'))
  const backup={format:'pg18_generated_059_backup_v1',archive_sha256:archiveSha,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,fresh_runtime_source_sha256:snapshot.manifest.default_fresh_source_sha256,captured_at:capturedAt}
  const backupBytes=Buffer.from(JSON.stringify(backup)+'\n'),backupSha=sha(backupBytes),verifiedAt=new Date().toISOString()
  const restored={format:'pg18_generated_059_restore_v1',backup_manifest_sha256:backupSha,archive_sha256:archiveSha,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,verified_at:verifiedAt,restored:true}
  const restoreBytes=Buffer.from(JSON.stringify(restored)+'\n'),raw={format:'agent_generated_operator_approval_v1',source_sha256:snapshot.source_sha256,system_identifier:state.system_identifier,database_oid:state.database_oid,predecessor_schema_sha256:catalogSha,
   fresh_runtime_source_sha256:snapshot.manifest.default_fresh_source_sha256,backup_manifest_sha256:backupSha,backup_archive_sha256:archiveSha,restore_evidence_sha256:sha(restoreBytes),expires_at:new Date(Date.now()+3600000).toISOString(),feature_disabled:true,maintenance_approved:true}
  const approvalBytes=Buffer.from(JSON.stringify(raw)+'\n'),approval=core.parseGeneratedOperatorApproval(raw,snapshot)
  core.verifyGeneratedOperatorBackupEvidence(approval,backup,restored,backupSha,sha(restoreBytes))
  const files={approval:privateWrite(directory+'/approval.json',approvalBytes),backup:privateWrite(directory+'/backup.json',backupBytes),restore:privateWrite(directory+'/restore.json',restoreBytes),admin:privateWrite(directory+'/admin.secret',proof.password)}
  return {approval,raw,files,directory,archiveSha,approvalSha:sha(approvalBytes),journal:[],async persist(record){privateWrite(directory+'/journal-'+this.journal.length+'.json',JSON.stringify(record)+'\n');this.journal.push(record)},beforeBusiness:await business(admin),beforeDatabase}
 }
 async function cli(mode,e,changes={}){
  const p='AGENT_STUDIO_GENERATED_059_',env={PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8',
   [p+'ENABLED']:'true',[p+'READ_APPROVED']:'APPROVE_GENERATED_059_READ_ONLY',[p+'APPROVAL_FILE']:e.files.approval,[p+'APPROVAL_SHA256']:e.approvalSha,[p+'BACKUP_MANIFEST_FILE']:e.files.backup,[p+'RESTORE_EVIDENCE_FILE']:e.files.restore,[p+'ADMIN_PASSWORD_FILE']:e.files.admin,
   ...(mode==='apply'?{[p+'WRITE_APPROVED']:'APPROVE_GENERATED_059_INSTALL_ONLY',[p+'JOURNAL_FILE']:e.directory+'/cli-journal.jsonl'}:{}),...changes}
  for(const key of Object.keys(env))if(env[key]===undefined)delete env[key]
  return await childNode([entry,'--'+mode,'--confirm-database','agent_studio','--expected-source-sha256',snapshot.source_sha256],env,root)
 }
 async function close(){if(closed)return;closed=true;await Promise.allSettled([...pools].map(p=>p.end()));pools.clear();passwords.clear()}
 try{
  await freshProof(admin,main);await freshProof(restoreAdmin,restore);assert.notEqual(systemIds.get(main.id),systemIds.get(restore.id))
  const original=fresh.captureFreshRuntimeSources(),c=await admin.connect()
  try{await c.query('BEGIN');await c.query(original.baseline.sql);await login(c,'agentstudio_stage_login',['agentstudio_api']);await login(c,'agentstudio_stage_worker',['agentstudio_api','agentstudio_worker']);await baseline.verifyFreshForTest(c);await installer.installFreshRuntime(c,original);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  for(const [suffix,expected]of Object.entries(extraSteps)){const bytes=fs.readFileSync(repo+'/db/postgres/migrations/pg_v9_'+suffix+'.sql');assert.equal(sha(bytes),expected);await admin.query(bytes.toString('utf8'))}
  await admin.query('CREATE ROLE ci_runtime_bridge NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT agentstudio_api TO ci_runtime_bridge WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  for(const [name,groups]of Object.entries(allGroups))await login(admin,name,groups,['agentstudio_stage_login','agentstudio_stage_worker'].includes(name))
  await login(admin,'agentstudio_native_login',[],true)
  const native=connect(main,main.db,'agentstudio_native_login',passwords.get('agentstudio_native_login'))
  try{const {NativeAuthRepository}=await import('../../src/native-auth-repository.mjs');const store=new NativeAuthRepository(native);await store.provisionInitialAdmin({email:'generated-operator-ci@example.test',password:'SyntheticOperatorAlice#'+randomBytes(12).toString('hex'),display_name:'Synthetic Operator Employee'})}finally{await native.end();pools.delete(native)}
  await full(admin,false,'bootstrap058');auditBaseline=await auditProfile(admin);baseBusiness=await business(admin);baseDatabase=await databaseMetadata(admin)
  baseDump=dockerPg(main,'pg_dump',['--format=custom','--create','--dbname='+main.db]);baseRoles=dockerPg(main,'pg_dumpall',['--roles-only','--no-role-passwords'])
  const roleText=baseRoles.toString('utf8');if((roleText.match(/^CREATE ROLE postgres;$/gm)??[]).length!==1)refuse('globals_format')
  // Both pristine clusters already possess postgres. Omit ONLY that duplicate
  // CREATE from the actual roles dump, retaining its real ALTER and grants.
  dockerPg(restore,'psql',['--no-psqlrc','--set=ON_ERROR_STOP=on','--dbname=postgres'],roleText.replace(/^CREATE ROLE postgres;\r?\n/m,''))
  return {proof,main,restore,root,privateRoot,entry,snapshot,core,opinion,generated,source,get admin(){return admin},get restoreAdmin(){return restoreAdmin},full,business,databaseMetadata,reset,evidence,cli,close,
   runtime(name){if(!passwords.has(name))refuse('unknown_synthetic_login');const pool=connect(main,main.db,name,passwords.get(name));return {pool,async close(){await pool.end();pools.delete(pool)}}},
   async recover(e,j=e.journal.at(-1)){return core.inspectGeneratedOperator(admin,snapshot,e.approval,j)},
   async assertUnchanged(e){await full(admin,false);assert.equal(await business(admin),e.beforeBusiness);assert.equal((await admin.query(core.generatedOperatorTargetSql)).rows[0].system_identifier,e.approval.system_identifier);assert.equal(sha(JSON.stringify((await admin.query(core.generatedOperatorCatalogSql)).rows[0].catalog)),e.approval.predecessor_schema_sha256)},
   async actualPlan(){return childNode([entry,'--plan'],childEnv,root)},
   async rawNode(args,env={}){return childNode([entry,...args],{...childEnv,...env},root)},
  }
 }catch(error){await close();throw error}
}
export function traceGeneratedOperatorPool(base,{before,after}={}){
 const trace=[],clients=[],transportErrors=[]
 return {trace,clients,transportErrors,pool:{async connect(){const raw=await base.connect(),onError=error=>transportErrors.push(error.code??'transport_error');raw.on('error',onError);let identity
  try{identity=(await raw.query('SELECT pg_backend_pid() AS pid,session_user AS login,current_user AS role')).rows[0];assert.equal(identity.login,'postgres');assert.equal(identity.role,'postgres')}catch(error){raw.release(true);throw error}clients.push(identity)
  return {release(destroy){if(destroy)raw.once('end',()=>raw.removeListener('error',onError));raw.release(destroy);if(!destroy)raw.removeListener('error',onError)},async query(sql,values=[]){trace.push({sql,values,pid:identity.pid});await before?.({sql,values,raw,pid:identity.pid});const result=await raw.query(sql,values);await after?.({sql,values,result,raw,pid:identity.pid});return result}}
 }}}
}
export function operatorGate(){let release,hit;const reached=new Promise(r=>{hit=r}),wait=new Promise(r=>{release=r});return {reached,release:()=>release(),async hold(value){hit(value);await wait}}}
export async function operatorUntil(fn,label,ms=15000){const until=Date.now()+ms;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('generated_operator_ci_timeout_'+label)}
