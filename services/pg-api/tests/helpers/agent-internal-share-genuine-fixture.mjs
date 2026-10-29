// Actual new-purpose F08 PG18/Native HTTPS fixture. No pool/file/socket before
// the strict F08 wrapper. No F01-purpose impersonation, PGlite or auditor stub.
import {requireAgentInternalShareGenuineCi} from './agent-internal-share-genuine-guard.mjs'

// SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_REVIEWED_H
export const agentInternalShareGenuineFrozenSources=Object.freeze({
  "db/postgres/001_stage_schema.sql": "af29a65a28c3dbde02bde8723b726f5493886d6d155142bc3bf00fd127be0f58",
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
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/native-auth-http.d.mts": "455046bbc72a9723f8143a4076b7b311d9914bb9fcfe5e61e5f84f944667d31a",
  "services/pg-api/src/native-auth-http.mjs": "3e849c29ef1df06ca00437708cf32d35b5f34313792e59db40996d5e32b2cd63",
  "services/pg-api/src/native-auth-repository.mjs": "f488ee7386c3ea27fe746ce90c10c4f786e9a0e8365f01df2778f0f841dd5a98",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs": "1d91520d5ec50021b6b1bc30294b608c33dd612547eb0aced8506bc7665e5bb1",
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c",
  "services/pg-api/src/repository.ts": "6916fc4503aa5d4e1c40f43351b89842194257378f47b2d6cec4473e495229c2",
  "services/pg-api/tests/helpers/agent-assessment-fixture.mjs": "41f747c751a181ef02ddc2060bd86cc15e744420cc7c9688bfa6fb3b8e80266a",
  "shared/agent-internal-share-contract.ts": "1f29bece171b7ae575d6ee8e6b4cfdfb9e7dc411ab7568c9b463df3ad79215ee",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/approval-delegation-audit-core.ts": "0be2d8be27c0b373a0dd69e09a196ba4b97f2758b7d2713baf90fcd1809c9029",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "9678d4f5ac3f690eb530e0e1ff94e32b9f3163bf3fd0cbbff964a4eed5259934",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "00d6626138aff0039864a8c544e34f44109c2164281834fd923b11c39b927d3a",
  "services/pg-api/src/http.ts": "918c7460a34b7603064e9c4c5c0c0f89e0ee9145f5b26c1c2bb5f3eb92576689",
  "services/pg-api/src/native-config-uat-policy.ts": "2225e0bc8dcc19c21c6abd0a8eba824253855b13513397da1403d898ae7a2b17",
  "services/pg-api/src/native-server.ts": "36bcfda573b72890b8fb1329de08884d0e85b4cc062a1d34a5f766e5c79704ba",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "8ecc7ffe1b7eacf6e3e0bc14686d388e440f5b1b00f61e818ab4de8a112c9edd",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "c314265af0f2c56f77f7d81112f89d0015f12b20dfad6b1b86f8758b5c315ab9",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "5ba9a56eb386bda745753b9fc49176902f4584ba8944027217b817657448d7a4",
  "services/pg-api/src/pg18-complete-profile.ts": "6dfd232a01592c85cc027d0e92de6816000d643a95d338cef070d63b1ff1b8f2",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "9070393ccd9c4a0e4e2ec234f559327c644b611096b441429ea8278f0a6c2f12",
  "services/pg-api/src/workflow-v2-run-repository.ts": "536e0d13e0deae1d26e167e4ededdb95db3f0b0e08b03cd65ce377f6a2d7929e",
  "services/pg-api/src/workflow-v2-worker.ts": "c95ae9e7dc1fa70e146a581f2c1b22b118816f756b63b2140101781f7bdfbc6b",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "src/lib/pgNativeAgentCreateJourney.ts": "5063c237e5d1c2fb7ef67bac18f76d488a10560add4ba90216064cdf87c9499d",
  "src/lib/pgNativeAgentCreateJourneyCache.ts": "d1a88ef5b2980cee63c1419912028ea41416a407c4c1bbada87d55be4c1ca06b",
  "src/lib/pgNativeAgentRunControl.ts": "149d2df06e614b2fc6b85945d9837e6b0be43ae702d23b520d66d5f814f2f622",
  "src/lib/pgNativeApprovalDelegationSession.ts": "7c63f1c1c2a69799686c7c7b9ca497d1170af7ff11d4643679ff9d8cb1aa6da4",
  "src/lib/pgNativeApprovalDelegations.ts": "dbc833a13803a9a3355de49b5f922754db53a0e8f405463c5dec97eebd5510a1",
  "src/lib/pgNativeAutonomousAgentSession.ts": "b6c29648b7f08cb92c18749ab4f504fdfd33ae84edc67edc3706dad45ada81a5",
  "src/lib/pgNativeDurableRunSession.ts": "60510959997a035535c66556ccf9ccc0a344b155e4ccd90c5b286a768a33d71d",
  "src/lib/pgNativePilotApi.ts": "4552085614b117ebaced46a45769f3c45eacbf9629ad3d5a8a06c1b7acbe6ff7",
  "src/lib/pgNativeStudioNavigation.ts": "15cb618ced257a35bc644de565e67a8955e59b798d476ff580da0a088fccff17",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "2c2599e194292288d3a3bda23432cc8d1bdbbcd237f41e042b39ca64202b2e05",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "e9c9e3877ec43c48daf81a563750e70417238dbeeced1cfd01fb030d26f749d8",
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
  "services/pg-api/src/bound-dispatch-server.ts": "71ab49b6d5068d8639b01fda1bf5468932017014e71d150ccfcb27355431cacf",
  "services/pg-api/src/model-connection-executor.ts": "8f239d7f9e00d267fe4fb3e6d552d8c3761e445ce4c3d4f70d79fef6621aa1aa",
  "services/pg-api/src/native-credential-policy.ts": "702147e13c977c4d20ec54bf6cf7e85125ad1866983d7614daaa05a6fbde1cc2",
  "services/pg-api/src/native-local-agent-contract.ts": "76c1ed1c587bdb5d5d8e0c06b39771b1efa8d20e4de777367d8a573d49c66c5b",
  "services/pg-api/src/native-local-agent-resources.ts": "b55d540428348a8cf8f867fff283634451eafb1aafe4519aab143253e9515e5f",
  "services/pg-api/src/native-local-device-audit-manifest.ts": "0aa7c3165026b3d046fd5170079f9082ccf73b8ee317d497ae5d1b76db73c7cc",
  "services/pg-api/src/native-local-device-audit.ts": "b001feede675315f6d216c3d3d7c21bdaf66f125a6ab8f43980f59dbdb408d9a",
  "services/pg-api/src/native-local-device-execution.ts": "3fb168d7506fc2b2835e96920ab5e36839ba9891bf0a2c6da332a5117416ea54",
  "services/pg-api/src/native-local-device-http.ts": "9ff14f42fa1118aba622f43b5414623979fc77ac08b4b810e19f85c0f6977783",
  "services/pg-api/src/native-local-device-repository.ts": "7be89686eae69ee74628f5b3b00a134780c007ad60e454b310e586ffff564653",
  "services/pg-api/src/native-local-device-runtime-policy.ts": "a021e1d4668ad38de0131b714f85586e37370c1be8380b5ab63ba861bcb081f9",
  "services/pg-api/src/native-local-device-validation.ts": "95ef9a26fe938d262e6d66e81a50265dd919419ab832ca748716387002b223ae",
  "services/pg-api/src/workflow-graph-v2.ts": "3d3c0f24fee5173869dc5c407583bc58cd901ec480b374de67030255ded3587a",
  "services/pg-api/src/workflow-v2-agent-machine.ts": "5b30556c6fac26b13e30196c5a78444faf5d726a966298755f50411dab140b26",
  "services/pg-api/src/workflow-v2-agent-resources.ts": "2ee0506dd283b7c1c636fc7d98e4e0fb6c5439fc2a842c84666f310bb8c98188",
  "services/pg-api/src/workflow-v2-dispatch-guard.ts": "7f3b06910262c145767f51c361c92811889a7b80c159a80e35d7d9d182883764",
  "services/pg-api/src/workflow-v2-machine.ts": "e3621b34e5e4b2f590b6cb35e5f75d859cc12b70665d77c7b8733739fd949fb4",
  "services/pg-api/src/workflow-v2-model-dispatch.ts": "0dfafe5447902c5f16eb869910aecb34ed93f21193394e5dabe0ac8d6e658536",
  "services/pg-api/src/workflow-v2-tool-client.ts": "596b491c687d688c6859b28dfcc978387c7d6d7d37d8b603f15fbbdf47f7b1e9",
  "services/pg-api/src/workflow-v2-tool-dispatch.ts": "529cb64942c5f3570da92f25f2d705ec552a2bd1b10439151963244b7abf25ed",
  "services/pg-api/src/workflow-v2-tool-plan.ts": "196b47614e73d5421a6ebe08a29f89372fd07f4a98ff38f5921d7eea9bab012a",
  "services/pg-api/src/workflow-v2-worker-loop.ts": "31a3aa71a25bf892d2dfc978d677ebaad47e1b8b409e681d58f1f74a0b3eb021",
  "shared/native-local-device-contract.d.mts": "bd0789512bb20b9bc4405f4b2ad9c8790e23b0cc0a5b970cbd065953479a55c1",
  "shared/native-local-device-contract.mjs": "1354c302ee2127a613b39f8f4df7d18051757a4b878b162557e59f8af586a928",
  "src/lib/pgNativeLocalDevice.ts": "255d079248f20b54f3c000f23cdb49ef7b99a12589039b218b9c585aa4b0fe31",
  "src/lib/pgNativeOfficeWorkflow.ts": "3f7e42d7dae05e20e7a1a8f14f7ebb8f442f79167f47bd7fa7883fafe3f1ea62",
  "src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx": "ab56c6035d92b833fd4b83b454100ef595526e549a66a732b23e3b87292df3e3",
  "src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx": "957f4eba1efc1497be3e6fd098add7c1cad54fe775c54fc3f0e0d9dcd868c1f1",
  "src/pages/PgNativePilot/useNativeLocalDevices.ts": "2122c7c04c71928d59f3576bede0fb4939195d922a91ca529ceff629760db55e",
  "services/pg-api/src/agent-caller-audit-core.ts": "118dfe91230f114265ed3c43ff967cc084d4158981918cef7085913001578893",
  "services/pg-api/src/agent-caller-audit.ts": "66a4eabd16896787efca9afc09947b688122816ca1e725c6121fddf56d801891",
  "services/pg-api/src/agent-caller-embed.ts": "1337319ae08fb4238445f12f0dd474e213f8f1c45f5f6bdfe18bf1cc59d5458a",
  "services/pg-api/src/agent-caller-execution-opt-in.ts": "6a4d9845b11484a5749e6cd12151c411ff4542265ebfd8fa4ac4fb2dbbdbf408",
  "services/pg-api/src/agent-caller-http.ts": "1aa21e49eea32e2373b7d7b98ff2ae85561f828be003f9ada3cf99dd426c9c5b",
  "services/pg-api/src/agent-caller-native-policy.ts": "8b78a89361f05bbb15a71ef2e07499ba88448e5d8101dcf1be8b87d2e68377bb",
  "services/pg-api/src/agent-caller-repository.ts": "06e9e5c7f2a37519deb0adeb4ac1c220c9b074d978c47c6dbf379d7b621e25bb",
  "services/pg-api/src/agent-caller-runtime-policy.ts": "833c62ed047a46ad2a66a10f60286dcee741738ca605432017a86aba60925223",
  "services/pg-api/src/knowledge-query-repository.ts": "6f0e45bf641746859ead03a777998fc932ae409be0e4735ee27dc45ce52e9d56",
  "shared/agent-caller-contract.ts": "147f48678600d933f0a50899c5c6f7f74d1d07e967a54a6aec0003d879ecc8ff",
  "src/lib/pgNativeAgentCallerPresentation.ts": "b189fb03b382943e3158967e8eba08b925c589c774b52aa47cdafc02d379871e",
  "src/lib/pgNativeAgentCallerSession.ts": "d896c7a0b7fee383ca65a9b59b26827a760766dc7c6247633482cee69cf4057d",
  "src/lib/pgNativeAgentCallers.ts": "ebecb453fca95a02a18131f8f2c0fe112cd83de403e7445e1d8644319e8d3d76",
  "src/lib/pgPublicAgentCaller.ts": "e735ccf9a1b47f9ca3cb28d94e269b6b3724de18ecca604c4b3ed5f4dfc6f4f0",
  "src/pages/PgNativePilot/PgNativeAgentCallerDetails.tsx": "236a56ad5c7aa9fde2f3c9839dbf8be8fa630c284fc63782381ecc27f4205b3d",
  "src/pages/PgNativePilot/PgNativeAgentCallerPanel.tsx": "4d3628fd9b00e7c56376102b9efe14211b3873c70ea275867a9c0ddaaae1a1a4",
  "services/pg-api/src/native-entry-http.ts": "bb7b73918f643d0d16b615aeeb3829ac70bb6e3a23e360f6b260c34bd98d7f14",
  "services/pg-api/src/owner-tool-trial-audit-core.ts": "f482fcb22dad341d2ef6b6468c790665245f43e5037e9252deb3dc6ea37901b3",
  "services/pg-api/src/owner-tool-trial-audit.ts": "9d2c88352a9d12afc16875627f27f4602ed3866f75981191241ef3978028f863",
  "services/pg-api/src/public-mcp-registry-contract.ts": "c60e46a735a6e876be0077290a1841e6879cf869330b2a9bd2860e274d271677",
  "services/pg-api/src/public-mcp-registry-network.ts": "d67e6cd485d51edfa94d9401d6c79481a3c8d966a7ffdbf00a4227e6f6f40c52",
  "services/pg-api/src/public-mcp-registry.ts": "7a4f484a0a5226fcc89010807fa78e1c9be1b3581690efaad727742ba13a23f8",
  "services/pg-api/src/registry-translation-trial.ts": "e7fec25833d5618e7fbad49381e4454a9d78a7ef4e6442c4f2a9c50e5a7dcad9",
  "services/pg-api/src/tool-hub-http.ts": "98e5e35aff1534a8db17f6e95403689ed387b34ab319d7c21f0ae92108eed81b",
  "services/pg-api/src/tool-hub-runtime-policy.ts": "376222bd27c80d3ccef1d09903c321568526aba033ef3c34c0c1a03bf383e6b3",
  "services/pg-api/src/tool-invocation-projection.ts": "f4121c65e330e8def262d9521266e292aa44b013ac15f26f5ba629f07bc7e1ea",
  "services/pg-api/src/tool-trial-check-expression.ts": "3f7d120b0dc82d48b1aed79e8f79ab42ef2645fc9abbc831459b4c9b39ee8bae",
  "services/pg-api/src/tool-trial-contract.ts": "ffd8cd57690df5c1844b69516f1b38afce8341bbb34e22778001d81e41aae3ac",
  "services/pg-api/src/tool-trial-repository.ts": "5386b9dcabfbc444847f21bff6adf20ef96e06f38bfd4150138c944efbdc13f9",
  "services/pg-api/src/workflow-repository.ts": "38e9b953cc70bcdc41343c5c8ecd54fe6ebf84295f2b45db113d9c9c284709c0",
  "shared/tool-hub-public-types.ts": "9f40bb2dd43cb24974ab439a2961cc44513ba01a80daafdaf76f8da5d7565c90",
  "src/lib/pgNativeToolHub.ts": "0b92d87f31a810030d5fb6789f2323ed6b6a4717f24779d18622fcf41b741c27",
  "src/lib/pgNativeToolHubSession.ts": "a631541855c13758549a2ce3c644af48030204542a284b5c9c0bdfb748016acc",
  "src/pages/PgNativePilot/PgNativePublicMcpCatalog.tsx": "12f280dd83023c0a12d0b63d2e588b8b8d192eacd1f533f81b3efc3dcbae5ff1",
  "src/pages/PgNativePilot/PgNativeToolHubPanel.tsx": "3a2183b8902bf7ffef096a029ca4e80ea37a9c9266ea10d00e509ce349599c91"
})

export async function agentInternalShareGenuineFixture(env=process.env,{browserMode=false}={}){
  const target=requireAgentInternalShareGenuineCi(env)
  if(browserMode!==(env.GITHUB_JOB==='pg18-internal-share-browser'))throw Error('agent_internal_share_genuine_job_mode_required')
  const [assertModule,fs,path,url,crypto]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
  const assert=assertModule.default,root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),{createHash,randomUUID}=crypto
  if(Object.keys(agentInternalShareGenuineFrozenSources).length<12)throw Error('agent_internal_share_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentInternalShareGenuineFrozenSources)){
    if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))throw Error('agent_internal_share_reviewed_source_pin_pending')
    const raw=fs.readFileSync(path.join(root,relative));assert.equal(createHash('sha256').update(raw).digest('hex'),expected,'Root must update exact reviewed F08 provenance after final integration')
  }
  const [https,pgModule,baseModule,tlsModule,nativeModule,authModule,cookieModule,marketAudit,marketRepo,marketHttp,policy,contracts,toolsModule,knowledgeModule,httpModule,workflowModule]=await Promise.all([
    import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-http.mjs'),
    import('../../src/native-auth-repository.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/agent-internal-share-audit.ts'),
    import('../../src/agent-internal-share-repository.ts'),import('../../src/agent-internal-share-http.ts'),import('../../src/agent-internal-share-runtime-policy.ts'),
    import('../../src/contracts.ts'),import('../../src/tool-connection-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/http.ts'),import('../../src/workflow-repository.ts')])
  const audit=marketAudit.verifyAgentInternalShareCredentials
  if(typeof audit!=='function')throw Error('agent_internal_share_actual_auditor_required')
  let base,nativeServer,lifetime,resolveLifetime,readyResolve,readyReject,serverTls,nativeOrigin,allowedOrigin,closed=false,dispatches=0
  const extraPools=[],cookies=new Map(),events=[]
  const mutable={available:true,writes:true,dropNext:null,beforeAuthenticate:null,afterBusiness:null}
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{resolveLifetime=resolve})
  const bounded=async(promise,ms=15000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_internal_share_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
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
        res.on('data',piece=>{size+=piece.length;if(size>max){res.destroy(Error('agent_internal_share_fixture_response_bound'));return};chunks.push(Buffer.from(piece))})
        res.once('error',reject);res.once('aborted',()=>reject(Error('agent_internal_share_genuine_response_lost')))
        res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('agent_internal_share_genuine_invalid_response'))}})
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
    try{await base?.close()}catch(error){failures.push(error)}cookies.clear()
    if(failures.length)throw new AggregateError(failures,'agent_internal_share_genuine_cleanup_failed')
  }
  try{
    base=await baseModule.agentAssessmentTcpFixture(env)
    for(const part of['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
    const adminPool=connect(target.user,target.password),authPool=connect('agentstudio_native_login',passwordFor('agentstudio_native_login')),auth=new authModule.NativeAuthRepository(authPool)
    await policy.inspectInternalSharePool(base.pool)
    const repository=()=>new marketRepo.AgentInternalShareRepository(base.pool,{allowWrites:mutable.writes&&mutable.available})
    const counts=async()=> (await base.db.query(`SELECT
      (SELECT count(*)::integer FROM agentstudio.agent_internal_share_invites) AS invites,
      (SELECT count(*)::integer FROM agentstudio.agent_internal_share_snapshots) AS snapshots,
      (SELECT count(*)::integer FROM agentstudio.agent_internal_share_receipts) AS receipts,
      (SELECT count(*)::integer FROM agentstudio.agent_internal_share_consumptions) AS consumptions,
      (SELECT count(*)::integer FROM agentstudio.agent_specs) AS agents,
      (SELECT count(*)::integer FROM agentstudio.agent_collaboration_revisions) AS history,
      (SELECT count(*)::integer FROM agentstudio.audit_events WHERE action LIKE 'agent.internal_share.%') AS audit,
      (SELECT count(*)::integer FROM agentstudio.agent_design_requests) AS design_requests,
      (SELECT count(*)::integer FROM agentstudio.agent_design_reservations) AS design_reservations,
      (SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS review_requests,
      (SELECT count(*)::integer FROM agentstudio.runs) AS runs,
      (SELECT count(*)::integer FROM agentstudio.external_effects) AS old_effects`)).rows[0]
    const modelBaseline=await counts()
    lifetime=tlsModule.withDisposableBoundModelTls(async()=>{dispatches++;throw Error('unexpected_F08_model_dispatch')},async tls=>{
      assert.ok(tls.serverTls);serverTls=tls.serverTls
      let nativeHandler
      nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return};void nativeHandler(req,res).catch(()=>res.destroy())})
      await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)})
      nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
      const selected=policy.selectNativeInternalShareCapabilities(env,true,allowedOrigin,true)
      assert.equal(selected.available,true,'Root must explicitly opt in F08 Native available in the isolated job');assert.equal(selected.writes,true,'Root must explicitly opt in initial F08 writes')
      nativeHandler=async(req,res)=>{
        const product=repository(),observed={}
        for(const operation of['list','preview','record','confirm'])observed[operation]=async(...args)=>{
          const value=await product[operation](...args)
          events.push({kind:'business',operation})
          if(mutable.afterBusiness)await mutable.afterBusiness({operation,identity:structuredClone(args[0]),input:args[1]===undefined?undefined:structuredClone(args[1])})
          return value
        }
        let generic,family,native
        native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowInternalShare:mutable.available,allowInternalShareWrites:mutable.available&&mutable.writes,businessHandler:async(incoming,outgoing)=>{if(await family(incoming,outgoing))return;return generic(incoming,outgoing)}})
        const authenticateRequest=async incoming=>{if(mutable.beforeAuthenticate)await mutable.beforeAuthenticate({path:incoming.url,method:incoming.method});return native.authenticateRequest(incoming)}
        const activeFamily=marketHttp.createAgentInternalShareHttp({repository:observed,authenticateRequest,allowedOrigin});family=async(incoming,outgoing)=>{if(!mutable.available&&incoming.url?.startsWith('/api/v2/internal-templates')){outgoing.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end(JSON.stringify({error:'not_found'}));return true};return activeFamily(incoming,outgoing)}
        generic=httpModule.createHandler({repository:base.agents,modelConnectionRepository:base.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(base.pool,base.key),workflowRepository:new workflowModule.WorkflowRepository(base.pool),knowledgeRepository:new knowledgeModule.KnowledgeBaseRepository(base.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F08_genuine_Native_cookie_only')}})
        const drop=mutable.dropNext
        if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
        return native.handler(req,res)
      }
      await login('alice');await login('bob');readyResolve();await finish
    },{listenPort:0,includeServerTls:true}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{});await ready
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const actual=await auth.verifySession(token);assert.ok(actual);return actual}
    const governance=async(who,enabled)=>{const response=await request('alice','/api/native-auth/employees');assert.equal(response.status,200);const row=response.body.items.find(item=>item.id===base.users[who]);assert.ok(row);const changed=await request('alice','/api/native-auth/employees/change',{request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(changed.status,200);return changed.body}
    const withHttpSource=async(who='alice')=>{const identity=await identityFor(who),tools=new toolsModule.ToolConnectionRepository(base.pool,base.key),tool=await tools.create(identity,{name:'F08 owner HTTP '+who,description:'Synthetic owner connector',method:'GET',url:'https://example.com/',headers:[{key:'X-F08-Private',value:'F08-private-header-never-public'}],body_template:'',timeout_s:5,enabled:true});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'http_f07'])],http_tools:[{name:'http_f07',description:'F08 private HTTP connector',connection_id:tool.id,connection_revision:tool.revision}]}),previous.revision);assert.ok(role);return{tool,role,identity,tools}}
    const withKnowledgeSource=async(who='alice')=>{const identity=await identityFor(who),bases=new knowledgeModule.KnowledgeBaseRepository(base.pool),baseRow=await bases.create(identity,'F08 owner KB '+who,'Synthetic private source');await bases.createTextDocument(identity,baseRow.id,{filename:'f07-private.txt',text:'F08-private-document-never-public'});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'knowledge_search'])],knowledge_base_ids:[baseRow.id]}),previous.revision);assert.ok(role);return{base:baseRow,role,identity}}
    const assertNoModelEffects=async()=>{assert.equal(dispatches,0);const after=await counts();for(const key of['design_requests','design_reservations','review_requests','runs','old_effects'])assert.equal(after[key],modelBaseline[key],'F08 must not create '+key)}
    return{...base,target,adminPool,authPool,auth,audit,repository,request,login,identityFor,credentials,mutable,nativeOrigin,allowedOrigin,serverTls,counts,governance,withHttpSource,withKnowledgeSource,events,assertNoModelEffects,close}
  }catch(error){await close();throw error}
}
