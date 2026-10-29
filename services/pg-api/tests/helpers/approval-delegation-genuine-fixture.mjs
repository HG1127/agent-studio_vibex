// Actual new-purpose F27 PG18/Native HTTPS fixture. No pool/file/socket before
// the strict F27 wrapper. No F01-purpose impersonation, PGlite or auditor stub.
import {requireApprovalDelegationGenuineCi} from './approval-delegation-genuine-guard.mjs'

// SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_REVIEWED_H
export const approvalDelegationGenuineFrozenSources=Object.freeze({
  "db/postgres/001_stage_schema.sql": "af29a65a28c3dbde02bde8723b726f5493886d6d155142bc3bf00fd127be0f58",
  "db/postgres/005_claim_agent_prepare.sql": "15e5989f7e60580639e3b70016fb032a63cc2e19a501272e4f3ddad296831064",
  "db/postgres/009_claim_autonomous_agent.sql": "b4188f7965c8329ea30e52eb420b799735616825887412796a402616072c4ab1",
  "db/postgres/010_pg18_native_auth_proposed.sql": "a079eb21b4b568fc217c685b5754186c83f25c920a8ffa4e3cbb43337204e695",
  "db/postgres/migrations/pg_v9_019_model_connections.sql": "8cc09710963b293351fe940c3b9816eefdd4e74169e63df519963c616ec48165",
  "db/postgres/migrations/pg_v9_020_model_credential_broker.sql": "8b1f89474764f8b778794f640b5a8097a74a6ce2dc72d04e419cb99f4d455c6d",
  "db/postgres/migrations/pg_v9_021_tool_connections.sql": "b4813598d2425796807437711c850c69c7a7a19440d8e7dce9d7e87c70e88d7b",
  "db/postgres/migrations/pg_v9_022_schedule_draft_fence.sql": "d0dc31be66d536174412bc4b6d880154c42099dc208858152e3edeaa18a4bcfe",
  "db/postgres/migrations/pg_v9_023_workflow_safe_worker.sql": "86cd4687f4b8d7e5a069edee1de5a2346e9a5b99fac12c9d0ba0ef7d8d8fbf7d",
  "db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql": "014d1ccb4e20a79a7470a1d1af0c3decf847fd4980278070b88e86382a07ee5c",
  "db/postgres/migrations/pg_v9_025_workflow_model_identity.sql": "e381465d120fb4db72ef2ef5fb1234ee384df051197e327db3f341f53956af3f",
  "db/postgres/migrations/pg_v9_026_workflow_tool_identity.sql": "fbd3ca935c8042035dd912a22653e9d4e89ed2f90dac7433d341da21328ba602",
  "db/postgres/migrations/pg_v9_027_workflow_agent_identity.sql": "a2328b832557e2798d2ee28a6d4ff04085ab7dd5e43f34427083d375d4608266",
  "db/postgres/migrations/pg_v9_028_autonomous_agent_identity.sql": "61252ea7a1cd07e82a32c03f9cad729741ed3598aa4041b5738858971398b58b",
  "db/postgres/migrations/pg_v9_029_mcp_connections.sql": "b05d813d1f360c4f41cf8c7c89537a0deb4c97112ff218ec38ed909859a3b25c",
  "db/postgres/migrations/pg_v9_030_mcp_tool_identity.sql": "2f9d84779b88e07864fa9dc5684097afeb80a17d9e999fc7580ec8bb7e7da31d",
  "db/postgres/migrations/pg_v9_031_smithery_managed.sql": "97cb633de97819dee8cc23e5b2560e52f42c7aa41b2bd772987513cc73aae094",
  "db/postgres/migrations/pg_v9_032_knowledge_access.sql": "214661d3da9bfe664f882c81a7e183b1381f610cf820fdab65426c9545a59327",
  "db/postgres/migrations/pg_v9_033_knowledge_content.sql": "2106ee6b54d3a76c6dd668aa39567d759e31b30d4b4ed7095afe11fd184e4f6c",
  "db/postgres/migrations/pg_v9_034_knowledge_runtime.sql": "96d311946f7ff4edb9e2f676090f194ff78f4688a34af0f89ee406e29a08b4ce",
  "db/postgres/migrations/pg_v9_035_knowledge_embedding_state.sql": "1017a4837a8fbed996ce0976e0e23499181f79bfab4edb2ad18e60509580776a",
  "db/postgres/migrations/pg_v9_036_knowledge_embedding_consent.sql": "a80f2574b7daccdd828e9e4554b86dd2306096ff250e735eea627b567d6a8474",
  "db/postgres/migrations/pg_v9_037_knowledge_index_runtime.sql": "c52881b111c9e0b642d4c57bc95a7788fd55532d1a7c00503fd27298753f5e9c",
  "db/postgres/migrations/pg_v9_038_knowledge_query_runtime.sql": "aade721ad2d592c07bc016627fa68f765366877fad2876db1ace02685b6fa848",
  "db/postgres/migrations/pg_v9_039_knowledge_execution_source.sql": "f1a63f4a3858baf4d58b16c3b44b28b1ad44255f19186a71ed2591ab8bfb0d76",
  "db/postgres/migrations/pg_v9_040_approved_semantic_tools.sql": "872709dc884656a756cd0ebf16413bb4353f50b7f0bcf9f9826ce3510a513b4a",
  "db/postgres/migrations/pg_v9_041_keyword_observations.sql": "15d00b287e2b8a094a77e6b6d50ecd46a5ff5f28e5442120da4f967a993746f5",
  "db/postgres/migrations/pg_v9_042_agent_knowledge_observations.sql": "d1430704ff5484b5e534fe10a7099ad78c84b4b19a0f56eaba20d344b17718ee",
  "db/postgres/migrations/pg_v9_043_workflow_sample_lineage.sql": "4b6c340b5be4cc85e36e541d31f94cadc838d9cbb46bf271b7468ffe8455aa2f",
  "db/postgres/migrations/pg_v9_044_schedule_execution.sql": "6069d9e556a12fac57ee11556b573d1a51e4638dc2d453d1b72fb53743449de7",
  "db/postgres/migrations/pg_v9_045_agent_collaboration.sql": "cd26ccd3ebdaa1f6e727a4563a13c39e7abdd4c0901e136413b8789b3a37b872",
  "db/postgres/migrations/pg_v9_046_agent_releases.sql": "95b89d0d904e8130963378e3ef03874fc6e4cdcd43c6d56b38db2ccfda3c9dfa",
  "db/postgres/migrations/pg_v9_047_employee_governance.sql": "a766ec0adf05ea04fe72550f5a0fd24dad383f02c0134f6b38b3c4e1f6f06022",
  "db/postgres/migrations/pg_v9_048_agent_human_input.sql": "57ac90dbe6fe73d6653e249d9bb94c1364c289799e979f38c41c6da107cc7fd8",
  "db/postgres/migrations/pg_v9_049_agent_memory.sql": "963f8e6fbfe9a18796579931a989e3d47b5c4b54492343acc2142f5e1575d2e3",
  "db/postgres/migrations/pg_v9_050_agent_memory_context.sql": "d7889f7dc7be4cd6a8d6d00d2895a1c954c29da6d66d1b55ba02534e43275c89",
  "db/postgres/migrations/pg_v9_051_agent_memory_derived.sql": "2d23d26f11cd2c86e603a59e0355706a76d082a9a97261dfd9aa4522e30d7de1",
  "db/postgres/migrations/pg_v9_052_agent_memory_outcome.sql": "ae6d8d0d2d61c8887e4807313d218d4d89f8fdfdf482f5a28907c81ef08642cf",
  "db/postgres/migrations/pg_v9_053_agent_memory_failure_source.sql": "c8df98a50f5a22245031bea13182a668016f7b5548fe92e76d6022833bcd25c4",
  "db/postgres/migrations/pg_v9_054_agent_feedback.sql": "872510847e8c1a8dfd3043dd89bbc419c5edfca7f4264a6fa06c1e378bc43b9a",
  "db/postgres/migrations/pg_v9_055_agent_optimization.sql": "e379316acc119e28c3e4f54108b8f10138e7a485bc75d9753f8a3bc2cc9ae3b0",
  "db/postgres/migrations/pg_v9_056_agent_review_ledger.sql": "50e1b8e33b44f8075daaf6bcb9413b932e2127d117d6f37740312822925ac2d5",
  "db/postgres/migrations/pg_v9_057_agent_assessment_execution.sql": "c34737b9982429ad79dec0d36420f5186b32bdbb5d2964b202d5c83ec86dc13f",
  "db/postgres/migrations/pg_v9_058_agent_opinion_read.sql": "98116d261958358a800754bc631726d373e6d7986dbfb73e700de624f2f5e92e",
  "db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql": "74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063",
  "db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql": "b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9",
  "db/postgres/migrations/pg_v9_061_company_overview.sql": "fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923",
  "db/postgres/migrations/pg_v9_062_agent_design.sql": "bd735c5a61dab098c846c93e30a2fad636b409ded40064a8cf311e0710a1e82e",
  "db/postgres/migrations/pg_v9_063_agent_template_market.sql": "b582c1ab75780b36828f0f81c926f0bf9eb727a5b78d24be9fb838b5a9d1c80b",
  "db/postgres/migrations/pg_v9_064_agent_plan_workflow.sql": "dbb01ca01ff50def0275d3bb14544313c19a263128012831a86a1573cb8ff9ba",
  "db/postgres/migrations/pg_v9_065_agent_internal_share.sql": "e1996ca4f767a8bdfd1f8c430f3e213f1cea49daf5f6614f65e5b40c2aabd8b6",
  "db/postgres/migrations/pg_v9_066_agent_approval_delegation.sql": "e9d3de270e65d3f9ccfc003e3f35f69c3079441b72143bfa8ab613464d8c5f40",
  "services/pg-api/src/agent-design-audit-core.ts": "31d99e0f28c9d04402ec1b75db3714a41947c296cfba74a99d3dabcdf182a872",
  "services/pg-api/src/agent-design-audit.ts": "1efe6de5bea8e14fa4b957e050edddcfee9a595f438d636f9a4046cce0921f78",
  "services/pg-api/src/agent-design-predecessor-audit-core.ts": "5edd52d341068256567775b9234abe0a3bf39194ca51ac6b40933062d6e4c988",
  "services/pg-api/src/agent-internal-share-audit-core.ts": "a179b261b50ebd3cf8fd6cc6186454a7f37d2755c46d8cdc24c26b1993dfb434",
  "services/pg-api/src/agent-internal-share-audit.ts": "7eac9cca88280e746a96daf272f2831797913dca827bb2833e239779ea3d367d",
  "services/pg-api/src/agent-internal-share-http.ts": "33b12fc8e42b81bd38d211cfaf26d0493e5a0401447268f4bff9f51f37f3b669",
  "services/pg-api/src/agent-internal-share-repository.ts": "b9249e398b5ce6a689dd72bd0c8beabcf5fa1a0aab5a68dd45bac1c3a3c25913",
  "services/pg-api/src/agent-internal-share-runtime-policy.ts": "917fcb5f2bdbdf473733c57b6c8c2f6590ac78b9d0e1de48700856d4795ec6fe",
  "services/pg-api/src/agent-plan-workflow-audit-core.ts": "96385b5f918ce0dccc7850aeed38cc65aad5811dbeedeb2291bc6a94d8203b42",
  "services/pg-api/src/agent-plan-workflow-audit.ts": "e36302d24fb1cd13599eb551f6604dea0681d9de01a16939f3942ad7b5f6dbf1",
  "services/pg-api/src/agent-plan-workflow-predecessor-061-audit-core.ts": "7e41e4f9662db2fd021587cb930b76e01974e3ff0acf10b6f3c3e41df991542b",
  "services/pg-api/src/agent-plan-workflow-predecessor-062-audit-core.ts": "761c136844c59b3824f78bc57e9f8a9a3ec7f2c69bd65ee545406046b4ae8566",
  "services/pg-api/src/agent-template-market-audit-core.ts": "1f2c8edd622d4ade4f4198e0a7bd1c64e71be18944682b3b892fa37c87565e65",
  "services/pg-api/src/agent-template-market-audit.ts": "6fbc677dc83b845ab39ad7bb893309c8f1f2efc4be7eb41fff11d37255ff6d37",
  "services/pg-api/src/agent-template-market-contract.ts": "345d339ad6a7499a7c64005dfa429ff1187c24c3a285a356a992f675a2c2e819",
  "services/pg-api/src/agent-worker.ts": "64f7daf2720f7d6464725f62360d3c2ac1897e8cd77ba7c04297516f89b17104",
  "services/pg-api/src/approval-delegation-audit-core.ts": "0be2d8be27c0b373a0dd69e09a196ba4b97f2758b7d2713baf90fcd1809c9029",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "206cce0bb3cca19cdf169f22dfbc2cb971b9c73925ffc9ef48abfe99138c884a",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "512a1f75ba19fc0f16ce9ba7bc0d2c3b5f1120f8832068e4b6e8e575f92de0f9",
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/native-auth-http.d.mts": "c28022dc065f11aa934ef16058cf11b0051325aa81dc53ed5993a1b411f41963",
  "services/pg-api/src/native-auth-http.mjs": "9e685f0ca21bd6ada835aa69af44508b207bbc8001b765685a624722bf72fa6f",
  "services/pg-api/src/native-auth-repository.mjs": "f488ee7386c3ea27fe746ce90c10c4f786e9a0e8365f01df2778f0f841dd5a98",
  "services/pg-api/src/native-server.ts": "2680c2370c193d690791e8096bb5ea2ffaa69d24a30e2c01edb64641d9627390",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs": "1d91520d5ec50021b6b1bc30294b608c33dd612547eb0aced8506bc7665e5bb1",
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c",
  "services/pg-api/src/repository.ts": "27e417340e7bae05df4accfd50ba83a14a9b6af138acceee8ae86757387d1b48",
  "services/pg-api/src/run-repository.ts": "303c2b60256dc42295d74702e14b0ab07d5a556dbe7bd5fbce6fd6c999421f15",
  "services/pg-api/src/workflow-v2-run-repository.ts": "6c0a8a3be99f08f692a2ce8a1133911260dfeae5a9206e4932856c4ed36ee487",
  "services/pg-api/src/workflow-v2-worker.ts": "3100b792b0a2fc6d2b9b16e69d82fa1245b61534586ee1a77abf4d358e35bfe7",
  "services/pg-api/tests/helpers/agent-assessment-fixture.mjs": "41f747c751a181ef02ddc2060bd86cc15e744420cc7c9688bfa6fb3b8e80266a",
  "services/pg-api/tests/helpers/approval-delegation-genuine-guard.mjs": "c48521998f2d70a8e8e282c4f27539c8f718b58fd10cfbaa3c6f1006547e9c67",
  "shared/agent-internal-share-contract.ts": "1f29bece171b7ae575d6ee8e6b4cfdfb9e7dc411ab7568c9b463df3ad79215ee",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "496621ea40c73bb0aaa02703047bc306788eb970ff4b9a6cb716a56ad871e3fa",
  "services/pg-api/src/http.ts": "68e7d8b34791dbf44e2ed52314aa2620f43b33ed3e62642988c4c60c3abf318f",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "35b9aa6e2fd95cfde2b514c7c8a33bcb153673acbffa22db14187d61dd6db686",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "85a1e2ee7122ab005271eddfab7c76beb53ec4c5d470f15393c815f535b2cc74",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "97049578f3d339e864189538ae14e64d7ef13f6eb74627e9730ae8866641f893",
  "services/pg-api/src/pg18-complete-profile.ts": "56d14a2a16bcc78330308c7a9f99c804ad5a6b3558b7b140f612ae34da5979ff",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "edc0956ec2820bf701a147111d37e7e40eb21dd664d1c90f231a964e7831a8d6",
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
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec",
  "services/pg-api/src/agent-run-control-admission.ts": "e907b0bfb6b445c8077f6ee17b3e3c9d73a1b373d56d8a9b9ae205bc20950a94",
  "services/pg-api/src/own-operations-contract.ts": "c5a5ababb17bed11959279b01657195b28af96ea909ff461535f9f19a26979ab",
  "services/pg-api/src/own-operations-repository.ts": "e685eb185d1d92596d93decd213aacaa7bcdaf12504dce4c5bb3ccaaa5afb075"
})

export async function approvalDelegationGenuineFixture(env=process.env,{browserMode=false}={}){
  const target=requireApprovalDelegationGenuineCi(env)
  if(browserMode!==(env.GITHUB_JOB==='pg18-approval-delegation-browser'))throw Error('approval_delegation_genuine_job_mode_required')
  const [assertModule,fs,path,url,crypto]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
  const assert=assertModule.default,root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),{createHash,randomUUID}=crypto
  if(Object.keys(approvalDelegationGenuineFrozenSources).length<12)throw Error('approval_delegation_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(approvalDelegationGenuineFrozenSources)){
    if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))throw Error('approval_delegation_reviewed_source_pin_pending')
    const raw=fs.readFileSync(path.join(root,relative));assert.equal(createHash('sha256').update(raw).digest('hex'),expected,'Root must update exact reviewed F27 provenance after final integration')
  }
  const [https,pgModule,baseModule,tlsModule,nativeModule,authModule,cookieModule,marketAudit,marketRepo,marketHttp,policy,contracts,toolsModule,knowledgeModule,httpModule,workflowModule]=await Promise.all([
    import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-http.mjs'),
    import('../../src/native-auth-repository.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/approval-delegation-audit.ts'),
    import('../../src/approval-delegation-repository.ts'),import('../../src/approval-delegation-http.ts'),import('../../src/approval-delegation-runtime-policy.ts'),
    import('../../src/contracts.ts'),import('../../src/tool-connection-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/http.ts'),import('../../src/workflow-repository.ts')])
  const audit=marketAudit.verifyApprovalDelegationCredentials
  if(typeof audit!=='function')throw Error('approval_delegation_actual_auditor_required')
  let base,nativeServer,lifetime,resolveLifetime,readyResolve,readyReject,serverTls,nativeOrigin,allowedOrigin,closed=false,dispatches=0,workerRoleCreated=false
  const extraPools=[],cookies=new Map(),events=[]
  const mutable={available:true,writes:true,dropNext:null,beforeAuthenticate:null,afterBusiness:null}
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{resolveLifetime=resolve})
  const bounded=async(promise,ms=15000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('approval_delegation_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const connect=(login,password)=>{const pool=new pgModule.default.Pool({...target,user:login,password,max:4,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});extraPools.push(pool);return{knowledgeSharing:true,connect:()=>pool.connect()}}
  const passwordFor=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  const raw=(selectedUrl,{method='GET',body,cookie,headers={}}={})=>{
    const selected=new URL(selectedUrl);assert.equal(selected.protocol,'https:');assert.equal(selected.hostname,'localhost');assert.ok(nativeOrigin&&selected.origin===nativeOrigin)
    const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),max=selected.pathname.endsWith('/market')?33554432:524288
    return new Promise((resolve,reject)=>{
      const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,
        ...(method!=='GET'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{
        const chunks=[];let size=0
        res.on('data',piece=>{size+=piece.length;if(size>max){res.destroy(Error('approval_delegation_fixture_response_bound'));return};chunks.push(Buffer.from(piece))})
        res.once('error',reject);res.once('aborted',()=>reject(Error('approval_delegation_genuine_response_lost')))
        res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('approval_delegation_genuine_invalid_response'))}})
      });req.once('error',reject);req.end(bytes)
    })
  }
  const request=(who,selectedPath,body,options={})=>raw(nativeOrigin+selectedPath,{...options,method:options.method??(body===undefined?'GET':'POST'),body,cookie:cookies.get(who)})
  const login=async who=>{assert.ok(Object.hasOwn(credentials,who));const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const values=response.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(value=>value.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
  const close=async()=>{
    if(closed)return;closed=true
    const failures=[]
    if(nativeServer){nativeServer.closeAllConnections();await bounded(new Promise(resolve=>nativeServer.close(resolve))).catch(error=>failures.push(error))}
    resolveLifetime();await bounded(lifetime??Promise.resolve()).catch(error=>failures.push(error))
    await bounded(Promise.allSettled(extraPools.map(pool=>pool.end()))).then(results=>{for(const result of results)if(result.status==='rejected')failures.push(result.reason)},error=>failures.push(error))
    if(workerRoleCreated)try{await base.db.query('DROP ROLE synthetic_f27_original_worker')}catch(error){failures.push(error)}
    try{await base?.close()}catch(error){failures.push(error)}cookies.clear()
    if(failures.length)throw new AggregateError(failures,'approval_delegation_genuine_cleanup_failed')
  }
  try{
    base=await baseModule.agentAssessmentTcpFixture(env)
    for(const part of['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share','066_agent_approval_delegation'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
    const adminPool=connect(target.user,target.password),authPool=connect('agentstudio_native_login',passwordFor('agentstudio_native_login')),auth=new authModule.NativeAuthRepository(authPool)
    await policy.inspectApprovalDelegationPool(base.pool)
    const repository=()=>new marketRepo.ApprovalDelegationRepository(base.pool,{allowWrites:mutable.writes&&mutable.available,allowModelDecisions:true,allowAutonomousDecisions:true,allowMcpExecution:true,allowKnowledgeExecution:true,allowHumanInput:true})
    const counts=async()=> (await base.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.agent_approval_delegation_grants) grants,(SELECT count(*)::integer FROM agentstudio.agent_approval_delegation_events) events,(SELECT count(*)::integer FROM agentstudio.agent_approval_delegation_receipts) receipts,(SELECT count(*)::integer FROM agentstudio.agent_approval_delegation_contexts) contexts,(SELECT count(*)::integer FROM agentstudio.approvals WHERE status<>'pending') decided,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE action LIKE 'agent.approval_delegation.%') audit,(SELECT count(*)::integer FROM agentstudio.external_effects WHERE status IN('started','unknown')) in_flight")).rows[0]
    lifetime=tlsModule.withDisposableBoundModelTls(async()=>{dispatches++;throw Error('unexpected_F27_model_dispatch')},async tls=>{
      assert.ok(tls.serverTls);serverTls=tls.serverTls
      let nativeHandler
      nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return};void nativeHandler(req,res).catch(()=>res.destroy())})
      await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)})
      nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
      const selected=policy.selectApprovalDelegationCapabilities(env,true,allowedOrigin,true)
      assert.equal(selected.available,true,'Root must explicitly opt in F27 Native available in the isolated job');assert.equal(selected.writes,true,'Root must explicitly opt in initial F27 writes')
      nativeHandler=async(req,res)=>{
        const product=repository(),observed={}
        for(const operation of['owner','assigned','record','confirm'])observed[operation]=async(...args)=>{
          const value=await product[operation](...args)
          events.push({kind:'business',operation})
          if(mutable.afterBusiness)await mutable.afterBusiness({operation,identity:structuredClone(args[0]),input:args[1]===undefined?undefined:structuredClone(args[1])})
          return value
        }
        let generic,family,native
        native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowApprovalDelegations:mutable.available,allowApprovalDelegationWrites:mutable.available&&mutable.writes,allowRunSubmission:true,allowBoundRunSubmission:true,allowAutonomousAgentSubmission:true,businessHandler:async(incoming,outgoing)=>{if(await family(incoming,outgoing))return;return generic(incoming,outgoing)}})
        const authenticateRequest=async incoming=>{if(mutable.beforeAuthenticate)await mutable.beforeAuthenticate({path:incoming.url,method:incoming.method});return native.authenticateRequest(incoming)}
        const activeFamily=marketHttp.createApprovalDelegationHttp({repository:observed,authenticateRequest,allowedOrigin});family=async(incoming,outgoing)=>{if(!mutable.available&&(incoming.url?.startsWith('/api/v2/approval-delegations')||incoming.url?.startsWith('/api/v2/manager/'))){outgoing.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end(JSON.stringify({error:'not_found'}));return true};return activeFamily(incoming,outgoing)}
        generic=httpModule.createHandler({repository:base.agents,runRepository:new (await import('../../src/run-repository.ts')).RunRepository(base.pool,{allowBoundModelRuns:true}),autonomousAgentRunRepository:base.owned,modelConnectionRepository:base.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(base.pool,base.key),workflowRepository:new workflowModule.WorkflowRepository(base.pool),knowledgeRepository:new knowledgeModule.KnowledgeBaseRepository(base.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F27_genuine_Native_cookie_only')}})
        const drop=mutable.dropNext
        if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
        return native.handler(req,res)
      }
      await login('alice');await login('bob');readyResolve();await finish
    },{listenPort:0,includeServerTls:true}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{});await ready
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const actual=await auth.verifySession(token);assert.ok(actual);return actual}
    const governance=async(who,enabled)=>{const response=await request('alice','/api/native-auth/employees');assert.equal(response.status,200);const row=response.body.items.find(item=>item.id===base.users[who]);assert.ok(row);const changed=await request('alice','/api/native-auth/employees/change',{request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(changed.status,200);return changed.body}
    const withHttpSource=async(who='alice')=>{const identity=await identityFor(who),tools=new toolsModule.ToolConnectionRepository(base.pool,base.key),tool=await tools.create(identity,{name:'F27 owner HTTP '+who,description:'Synthetic owner connector',method:'GET',url:'https://example.com/',headers:[{key:'X-F27-Private',value:'F27-private-header-never-public'}],body_template:'',timeout_s:5,enabled:true});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'http_f07'])],http_tools:[{name:'http_f07',description:'F27 private HTTP connector',connection_id:tool.id,connection_revision:tool.revision}]}),previous.revision);assert.ok(role);return{tool,role,identity,tools}}
    const withKnowledgeSource=async(who='alice')=>{const identity=await identityFor(who),bases=new knowledgeModule.KnowledgeBaseRepository(base.pool),baseRow=await bases.create(identity,'F27 owner KB '+who,'Synthetic private source');await bases.createTextDocument(identity,baseRow.id,{filename:'f07-private.txt',text:'F27-private-document-never-public'});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'knowledge_search'])],knowledge_base_ids:[baseRow.id]}),previous.revision);assert.ok(role);return{base:baseRow,role,identity}}
    const assertNoModelEffects=async()=>{assert.equal(dispatches,0);assert.equal((await counts()).in_flight,0)}
    const workerLogin='synthetic_f27_original_worker',workerPassword=passwordFor(workerLogin),activation=await import('../../src/native-activation-cli.mjs')
    await base.db.query("CREATE ROLE "+workerLogin+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(workerPassword)+"'")
    workerRoleCreated=true;await base.db.query('GRANT agentstudio_worker,agentstudio_api TO '+workerLogin+' WITH INHERIT FALSE, SET TRUE')
    const originalWorkerPool=connect(workerLogin,workerPassword),single=new (await import('../../src/run-repository.ts')).RunRepository(base.pool,{allowBoundModelRuns:true}),prepare=new (await import('../../src/agent-worker.ts')).AgentPrepareWorker(originalWorkerPool,'F27_original_prepare'),worker=new (await import('../../src/workflow-v2-worker.ts')).WorkflowV2Worker(originalWorkerPool,'F27_original_agent',{executionMode:'agent_native_v2',agentExecutionApproved:true,humanInputApproved:true})
    const pendingRun=async(who='bob',model=false)=>{
      // Close prior fixture-owned queued parent operations through the original
      // authenticated Owner cancel method before admitting the next case. Do
      // not let an earlier approved parent or a later edited source affect the
      // generic original Worker claim order; no SQL job/lease fabrication.
      for(const name of ['alice','bob']){
        const originalIdentity=await identityFor(name),eligible=(await base.db.query("SELECT id FROM agentstudio.runs WHERE owner_user_id=$1 AND kind='agent' AND checkpoint->>'execution_mode'='agent_native_v2' AND status IN('queued','running') ORDER BY id",[base.users[name]])).rows
        for(const previous of eligible)await base.owned.cancel(originalIdentity,previous.id)
      }
      const identity=await identityFor(who),spec=await base.agents.get(identity,base.resources[who].spec.id);assert.ok(spec);let admitted;if(model){admitted=await single.submit(identity,spec.id,{idempotency_key:randomUUID(),instruction:'F27 private Owner instruction never sent to manager'});const tick=await prepare.tick();assert.equal(tick.status,'prepared');assert.equal(tick.run_id,admitted.run.id)}else{admitted=await base.owned.submit(identity,spec.id,{expected_revision:spec.revision,idempotency_key:randomUUID(),instruction:'F27 private Owner instruction never sent to manager',max_steps:3});let found=false;for(let n=0;n<80;n++){const tick=await worker.tick();assert.ok(['progressed','awaiting_approval','succeeded'].includes(tick.status),'Only original nonprovider parent progress may precede this pending run: '+JSON.stringify(tick));if(tick.run_id===admitted.run.id&&tick.status==='awaiting_approval'){found=true;break}}assert.ok(found,'original Worker did not reach submitted parent approval')}return admitted.run.id}
    return{pendingRun,worker,single,originalWorkerPool,...base,target,adminPool,authPool,auth,audit,repository,request,login,identityFor,credentials,mutable,nativeOrigin,allowedOrigin,serverTls,counts,governance,withHttpSource,withKnowledgeSource,events,assertNoModelEffects,close}
  }catch(error){await close();throw error}
}
