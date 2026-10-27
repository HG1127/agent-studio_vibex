// Hosted network-none container only. No product imports this fixture.
// Attestation precedes driver/Pool, credentials, bootstrap and TLS effects.
import {requireAssessmentFullCliCi,inspectAssessmentFullCliAttestation} from './assessment-full-cli-ci-guard.mjs'
import {createHash,randomBytes,X509Certificate} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync,lstatSync,realpathSync,readdirSync,mkdtempSync,openSync,writeFileSync,fstatSync,closeSync,constants} from 'node:fs'
import path from 'node:path'

const extraSteps=['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization','056_agent_review_ledger','057_agent_assessment_execution']
const loginNames=Object.freeze({api:'agentstudio_stage_login',worker:'agentstudio_review_worker_login',dispatch:'agentstudio_review_dispatch_login',secret:'agentstudio_model_broker_login',native:'agentstudio_native_login'})
const groups=Object.freeze({agentstudio_stage_login:['agentstudio_api'],agentstudio_stage_worker:['agentstudio_worker','agentstudio_api'],agentstudio_review_worker_login:['agentstudio_review_worker'],agentstudio_review_dispatch_login:['agentstudio_review_dispatch'],agentstudio_model_broker_login:['agentstudio_model_broker']})
const credentialDirectories=Object.freeze({worker:'/run/credentials/agentstudio-pg18-review-worker.service',broker:'/run/credentials/agentstudio-pg18-review-broker.service'})
const refuse=code=>{throw Error(code)}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)

async function proveFreshServer(admin,target){
  const db=await admin.connect();let begun=false
  try{
    await db.query('BEGIN READ ONLY');begun=true
    const row=(await db.query(`SELECT current_database() AS db,session_user AS login,current_user AS role,
      current_setting('server_version_num')::integer AS version,inet_server_port() AS port,host(inet_server_addr()) AS address,
      (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser,
      (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier,
      current_setting('cluster_name') AS cluster_name,current_setting('data_directory') AS data_directory,
      pg_postmaster_start_time() AS started_at,
      (SELECT count(*)::integer FROM pg_catalog.pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS app_schemas,
      (SELECT coalesce(jsonb_agg(rolname ORDER BY rolname),'[]'::jsonb) FROM pg_catalog.pg_roles WHERE rolname !~ '^pg_') AS user_roles,
      (SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','m','v','f','S')) AS user_relations,
      (SELECT count(*)::integer FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS user_functions,
      (SELECT count(*)::integer FROM pg_catalog.pg_extension WHERE extname<>'plpgsql') AS extra_extensions`)).rows[0]
    const started=row?.started_at instanceof Date?row.started_at.getTime():Date.parse(row?.started_at),created=Date.parse(target.containerCreatedAt),now=Date.now()
    if(!row||row.db!=='agent_studio'||row.login!==target.user||row.role!==target.user||row.superuser!==true||row.port!==5333||row.address!=='127.0.0.1'||row.version<180000||row.version>=190000||
      row.system_identifier!==target.systemIdentifier||row.cluster_name!==target.clusterName||row.data_directory!==target.pgdata||!Number.isFinite(created)||!Number.isFinite(started)||started<created-5000||started>now+2000||now-started>300000||row.app_schemas!==0||!same(row.user_roles,[target.user])||row.user_relations!==0||row.user_functions!==0||row.extra_extensions!==0)
      refuse('assessment_full_cli_fresh_server_required')
  }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
function emptyCredentialDirectories(target){
  for(const directory of Object.values(credentialDirectories)){
    const stat=lstatSync(directory)
    if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(directory)!==directory||stat.uid!==target.uid||stat.gid!==target.gid||(stat.mode&0o7777)!==0o700||readdirSync(directory).length)
      refuse('assessment_full_cli_empty_owned_credential_mount_required')
  }
}

export async function assessmentFullCliFixture(env=process.env){
  const proof=requireAssessmentFullCliCi(env)
  const target=inspectAssessmentFullCliAttestation(proof)
  if(createHash('sha256').update(readFileSync('/opt/assessment-ci/SHA256SUMS')).digest('hex')!==target.sourceSha256)refuse('assessment_full_cli_source_manifest_required')
  // No target or Pool supplied by callers; only the audit-sealed profile can
  // expose this exact isolated address and the matching cluster identity.
  const [{default:pg},{loadPg18CiBaseline},{captureFreshRuntimeSources},{installFreshRuntime},{verifyFreshForTest},{makeNativeScramVerifier}]=await Promise.all([
    import('pg'),import('../../src/pg18-ci-schema.mjs'),import('../../src/pg18-fresh-runtime-source.mjs'),import('../../src/pg18-fresh-runtime-install.ts'),import('../../src/baota-pg18-fresh-init.mjs'),import('../../src/native-activation-cli.mjs')])
  const pools=[],buffers=[],passwords=new Map()
  const own=bytes=>{buffers.push(bytes);return bytes}
  const pgTarget={host:target.host,port:target.port,database:target.database}
  const connect=(login,password,max=4)=>{const pool=new pg.Pool({...pgTarget,user:login,password,max,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});pools.push(pool);return pool}
  const admin=connect(target.user,target.password,6)
  const passwordFor=login=>{if(!passwords.has(login))passwords.set(login,randomBytes(40).toString('hex'));return passwords.get(login)}
  let closing
  const close=()=>closing??(closing=(async()=>{
    let timer
    try{const results=await Promise.race([Promise.allSettled(pools.map(pool=>pool.end())),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('assessment_full_cli_pool_close_timeout')),10000)})]);if(results.some(result=>result.status==='rejected'))refuse('assessment_full_cli_pool_close_failed')}
    finally{if(timer)clearTimeout(timer);for(const bytes of buffers)bytes.fill(0);passwords.clear()}
    // Credential/TLS scratch removal is left to the owner-validated container
    // teardown. Never recursively remove /run, PGDATA or a host directory.
  })())
  try{
    await proveFreshServer(admin,target)
    emptyCredentialDirectories(target)
    const snapshot=captureFreshRuntimeSources()
    const allowedSql=new Set([...snapshot.sources.map(source=>source.path.replace(/^db\/postgres\//,'')),...extraSteps.map(part=>'migrations/pg_v9_'+part+'.sql')])
    const sql=file=>{if(!allowedSql.has(file))refuse('assessment_full_cli_unreviewed_sql_source');return readFileSync(new URL('../../../../db/postgres/'+file,import.meta.url),'utf8').split(/\r?\n/).filter(line=>!line.trim().startsWith('\\')).join('\n')}
    const addLogin=async(db,login)=>{
      if(!Object.hasOwn(groups,login))refuse('assessment_full_cli_unreviewed_login')
      await db.query('CREATE ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(passwordFor(login))+"'")
      for(const role of groups[login])await db.query('GRANT '+role+' TO '+login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
    }
    const bootstrap=await admin.connect()
    try{
      await bootstrap.query('BEGIN')
      try{
        await bootstrap.query("SET LOCAL password_encryption='scram-sha-256'")
        await bootstrap.query(loadPg18CiBaseline().sql)
        await addLogin(bootstrap,'agentstudio_stage_login');await addLogin(bootstrap,'agentstudio_stage_worker')
        await verifyFreshForTest(bootstrap)
        // The attested profile matches original postgres/5333/agent_studio;
        // unlike the5432 fixture, no Native SQL precondition rewrite is needed.
        await installFreshRuntime(bootstrap,snapshot)
        await bootstrap.query('COMMIT')
      }catch(error){await bootstrap.query('ROLLBACK');throw error}
    }finally{bootstrap.release()}
    for(const part of extraSteps)await admin.query(sql('migrations/pg_v9_'+part+'.sql'))
    // Fresh050 intentionally disables these logins. This activation belongs
    // only to this attested synthetic fixture and never edits the initializer.
    for(const login of [loginNames.api,loginNames.native])await admin.query('ALTER ROLE '+login+" LOGIN PASSWORD '"+makeNativeScramVerifier(passwordFor(login))+"'")
    for(const login of [loginNames.worker,loginNames.dispatch,loginNames.secret])await addLogin(admin,login)
    const adapter=pool=>({knowledgeSharing:true,connect:()=>pool.connect()})
    const pool=adapter(connect(loginNames.api,passwordFor(loginNames.api))),workerPool=adapter(connect(loginNames.worker,passwordFor(loginNames.worker))),dispatchPool=adapter(connect(loginNames.dispatch,passwordFor(loginNames.dispatch))),secretPool=adapter(connect(loginNames.secret,passwordFor(loginNames.secret)))
    const [{verifyAgentAssessmentCredentials},{verifyBoundDispatchRole},{inspectAgentAssessmentOperatorPool}]=await Promise.all([import('../../src/agent-assessment-audit.ts'),import('../../src/bound-dispatch-role-preflight.ts'),import('../../src/agent-assessment-service.ts')])
    if(!await verifyAgentAssessmentCredentials(admin))refuse('assessment_full_cli_schema_required')
    const runtimeTarget={mode:'baota_pg18',...pgTarget,user:loginNames.api,expectedMajor:18}
    await verifyBoundDispatchRole(pool,runtimeTarget,'api');await verifyBoundDispatchRole(secretPool,runtimeTarget,'broker')
    await inspectAgentAssessmentOperatorPool(workerPool,{...runtimeTarget,user:loginNames.worker},'worker');await inspectAgentAssessmentOperatorPool(dispatchPool,{...runtimeTarget,user:loginNames.dispatch},'dispatch')
    const key=own(randomBytes(32))
    const [{NativeAuthRepository},{ModelConnectionRepository},{AgentSpecRepository},{safeAgentSpec},{AgentReviewSourceRepository},{AgentReviewLedgerRepository},{AgentFeedbackRepository},{AutonomousAgentRunRepository}]=await Promise.all([
      import('../../src/native-auth-repository.mjs'),import('../../src/model-connection-repository.ts'),import('../../src/repository.ts'),import('../../src/contracts.ts'),import('../../src/agent-review-source.ts'),import('../../src/agent-review-ledger.ts'),import('../../src/agent-feedback-repository.ts'),import('../../src/autonomous-agent-run-repository.ts')])
    const store=new NativeAuthRepository(adapter(connect(loginNames.native,passwordFor(loginNames.native))))
    const alicePassword='SyntheticCliAlice#'+randomBytes(12).toString('hex')
    const alice=await store.provisionInitialAdmin({email:'assessment-cli-alice@example.test',password:alicePassword,display_name:'Synthetic CLI Alice'})
    const session=await store.login('assessment-cli-alice@example.test',alicePassword)
    const bob=await store.provisionEmployee(session.token,{email:'assessment-cli-bob@example.test',password:'SyntheticCliBob#'+randomBytes(12).toString('hex'),display_name:'Synthetic CLI Bob'})
    const users={alice:alice.id,bob:bob.id},identities={},resources={},models=new ModelConnectionRepository(pool,key,secretPool),agents=new AgentSpecRepository(pool)
    for(const who of ['alice','bob']){
      identities[who]=(await admin.query('SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1',[users[who]])).rows[0]
      const created=await models.create(identities[who],{name:'Synthetic full CLI '+who,provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-full-cli-'+who+'-never-provider',models:['synthetic'],enabled:true})
      const model=await models.testConnection(identities[who],created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''}))
      const binding={connection_id:model.id,connection_revision:model.revision,model_id:'synthetic'}
      const spec=await agents.create(identities[who],'Synthetic full CLI '+who,safeAgentSpec({goal:'Synthetic CLI lifecycle '+who,task_scope:'Attested network-none test only',deliverables:['Metadata'],task_plan:[],done_criteria:['Zero provider effects'],tools:['calculate'],knowledge_base_ids:[],model_binding:binding}))
      resources[who]={model,binding,spec}
    }
    const scratch=mkdtempSync('/tmp/assessment-full-cli-tls-')
    if(path.dirname(realpathSync(scratch))!=='/tmp'||lstatSync(scratch).uid!==target.uid)refuse('assessment_full_cli_tls_scratch_required')
    const command=args=>execFileSync('openssl',args,{cwd:scratch,stdio:'ignore',timeout:20000,env:{PATH:'/usr/bin:/bin',HOME:scratch},windowsHide:true})
    command(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-keyout','ca.key','-out','ca.pem','-days','1','-subj','/CN=Disposable Review CLI CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'])
    for(const name of ['server','worker']){
      command(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=Disposable Review CLI '+name])
      writeFileSync(path.join(scratch,name+'.ext'),['basicConstraints=CA:FALSE','keyUsage=digitalSignature,keyEncipherment','extendedKeyUsage='+(name==='server'?'serverAuth':'clientAuth'),...(name==='server'?['subjectAltName=DNS:localhost,IP:127.0.0.1']:[])].join('\n'),{flag:'wx',mode:0o600})
      command(['x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','1','-sha256','-extfile',name+'.ext'])
    }
    const read=name=>own(readFileSync(path.join(scratch,name)))
    const tls={ca:read('ca.pem'),serverCert:read('server.pem'),serverKey:read('server.key'),clientCert:read('worker.pem'),clientKey:read('worker.key')}
    tls.serverFingerprint=new X509Certificate(tls.serverCert).fingerprint256;tls.clientFingerprint=new X509Certificate(tls.clientCert).fingerprint256
    const fileContents={worker:{'worker.secret':own(Buffer.from(passwordFor(loginNames.worker))),'review-ca.pem':tls.ca,'review-worker.pem':tls.clientCert,'review-worker.key':tls.clientKey},broker:{'api.secret':own(Buffer.from(passwordFor(loginNames.api))),'dispatch.secret':own(Buffer.from(passwordFor(loginNames.dispatch))),'broker.secret':own(Buffer.from(passwordFor(loginNames.secret))),'model-encryption.secret':own(Buffer.from(key.toString('hex'))),'review-ca.pem':tls.ca,'review-server.pem':tls.serverCert,'review-server.key':tls.serverKey}}
    for(const [kind,files] of Object.entries(fileContents))for(const [name,bytes] of Object.entries(files)){
      const file=credentialDirectories[kind]+'/'+name;let fd
      try{fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400);writeFileSync(fd,bytes);const stat=fstatSync(fd)
        if(!stat.isFile()||stat.uid!==target.uid||stat.gid!==target.gid||stat.nlink!==1||(stat.mode&0o7777)!==0o400||stat.size!==bytes.length||realpathSync(file)!==file)refuse('assessment_full_cli_credential_write_refused')
      }finally{if(fd!==undefined)closeSync(fd)}
    }
    const {agentAssessmentApproval}=await import('../../src/agent-assessment-contract.ts')
    const serviceEnv=kind=>{
      if(kind!=='worker'&&kind!=='broker')refuse('assessment_full_cli_unknown_service')
      return {PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:agentAssessmentApproval,AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',AGENT_STUDIO_PG_REVIEW_ORIGIN:'https://127.0.0.1:7459',AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:tls.serverFingerprint,AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:tls.clientFingerprint,AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:loginNames.worker,AGENT_STUDIO_PG_REVIEW_DISPATCH_LOGIN:loginNames.dispatch,AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',AGENT_STUDIO_PG_USER:loginNames.api,CREDENTIALS_DIRECTORY:credentialDirectories[kind]}
    }
    return {db:{query:(text,args=[])=>admin.query(text,args),exec:text=>admin.query(text)},pool,workerPool,dispatchPool,secretPool,key,sql,users,identities,resources,models,agents,
      review:new AgentReviewSourceRepository(pool),ledger:new AgentReviewLedgerRepository(pool,{allowSubmissions:true}),closed:new AgentReviewLedgerRepository(pool),feedback:new AgentFeedbackRepository(pool,{allowSubmit:true,allowLessonStorage:true}),owned:new AutonomousAgentRunRepository(pool,{allowHumanInput:true}),
      serviceEnv,tls,close}
  }catch(error){await close().catch(()=>undefined);throw error}
}
