// New-purpose hosted synthetic fixture. Importing this file opens nothing.
import {requireOriginalHome070Ci} from './original-home070-ci-guard.mjs'
import {requireOriginalHome071Ci} from './original-home071-ci-guard.mjs'
import {requireOriginalLoginHome071Ci} from './original-login-home071-ci-guard.mjs'
export async function originalHome070GenuineFixture(env=process.env){
 return openOriginalHomeFixture(env,requireOriginalHome070Ci(env),'home070')
}
export async function originalHome071GenuineFixture(env=process.env){
 return openOriginalHomeFixture(env,requireOriginalHome071Ci(env),'home071')
}
export async function originalLoginHome071GenuineFixture(env=process.env){
 const permit=requireOriginalLoginHome071Ci(env)
 const f=await openOriginalHomeFixture(env,permit,'original-login-home071')
 try{
  const {default:assert}=await import('node:assert/strict')
  assert.equal(f.sourceManifest.profile,'original-login-home071')
  assert.equal(await f.inspect(),'absent');assert.equal(await f.inspectCatalog(),'absent')
  await f.install070()
  await f.install071()
  assert.equal(await f.inspect(),'installed');assert.equal(await f.inspectCatalog(),'installed')
  // Preserve the authentication story's read-only business surface.
  await f.prepare({enabled:true,writes:false});await f.prepareCatalog({enabled:true,writes:false})
  const installed=await f.inventory()
  assert.deepEqual(installed.tables,[...f.baseline.tables,'agentstudio.agent_spec_authoring','agentstudio.agent_spec_favorites'].sort())
  assert.deepEqual(installed.versions,[...f.baseline.versions,'pg_v9_070','pg_v9_071'].sort());assert.deepEqual(installed.roles,f.baseline.roles)
  assert.equal(f.ownOperationsSchemaVerified,true)
  const browserHomeProfile=Object.freeze({format:'agentstudio.original-login-home071.fixture.v1',profile:permit.profile,
   head:permit.head,catalog_profile:permit.catalog_profile,predecessor_profile:'complete069',fresh_F01_service_required:true,
   predecessor_source_and_catalog_verified:f.baseline.predecessor_source_and_catalog_verified,
   complete069_original_initializer_verified:false,optional070_verified:true,optional071_verified:true,
   own_operations_schema_verified:true,installed_versions:installed.versions,configuration_writes:false,
   Native_server_process_entry_verified:false,monitor073_installed:false,production_GO:false})
  return {...f,browserHomeProfile}
 }catch(error){try{await f.close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_login_home071_start_and_cleanup_failed')}throw error}
}
// No exported opener accepts a permit/profile or retargeted credentials.
async function openOriginalHomeFixture(env,permit,suite){
 const browserMode=suite==='original-login-home071',catalogSuite=suite==='home071'||browserMode
 const [{default:assert},fs,path,url,crypto,child,https,{agentDesignGenuineFixture},source,review,authModule,runtime,audit,delegation,devices,callers,trials,http,cookieModule,catalogRuntime,catalogAudit,review071]=await Promise.all([
  import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process'),import('node:https'),
  import('./agent-design-genuine-fixture.mjs'),import('../../src/pg18-complete-profile-source.mjs'),import('../../../../ops/pg18-original-home070-review-plan.mjs'),
  import('../../src/native-auth-http.mjs'),import('../../src/native-home-agent-specs-runtime.ts'),import('../../src/native-home-authoring-audit.ts'),
  import('../../src/approval-delegation-audit.ts'),import('../../src/native-local-device-audit.ts'),import('../../src/agent-caller-audit.ts'),import('../../src/owner-tool-trial-audit.ts'),import('../../src/http.ts'),import('../../src/native-employee-auth.mjs'),import('../../src/native-agent-catalog-runtime.ts'),import('../../src/native-agent-catalog-audit.ts'),import('../../../../ops/pg18-original-home071-review-plan.mjs')])
 const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'../../../..')
 const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex')
 const checkout=()=>{assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',maxBuffer:4096}).trim(),permit.head);assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8',maxBuffer:65536}).trim(),'','clean exact-head checkout required')}
 checkout()
 const snapshot=await source.captureCompleteProfileSources(),plan=await review.captureOriginalHome070ReviewPlan()
 assert.equal(plan.manifest.base_source_sha256,snapshot.source_sha256);assert.equal(plan.installed_profile_verified,false)
 assert.equal(plan.manifest.initialization_contract.profile,'original-home070');assert.equal(plan.manifest.initialization_contract.default_profile,'default050')
 const successor=catalogSuite?await review071.captureOriginalHome071ReviewPlan():null
 if(successor){assert.equal(successor.manifest.predecessor_source_sha256,plan.source_sha256);assert.equal(successor.manifest.profile,browserMode?permit.catalog_profile:permit.profile);assert.equal(successor.installed_profile_verified,false)}
 const extra=['services/pg-api/tests/helpers/original-home070-ci-guard.mjs','services/pg-api/tests/helpers/original-home071-ci-guard.mjs','services/pg-api/tests/helpers/original-home070-genuine-fixture.mjs','services/pg-api/tests/helpers/original-home071-genuine-fixture.mjs','services/pg-api/tests/helpers/original-home-owned-resources-case.mjs','services/pg-api/tests/original-home070-genuine-pg18.test.mjs','services/pg-api/tests/original-home071-genuine-pg18.test.mjs','services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs','services/pg-api/tests/helpers/agent-assessment-fixture.mjs','.github/workflows/pg18-agent-design-genuine-ci.yml']
 if(browserMode)extra.push('services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs','services/pg-api/tests/helpers/original-login-home071-genuine-fixture.mjs','tests/helpers/pg-original-login-browser-guard.mjs')
 const read=relative=>{let at=root;for(const part of relative.split('/')){assert.equal(fs.lstatSync(at).isSymbolicLink(),false);at=path.join(at,part)}const st=fs.lstatSync(at);assert(st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=16*1024*1024);return fs.readFileSync(at)}
 const pins=[...plan.manifest.optional_sql_sources,...plan.manifest.review_and_native_entry_sources,...(successor?[...successor.manifest.optional_sql_sources,...successor.manifest.catalog_entry_sources]:[]),...extra.map(file=>({path:file,sha256:sha(read(file))}))]
 const assertSources=()=>{checkout();source.assertCompleteProfileSnapshot(snapshot,snapshot.source_sha256);for(const pin of pins)assert.equal(sha(read(pin.path)),pin.sha256)}
 const sql070=plan.manifest.optional_sql_sources[0];assert.equal(sql070.path,'db/postgres/migrations/pg_v9_070_home_authoring.sql')
 let f,server,handler,home,catalogHttp,origin,allowedOrigin,catalogCountGate,ownOperationsSchemaVerified=false,closed=false,installed=false,installed071=false,dropNext=false
 const cookies=new Map(),transport={attempts:0,lostReplies:0},baseline={}
 const withApi=async(body,{identity,readOnly=true}={})=>{
  const db=await f.pool.connect();let begun=false
  try{
   await db.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');begun=true
   const actual=(await db.query("SELECT session_user::text AS login,current_user::text AS actor,r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
   assert.equal(actual.login,'synthetic_assessment_api');assert.equal(actual.actor,actual.login);assert.equal(actual.safe,true)
   await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog,public')
   let owner
   if(identity){owner=(await db.query('SELECT agentstudio.identity_user_id($1::text,$2::text) AS id',[identity.issuer,identity.subject])).rows[0].id;assert.ok(owner);await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])}
   const result=await body(db,owner)
   // All direct probes are read-only or intentionally rolled back, including
   // denied writes. Real facade/repository writes own their real transactions.
   return result
  }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
 }
 const prepare=async({enabled=false,writes=true}={})=>{
  const next=await runtime.prepareNativeHomeAgentSpecs({pool:f.pool,env:enabled?{AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true'}:{},listen:true,allowedOrigin,configurationWrites:writes,allowNativeLocalAgentSpecs:false,authenticateRequest:handler.authenticateRequest})
  home=next;return next
 }
 const prepareCatalog=async({enabled=false,writes=true}={})=>{
  assert.equal(catalogSuite,true)
  // Observe the real SQL result after COUNT, without rewriting a query, result,
  // identity, role or permission. Used only to exercise a concurrent snapshot.
  const observedPool={...f.pool,async connect(){const db=await f.pool.connect();return{async query(text,args=[]){const result=await db.query(text,args);const gate=catalogCountGate;if(gate&&!gate.seen&&text.startsWith('SELECT count(*)::text AS total')){gate.seen=true;gate.counted();await gate.held}return result},release(...args){return Reflect.apply(db.release,db,args)}}}}
  const next=await catalogRuntime.prepareNativeAgentCatalog({pool:observedPool,env:enabled?{AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED:'true'}:{},listen:true,allowedOrigin,configurationWrites:writes})
  catalogHttp=next?.createHandler(handler.authenticateRequest)??null;return catalogHttp
 }
 const raw=async(pathname,{who='alice',method='GET',body,headers={},cookie,csrf=true,sendOrigin=true,expectedEmployee}={})=>{
  assert.equal(typeof pathname,'string');assert(pathname.startsWith('/')&&!pathname.startsWith('//'))
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));transport.attempts++
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:'127.0.0.1',port:Number(new URL(origin).port),servername:'localhost',path:pathname,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',...(sendOrigin?{Origin:allowedOrigin}:{}),...(csrf&&method!=='GET'?{'X-AgentStudio-Request':'1'}:{}),...(pathname.startsWith('/api/v2/original-ui/agent-specs')&&['POST','PATCH'].includes(method)&&expectedEmployee!==null?{'X-AgentStudio-Expected-Employee':expectedEmployee??f.users[who]}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{}),...(cookie===null?{}:{Cookie:cookie??cookies.get(who)??''}),...headers}},res=>{
    const chunks=[];let size=0
    res.on('data',value=>{size+=value.length;if(size>1048576){res.destroy();return}chunks.push(Buffer.from(value))});res.once('error',reject);res.once('aborted',()=>reject(Error('original_home070_response_lost')))
    res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('original_home070_invalid_response'))}})
   });req.once('error',reject);req.end(bytes)
  })
 }
 const login=async who=>{const response=await raw('/api/native-auth/login',{who,method:'POST',body:f.credentials[who],cookie:null});assert.equal(response.status,200);const list=response.headers['set-cookie'];assert(Array.isArray(list));const full=list.find(value=>value.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='));assert(full);assert.match(full,/;\s*Secure/i);assert.match(full,/;\s*HttpOnly/i);const cookie=full.split(';',1)[0];cookies.set(who,cookie);const me=await raw('/api/native-auth/me',{who});assert.equal(me.status,200);assert.equal(me.body.authenticated,true);assert.equal(me.body.user.id,f.users[who]);return cookie}
 const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert(token);const actual=await f.auth.verifySession(token);assert(actual&&actual.issuer==='urn:agentstudio:local:v1');return actual}
 const catalogMutation=async(change,restore,body)=>{
  assertSources();await f.db.exec(change)
  try{return await body()}finally{await f.db.exec(restore);if(installed)assert.equal(await audit.inspectOptionalNativeHomeAuthoringSchema(f.pool),'installed');if(installed071)assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),'installed');assertSources()}
 }
 const close=async()=>{
  if(closed)return;closed=true
  catalogCountGate?.release();catalogCountGate=null
  const failures=[]
  if(server){server.closeAllConnections();try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('original_home070_close_timeout')),10000);server.close(()=>{clearTimeout(timer);resolve()})})}catch(error){failures.push(error)}}
  if(f){
   try{assert.equal(f.providerRequests.length,0);f.assertNoProviderErrors()}catch(error){failures.push(error)}
   try{await f.close()}catch(error){failures.push(error)}
  }
  cookies.clear();try{assertSources()}catch(error){failures.push(error)}
  if(failures.length)throw new AggregateError(failures,'original_home070_owned_cleanup_failed')
 }
 try{
  // Original F01 admission, real Native identities, CA-verified HTTPS and owned
  // cleanup stay intact. Its synthetic provider/worker is never ticked here.
  f=await agentDesignGenuineFixture(env,{browserMode})
  const actualTarget=(await f.db.query("SELECT current_database() AS database,session_user::text AS login,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary,(pg_control_system()).system_identifier::text AS system_identifier,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid")).rows[0]
  assert.equal(actualTarget.database,permit.target.database);assert.equal(actualTarget.login,permit.target.user);assert(actualTarget.version>=180000&&actualTarget.version<190000);assert.equal(actualTarget.primary,true);assert.match(actualTarget.system_identifier,/^[1-9][0-9]+$/);assert.match(actualTarget.database_oid,/^[1-9][0-9]+$/)
  baseline.target={profile:permit.profile,head:permit.head,...actualTarget};baseline.fresh_F01_service_required=true
  for(const version of ['063','064','065','066','067','068','069']){
   const pin=snapshot.manifest.sql_sources.find(entry=>entry.path.startsWith('db/postgres/migrations/pg_v9_'+version+'_'));assert(pin)
   const raw=read(pin.path);assert.equal(sha(raw),pin.sha256);await f.db.exec(raw.toString('utf8'))
  }
  baseline.tables=(await f.db.query("SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname")).rows.map(row=>row.name)
  baseline.versions=(await f.db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows.map(row=>row.version)
  baseline.roles=(await f.db.query('SELECT oid::text,rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_catalog.pg_roles ORDER BY rolname')).rows
  assert.deepEqual(baseline.tables,snapshot.tables);assert.deepEqual(baseline.versions,[...snapshot.versions,'pg18_fresh_runtime_001'].sort())
  await withApi(async db=>{for(const verify of [delegation.verifyApprovalDelegationCredentials,devices.verifyNativeLocalDeviceSchema,callers.verifyAgentCallerCredentials,trials.verifyOwnerToolTrialCredentials])assert.equal(await verify(db),true)})
  baseline.predecessor_source_and_catalog_verified=true
  baseline.complete069_original_initializer_verified=false // its fixed5333 target is not relabeled
  server=https.createServer({...f.serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!handler){res.writeHead(503);res.end();return}if(dropNext&&req.method==='POST'&&req.url==='/api/v2/original-ui/agent-specs'){dropNext=false;const end=res.end;res.end=function(...args){if(this.statusCode===201){transport.lostReplies++;this.destroy();return this}return end.apply(this,args)}}void handler.handler(req,res).catch(()=>res.destroy())})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  origin='https://localhost:'+server.address().port
  allowedOrigin=browserMode?permit.origin:origin
  let generic
  handler=authModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin,allowConfigurationWrites:true,businessHandler:async(req,res)=>{if(catalogHttp&&await catalogHttp(req,res))return;if(home&&await home(req,res))return;return generic(req,res)}})
  generic=http.createHandler({repository:f.agents,allowedOrigin,authenticateRequest:handler.authenticateRequest,verifyToken:async()=>{throw Error('original_home070_Native_cookie_only')}})
  if(browserMode){
   const [outcome,own,httpOwn,policy]=await Promise.all([import('../../src/agent-memory-outcome-audit.ts'),import('../../src/own-operations-repository.ts'),import('../../src/own-operations-http.ts'),import('../../src/native-config-uat-policy.ts')])
   const outcomeAvailable=await outcome.inspectAgentMemoryOutcomeSchema(f.pool)
   ownOperationsSchemaVerified=await own.inspectOwnOperationsSchema(f.pool,outcomeAvailable)
   assert.equal(ownOperationsSchemaVerified,true,'original_login_actual_owner_inbox_schema_required')
   const capabilities=policy.selectNativePg18UatCapabilities(env,true,allowedOrigin)
   assert.equal(capabilities.configurationWrites,false)
   generic=httpOwn.createNativeOwnOperationsBusinessHandler({repository:new own.OwnOperationsRepository(f.pool),available:ownOperationsSchemaVerified,
    policy:capabilities,businessHandler:generic,allowedOrigin,authenticateRequest:handler.authenticateRequest})
  }
  await prepare();await login('alice');await login('bob')
  assertSources()
  return {...f,baseline,sourceManifest:{profile:permit.profile,head:permit.head,source_sha256:(successor??plan).source_sha256,predecessor_source_sha256:successor?plan.source_sha256:null,pins},withApi,raw,login,identityFor,prepare,prepareCatalog,catalogMutation,transport,origin,nativeOrigin:origin,allowedOrigin,ownOperationsSchemaVerified,
   inspect:()=>audit.inspectOptionalNativeHomeAuthoringSchema(f.pool),
    inspectCatalog:()=>{assert.equal(catalogSuite,true);return catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool)},
   async install070(){assert.equal(installed,false);assertSources();const raw=read(sql070.path);assert.equal(sha(raw),sql070.sha256);await f.db.exec(raw.toString('utf8'));assert.equal(await audit.inspectOptionalNativeHomeAuthoringSchema(f.pool),'installed');installed=true;await prepare({enabled:true,writes:!browserMode});assertSources()},
    async install071(){assert.equal(catalogSuite,true);assert.equal(installed,true);assert.equal(installed071,false);assert.equal(await audit.inspectOptionalNativeHomeAuthoringSchema(f.pool),'installed');assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),'absent');assertSources();const sql=successor.manifest.optional_sql_sources[0],raw=read(sql.path);assert.equal(sha(raw),sql.sha256);await f.db.exec(raw.toString('utf8'));assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),'installed');installed071=true;await prepareCatalog({enabled:true,writes:!browserMode});assertSources()},
    async profileFor(who){const response=await raw('/api/native-auth/me',{who});assert.equal(response.status,200);assert.equal(response.body.authenticated,true);assert.equal(response.body.user.id,f.users[who]);return response.body.user},
    holdNextCatalogCount(){assert.equal(catalogSuite,true);assert.equal(catalogCountGate==null,true);let counted,release;const countedPromise=new Promise(resolve=>{counted=resolve}),held=new Promise(resolve=>{release=resolve});catalogCountGate={counted,held,release,seen:false};return{counted:countedPromise,release(){catalogCountGate?.release();catalogCountGate=null}}},
   async inventory(){return{tables:(await f.db.query("SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname")).rows.map(row=>row.name),versions:(await f.db.query('SELECT version FROM agentstudio.schema_migrations ORDER BY version')).rows.map(row=>row.version),roles:(await f.db.query('SELECT oid::text,rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_catalog.pg_roles ORDER BY rolname')).rows}},
   dropNextSuccessfulCreateReply(){dropNext=true},
   withEmployee:async(who,body,options={})=>withApi(body,{...options,identity:await identityFor(who)}),close}
 }catch(error){await close();throw error}
}
