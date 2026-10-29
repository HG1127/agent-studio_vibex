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
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/approval-delegation-audit-core.ts": "7a2b204e095b4f31632b61d1e6ecfeffca040b41aaf5ac27fa82d30f5cdd5396",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "206cce0bb3cca19cdf169f22dfbc2cb971b9c73925ffc9ef48abfe99138c884a",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "ed429165f1fba857b986a2248c46f289aca220a01e4fe4a77ad27c278ef9968d",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "496621ea40c73bb0aaa02703047bc306788eb970ff4b9a6cb716a56ad871e3fa",
  "services/pg-api/src/http.ts": "68e7d8b34791dbf44e2ed52314aa2620f43b33ed3e62642988c4c60c3abf318f",
  "services/pg-api/src/native-auth-http.d.mts": "c28022dc065f11aa934ef16058cf11b0051325aa81dc53ed5993a1b411f41963",
  "services/pg-api/src/native-auth-http.mjs": "9e685f0ca21bd6ada835aa69af44508b207bbc8001b765685a624722bf72fa6f",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/native-server.ts": "2680c2370c193d690791e8096bb5ea2ffaa69d24a30e2c01edb64641d9627390",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "35b9aa6e2fd95cfde2b514c7c8a33bcb153673acbffa22db14187d61dd6db686",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "85a1e2ee7122ab005271eddfab7c76beb53ec4c5d470f15393c815f535b2cc74",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "97675ea3f633525ce529e5fa39099b0d030211dcae6fb50843d5b5ac051e7856",
  "services/pg-api/src/pg18-complete-profile.ts": "56d14a2a16bcc78330308c7a9f99c804ad5a6b3558b7b140f612ae34da5979ff",
  "services/pg-api/src/run-repository.ts": "303c2b60256dc42295d74702e14b0ab07d5a556dbe7bd5fbce6fd6c999421f15",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "edc0956ec2820bf701a147111d37e7e40eb21dd664d1c90f231a964e7831a8d6",
  "services/pg-api/src/workflow-v2-run-repository.ts": "6c0a8a3be99f08f692a2ce8a1133911260dfeae5a9206e4932856c4ed36ee487",
  "services/pg-api/src/workflow-v2-worker.ts": "3100b792b0a2fc6d2b9b16e69d82fa1245b61534586ee1a77abf4d358e35bfe7",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "src/lib/pgNativeAgentCreateJourney.ts": "5063c237e5d1c2fb7ef67bac18f76d488a10560add4ba90216064cdf87c9499d",
  "src/lib/pgNativeAgentCreateJourneyCache.ts": "d1a88ef5b2980cee63c1419912028ea41416a407c4c1bbada87d55be4c1ca06b",
  "src/lib/pgNativeAgentRunControl.ts": "149d2df06e614b2fc6b85945d9837e6b0be43ae702d23b520d66d5f814f2f622",
  "src/lib/pgNativeApprovalDelegationSession.ts": "7c63f1c1c2a69799686c7c7b9ca497d1170af7ff11d4643679ff9d8cb1aa6da4",
  "src/lib/pgNativeApprovalDelegations.ts": "dbc833a13803a9a3355de49b5f922754db53a0e8f405463c5dec97eebd5510a1",
  "src/lib/pgNativeAutonomousAgentSession.ts": "cb51f3680021377041dac425b4767172debaa853b47a68cbaf3562855ee50d4b",
  "src/lib/pgNativeDurableRunSession.ts": "60510959997a035535c66556ccf9ccc0a344b155e4ccd90c5b286a768a33d71d",
  "src/lib/pgNativePilotApi.ts": "53e514d3eb8980a189d7e9a6b2b5009292a25d505a38bfdcd1d379ac10f26ddb",
  "src/lib/pgNativeStudioNavigation.ts": "8509911393486f8f092386a34234f8d521185865325c8619281a3b9098135991",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "e3f8ebac7e181e783ae7e93be6f649c940f7a06abde745d697d580db9d2b90c9",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "88abe0b779b09e5b769d591724ed428b096aecfc3ec8d196339255caa1bd1958",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec"
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
