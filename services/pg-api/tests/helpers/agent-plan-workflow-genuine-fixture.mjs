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
  "services/pg-api/src/approval-delegation-audit-core.ts": "0be2d8be27c0b373a0dd69e09a196ba4b97f2758b7d2713baf90fcd1809c9029",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "9678d4f5ac3f690eb530e0e1ff94e32b9f3163bf3fd0cbbff964a4eed5259934",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "b58c0962e46f33efcc2e542d432cb02e0f8c0aac35fd2059e5f68e99d0b07e21",
  "services/pg-api/src/http.ts": "13be40fbd21cf705675b5fb5cc0af6e2db6d580da0496ae4c1111c53be0d8044",
  "services/pg-api/src/native-auth-http.d.mts": "a46bc0bc5e826b5bd8d81cd30d272b0b50117f403610798c867e3c0c083a8feb",
  "services/pg-api/src/native-auth-http.mjs": "1c6db59505c99128127b8f602b38c96a5a8bd822e0945ceda9b0e25a4cbf8a47",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/native-server.ts": "b4f6ec8fea80f61c78d7df8795c6ed4857b1cb1658d7ca688e701d0812a8b4dc",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "a2f3185a33de33fcd999d49d7ee02bcf52b742a1eab5856bc19b0daf394d32c0",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "3917e4db75d7a79c9497df0f56372656c81870bf14c9932999026e63fda3f147",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "3f6f2f702222d527c50210ea53b2a80abc2f7c8f9832ccaa68d58b28e1045f2a",
  "services/pg-api/src/pg18-complete-profile.ts": "4f2798a878d3869d015285597f334a1a21937778a6c719401af4b638a5e0f79b",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "edc0956ec2820bf701a147111d37e7e40eb21dd664d1c90f231a964e7831a8d6",
  "services/pg-api/src/workflow-v2-run-repository.ts": "e8376430c1b84fd7193d0a2b59afc58acd4767f5e8ff4a8e9e24bdb47e6302fa",
  "services/pg-api/src/workflow-v2-worker.ts": "92d7fcb43995d186c12209e6dfdfce4827199d6ff60cd1d28a264587813d14ca",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "src/lib/pgNativeAgentCreateJourney.ts": "5063c237e5d1c2fb7ef67bac18f76d488a10560add4ba90216064cdf87c9499d",
  "src/lib/pgNativeAgentCreateJourneyCache.ts": "d1a88ef5b2980cee63c1419912028ea41416a407c4c1bbada87d55be4c1ca06b",
  "src/lib/pgNativeAgentRunControl.ts": "149d2df06e614b2fc6b85945d9837e6b0be43ae702d23b520d66d5f814f2f622",
  "src/lib/pgNativeApprovalDelegationSession.ts": "7c63f1c1c2a69799686c7c7b9ca497d1170af7ff11d4643679ff9d8cb1aa6da4",
  "src/lib/pgNativeApprovalDelegations.ts": "dbc833a13803a9a3355de49b5f922754db53a0e8f405463c5dec97eebd5510a1",
  "src/lib/pgNativeAutonomousAgentSession.ts": "b6c29648b7f08cb92c18749ab4f504fdfd33ae84edc67edc3706dad45ada81a5",
  "src/lib/pgNativeDurableRunSession.ts": "60510959997a035535c66556ccf9ccc0a344b155e4ccd90c5b286a768a33d71d",
  "src/lib/pgNativePilotApi.ts": "d4898e7b8249f8eb00e8ebafb005835b7169573b7e7e1e4f5b85ea63cee2fc9f",
  "src/lib/pgNativeStudioNavigation.ts": "76d65257fa3c55d6aa7137bcc23f8f406b87abaa00711a6f037640832bafb569",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "2c2599e194292288d3a3bda23432cc8d1bdbbcd237f41e042b39ca64202b2e05",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "85f081a848c9ebfa28d6b332910f28d75577b6bd70bac06a7f6d27341709b515",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec",
  "services/pg-api/src/agent-run-control-admission.ts": "e907b0bfb6b445c8077f6ee17b3e3c9d73a1b373d56d8a9b9ae205bc20950a94",
  "services/pg-api/src/own-operations-contract.ts": "c5a5ababb17bed11959279b01657195b28af96ea909ff461535f9f19a26979ab",
  "services/pg-api/src/own-operations-repository.ts": "e685eb185d1d92596d93decd213aacaa7bcdaf12504dce4c5bb3ccaaa5afb075",
  "services/pg-api/src/agent-optimization-repository.ts": "957b6ea18077085709e8209c276b9be523126930ee12adaca11d6ae0b8bf4068",
  "services/pg-api/src/agent-optimization-retest-policy.ts": "f14883d0e5c0fd68b1472291a16e0ad8c08c9c9c9d468bd0b9be561e95cf1998",
  "services/pg-api/src/knowledge-index-service.ts": "bb8d3345460652a9b130a4df12af4b4fa997a18044d31ca25d2d4fe2316b02a4",
  "services/pg-api/src/knowledge-worker-heartbeat-lifecycle.ts": "31c77b39b0e25b01532d25a5b6e09f54f6e3465f9c3a1549cf90a763f2f179cf",
  "shared/agent-optimization-retest-contract.ts": "cdefa16278ba87bc7ef3aa10a3af59f3944a4bf3c9b99a0027f5b159e6482e5b",
  "local-executor/browser-server.mjs": "b05a401f8e507a8a989ee771173760111397828f1640e847cda0181f32eb7f9d",
  "local-executor/native-connection.mjs": "9739668820d790655f0670423b995635990ab1e1c3310d5fe5a63d92f6e2a862",
  "local-executor/native-run.mjs": "846a4947d4db2444f65ba28548f6b5386f639291f245f44e9fe6369b2dd806b9",
  "local-executor/office-table.mjs": "eb83713237a7f47f411c724823e3afea8e5b22e7079d0149477b37eba2052fc5",
  "local-executor/office-worker.mjs": "c2abd9abd34ed917c5d7bbe8edde236273e041d69c71db68cc0fb1f3bb2eb236",
  "local-executor/office.mjs": "7c3abc4f87c497ccc7dbaa84a83458fa0ac0f21e3c224be829799bfbe7110c8f",
  "local-executor/result.mjs": "9bb610ae182dbb903c00a12cefe5bcaf08acc29211c26731c344ff06b8f84e22",
  "local-executor/runtime.mjs": "e9e797cd8b4250a2b9515207761c56b35bbe7993613d6d0937c971f54196bf38",
  "services/pg-api/src/agent-human-input-policy.ts": "ac50ff7cdf68f523db52a404752d16598f2199f551990cf0b78ef67c60f8bc1b",
  "services/pg-api/src/bound-dispatch-server.ts": "486bb29963ee9e74c72aafa910bf521b9252fb5700da8206aa9a150e1451606e",
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/model-connection-executor.ts": "8f239d7f9e00d267fe4fb3e6d552d8c3761e445ce4c3d4f70d79fef6621aa1aa",
  "services/pg-api/src/native-credential-policy.ts": "702147e13c977c4d20ec54bf6cf7e85125ad1866983d7614daaa05a6fbde1cc2",
  "services/pg-api/src/native-local-agent-contract.ts": "76c1ed1c587bdb5d5d8e0c06b39771b1efa8d20e4de777367d8a573d49c66c5b",
  "services/pg-api/src/native-local-agent-resources.ts": "b55d540428348a8cf8f867fff283634451eafb1aafe4519aab143253e9515e5f",
  "services/pg-api/src/native-local-device-audit-manifest.ts": "e105dc5cbeb1c8d7927ed6cf3e8b72a96672d65a94373696aa5ad13fe494eda5",
  "services/pg-api/src/native-local-device-audit.ts": "68a0dc7268933fd96d00d02c4105181be91bd647b5abbd10bf5973aeb36aae47",
  "services/pg-api/src/native-local-device-execution.ts": "3fb168d7506fc2b2835e96920ab5e36839ba9891bf0a2c6da332a5117416ea54",
  "services/pg-api/src/native-local-device-http.ts": "9ff14f42fa1118aba622f43b5414623979fc77ac08b4b810e19f85c0f6977783",
  "services/pg-api/src/native-local-device-repository.ts": "73f491515d90a8f1e0cb7ae6ce4ed0df9bf17f1859bc0e395bd3fa4d744a759e",
  "services/pg-api/src/native-local-device-runtime-policy.ts": "a021e1d4668ad38de0131b714f85586e37370c1be8380b5ab63ba861bcb081f9",
  "services/pg-api/src/native-local-device-validation.ts": "95ef9a26fe938d262e6d66e81a50265dd919419ab832ca748716387002b223ae",
  "services/pg-api/src/workflow-graph-v2.ts": "3d3c0f24fee5173869dc5c407583bc58cd901ec480b374de67030255ded3587a",
  "services/pg-api/src/workflow-v2-agent-machine.ts": "5b30556c6fac26b13e30196c5a78444faf5d726a966298755f50411dab140b26",
  "services/pg-api/src/workflow-v2-agent-resources.ts": "2ee0506dd283b7c1c636fc7d98e4e0fb6c5439fc2a842c84666f310bb8c98188",
  "services/pg-api/src/workflow-v2-dispatch-guard.ts": "bbcd75f06f330a7a417275536f5864046beea8c857dbca8519e35805637dcb2f",
  "services/pg-api/src/workflow-v2-machine.ts": "e3621b34e5e4b2f590b6cb35e5f75d859cc12b70665d77c7b8733739fd949fb4",
  "services/pg-api/src/workflow-v2-model-dispatch.ts": "fc79e5048281f775248fa89aa9b3cbc6d88fe6929712a70a2fc2c7c618c00728",
  "services/pg-api/src/workflow-v2-tool-client.ts": "596b491c687d688c6859b28dfcc978387c7d6d7d37d8b603f15fbbdf47f7b1e9",
  "services/pg-api/src/workflow-v2-tool-dispatch.ts": "50067b1f06d665dc6c982137caa7f8d68cf1d1fa0ce51025e936fe3f396356b6",
  "services/pg-api/src/workflow-v2-tool-plan.ts": "196b47614e73d5421a6ebe08a29f89372fd07f4a98ff38f5921d7eea9bab012a",
  "services/pg-api/src/workflow-v2-worker-loop.ts": "ac8a6c7b74f50d9da268fd60b410768d2645e9c5c903df7bb80f9a671103c625",
  "shared/native-local-device-contract.d.mts": "bd0789512bb20b9bc4405f4b2ad9c8790e23b0cc0a5b970cbd065953479a55c1",
  "shared/native-local-device-contract.mjs": "1354c302ee2127a613b39f8f4df7d18051757a4b878b162557e59f8af586a928",
  "src/lib/pgNativeLocalDevice.ts": "255d079248f20b54f3c000f23cdb49ef7b99a12589039b218b9c585aa4b0fe31",
  "src/lib/pgNativeOfficeWorkflow.ts": "3f7e42d7dae05e20e7a1a8f14f7ebb8f442f79167f47bd7fa7883fafe3f1ea62",
  "src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx": "ab56c6035d92b833fd4b83b454100ef595526e549a66a732b23e3b87292df3e3",
  "src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx": "957f4eba1efc1497be3e6fd098add7c1cad54fe775c54fc3f0e0d9dcd868c1f1",
  "src/pages/PgNativePilot/useNativeLocalDevices.ts": "2122c7c04c71928d59f3576bede0fb4939195d922a91ca529ceff629760db55e"
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
