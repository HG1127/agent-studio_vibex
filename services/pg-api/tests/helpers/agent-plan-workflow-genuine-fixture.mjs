// Real PG18 SQL/API-repository reproduction. Importing opens nothing.
// Provider/HTTP/browser/real Worker transport validation belongs to stage4.
import {requireAgentPlanWorkflowGenuineCi} from './agent-plan-workflow-genuine-guard.mjs'
// F05_SOURCE_PINS_BEGIN
export const agentPlanWorkflowFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_064_agent_plan_workflow.sql": "dbb01ca01ff50def0275d3bb14544313c19a263128012831a86a1573cb8ff9ba",
  "services/pg-api/src/agent-plan-workflow-audit-core.ts": "96385b5f918ce0dccc7850aeed38cc65aad5811dbeedeb2291bc6a94d8203b42",
  "services/pg-api/src/agent-plan-workflow-audit.ts": "e36302d24fb1cd13599eb551f6604dea0681d9de01a16939f3942ad7b5f6dbf1",
  "services/pg-api/src/agent-plan-workflow-predecessor-062-audit-core.ts": "761c136844c59b3824f78bc57e9f8a9a3ec7f2c69bd65ee545406046b4ae8566",
  "services/pg-api/src/agent-plan-workflow-predecessor-061-audit-core.ts": "7e41e4f9662db2fd021587cb930b76e01974e3ff0acf10b6f3c3e41df991542b",
  "services/pg-api/src/agent-plan-workflow-contract.ts": "1f18ad82acc3ab281dc162d8dfcf57f0b01e81302a8d3e4e1cb6d0ef4de0a667",
  "services/pg-api/src/agent-plan-workflow-result.ts": "4f0b822437d0b290740bed84c7ac45a39bdbcea4e5c236d50bf70a024e1c4063",
  "services/pg-api/src/agent-plan-workflow-source.ts": "4962c36f31c9f65c3538d30cb36edd4e589fd6a19458715844c6e1a9acbe809d",
  "services/pg-api/src/agent-plan-workflow-ledger.ts": "31df980d1aa8143ace94fa5dec3229b45c4ec63a00163106bdaadde5d13444a5",
  "services/pg-api/src/agent-plan-workflow-rpc-contract.ts": "5fc2539c329b71b53a8a6b6e060773cdb3e97d1c9501e2e6715c66f8eec6d2b7",
  "services/pg-api/src/agent-plan-workflow-runtime-policy.ts": "7e36024892c57813dbd40c6d04a4c40b8a3eed1495c1bc3e49507022cafd7d6e",
  "db/postgres/migrations/pg_v9_062_agent_design.sql": "bd735c5a61dab098c846c93e30a2fad636b409ded40064a8cf311e0710a1e82e",
  "db/postgres/migrations/pg_v9_063_agent_template_market.sql": "b582c1ab75780b36828f0f81c926f0bf9eb727a5b78d24be9fb838b5a9d1c80b",
  "services/pg-api/src/agent-design-audit-core.ts": "31d99e0f28c9d04402ec1b75db3714a41947c296cfba74a99d3dabcdf182a872",
  "services/pg-api/src/agent-design-audit.ts": "1efe6de5bea8e14fa4b957e050edddcfee9a595f438d636f9a4046cce0921f78",
  "services/pg-api/src/agent-design-predecessor-audit-core.ts": "5edd52d341068256567775b9234abe0a3bf39194ca51ac6b40933062d6e4c988",
  "services/pg-api/src/agent-template-market-audit-core.ts": "1f2c8edd622d4ade4f4198e0a7bd1c64e71be18944682b3b892fa37c87565e65",
  "services/pg-api/src/agent-template-market-audit.ts": "6fbc677dc83b845ab39ad7bb893309c8f1f2efc4be7eb41fff11d37255ff6d37",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs": "1d91520d5ec50021b6b1bc30294b608c33dd612547eb0aced8506bc7665e5bb1",
  "services/pg-api/src/pg18-fresh-runtime-install.ts": "9e38f9278d26b73b5894cf3618a3c17092b7fcca8e7d1b145bcedb4b9d16b0c7",
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c"
})
// F05_SOURCE_PINS_END
export async function agentPlanWorkflowGenuineFixture(env=process.env){
 const target=requireAgentPlanWorkflowGenuineCi(env)
 const [{default:assert},fs,path,url,crypto]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
 const root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url)))
 assert.ok(Object.keys(agentPlanWorkflowFrozenSources).length>=15,'reviewed source pins must be present before any database connection')
 for(const [relative,expected]of Object.entries(agentPlanWorkflowFrozenSources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),expected,'reviewed F05 source pin '+relative)
 const [pgModule,baseModule,auditModule,ledgerModule,sourceModule,contract,result,repository,authModule,activationModule,workflowModule,contracts]=await Promise.all([
  import('pg'),import('./agent-assessment-fixture.mjs'),import('../../src/agent-plan-workflow-audit.ts'),import('../../src/agent-plan-workflow-ledger.ts'),import('../../src/agent-plan-workflow-source.ts'),import('../../src/agent-plan-workflow-contract.ts'),import('../../src/agent-plan-workflow-result.ts'),import('../../src/repository.ts'),import('../../src/native-auth-repository.mjs'),import('../../src/native-activation-cli.mjs'),import('../../src/workflow-repository.ts'),import('../../src/contracts.ts')])
 const pg=pgModule.default,pools=[],roles=[];let base,closed=false
 const quote=value=>{assert.match(value,/^[a-z_][a-z_0-9]*$/);return '"'+value+'"'}
 const ownPool=(user,password)=>{const pool=new pg.Pool({...target,user,password,max:4,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});pools.push(pool);return pool}
 const mustClient=async(db,role)=>{
  assert.ok(db instanceof pg.Client);assert.equal(db.connectionParameters.host,'127.0.0.1');assert.equal(Number(db.connectionParameters.port),5432);assert.equal(db.connectionParameters.database,target.database)
  assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432)
  const r=(await db.query("SELECT current_user AS role,session_user AS login,pg_backend_pid() AS pid,current_database() AS db,current_setting('server_version_num')::integer AS version")).rows[0]
  assert.equal(r.role,role);assert.equal(r.login,db.connectionParameters.user);assert.equal(r.pid,db.processID);assert.equal(r.db,target.database);assert.ok(r.version>=180000&&r.version<190000)
  if(role!=='agentstudio_admin')assert.notEqual(r.login,target.user)
 }
 const close=async()=>{
  if(closed)return;closed=true
  const failures=[]
  for(const pool of pools)try{await pool.end()}catch(e){failures.push(e)}
  if(base){for(const {login,role}of roles)try{await base.db.query('REVOKE '+quote(role)+' FROM '+quote(login));await base.db.query('DROP ROLE '+quote(login))}catch(e){failures.push(e)};try{await base.close()}catch(e){failures.push(e)}}
  if(failures.length)throw new AggregateError(failures,'F05 genuine fixture cleanup failed')
 }
 try{
  base=await baseModule.agentAssessmentTcpFixture(env)
  for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
  const adminPool=ownPool(target.user,target.password)
  const admin=async body=>{const db=await adminPool.connect();try{await mustClient(db,target.user);return await body(db)}finally{db.release()}}
  const privatePools={}
  for(const [key,role]of [['worker','agentstudio_plan_workflow_worker'],['dispatch','agentstudio_plan_workflow_dispatch']]){
   const login='synthetic_f05_'+key,password=crypto.randomBytes(40).toString('hex')
   await admin(async db=>{await db.query('CREATE ROLE '+quote(login)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activationModule.makeNativeScramVerifier(password)+"'");roles.push({login,role});await db.query('GRANT '+quote(role)+' TO '+quote(login)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')})
   privatePools[key]=ownPool(login,password)
  }
  const authPassword=crypto.createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),auth=new authModule.NativeAuthRepository(ownPool('agentstudio_native_login',authPassword)),identities={}
  for(const who of ['alice','bob']){const logged=await auth.login('assessment-'+who+'@example.test',who==='alice'?'SyntheticAssessmentAlice#2026':'SyntheticAssessmentBob#2026');identities[who]=await auth.verifySession(logged.token);assert.ok(identities[who]);assert.equal(identities[who].issuer,'urn:agentstudio:local:v1')}
  const audit=auditModule.verifyAgentPlanWorkflowCredentials,source=new sourceModule.AgentPlanWorkflowSourceRepository(base.pool,audit)
  const ledger=new ledgerModule.AgentPlanWorkflowLedgerRepository(base.pool,{allowSubmissions:true,allowSaves:true,audit,workerPool:privatePools.worker,dispatchPool:privatePools.dispatch,executionEnabled:true,executionApproval:'APPROVE_DISPOSABLE_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_ONLY'})
  const api=async(who,body)=>repository.withActor(base.pool,identities[who],async(db,owner)=>{await mustClient(db,'agentstudio_api');assert.equal(owner,base.users[who]);assert.equal(await audit(db),true);return body(db,owner)})
  const asRole=async(pool,role,body)=>{const db=await pool.connect();let begun=false;try{await mustClient(db,db.connectionParameters.user);await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE '+quote(role));await mustClient(db,role);const value=await body(db);await db.query('COMMIT');begun=false;return value}finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}}
  const roleAudit=()=>Promise.all([api('alice',async()=>true),...Object.entries(privatePools).map(([key,pool])=>asRole(pool,'agentstudio_plan_workflow_'+key,db=>audit(db)))])
  const call=async(db,name,args=[])=>{
   const signatures={owner_state:'',source:'jsonb,boolean',record:'jsonb,jsonb',receipt:'uuid',read_result:'uuid',control:'jsonb',control_receipt:'uuid',save_record:'jsonb,jsonb',save_receipt:'uuid',claim:'uuid',pause:'uuid,uuid,bigint,uuid',context:'uuid,uuid,bigint,uuid',reserve:'uuid,uuid,bigint,uuid',finish:'uuid,uuid,bigint,uuid,jsonb'}
   assert.ok(Object.hasOwn(signatures,name));const types=signatures[name]?signatures[name].split(','):[];assert.equal(args.length,types.length)
   return(await db.query('SELECT agentstudio.agent_plan_workflow_'+name+'('+types.map((type,i)=>'$'+(i+1)+'::'+type).join(',')+') AS value',args.map((v,i)=>types[i]==='jsonb'?JSON.stringify(v):v))).rows[0].value
  }
  const submitted=async(who='alice',instruction=' 保留原文\n生成工作流草稿 ',generationModel=base.resources[who].binding)=>{
   const selection={purpose:contract.agentPlanWorkflowPurpose,spec_id:base.resources[who].spec.id,generation_model:generationModel},ref=await source.reference(identities[who],selection)
   const choice={action:'preview',purpose:contract.agentPlanWorkflowPurpose,source:ref.source,generation_model:selection.generation_model,instruction,output_token_limit:4096},prepared=await ledger.preview(identities[who],choice)
   const intent={...choice,action:'submit',request_id:crypto.randomUUID(),expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:contract.agentPlanWorkflowFeeAcknowledgement},receipt=await ledger.submit(identities[who],intent)
   return{who,identity:identities[who],choice,prepared,intent,receipt}
  }
  const proof=claim=>{const {lease_expires_at:_,...v}=claim;return v}
  const claimed=async p=>{const claim=await ledger.claim(crypto.randomUUID());assert.ok(claim);assert.equal(claim.request_id,p.intent.request_id);return proof(claim)}
  const output=()=>({protocol:'agent_plan_workflow_model_output_v1',name:'合成草稿',graph:{version:2,description:'仅供隔离验证',nodes:[{id:'start',type:'start',position:{x:0,y:0},data:{title:'开始'}},{id:'calc',type:'tool',position:{x:200,y:0},data:{title:'计算',tool:'calculate',params_template:'{{input}}'}},{id:'end',type:'end',position:{x:400,y:0},data:{title:'结束',output_template:'{{计算.output}}'}}],edges:[{id:'a',source:'start',target:'calc'},{id:'b',source:'calc',target:'end'}]}})
  const succeeded=async(who='alice')=>{const p=await submitted(who),lease=await claimed(p);await ledger.reserve(lease);const model=output(),completion={status:'succeeded',model_json:JSON.stringify(model)},reply=await ledger.finish(lease,completion);assert.equal(reply.state,'succeeded');const view=await ledger.view(p.identity,p.intent.request_id);assert.equal(view.result_status,'available');return{...p,lease,model,completion,reply,view}}
  const saveInput=async(p,edits=null)=>{const input={generation_request_id:p.intent.request_id,expected_result_sha256:p.view.result.result_sha256,edits},preview=await ledger.previewSave(p.identity,input),intent={action:'save',purpose:contract.agentPlanWorkflowPurpose,request_id:crypto.randomUUID(),generation_request_id:p.intent.request_id,source:p.receipt.source,expected_result_sha256:preview.result_sha256,expected_preview_sha256:preview.preview_sha256,expected_candidate_sha256:preview.candidate_sha256,confirm:true,save_acknowledgement:contract.agentPlanWorkflowSaveAcknowledgement};return{input,preview,intent}}
  const control=(p,action)=>({action,request_id:crypto.randomUUID(),generation_request_id:p.intent.request_id,confirm:true,acknowledgement:action==='cancel'?'APPROVE_EXACT_AGENT_PLAN_WORKFLOW_CANCEL_ONLY_V1':'APPROVE_EXACT_AGENT_PLAN_WORKFLOW_ERASE_ONLY_V1'})
  const state=()=>admin(async db=>(await db.query(`SELECT jsonb_build_object('requests',(SELECT count(*) FROM agentstudio.agent_plan_workflow_requests),'inputs',(SELECT count(*) FROM agentstudio.agent_plan_workflow_inputs),'jobs',(SELECT count(*) FROM agentstudio.agent_plan_workflow_jobs),'reservations',(SELECT count(*) FROM agentstudio.agent_plan_workflow_reservations),'outcomes',(SELECT count(*) FROM agentstudio.agent_plan_workflow_outcomes),'outputs',(SELECT count(*) FROM agentstudio.agent_plan_workflow_outputs),'controls',(SELECT count(*) FROM agentstudio.agent_plan_workflow_controls),'saves',(SELECT count(*) FROM agentstudio.agent_plan_workflow_save_receipts),'provenance',(SELECT count(*) FROM agentstudio.agent_plan_workflow_save_provenance),'workflows',(SELECT count(*) FROM agentstudio.workflows),'audits',(SELECT count(*) FROM agentstudio.audit_events),'old_runs',(SELECT count(*) FROM agentstudio.runs),'old_effects',(SELECT count(*) FROM agentstudio.external_effects)) AS value`)).rows[0].value)
  await roleAudit()
  return{...base,target,identities,adminPool,admin,privatePools,auth,audit,source,ledger,api,asRole,roleAudit,call,submitted,claimed,succeeded,saveInput,control,output,proof,state,contract,result,contracts,workflow:new workflowModule.WorkflowRepository(base.pool),mustClient,close}
 }catch(error){await close();throw error}
}
