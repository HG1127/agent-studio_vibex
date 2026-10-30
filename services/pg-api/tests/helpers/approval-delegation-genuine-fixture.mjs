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
  "services/pg-api/src/agent-internal-share-http.ts": "ef14078870f666f5a36180916b4961c4624f7d708fc0a0671fc35944b83bdf52",
  "services/pg-api/src/agent-internal-share-repository.ts": "cf335ed94ef8bfddc10e6ed3c6248b967ad7e00d00232b9d4faf2e4d2b2f7f17",
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
  "services/pg-api/src/approval-delegation-http.ts": "9678d4f5ac3f690eb530e0e1ff94e32b9f3163bf3fd0cbbff964a4eed5259934",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/native-auth-http.d.mts": "455046bbc72a9723f8143a4076b7b311d9914bb9fcfe5e61e5f84f944667d31a",
  "services/pg-api/src/native-auth-http.mjs": "3e849c29ef1df06ca00437708cf32d35b5f34313792e59db40996d5e32b2cd63",
  "services/pg-api/src/native-auth-repository.mjs": "f488ee7386c3ea27fe746ce90c10c4f786e9a0e8365f01df2778f0f841dd5a98",
  "services/pg-api/src/native-server.ts": "2c465065accd677b42f1a7068da4cd5dc153d382ab9498c566593fe8c4fcbca0",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs": "1d91520d5ec50021b6b1bc30294b608c33dd612547eb0aced8506bc7665e5bb1",
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c",
  "services/pg-api/src/repository.ts": "6916fc4503aa5d4e1c40f43351b89842194257378f47b2d6cec4473e495229c2",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/workflow-v2-run-repository.ts": "0cd4ba90b942d30aacc5fcd5e4ae0067163b0c8def563c0b34212f4cdcd360cd",
  "services/pg-api/src/workflow-v2-worker.ts": "c95ae9e7dc1fa70e146a581f2c1b22b118816f756b63b2140101781f7bdfbc6b",
  "services/pg-api/tests/helpers/agent-assessment-fixture.mjs": "41f747c751a181ef02ddc2060bd86cc15e744420cc7c9688bfa6fb3b8e80266a",
  "services/pg-api/tests/helpers/approval-delegation-genuine-guard.mjs": "c48521998f2d70a8e8e282c4f27539c8f718b58fd10cfbaa3c6f1006547e9c67",
  "shared/agent-internal-share-contract.ts": "1f29bece171b7ae575d6ee8e6b4cfdfb9e7dc411ab7568c9b463df3ad79215ee",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "00d6626138aff0039864a8c544e34f44109c2164281834fd923b11c39b927d3a",
  "services/pg-api/src/http.ts": "918c7460a34b7603064e9c4c5c0c0f89e0ee9145f5b26c1c2bb5f3eb92576689",
  "services/pg-api/src/native-config-uat-policy.ts": "206bd1b738cc864aaf609f36ed05957f14d958cae623e6a39349c53c1b24f68e",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "8fe2a1f9c53d13b0331d24a03323833d5f8f5d0740695d57b6890b73cad1fa75",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "d5cc238eb52cf9e4e3e5d123897d41961b62ea7c1f02144c2f277ab3cef1aa9e",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "c314265af0f2c56f77f7d81112f89d0015f12b20dfad6b1b86f8758b5c315ab9",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "f5251cc0b6820b3c3930b37e06c3b75ccea47bd387d5b727c845261a2084b54b",
  "services/pg-api/src/pg18-complete-profile.ts": "6dfd232a01592c85cc027d0e92de6816000d643a95d338cef070d63b1ff1b8f2",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "9070393ccd9c4a0e4e2ec234f559327c644b611096b441429ea8278f0a6c2f12",
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
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "8f06a93bb52dbb29365e9f1ce22cde962d4581c3a74a8ba8277bda13e7cd2ff9",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec",
  "services/pg-api/src/agent-run-control-admission.ts": "e907b0bfb6b445c8077f6ee17b3e3c9d73a1b373d56d8a9b9ae205bc20950a94",
  "services/pg-api/src/own-operations-contract.ts": "c5a5ababb17bed11959279b01657195b28af96ea909ff461535f9f19a26979ab",
  "services/pg-api/src/own-operations-repository.ts": "092699446d390974ea20cdb62c4d386d82b702dc7cc67526ab08ba5e1f816679",
  "services/pg-api/src/agent-optimization-repository.ts": "957b6ea18077085709e8209c276b9be523126930ee12adaca11d6ae0b8bf4068",
  "services/pg-api/src/agent-optimization-retest-policy.ts": "f14883d0e5c0fd68b1472291a16e0ad8c08c9c9c9d468bd0b9be561e95cf1998",
  "services/pg-api/src/knowledge-index-service.ts": "bb8d3345460652a9b130a4df12af4b4fa997a18044d31ca25d2d4fe2316b02a4",
  "services/pg-api/src/knowledge-worker-heartbeat-lifecycle.ts": "31c77b39b0e25b01532d25a5b6e09f54f6e3465f9c3a1549cf90a763f2f179cf",
  "shared/agent-optimization-retest-contract.ts": "cdefa16278ba87bc7ef3aa10a3af59f3944a4bf3c9b99a0027f5b159e6482e5b",
  "local-executor/browser-server.mjs": "b05a401f8e507a8a989ee771173760111397828f1640e847cda0181f32eb7f9d",
  "local-executor/native-connection.mjs": "8c1c4030d9a1ca74a9acf192c1408bda9a2353055671acce8741376eb44cce72",
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
  "services/pg-api/src/native-local-device-audit-manifest.ts": "854bf8a9f7634763335d9d0f9613d71d6ec32dc2653264f4d76c087fd3c4d2c3",
  "services/pg-api/src/native-local-device-audit.ts": "b001feede675315f6d216c3d3d7c21bdaf66f125a6ab8f43980f59dbdb408d9a",
  "services/pg-api/src/native-local-device-execution.ts": "3fb168d7506fc2b2835e96920ab5e36839ba9891bf0a2c6da332a5117416ea54",
  "services/pg-api/src/native-local-device-http.ts": "30c7ecd224ad47b1bf20e8aa6aa72d14e96ebb44a327b75fedaa5545f6ad4582",
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
  "services/pg-api/src/workflow-v2-worker-loop.ts": "86699001257bb08995cbdbd89ef7611b5b97fce8d2bbb0709bd04fb248f7c531",
  "shared/native-local-device-contract.d.mts": "bd0789512bb20b9bc4405f4b2ad9c8790e23b0cc0a5b970cbd065953479a55c1",
  "shared/native-local-device-contract.mjs": "1354c302ee2127a613b39f8f4df7d18051757a4b878b162557e59f8af586a928",
  "src/lib/pgNativeLocalDevice.ts": "255d079248f20b54f3c000f23cdb49ef7b99a12589039b218b9c585aa4b0fe31",
  "src/lib/pgNativeOfficeWorkflow.ts": "3f7e42d7dae05e20e7a1a8f14f7ebb8f442f79167f47bd7fa7883fafe3f1ea62",
  "src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx": "ab56c6035d92b833fd4b83b454100ef595526e549a66a732b23e3b87292df3e3",
  "src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx": "957f4eba1efc1497be3e6fd098add7c1cad54fe775c54fc3f0e0d9dcd868c1f1",
  "src/pages/PgNativePilot/useNativeLocalDevices.ts": "2122c7c04c71928d59f3576bede0fb4939195d922a91ca529ceff629760db55e",
  "services/pg-api/src/agent-caller-audit-core.ts": "118dfe91230f114265ed3c43ff967cc084d4158981918cef7085913001578893",
  "services/pg-api/src/agent-caller-audit.ts": "66a4eabd16896787efca9afc09947b688122816ca1e725c6121fddf56d801891",
  "services/pg-api/src/agent-caller-embed.ts": "9640286ed26c95b962bd6a4344730f854bff6a04c90d742772aa10a1c2eb96b7",
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
  "services/pg-api/src/tool-trial-repository.ts": "7e7327e992f7805f2879d0ba9df6bfc40f86d35da727051252ce893f5720301f",
  "services/pg-api/src/workflow-repository.ts": "38e9b953cc70bcdc41343c5c8ecd54fe6ebf84295f2b45db113d9c9c284709c0",
  "shared/tool-hub-public-types.ts": "9f40bb2dd43cb24974ab439a2961cc44513ba01a80daafdaf76f8da5d7565c90",
  "src/lib/pgNativeToolHub.ts": "0b92d87f31a810030d5fb6789f2323ed6b6a4717f24779d18622fcf41b741c27",
  "src/lib/pgNativeToolHubSession.ts": "a631541855c13758549a2ce3c644af48030204542a284b5c9c0bdfb748016acc",
  "src/pages/PgNativePilot/PgNativePublicMcpCatalog.tsx": "80612891e9bf6f8bcd12663eee39165c8680efa62f19a85baeca0eb43ce6c6f5",
  "src/pages/PgNativePilot/PgNativeToolHubPanel.tsx": "3a2183b8902bf7ffef096a029ca4e80ea37a9c9266ea10d00e509ce349599c91",
  "services/pg-api/src/native-local-executor-operator-plan.d.mts": "890ca7e6e0b2f3d4addc55a5307249407db48c7ddcdd4abfcba7a5763e380180",
  "services/pg-api/src/native-local-executor-operator-plan.mjs": "df49c83e97be6e04b122aaaac42439731f7c7bf3ece50653c7342d752e0d9754",
  "services/pg-api/src/native-local-executor-service-preflight-cli.mjs": "c7de574a8647e96684b81ce9f9a78b42b50d9e78e0b152ad7dddd3a28697a8d8",
  "services/pg-api/src/native-local-executor-service-preflight.ts": "659777c417f89d7b53851a115948dd38a5a341a671273fda1aa54bc468a10397",
  "services/pg-api/src/native-local-device-auth-error.ts": "5c8a158b965a34f99404d3c7d176c2823bbad82940991c5962db3863bdbd7776",
  "services/pg-api/src/pg18-complete-service-cli.mjs": "a6544177365130529f86329b96afa90b82b5f4131b55747e9f954a5a05cca0ac",
  "services/pg-api/src/pg18-complete-service-core.mjs": "e4f4241f623b219f963dc262d03ec8de92c05113af8c5b8f1ea91417015438cf",
  "services/pg-api/src/pg18-complete-service-journal.mjs": "df447edc97f535b223af6fd8ea618974adfef581f7b53013f53081cf53f44e75",
  "services/pg-api/src/pg18-complete-service-plan.mjs": "afcd8e83edd5ac68beb44f85d31fcfca5a66415fb6274e41fdd2ba2a18991c05",
  "services/pg-api/src/pg18-complete-review-worker-cli.mjs": "e233c0857d6792c03bfb62fa052b704a322f1725ac8a3d70795f2774ea413c60",
  "services/pg-api/src/pg18-complete-review-worker-core.mjs": "1d4fe8d1c1500d75699407c8cb2c51b107757446c587d080035258708d45ff8e",
  "services/pg-api/src/pg18-complete-review-worker-journal.mjs": "35013ee477521f75a8806bdabcf7cb2c134918871997fedd7798d66b0781f056",
  "services/pg-api/src/pg18-complete-review-worker-plan.mjs": "a52dfd482b10c98a7489ab185e73088fd524c2a2042fdd5ad548926d83f7531d",
  "services/pg-api/src/pg18-full069-worker-live-child.mjs": "209cefe0516c61c4998ebd3183e65460327a445bb185abbde2888e9ed3eb6a2b",
  "services/pg-api/src/pg18-full069-worker-live-cli.mjs": "7b87c06eb64f117a0929d33d0e9c85be56f0c975862f31b2fac644b22464b898",
  "services/pg-api/src/pg18-full069-worker-live-contract.mjs": "8c286bae8658055ae38a3413e6db6dcbf93bb745e9868abe8cafa02aebe77e4e",
  "services/pg-api/src/pg18-full069-worker-live-native.mjs": "33e90f8a20e76a6cb0a8699a0b6546445392f059b34e784f4de081b125e9f88d",
  "services/pg-api/src/pg18-full069-worker-live-processes.mjs": "9c45e6845297dcc087bfdf612639e5305b2ccbe8e696ea885ed44ff281610699",
  "services/pg-api/src/pg18-full069-worker-live-runner.mjs": "3433b16af75b26822354b19863bc78b2749083cc429dac79dcef2f6e67730d96",
  "services/pg-api/src/pg18-full069-worker-live-runtime.mjs": "45f1d147ef840bac2b6cba27f211cba1be492be015bf6d0fb7d48b6062d36b23",
  "services/pg-api/src/pg18-full069-worker-live-sources.mjs": "b2fce5081048f6f700a3663e8401ff039389c445f34b8f4e8c0cef81a0580beb",
  "services/pg-api/src/pg18-full069-worker-live-trust.mjs": "dfaf7ef5c57ea46107c6e4297758a678e7ce21befc8ffcd0b7cb4cd0d0f31d95",
  "services/pg-api/src/pg18-complete-executor-cli.mjs": "31486fca2a869b38255a15f1790c983f54a8cd877bdd824516676a66f6d451bd",
  "services/pg-api/src/pg18-complete-executor-core.mjs": "544dd6cf44bed4879c7a7b5cb36adeb06d176248e2c5ae281eee4c820c1c5b14",
  "services/pg-api/src/pg18-complete-executor-journal.mjs": "ef6039d1710ba7eddc067a762917985520ceacd490045cd7f4bc31de556f5775",
  "services/pg-api/src/pg18-complete-executor-plan.mjs": "79f9ecf9e529f06baf00698ea7bdd283f1af55b818538d06c676ab09492417bb",
  "services/pg-api/src/pg18-complete-review-stack-cli.mjs": "ee8c465d1c936e78b0d1c5e8c7ed8b437ad8c4f23d67ca782343509a35b3b7af",
  "services/pg-api/src/pg18-complete-review-stack-core.mjs": "bb5c6aebf8525565a9c0b50b0ebb6ceeefc52b825d34756e4c06c2a05c909dae",
  "services/pg-api/src/pg18-complete-review-stack-journal.mjs": "cb80856ee69a6f5b5f6aafc5987ff96a925700fc83b89a9e2e9b001654560d05",
  "services/pg-api/src/pg18-complete-review-stack-plan.mjs": "6529b4e1b72c8b1b91ff9149495fef07db647d3c76fa0b568010c4f0b8468ca0",
  "services/pg-api/src/pg18-complete-companion-sources.mjs": "86287d9929f90958e398d88fcbd22980933a5c40f4a92da5f9df23a8837eabda",
  "services/pg-api/src/pg18-complete-plan-workflow-catalog.mjs": "711e8fbfc9df1d260171aaf50033e9fd2dd40b1948beb28f5ee709953c8b817a",
  "services/pg-api/src/pg18-complete-plan-workflow-cli.mjs": "d5154fece52698618877563aa9a7f4a9f5930830662740e63298c695fb664cf8",
  "services/pg-api/src/pg18-complete-plan-workflow-core.mjs": "b274166cb186000116c2b79fb3f6778c87db06d2e59fd5a448febe33cac742ba",
  "services/pg-api/src/pg18-complete-plan-workflow-journal.mjs": "a46242655009dc5ceb9fb479c5dd0421659ea401f18dfddbbcfd38fbd4db1f7f",
  "services/pg-api/src/pg18-complete-plan-workflow-plan.mjs": "b337f602cabb01891832abd60bf523cb6084bc7f5364567e165c90086334c693",
  "services/pg-api/src/pg18-complete-plan-workflow-predecessor-plan.mjs": "8121e4adeb35e54b312a9b52f69c7ab7401cda2f33c43a7290fb67480f42da1f",
  "services/pg-api/src/pg18-complete-plan-workflow-predecessors.mjs": "8dcfbf2a17e9104097917ba9318f6d5251f00f20e1dd0a0d65f41a726b4f9b39",
  "services/pg-api/src/pg18-complete-plan-workflow-sources.mjs": "ce7baa677a7fae18a6238e904e1b2bf9c1825ecab1556ce4dd89459738da2876",
  "services/pg-api/src/pg18-full069-worker-path-validation-cli.mjs": "d01d5fae09263d8b28fd0e64807f4fbca09ed04f187fe17d204972c426bd95ea",
  "services/pg-api/src/pg18-full069-worker-path-validation-contract.mjs": "7178952e2ee52b910dc67038524dd3818678ea7970c3de1b924d67a955aa8fd8",
  "services/pg-api/src/pg18-full069-worker-path-validation-guard.mjs": "3ff1a663e16e3f396f4a192f03389080c4985ab15dcedc280205986ce8f0e4e4",
  "services/pg-api/src/pg18-full069-worker-path-validation-runner.mjs": "c46d7ebcca27b910d2ee436a26db7b1a1a1067a66ca01f363eac4557934ee707",
  "services/pg-api/src/pg18-full069-final-cli.mjs": "d137ed31ee18918f798b9731850aa9f665ee26d6ca05c8cf00935579ad79b890",
  "services/pg-api/src/pg18-full069-final-client-bindings.mjs": "67b9f635f1a22a9fb728c48405ea2b5fbba83a209b1229ce25720a5f7ca4762d",
  "services/pg-api/src/pg18-full069-final-companion-child.mjs": "82d27723ef449cf81b3eb9ca55f36d04a8ef96c1b0a5fab42fb43123c5ce23e6",
  "services/pg-api/src/pg18-full069-final-companion-contract.mjs": "a350021e1712ed971b1d1b6489ca22a65176893a4720c5574098951937e3b481",
  "services/pg-api/src/pg18-full069-final-companion-kernel.mjs": "25c97e090d9feb948f9dce662df4848362cffa2ebd393e7d5680999c8a0d68fb",
  "services/pg-api/src/pg18-full069-final-companions.mjs": "5fcedd866174e3a3fccc527358eb94fa889030ccf915cc7636a4490df4be2108",
  "services/pg-api/src/pg18-full069-final-login-contract.mjs": "ecd3142f8625daf0dfca3b256ba2e11a88de248baa901bab68db7d57e2c1dd22",
  "services/pg-api/src/pg18-full069-final-records.mjs": "ce30e7238c414977ce2e1168508989ebb6fe6bca853e5f30539ac66de3ed7e62",
  "services/pg-api/src/pg18-full069-final-runner.mjs": "d2e072be19aa097e0215f488a0836f740589867f141c790330704ddbb288fb29",
  "services/pg-api/src/pg18-full069-final-runtime.mjs": "64a5f9c8d3de5ef16bec665451ea8d3c7a11b8420cb84512fbefdd2b318e1739",
  "services/pg-api/src/pg18-full069-final-sources.mjs": "94da32378d28b72bcf37018be71d3a29cf16ad6704bf021fa980cdf7f9707b2f",
  "services/pg-api/src/pg18-full069-final-trust.mjs": "2cfd1d425559e6f62d24117b6942d4e35ed40aa7dfab92df64f9d7dd533ab501",
  "services/pg-api/src/pg18-full069-final-window.mjs": "0bfe2b88f46cd57d3e11da3e3b820f04b0a4c0339b05ac2f33724730b40f3e07",
  "services/pg-api/src/pg18-full069-final14-catalog.mjs": "766a162be70fd0b323b914b8b8e7307be79e63934d6e1a076112c7e363d30765",
  "services/pg-api/src/pg18-full069-network-policy.mjs": "935ecb8899ac86b9b74a21dda680616560d690e380e78622d948fb34e1e0ba1a",
  "services/pg-api/src/native-agent-catalog-audit.ts": "54ef7c8430585bdc80c80d4a20d67a3b0426d47c8bf3fef934b37e54ec405227",
  "services/pg-api/src/native-agent-catalog-http.ts": "6f14cb0b944081b064853f99fa605dd2af195ac3fcbbad715007581620e1ddf4",
  "services/pg-api/src/native-agent-catalog-repository.ts": "a2c8feb26dabcf8aebbad02f8e9c936ce213bbe37776ff849fc5227deaaae470",
  "services/pg-api/src/native-agent-catalog-runtime.ts": "0a4897b6f1f7d47a7aef9feb9f0783ccaed94300fceb88d337b85f65a10879a7",
  "services/pg-api/src/native-home-agent-specs-http.ts": "9410b58364d167b83017228ae1260fb2757bb59b584650ae0ce6a0702eab9140",
  "services/pg-api/src/native-home-agent-specs-repository.ts": "3b2c8f3b523629756092244d75a03959305dbbf1ee16c6d15c9a3a11a86187ba",
  "services/pg-api/src/native-home-agent-specs-runtime.ts": "babb676a5632dad0bd3d474e694fdd1e182251fd03942f762ab7e66cd7c6df47",
  "services/pg-api/src/native-home-authoring-audit.ts": "0cad2d395136a9b978ed63044155bc3dc1fde638cc1246331696deb9c5f7e427",
  "services/pg-api/src/native-home-knowledge-stats-audit.ts": "ea7804b2e177223cf2bdfe45d5e78a789998086d9792930db787ca6856f30337",
  "services/pg-api/src/native-home-resources-contract.ts": "e600374afc5e79915d7f05fdf8c4178b9a629c73f215f3c36150e5ea1d25b1c1",
  "services/pg-api/src/native-home-resources-http.ts": "9f8ee1541b03d8a0596e99ca96568a42d509c8a9ec268f3ca3bd2337128aea18",
  "services/pg-api/src/native-home-resources-repository.ts": "32f202a102c979ef6c29d86348ab70f693d1d98b10b9b57feb5985349bd09120",
  "services/pg-api/src/native-original-ui-preconditions.ts": "4c92e71988e94f26cd492a915be635d6d9ffe701cdc189fbdebee2bdc81eda7b",
  "services/pg-api/src/original-agent-inbox-contract.ts": "ea8aef1b3b025bee71c7cdc0e81d9d65dd50af6b343e38757c7051d747141bc2",
  "services/pg-api/src/original-agent-inbox-http.ts": "1073af97562f35a13bff1ba7d8cd95f46d9594ed2074968b302664a4252f86d8",
  "shared/original-agent-catalog.ts": "2aac1f4f3c3d7f7e32953066bad4cfeba52da4cf9099fd8132e8d6a62a54f871",
  "shared/original-home-authoring.ts": "78356c473b3dcf190ff65fff25265b0321d31a0bc9db67a159ee66b599f881b2",
  "services/pg-api/src/native-home-knowledge-stats-pins.ts": "fa4308addaa5562cf12a37e867deffbf133458c80823a1bae42426221c82707d",
  "services/pg-api/src/native-home-knowledge-stats-runtime.ts": "249e533ed5c477abc4189c4e676948d01f3b81b5cbc31cca8b1032df3be4f353",
  "services/pg-api/src/pg18-full069-reader-audit-phase.mjs": "53419efca128b54406394687c80b3379c68f50b7f30f26765b530f9a7c3ed909",
  "services/pg-api/src/native-monitor-inbox-audit.ts": "2309627303b6fe7f7237c1ce2666ddd069db740ce210edcdd84d427ec6a49cd8",
  "services/pg-api/src/native-monitor-inbox-contract.ts": "eb47468dc077794254266d865bec917f6f72530e3aebbd3e11d8e13bec3ccd19",
  "services/pg-api/src/native-monitor-inbox-http.ts": "b700ec51d8d0fed9f3849c8fddedc50dc95d252d78b4361d5b7c1258ab6e610f",
  "services/pg-api/src/native-monitor-inbox-import-plan.ts": "3072ef03ae7179676ab576caca40817985f620b6ea4c34ba9f23bb77e56a6746",
  "services/pg-api/src/native-monitor-inbox-repository.ts": "46dd016a2dedd434d9b7e5ec93b25816b03b02d5977e10d5729e5113cb023daa",
  "services/pg-api/src/native-monitor-inbox-runtime.ts": "17bd61f2d8d222a06cee4d3346288d1632f376d4ff6b4693953e64e3bd0a7f2a",
  "services/pg-api/src/native-monitor-inbox-schema.ts": "4970eee96a4a1ad2e60ebf4bbb0273736df8bb7e484699e30b295e46648e2528",
  "services/pg-api/src/pg18-full069-final14-database-acl.mjs": "2c0b34776db5364f6878de19eda526ded1d8bd97ec46fa34d633f6527ba8112a",
  "services/pg-api/src/pg18-full069-owned-record-contract.mjs": "d8a34454c2c3cf0c072bfdbaec608899152c15113a6083e9fde12e3b582f5587",
  "services/pg-api/src/original-internal-overview-http.ts": "2d6c058c37d5a23c471ad1874e30b82eed25eb5172c08155a867d6d1d789c0d3",
  "services/pg-api/src/original-internal-overview-read.ts": "810f10a8a2363046e6bdae3389870239cf81d47f14d91a702ddc1d2d6baef22e",
  "shared/original-internal-overview-contract.ts": "a4aad15db6aa5e91b338470ffbe692b5df98a4aae0fed0ebd791dd36dfa30969",
  "services/pg-api/src/pg18-full069-owned-process-observation.mjs": "aec459c8d2c350fb1dd69e46b8cdff7c8967928dfe43bb804dd7e74725ad0d5a",
  "services/pg-api/src/agent-design-http.ts": "a66a620ebcfa9b52705940d7db4bfd556cbcf46eeb8954f53b7b6d89e7e8f837",
  "services/pg-api/src/agent-design-ledger.ts": "e2104df39284a2a4e616513f2a6bbe86d8a051a77e6f679b20228667daea0391",
  "services/pg-api/src/pg18-full069-worker-startup-observation.d.mts": "1240a3dc22506ef7fe7170e162bace3a27737d344690d106bc4d3ef188f2cab9",
  "services/pg-api/src/pg18-full069-worker-startup-observation.mjs": "4651d93764b378018a2b81cdccb83eceeabb76772c411a2f085e2d73093d3d06",
  "db/postgres/003_finish_job.sql": "b10ebd832b5cfff727a0444814b91561e650f40c85e91f3be46a1115f358c738",
  "db/postgres/004_retry_job.sql": "5eab2265fd8f705b0745c2f8a2be0f64efca49b5fcd08ced834617035eec8337",
  "db/postgres/006_claim_agent_model.sql": "0b464605aa968c2d9f558b68b342eb409c809013dbd4d178c9f0ca9cdec6a449",
  "db/postgres/007_claim_workflow_safe.sql": "e7dc2335d97f8235e54b4a7a5c1ac03bc156577e2e7a2bdd2e0273f33af8bafa",
  "db/postgres/008_claim_workflow_v2.sql": "fa1f62bdda742c281d74ac50b01db1697402dda710c417437553828bf14c5ef1"
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
