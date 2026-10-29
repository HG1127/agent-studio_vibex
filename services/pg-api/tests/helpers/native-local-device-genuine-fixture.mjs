// Real isolated PG18 + Native Cookie HTTPS. No PGlite, session spoofing,
// table-return mocks, permission callbacks or fabricated positive auditors.
import {requireNativeLocalDeviceGenuineCi} from './native-local-device-genuine-guard.mjs'
// Literal reviewed Git LF sources; purpose guard runs before filesystem access.
export const nativeLocalDeviceGenuineFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_067_native_local_devices.sql": "003e2e5ffbe7893fe6290b65232c89d0156142ae88c2f6d98078daf6bbcddeb2",
  "local-executor/browser-server.mjs": "b05a401f8e507a8a989ee771173760111397828f1640e847cda0181f32eb7f9d",
  "local-executor/native-connection.mjs": "9739668820d790655f0670423b995635990ab1e1c3310d5fe5a63d92f6e2a862",
  "local-executor/native-run.mjs": "846a4947d4db2444f65ba28548f6b5386f639291f245f44e9fe6369b2dd806b9",
  "local-executor/office-table.mjs": "eb83713237a7f47f411c724823e3afea8e5b22e7079d0149477b37eba2052fc5",
  "local-executor/office-worker.mjs": "c2abd9abd34ed917c5d7bbe8edde236273e041d69c71db68cc0fb1f3bb2eb236",
  "local-executor/office.mjs": "7c3abc4f87c497ccc7dbaa84a83458fa0ac0f21e3c224be829799bfbe7110c8f",
  "local-executor/result.mjs": "9bb610ae182dbb903c00a12cefe5bcaf08acc29211c26731c344ff06b8f84e22",
  "local-executor/runtime.mjs": "e9e797cd8b4250a2b9515207761c56b35bbe7993613d6d0937c971f54196bf38",
  "package.json": "990cdbf4993cbca712fba52638354ea3902a30d30cb54ae88a1806c60f1aa722",
  "pnpm-lock.yaml": "1331a2facbfce348d255c96695dcda3d090d8cc307c5c9618a717d61daac81aa",
  "services/pg-api/src/agent-human-input-policy.ts": "ac50ff7cdf68f523db52a404752d16598f2199f551990cf0b78ef67c60f8bc1b",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "b58c0962e46f33efcc2e542d432cb02e0f8c0aac35fd2059e5f68e99d0b07e21",
  "services/pg-api/src/bound-dispatch-server.ts": "486bb29963ee9e74c72aafa910bf521b9252fb5700da8206aa9a150e1451606e",
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/http.ts": "13be40fbd21cf705675b5fb5cc0af6e2db6d580da0496ae4c1111c53be0d8044",
  "services/pg-api/src/model-connection-executor.ts": "8f239d7f9e00d267fe4fb3e6d552d8c3761e445ce4c3d4f70d79fef6621aa1aa",
  "services/pg-api/src/native-auth-http.d.mts": "a46bc0bc5e826b5bd8d81cd30d272b0b50117f403610798c867e3c0c083a8feb",
  "services/pg-api/src/native-auth-http.mjs": "1c6db59505c99128127b8f602b38c96a5a8bd822e0945ceda9b0e25a4cbf8a47",
  "services/pg-api/src/native-credential-policy.ts": "702147e13c977c4d20ec54bf6cf7e85125ad1866983d7614daaa05a6fbde1cc2",
  "services/pg-api/src/native-local-agent-contract.ts": "76c1ed1c587bdb5d5d8e0c06b39771b1efa8d20e4de777367d8a573d49c66c5b",
  "services/pg-api/src/native-local-agent-resources.ts": "b55d540428348a8cf8f867fff283634451eafb1aafe4519aab143253e9515e5f",
  "services/pg-api/src/native-local-device-audit-manifest.ts": "8dc56336e2f120a8847ccea5427d20f5d97427350541f6c5fdd1d6d79aedc5d0",
  "services/pg-api/src/native-local-device-audit.ts": "68a0dc7268933fd96d00d02c4105181be91bd647b5abbd10bf5973aeb36aae47",
  "services/pg-api/src/native-local-device-execution.ts": "3fb168d7506fc2b2835e96920ab5e36839ba9891bf0a2c6da332a5117416ea54",
  "services/pg-api/src/native-local-device-http.ts": "9ff14f42fa1118aba622f43b5414623979fc77ac08b4b810e19f85c0f6977783",
  "services/pg-api/src/native-local-device-repository.ts": "73f491515d90a8f1e0cb7ae6ce4ed0df9bf17f1859bc0e395bd3fa4d744a759e",
  "services/pg-api/src/native-local-device-runtime-policy.ts": "a021e1d4668ad38de0131b714f85586e37370c1be8380b5ab63ba861bcb081f9",
  "services/pg-api/src/native-local-device-validation.ts": "95ef9a26fe938d262e6d66e81a50265dd919419ab832ca748716387002b223ae",
  "services/pg-api/src/native-server.ts": "b4f6ec8fea80f61c78d7df8795c6ed4857b1cb1658d7ca688e701d0812a8b4dc",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "a2f3185a33de33fcd999d49d7ee02bcf52b742a1eab5856bc19b0daf394d32c0",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "3917e4db75d7a79c9497df0f56372656c81870bf14c9932999026e63fda3f147",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "41c7c706bc6825cdff3f2067aa4365dbc99dd10de4ff5fffcd30613e0551c2d2",
  "services/pg-api/src/pg18-complete-profile.ts": "4f2798a878d3869d015285597f334a1a21937778a6c719401af4b638a5e0f79b",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/workflow-graph-v2.ts": "3d3c0f24fee5173869dc5c407583bc58cd901ec480b374de67030255ded3587a",
  "services/pg-api/src/workflow-v2-agent-machine.ts": "5b30556c6fac26b13e30196c5a78444faf5d726a966298755f50411dab140b26",
  "services/pg-api/src/workflow-v2-agent-resources.ts": "2ee0506dd283b7c1c636fc7d98e4e0fb6c5439fc2a842c84666f310bb8c98188",
  "services/pg-api/src/workflow-v2-dispatch-guard.ts": "bbcd75f06f330a7a417275536f5864046beea8c857dbca8519e35805637dcb2f",
  "services/pg-api/src/workflow-v2-machine.ts": "e3621b34e5e4b2f590b6cb35e5f75d859cc12b70665d77c7b8733739fd949fb4",
  "services/pg-api/src/workflow-v2-model-dispatch.ts": "fc79e5048281f775248fa89aa9b3cbc6d88fe6929712a70a2fc2c7c618c00728",
  "services/pg-api/src/workflow-v2-run-repository.ts": "e8376430c1b84fd7193d0a2b59afc58acd4767f5e8ff4a8e9e24bdb47e6302fa",
  "services/pg-api/src/workflow-v2-tool-client.ts": "596b491c687d688c6859b28dfcc978387c7d6d7d37d8b603f15fbbdf47f7b1e9",
  "services/pg-api/src/workflow-v2-tool-dispatch.ts": "50067b1f06d665dc6c982137caa7f8d68cf1d1fa0ce51025e936fe3f396356b6",
  "services/pg-api/src/workflow-v2-tool-plan.ts": "196b47614e73d5421a6ebe08a29f89372fd07f4a98ff38f5921d7eea9bab012a",
  "services/pg-api/src/workflow-v2-worker-loop.ts": "ac8a6c7b74f50d9da268fd60b410768d2645e9c5c903df7bb80f9a671103c625",
  "services/pg-api/src/workflow-v2-worker.ts": "92d7fcb43995d186c12209e6dfdfce4827199d6ff60cd1d28a264587813d14ca",
  "services/pg-api/tests/helpers/native-local-device-genuine-guard.mjs": "9e194d2cf3e23331af47f7122cb4076fb1ab6802c225c0197f33acf971c8b2ba",
  "shared/native-local-device-contract.d.mts": "bd0789512bb20b9bc4405f4b2ad9c8790e23b0cc0a5b970cbd065953479a55c1",
  "shared/native-local-device-contract.mjs": "1354c302ee2127a613b39f8f4df7d18051757a4b878b162557e59f8af586a928",
  "src/lib/pgNativeAutonomousAgentSession.ts": "b6c29648b7f08cb92c18749ab4f504fdfd33ae84edc67edc3706dad45ada81a5",
  "src/lib/pgNativeLocalDevice.ts": "255d079248f20b54f3c000f23cdb49ef7b99a12589039b218b9c585aa4b0fe31",
  "src/lib/pgNativeOfficeWorkflow.ts": "3f7e42d7dae05e20e7a1a8f14f7ebb8f442f79167f47bd7fa7883fafe3f1ea62",
  "src/lib/pgNativePilotApi.ts": "d4898e7b8249f8eb00e8ebafb005835b7169573b7e7e1e4f5b85ea63cee2fc9f",
  "src/lib/pgNativeStudioNavigation.ts": "76d65257fa3c55d6aa7137bcc23f8f406b87abaa00711a6f037640832bafb569",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "2c2599e194292288d3a3bda23432cc8d1bdbbcd237f41e042b39ca64202b2e05",
  "src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx": "ab56c6035d92b833fd4b83b454100ef595526e549a66a732b23e3b87292df3e3",
  "src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx": "957f4eba1efc1497be3e6fd098add7c1cad54fe775c54fc3f0e0d9dcd868c1f1",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "85f081a848c9ebfa28d6b332910f28d75577b6bd70bac06a7f6d27341709b515",
  "src/pages/PgNativePilot/useNativeLocalDevices.ts": "2122c7c04c71928d59f3576bede0fb4939195d922a91ca529ceff629760db55e"
})
export async function nativeLocalDeviceGenuineFixture(env=process.env,{browserMode=false}={}){
 const target=requireNativeLocalDeviceGenuineCi(env)
 const [sourceFs,sourcePath,sourceUrl,sourceCrypto]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
 const sourceRoot=sourcePath.resolve(sourceUrl.fileURLToPath(new URL('../../../../',import.meta.url)))
 for(const [relative,expected] of Object.entries(nativeLocalDeviceGenuineFrozenSources)){
  const actual=sourceCrypto.createHash('sha256').update(sourceFs.readFileSync(sourcePath.join(sourceRoot,relative))).digest('hex')
  if(actual!==expected)throw Error('native_local_reviewed_source_changed:'+relative)
 }
 if(browserMode!==(env.GITHUB_JOB==='pg18-local-device-browser'))throw Error('native_local_genuine_job_mode_required')
 const [{default:assert},crypto,https,pgModule,baseModule,tlsModule,authModule,nativeModule,cookiesModule,repoModule,httpModule,auditModule,contractsModule,genericModule,runModule,toolsModule]=await Promise.all([
  import('node:assert/strict'),import('node:crypto'),import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-repository.mjs'),import('../../src/native-auth-http.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/native-local-device-repository.ts'),import('../../src/native-local-device-http.ts'),import('../../src/native-local-device-audit.ts'),import('../../src/contracts.ts'),import('../../src/http.ts'),import('../../src/autonomous-agent-run-repository.ts'),import('../../src/tool-connection-repository.ts')])
 const {randomUUID,createHash}=crypto,extraPools=[],cookies=new Map(),events=[],mutable={writes:true,dropNext:null,beforeAuthenticate:null}
 let base,server,tlsLifetime,finishTls,origin,allowedOrigin,serverTls,handler,closed=false
 const passwordFor=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
 const connect=login=>{const pool=new pgModule.default.Pool({...target,user:login,password:passwordFor(login),max:4,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});extraPools.push(pool);return{connect:()=>pool.connect()}}
 const raw=async(path,{method='GET',body,cookie,headers={},executor=false}={})=>{
  assert.ok(origin&&path.startsWith('/'));const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
  return new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port:Number(new URL(origin).port),servername:'localhost',path,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',...(executor?{}:{Origin:allowedOrigin}),...(method!=='GET'?{'Content-Type':'application/json',...(executor?{}:{'X-AgentStudio-Request':'1'})}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},response=>{
   const chunks=[];let n=0;response.on('data',piece=>{n+=piece.length;if(n>1600000){response.destroy(Error('native_local_genuine_response_bound'));return}chunks.push(Buffer.from(piece))});response.once('error',reject);response.once('aborted',()=>reject(Error('native_local_actual_ack_lost')));response.once('end',()=>{try{resolve({status:response.statusCode,headers:response.headers,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))})}catch{reject(Error('native_local_genuine_invalid_response'))}})
  });request.once('error',reject);request.end(bytes)})
 }
 const request=(who,path,body,options={})=>raw(path,{...options,method:options.method??(body===undefined?'GET':'POST'),body,cookie:cookies.get(who)})
 const executor=(token,operation,body,options={})=>raw('/api/public/native-local-executor/'+operation,{method:'POST',body,executor:true,headers:{...(token?{'X-Studio-Device-Token':token}:{}),...options.headers}})
 const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
 const login=async who=>{const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const set=response.headers['set-cookie'];assert.ok(Array.isArray(set));const cookie=set.find(c=>c.startsWith(cookiesModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
 const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const identity=await auth.verifySession(token);assert.ok(identity);return identity}
 let auth,executorPool
 async function close(){if(closed)return;closed=true;const errors=[]
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve)).catch(e=>errors.push(e))}
  finishTls?.();await tlsLifetime?.catch(e=>errors.push(e));for(const pool of extraPools){try{await pool.end?.()}catch(e){errors.push(e)}}
  try{await base?.close()}catch(e){errors.push(e)}cookies.clear();if(errors.length)throw new AggregateError(errors,'native_local_genuine_cleanup_failed')
 }
 try{
  base=await baseModule.agentAssessmentTcpFixture(env)
  for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share','067_native_local_devices'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
  const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs'),loginName='synthetic_local_executor'
  await base.db.exec('CREATE ROLE '+loginName+" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+makeNativeScramVerifier(passwordFor(loginName))+"'")
  await base.db.exec('GRANT agentstudio_local_executor TO '+loginName+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  executorPool=connect(loginName)
  try{await auditModule.inspectNativeLocalDevicePool(base.pool,'agentstudio_api');await auditModule.inspectNativeLocalDevicePool(executorPool,'agentstudio_local_executor')}
  catch(error){
   // Catalog-only observations of the ACTUAL installed database. No data rows,
   // credentials, token hashes, fake expected rows or positive audit callback.
   const routines=(await base.db.query("SELECT p.proname,oidvectortypes(p.proargtypes) args,p.proargnames names,pg_get_expr(p.proargdefaults,0,false) defaults,format_type(p.prorettype,NULL) returns,p.provolatile,p.proisstrict,p.prosecdef,p.proconfig,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') source_sha256 FROM pg_catalog.pg_proc p WHERE p.pronamespace='agentstudio'::regnamespace AND (starts_with(p.proname,'native_local_') OR p.proname IN('agent_design_sort_key','agent_design_number','agent_design_index_key','agent_design_compact','agent_design_digest','agent_design_native')) ORDER BY p.proname")).rows
   const constraints=(await base.db.query("SELECT c.conrelid::regclass::text table_name,c.conname,c.contype,c.convalidated,c.conenforced,pg_get_constraintdef(c.oid,false) definition FROM pg_catalog.pg_constraint c WHERE c.conrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace='agentstudio'::regnamespace AND relname IN('native_local_devices','native_local_receipts','native_local_run_devices','native_local_jobs')) ORDER BY c.conrelid,c.conname")).rows
   process.stderr.write(JSON.stringify({event:'native_local_actual_installed_catalog_observation',routines,constraints,observed_data_only:true})+'\n');throw error
  }
  auth=new authModule.NativeAuthRepository(connect('agentstudio_native_login'))
  let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{finishTls=resolve})
  tlsLifetime=tlsModule.withDisposableBoundModelTls(async()=>{throw Error('unexpected_native_local_fixture_model_dispatch')},async tls=>{
   serverTls=tls.serverTls;assert.ok(serverTls);server=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!handler){res.writeHead(503);res.end();return}void handler(req,res).catch(()=>res.destroy())});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
   origin='https://localhost:'+server.address().port;allowedOrigin=browserMode?'https://localhost:17443':origin
   const {selectNativeLocalDevices}=await import('../../src/native-local-device-runtime-policy.ts');const enabled=selectNativeLocalDevices(env,true,allowedOrigin,true);assert.equal(enabled.available,true);assert.equal(enabled.writes,true)
   const executorRepository=new repoModule.NativeLocalExecutorRepository(executorPool)
   handler=async(req,res)=>{
    const repository=new repoModule.NativeLocalDeviceRepository(base.pool,{allowWrites:mutable.writes});let local,generic
    const native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowLocalDevices:true,allowLocalDeviceWrites:mutable.writes,allowAutonomousAgentSubmission:true,businessHandler:async(incoming,outgoing)=>{if(await local(incoming,outgoing))return generic(incoming,outgoing)}})
    const authenticateRequest=async incoming=>{if(mutable.beforeAuthenticate)await mutable.beforeAuthenticate({path:incoming.url,method:incoming.method});return native.authenticateRequest(incoming)}
    local=httpModule.createNativeLocalDeviceHttp({repository,executor:executorRepository,authenticateRequest,allowedOrigin,allowWrites:mutable.writes})
    generic=genericModule.createHandler({allowNativeLocalAgentSpecs:true,repository:base.agents,modelConnectionRepository:base.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(base.pool,base.key),autonomousAgentRunRepository:new runModule.AutonomousAgentRunRepository(base.pool,{allowHumanInput:true,allowLocalDevices:true}),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('native_local_cookie_only')}})
    const drop=mutable.dropNext;if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const end=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this}return end.apply(this,args)}}
    events.push({path:req.url,method:req.method});return native.handler(req,res)
   }
   await login('alice');await login('bob');readyResolve();await finish
  },{listenPort:0,includeServerTls:true}).catch(e=>{readyReject(e);throw e});void tlsLifetime.catch(()=>{});await ready
  const counts=async()=> (await base.db.query("SELECT (SELECT count(*)::int FROM agentstudio.native_local_devices) devices,(SELECT count(*)::int FROM agentstudio.native_local_jobs) jobs,(SELECT count(*)::int FROM agentstudio.native_local_receipts) receipts,(SELECT count(*)::int FROM agentstudio.audit_events WHERE action LIKE 'local.%') audit,(SELECT count(*)::int FROM agentstudio.agent_specs) agents")).rows[0]
  return{...base,target,auth,executorPool,audit:auditModule,request,executor,login,identityFor,cookies,credentials,mutable,events,counts,nativeOrigin:origin,allowedOrigin,serverTls,close,randomUUID,contracts:contractsModule,
   childTlsCa:()=>Buffer.from(serverTls.ca)}
 }catch(e){await close();throw e}
}
