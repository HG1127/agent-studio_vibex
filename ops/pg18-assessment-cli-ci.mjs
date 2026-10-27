#!/usr/bin/env node
// GitHub-only coordinator for a NEW synthetic container. No production target,
// host credential directory, Docker socket mount, image push or schema shortcut.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync,spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {requireAssessmentFullCliCi} from '../services/pg-api/tests/helpers/assessment-full-cli-ci-guard.mjs'

const root=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))
const baseImage='pgvector/pgvector:0.8.7-pg18'
const pgdata='/var/lib/postgresql/assessment-cli-ci'
const uid=20001
const labelPrefix='org.agentstudio.assessment-cli.'
const hash=raw=>createHash('sha256').update(raw).digest('hex')
const refuse=reason=>{throw Error('assessment_cli_coordinator_refused:'+reason)}
let phase='not_started'
const stage=value=>{phase=value}
const sourceSeeds=['services/pg-api/src/agent-assessment-service.ts','services/pg-api/tests/assessment-full-cli-lifecycle.integration.mjs']
const freshSqlPaths=['db/postgres/001_stage_schema.sql','db/postgres/010_pg18_native_auth_proposed.sql',...[
  '019_model_connections','020_model_credential_broker','021_tool_connections','022_schedule_draft_fence','023_workflow_safe_worker','024_bound_dispatch_identity','025_workflow_model_identity','026_workflow_tool_identity','027_workflow_agent_identity','028_autonomous_agent_identity','029_mcp_connections','030_mcp_tool_identity','031_smithery_managed','032_knowledge_access','033_knowledge_content','034_knowledge_runtime','035_knowledge_embedding_state','036_knowledge_embedding_consent','037_knowledge_index_runtime','038_knowledge_query_runtime','039_knowledge_execution_source','040_approved_semantic_tools','041_keyword_observations','042_agent_knowledge_observations','043_workflow_sample_lineage','044_schedule_execution','045_agent_collaboration','046_agent_releases','047_employee_governance','048_agent_human_input','049_agent_memory','050_agent_memory_context'
].map(name=>'db/postgres/migrations/pg_v9_'+name+'.sql')]
const optionalSql=['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization','056_agent_review_ledger','057_agent_assessment_execution'].map(name=>'db/postgres/migrations/pg_v9_'+name+'.sql')
const hostEnvironment=()=>Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP'].filter(key=>typeof process.env[key]==='string').map(key=>[key,process.env[key]]))
export function assessmentCliCoordinatorPlan(){return {mode:'plan',base_image:baseImage,network_mode:'none',published_ports:0,host_bind_mounts:0,tmpfs_mounts:['/run','/var/lib/postgresql'],test_uid:uid,database_port:5333,services_started:false,credentials_read:false,network_used:false,production_cutover_allowed:false}}
export function assessmentCliLabels(target){return {[labelPrefix+'run']:target.runId,[labelPrefix+'attempt']:target.runAttempt,[labelPrefix+'job']:'pg18-review-operator-lifecycle',[labelPrefix+'nonce']:target.nonce}}
export function assessmentCliPostgresArgv(target){return ['postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name=ci-review-'+target.nonce.slice(0,48)]}
function ownedContainer(observed,target,expected){
  const labels=observed?.Config?.Labels??{}
  if(observed?.Id!==target.containerId||observed.Name!=='/'+expected.name||observed.Image!==expected.imageId||Object.entries(assessmentCliLabels(target)).some(([key,value])=>labels[key]!==value))refuse('container_ownership')
}
export function inspectAssessmentCliContainer(observed,target,expected,now=Date.now()){
  ownedContainer(observed,target,expected)
  const host=observed.HostConfig,network=observed.NetworkSettings,created=Date.parse(observed.Created)
  const empty=value=>value==null||typeof value==='object'&&Object.keys(value).length===0
  // EXPOSE from the base image may appear as {"5432/tcp":null}; that is
  // documentation without a published endpoint. Any actual binding refuses.
  const unpublished=value=>value==null||typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(bindings=>bindings===null||Array.isArray(bindings)&&bindings.length===0)
  if(!Number.isFinite(created)||created<now-300000||created>now+5000||observed.State?.Running!==true||host?.NetworkMode!=='none'||host.Privileged!==false||!['','private'].includes(host.PidMode)||host.IpcMode==='host'||host.PublishAllPorts!==false||
    !unpublished(host.PortBindings)||!unpublished(network?.Ports)||!empty(host.Binds)||!empty(host.VolumesFrom)||!empty(host.Devices)||!empty(host.DeviceRequests)||!empty(host.CapAdd)||
    JSON.stringify(Object.keys(host.Tmpfs??{}).sort())!==JSON.stringify(['/run','/var/lib/postgresql'])||!Array.isArray(observed.Mounts)||observed.Mounts.some(m=>m.Type!=='tmpfs'||!['/run','/var/lib/postgresql'].includes(m.Destination))||
    JSON.stringify(observed.Config?.Cmd)!==JSON.stringify(assessmentCliPostgresArgv(target)))refuse('container_isolation')
  const settings=new Map((observed.Config.Env??[]).map(item=>{const n=item.indexOf('=');return [item.slice(0,n),item.slice(n+1)]}))
  if(settings.get('POSTGRES_USER')!=='postgres'||settings.get('POSTGRES_DB')!=='agent_studio'||settings.get('PGDATA')!==pgdata||settings.get('POSTGRES_PASSWORD')!=='synthetic-agentstudio-review-cli-'+target.runId+'-'+target.runAttempt)refuse('container_pg_profile')
  return {createdAt:observed.Created,labels:assessmentCliLabels(target)}
}
function codePath(rel){
  if(typeof rel!=='string'||!rel.match(/^[A-Za-z0-9_./-]+$/)||rel.includes('..')||!(rel.startsWith('services/pg-api/src/')||rel.startsWith('services/pg-api/tests/')||rel.startsWith('shared/'))||!rel.match(/\.(?:ts|mts|mjs|js)$/))refuse('source_path')
  return rel
}
export function assessmentCliContainedPath(repository,relative,kind='file'){
  const pinned=fs.realpathSync(repository)
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).some(part=>part==='..'||part===''))refuse('source_path_escape')
  const chunks=relative.split(/[\\/]/);let cursor=pinned
  for(let i=0;i<chunks.length;i++){
    cursor=path.join(cursor,chunks[i]);const stat=fs.lstatSync(cursor)
    if(stat.isSymbolicLink()||i<chunks.length-1&&!stat.isDirectory())refuse('source_path_link')
    if(i===chunks.length-1&&(kind==='file'?!stat.isFile():kind==='directory'?!stat.isDirectory():true))refuse('source_path_kind')
  }
  const canonical=fs.realpathSync(cursor),inside=path.relative(pinned,canonical)
  if(inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside))refuse('source_path_escape')
  return canonical
}
function regular(file){return fs.readFileSync(assessmentCliContainedPath(root,path.relative(root,file)))}
export function assessmentCliSourceInventory(){
  const packageFile=assessmentCliContainedPath(root,'services/pg-api/package.json'),modules=assessmentCliContainedPath(root,'services/pg-api/node_modules','directory')
  const require=createRequire(packageFile),parser=fs.realpathSync(require.resolve('typescript')),relative=path.relative(modules,parser)
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))refuse('parser_dependency_escape')
  const ts=require(parser),files=new Set()
  function visit(rel){
    codePath(rel);if(files.has(rel))return;files.add(rel)
    const code=regular(path.join(root,rel)).toString('utf8'),tree=ts.createSourceFile(rel,code,ts.ScriptTarget.Latest,true),targets=new Set()
    const add=node=>{if(node&&ts.isStringLiteralLike(node))targets.add(node.text)}
    const walk=node=>{
      if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))add(node.moduleSpecifier)
      else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){if(!ts.isStringLiteralLike(node.arguments[0]))refuse('computed_import');add(node.arguments[0])}
      else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))add(node.argument.literal)
      else if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'&&node.arguments?.length===2&&node.arguments[1].getText(tree)==='import.meta.url'){
        const value=node.arguments[0]
        // ../ is a cwd/root locator, not a source file. Every literal file
        // asset still reaches the strict code/SQL path rules below.
        if(ts.isStringLiteralLike(value)&&!value.text.endsWith('/')&&path.posix.extname(value.text))add(value)
      }
      ts.forEachChild(node,walk)
    }
    walk(tree)
    for(const target of targets)if(target.startsWith('.')){
      const next=path.posix.normalize(path.posix.join(path.posix.dirname(rel),target))
      if(next.startsWith('db/postgres/')&&next.endsWith('.sql'))continue // exact SQL list below
      visit(next)
    }
  }
  for(const seed of sourceSeeds)visit(seed)
  return files
}
async function prepareContext(directory){
  stage('source_inventory')
  const payload=path.join(directory,'payload'),manifest=new Map(),copy=(rel,raw)=>{
    if(rel.includes('\n')||rel.includes('\r')||rel.includes('\\')||path.posix.isAbsolute(rel)||rel.split('/').includes('..'))refuse('payload_path')
    const file=path.join(payload,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,raw);manifest.set(rel,hash(raw))
  }
  for(const rel of assessmentCliSourceInventory())copy(rel,regular(path.join(root,rel)))
  stage('sql_sources')
  // Validate every fixed SQL parent before calling the loader that reads it.
  // Keep this closed list aligned with the pinned fresh050 source fingerprint.
  for(const rel of [...freshSqlPaths,...optionalSql,'services/pg-api/package.json','services/pg-api/pnpm-lock.yaml'])copy(rel,regular(path.join(root,rel)))
  const snapshotSource=assessmentCliContainedPath(root,'services/pg-api/src/pg18-fresh-runtime-source.mjs')
  const {captureFreshRuntimeSources}=await import(pathToFileURL(snapshotSource).href)
  const snapshot=captureFreshRuntimeSources()
  if(snapshot.source_sha256!=='69cbb979c0f8de76f628309a33bbb9363e92edaacb2dfd4f18377b0cdbaef59e'||JSON.stringify(snapshot.sources.map(item=>item.path))!==JSON.stringify(freshSqlPaths)||snapshot.sources.some(item=>manifest.get(item.path)!==item.sha256))refuse('fresh_baseline_drift')
  // The API install is standalone/frozen/ignore-scripts in this hosted job.
  // Preserve only relative dependency links whose resolved target stays inside
  // the copied node_modules tree; never follow a workspace or host link.
  stage('dependency_copy')
  const modules=assessmentCliContainedPath(root,'services/pg-api/node_modules','directory')
  const inside=file=>{const rel=path.relative(modules,file);return rel===''||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
  function dependency(relative){
    const source=path.join(modules,relative),stat=fs.lstatSync(source),rel=path.posix.join('services/pg-api/node_modules',relative.split(path.sep).join('/')),destination=path.join(payload,rel)
    if(stat.isSymbolicLink()){
      const link=fs.readlinkSync(source),resolved=fs.realpathSync(source)
      if(path.isAbsolute(link)||!inside(resolved)||!fs.statSync(resolved).isDirectory()&&!fs.statSync(resolved).isFile())refuse('dependency_link_escape')
      fs.mkdirSync(path.dirname(destination),{recursive:true});fs.symlinkSync(link,destination)
      if(fs.statSync(source).isFile())manifest.set(rel,hash(fs.readFileSync(source)))
      return
    }
    if(stat.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const name of fs.readdirSync(source))dependency(path.join(relative,name));return}
    if(!stat.isFile())refuse('dependency_not_regular')
    copy(rel,fs.readFileSync(source))
  }
  dependency('')
  const sums=[...manifest].sort(([a],[b])=>a.localeCompare(b)).map(([rel,sha])=>sha+'  '+rel).join('\n')+'\n'
  fs.writeFileSync(path.join(payload,'SHA256SUMS'),sums)
  fs.writeFileSync(path.join(directory,'Dockerfile'),regular(path.join(root,'ops/ci/assessment-operator.Dockerfile')))
  return {sourceSha256:hash(sums),sourceFiles:manifest.size}
}
function docker(args,{env=hostEnvironment(),input,timeout=30000,inherit=false}={}){
  try{return execFileSync('docker',args,{env,input,encoding:'utf8',timeout,maxBuffer:32*1024*1024,stdio:inherit?'inherit':['pipe','pipe','pipe']})?.trim()??''}
  catch{refuse('docker_command_failed')}
}
const rootSetup=String.raw`import fs from 'node:fs';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const marker=JSON.parse(Buffer.concat(chunks));
for(const directory of ['/run/agentstudio-review-cli-ci','/run/credentials']){if(fs.existsSync(directory))throw Error('unexpected_ci_directory');fs.mkdirSync(directory,{mode:0o755})}
for(const kind of ['worker','broker']){const directory='/run/credentials/agentstudio-pg18-review-'+kind+'.service';fs.mkdirSync(directory,{mode:0o700});fs.chownSync(directory,20001,20001)}
fs.writeFileSync('/run/agentstudio-review-cli-ci/attestation.json',JSON.stringify(marker),{flag:'wx',mode:0o444});fs.chmodSync('/run/agentstudio-review-cli-ci',0o555);
`
// docker exec otherwise inherits PGDATA and the initialization password from
// postgres' container environment. Only this explicit CI control set reaches
// the test harness; actual service children apply a further smaller whitelist.
const testBootstrap=String.raw`import {spawn} from 'node:child_process';
const names=['PATH','HOME','TMPDIR','GITHUB_ACTIONS','CI','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL','AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED','AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD','AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID','AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE'];
const env=Object.fromEntries(names.filter(name=>typeof process.env[name]==='string').map(name=>[name,process.env[name]]));
const child=spawn(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','services/pg-api/tests/assessment-full-cli-lifecycle.integration.mjs'],{env,stdio:'inherit'});
child.once('error',()=>{process.stderr.write('ASSESSMENT_CLI_HARNESS_UNAVAILABLE\n');process.exitCode=1});child.once('exit',code=>{process.exitCode=code===0?0:1});
`
export function finishAssessmentCliResources(containerCleanup,contextCleanup){try{containerCleanup()}finally{contextCleanup()}}
export async function runAssessmentCliCoordinator(env=process.env){
  // The host gate is pure. Placeholder identity cannot unlock container/node
  // operations; the actual ID/nonce must subsequently pass docker inspect.
  stage('host_profile')
  if(process.platform!=='linux'||env.DOCKER_HOST!==undefined||env.DOCKER_CONTEXT!==undefined)refuse('host_profile')
  stage('ci_gate')
  const profile=requireAssessmentFullCliCi({...env,AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID:'f'.repeat(64),AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE:'e'.repeat(64)})
  const nonce=randomBytes(32).toString('hex'),target={runId:profile.runId,runAttempt:profile.runAttempt,nonce,containerId:''}
  const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'agentstudio-assessment-cli-ci-'))
  if(path.dirname(directory)!==parent)refuse('temporary_directory')
  const name='agentstudio-assessment-cli-'+target.runId+'-'+target.runAttempt+'-'+nonce.slice(0,12),tag='agentstudio-assessment-cli-ci:r'+target.runId+'-a'+target.runAttempt+'-'+nonce.slice(0,12)
  let imageId
  const inspect=()=>JSON.parse(docker(['inspect',target.containerId]))[0]
  try{
    const payload=await prepareContext(directory)
    stage('image_build')
    docker(['build','--file',path.join(directory,'Dockerfile'),'--tag',tag,directory],{timeout:600000,inherit:true})
    imageId=docker(['image','inspect',tag,'--format','{{.Id}}']);if(!/^sha256:[a-f0-9]{64}$/.test(imageId))refuse('image_identity')
    const password='synthetic-agentstudio-review-cli-'+target.runId+'-'+target.runAttempt
    const dockerEnv={...hostEnvironment(),POSTGRES_USER:'postgres',POSTGRES_DB:'agent_studio',POSTGRES_PASSWORD:password,PGDATA:pgdata}
    const args=['run','--detach','--name',name,'--network','none','--tmpfs','/run:rw,nosuid,nodev,noexec,size=32m,mode=0755','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,noexec,size=512m,mode=0755']
    for(const [key,value] of Object.entries(assessmentCliLabels(target)))args.push('--label',key+'='+value)
    for(const key of ['POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD','PGDATA'])args.push('--env',key)
    target.containerId=docker([...args,imageId,...assessmentCliPostgresArgv(target)],{env:dockerEnv,timeout:30000})
    stage('container_inspection')
    if(!/^[a-f0-9]{64}$/.test(target.containerId))refuse('container_identity')
    const expected={name,imageId};inspectAssessmentCliContainer(inspect(),target,expected)
    let ready=false
    stage('postgres_readiness')
    for(let attempt=0;attempt<90;attempt++){
      try{docker(['exec','--user','postgres',target.containerId,'pg_isready','-h','127.0.0.1','-p','5333','-U','postgres','-d','agent_studio'],{timeout:5000});ready=true;break}catch{}
      await delay(1000)
    }
    if(!ready)refuse('postgres_start_timeout')
    stage('postgres_fingerprint')
    const observed=inspect(),verified=inspectAssessmentCliContainer(observed,target,expected)
    const systemId=docker(['exec','--user','postgres',target.containerId,'psql','-X','-Atq','-p','5333','-U','postgres','-d','agent_studio','-c','SELECT system_identifier::text FROM pg_control_system()'])
    const netns=docker(['exec','--user','0',target.containerId,'readlink','/proc/self/ns/net']),postgresNetns=docker(['exec','--user','postgres',target.containerId,'readlink','/proc/self/ns/net'])
    if(!/^[1-9][0-9]{0,19}$/.test(systemId)||!/^net:\[[1-9][0-9]*\]$/.test(netns)||postgresNetns!==netns)refuse('postgres_namespace')
    const marker={format:'agentstudio_assessment_full_cli_ci_v1',repository:'HG1127/agent-studio_vibex',workflow:'Agent Studio PG18 review operator lifecycle isolated verification',job:'pg18-review-operator-lifecycle',run_id:target.runId,run_attempt:target.runAttempt,container_id:target.containerId,nonce,host_inspected:true,image:baseImage,image_id:imageId,source_sha256:payload.sourceSha256,created_at:verified.createdAt,network_mode:'none',published_ports:[],publish_all_ports:false,bind_mounts:[],devices:[],volumes_from:[],tmpfs_mounts:['/run','/var/lib/postgresql'],privileged:false,pid_mode:'private',labels:verified.labels,postgres_argv:assessmentCliPostgresArgv(target),netns,postgres_netns:postgresNetns,test_uid:uid,test_gid:uid,pg_system_identifier:systemId,pgdata,fresh_cluster:true}
    docker(['exec','--interactive','--user','0',target.containerId,'node','--input-type=module','-e',rootSetup],{input:JSON.stringify(marker)})
    stage('nonroot_lifecycle')
    const controls={GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio PG18 review operator lifecycle isolated verification',GITHUB_JOB:'pg18-review-operator-lifecycle',GITHUB_RUN_ID:target.runId,GITHUB_RUN_ATTEMPT:target.runAttempt,AGENT_STUDIO_ASSESSMENT_CLI_CI_EPHEMERAL:'true',AGENT_STUDIO_ASSESSMENT_CLI_CI_WRITE_APPROVED:'YES_DISPOSABLE_CONTAINER_ONLY',AGENT_STUDIO_ASSESSMENT_CLI_CI_ADMIN_PASSWORD:password,AGENT_STUDIO_ASSESSMENT_CLI_CI_CONTAINER_ID:target.containerId,AGENT_STUDIO_ASSESSMENT_CLI_CI_NONCE:nonce,HOME:'/tmp/assessment-ci',TMPDIR:'/tmp/assessment-ci'}
    const execution=['exec','--user',uid+':'+uid,'--workdir','/opt/assessment-ci']
    for(const key of Object.keys(controls))execution.push('--env',key)
    execution.push(target.containerId,'node','--input-type=module','-e',testBootstrap)
    const code=await new Promise((resolve,reject)=>{
      const child=spawn('docker',execution,{env:{...hostEnvironment(),...controls},stdio:'inherit'}),timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('assessment_cli_case_timeout'))},600000)
      child.once('error',()=>{clearTimeout(timer);reject(Error('assessment_cli_case_unavailable'))});child.once('exit',value=>{clearTimeout(timer);resolve(value)})
    })
    if(code!==0)refuse('lifecycle_cases_failed')
    process.stdout.write(JSON.stringify({mode:'verified',source_files:payload.sourceFiles,source_sha256:payload.sourceSha256,network_mode:'none',host_target_contacted:false,provider_egress_allowed:false,production_cutover_allowed:false})+'\n')
  }finally{
    finishAssessmentCliResources(()=>{
      if(target.containerId&&imageId){
        // Exact acknowledged CID/name/image/label check; no enumeration/prune.
        ownedContainer(inspect(),target,{name,imageId});docker(['rm','--force',target.containerId])
      }
    },()=>{
      if(path.dirname(directory)!==parent||!path.basename(directory).startsWith('agentstudio-assessment-cli-ci-'))refuse('cleanup_directory')
      fs.rmSync(directory,{recursive:true,force:true})
    })
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length===3&&process.argv[2]==='--plan')process.stdout.write(JSON.stringify(assessmentCliCoordinatorPlan())+'\n')
  else if(process.argv.length===3&&process.argv[2]==='--run')void runAssessmentCliCoordinator().catch(error=>{
    // Failure diagnostics contain fixed stages/codes and boolean gates only.
    // Never print an environment value, raw exception, argv, path or stack.
    if(process.env.GITHUB_ACTIONS==='true'&&process.env.CI==='true'){
      const value=typeof error?.message==='string'?error.message:'',match=/^assessment_cli_coordinator_refused:([a-z_]+)$/.exec(value)
      const reason=match?.[1]??(value==='refuse_non_ephemeral_assessment_full_cli_ci'?'ci_profile':/^[A-Z_]+$/.test(error?.code??'')?error.code:'unexpected_error')
      process.stderr.write(JSON.stringify({error:'ASSESSMENT_CLI_STAGE_FAILURE',phase,reason,gates:{platform_linux:process.platform==='linux',docker_override_absent:process.env.DOCKER_HOST===undefined&&process.env.DOCKER_CONTEXT===undefined,repository:process.env.GITHUB_REPOSITORY==='HG1127/agent-studio_vibex',workflow:process.env.GITHUB_WORKFLOW==='Agent Studio PG18 review operator lifecycle isolated verification',job:process.env.GITHUB_JOB==='pg18-review-operator-lifecycle',runner:process.env.RUNNER_ENVIRONMENT==='github-hosted',database_env:Object.keys(process.env).some(key=>key==='DATABASE_URL'||/^PG[A-Z_]/.test(key)),proxy_env:['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].some(key=>process.env[key]!==undefined),node_override:['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED'].some(key=>process.env[key]!==undefined)}})+'\n')
    }
    process.stderr.write('ASSESSMENT_CLI_COORDINATOR_REFUSED\n');process.exitCode=1
  })
  else{process.stderr.write('ASSESSMENT_CLI_COORDINATOR_EXPLICIT_MODE_REQUIRED\n');process.exitCode=1}
}
