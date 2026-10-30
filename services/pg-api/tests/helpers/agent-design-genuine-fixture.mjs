// F01 test-only actual PG18/Native HTTPS/mTLS fixture. Import is side-effect free.
// Ordinary hosts fail before pg/fixture imports, Pool, SQL, files or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

const workflow='Agent Studio F01 Agent Design genuine PG18 isolated verification'
const jobs=new Set(['pg18-agent-design-genuine','pg18-agent-design-browser'])
// Reviewed runtime source pins are test provenance only. They never authorize
// a role: every positive still executes the actual original-client auditor.
export const agentDesignGenuineFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_062_agent_design.sql": "bd735c5a61dab098c846c93e30a2fad636b409ded40064a8cf311e0710a1e82e",
  "services/pg-api/src/agent-design-audit-core.ts": "31d99e0f28c9d04402ec1b75db3714a41947c296cfba74a99d3dabcdf182a872",
  "services/pg-api/src/agent-design-audit.ts": "1efe6de5bea8e14fa4b957e050edddcfee9a595f438d636f9a4046cce0921f78",
  "services/pg-api/src/native-auth-http.mjs": "3e849c29ef1df06ca00437708cf32d35b5f34313792e59db40996d5e32b2cd63",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "services/pg-api/src/agent-design-value-contract.ts": "a7e6ca69da599cd6423feb300010d6297fc104b5bd11c7864aa9000c86dc2110",
  "services/pg-api/src/agent-design-contract.ts": "29a358f47c84a6be8b8385cf3b878fb78989a97b00811a9fc99327aff6008542",
  "services/pg-api/src/agent-design-rpc-contract.ts": "57bbccd6657dbc680fa47d917efc6fb8b5dcadead37c4e91cd06e1bc3783e823",
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
  "services/pg-api/src/native-auth-http.d.mts": "455046bbc72a9723f8143a4076b7b311d9914bb9fcfe5e61e5f84f944667d31a",
  "services/pg-api/src/native-config-uat-policy.ts": "6a9f9f0747ef242f53b99a39438cd886d85cd6a4c6be88b00559bf2bd8b01f26",
  "services/pg-api/src/native-server.ts": "2c465065accd677b42f1a7068da4cd5dc153d382ab9498c566593fe8c4fcbca0",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "8fe2a1f9c53d13b0331d24a03323833d5f8f5d0740695d57b6890b73cad1fa75",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "d5cc238eb52cf9e4e3e5d123897d41961b62ea7c1f02144c2f277ab3cef1aa9e",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "c314265af0f2c56f77f7d81112f89d0015f12b20dfad6b1b86f8758b5c315ab9",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "f5251cc0b6820b3c3930b37e06c3b75ccea47bd387d5b727c845261a2084b54b",
  "services/pg-api/src/pg18-complete-profile.ts": "6dfd232a01592c85cc027d0e92de6816000d643a95d338cef070d63b1ff1b8f2",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "9070393ccd9c4a0e4e2ec234f559327c644b611096b441429ea8278f0a6c2f12",
  "services/pg-api/src/workflow-v2-run-repository.ts": "0cd4ba90b942d30aacc5fcd5e4ae0067163b0c8def563c0b34212f4cdcd360cd",
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
  "services/pg-api/src/own-operations-repository.ts": "4111884cdb352cacf5414184065286766d0206a0de5076b2b5e2662fe72dbac0",
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
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
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
  "services/pg-api/src/workflow-v2-worker-loop.ts": "214bbeaa14d514e60e106fe63358869b257909e056e14f7b400c4c19e8deba66",
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
  "services/pg-api/src/repository.ts": "6916fc4503aa5d4e1c40f43351b89842194257378f47b2d6cec4473e495229c2",
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
  "services/pg-api/src/pg18-full069-worker-live-child.mjs": "863b04dbee65d3890c70af0244320b2d3ba56c50e34f666a3ea384b527bbe352",
  "services/pg-api/src/pg18-full069-worker-live-cli.mjs": "7b87c06eb64f117a0929d33d0e9c85be56f0c975862f31b2fac644b22464b898",
  "services/pg-api/src/pg18-full069-worker-live-contract.mjs": "8c286bae8658055ae38a3413e6db6dcbf93bb745e9868abe8cafa02aebe77e4e",
  "services/pg-api/src/pg18-full069-worker-live-native.mjs": "33e90f8a20e76a6cb0a8699a0b6546445392f059b34e784f4de081b125e9f88d",
  "services/pg-api/src/pg18-full069-worker-live-processes.mjs": "675a6c91964c0b9f42cc821ab3b7bc0de4d6bd6fde2ee676b91b9010311c3bad",
  "services/pg-api/src/pg18-full069-worker-live-runner.mjs": "3433b16af75b26822354b19863bc78b2749083cc429dac79dcef2f6e67730d96",
  "services/pg-api/src/pg18-full069-worker-live-runtime.mjs": "45f1d147ef840bac2b6cba27f211cba1be492be015bf6d0fb7d48b6062d36b23",
  "services/pg-api/src/pg18-full069-worker-live-sources.mjs": "1b386c2a16661910b50afb59d5c28277d0cc908bf5c8fc1bf55c095ce05b46f9",
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
  "services/pg-api/src/pg18-full069-worker-path-validation-runner.mjs": "90a331d44739bd73412929f51d5967bd75e1e448524d6faa0232abf79095b2c3",
  "services/pg-api/src/pg18-full069-final-cli.mjs": "d137ed31ee18918f798b9731850aa9f665ee26d6ca05c8cf00935579ad79b890",
  "services/pg-api/src/pg18-full069-final-client-bindings.mjs": "67b9f635f1a22a9fb728c48405ea2b5fbba83a209b1229ce25720a5f7ca4762d",
  "services/pg-api/src/pg18-full069-final-companion-child.mjs": "82d27723ef449cf81b3eb9ca55f36d04a8ef96c1b0a5fab42fb43123c5ce23e6",
  "services/pg-api/src/pg18-full069-final-companion-contract.mjs": "a350021e1712ed971b1d1b6489ca22a65176893a4720c5574098951937e3b481",
  "services/pg-api/src/pg18-full069-final-companion-kernel.mjs": "25c97e090d9feb948f9dce662df4848362cffa2ebd393e7d5680999c8a0d68fb",
  "services/pg-api/src/pg18-full069-final-companions.mjs": "5fcedd866174e3a3fccc527358eb94fa889030ccf915cc7636a4490df4be2108",
  "services/pg-api/src/pg18-full069-final-login-contract.mjs": "ecd3142f8625daf0dfca3b256ba2e11a88de248baa901bab68db7d57e2c1dd22",
  "services/pg-api/src/pg18-full069-final-records.mjs": "ce30e7238c414977ce2e1168508989ebb6fe6bca853e5f30539ac66de3ed7e62",
  "services/pg-api/src/pg18-full069-final-runner.mjs": "d2e072be19aa097e0215f488a0836f740589867f141c790330704ddbb288fb29",
  "services/pg-api/src/pg18-full069-final-runtime.mjs": "d84197104e11431c22eac041d21ff2a695f1afbb35300f6b569e75fcf7c39b94",
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
  "services/pg-api/src/native-monitor-inbox-audit.ts": "5082534d9874070bb98907e8857b1afa4b5e89c96b0ee0f1dab52973c3a2bf56",
  "services/pg-api/src/native-monitor-inbox-contract.ts": "eb47468dc077794254266d865bec917f6f72530e3aebbd3e11d8e13bec3ccd19",
  "services/pg-api/src/native-monitor-inbox-http.ts": "b700ec51d8d0fed9f3849c8fddedc50dc95d252d78b4361d5b7c1258ab6e610f",
  "services/pg-api/src/native-monitor-inbox-import-plan.ts": "3072ef03ae7179676ab576caca40817985f620b6ea4c34ba9f23bb77e56a6746",
  "services/pg-api/src/native-monitor-inbox-repository.ts": "46dd016a2dedd434d9b7e5ec93b25816b03b02d5977e10d5729e5113cb023daa",
  "services/pg-api/src/native-monitor-inbox-runtime.ts": "17bd61f2d8d222a06cee4d3346288d1632f376d4ff6b4693953e64e3bd0a7f2a",
  "services/pg-api/src/native-monitor-inbox-schema.ts": "5d86d62f99055699280777e6db78691e5e06edfbecbfb7c27652dfc768110ac3",
  "services/pg-api/src/pg18-full069-final14-database-acl.mjs": "5b0fcf05a15e218a6724edbfd0eb5f9d5e6ba6a3076b68683dbd909fddafa800",
  "services/pg-api/src/pg18-full069-owned-record-contract.mjs": "d8a34454c2c3cf0c072bfdbaec608899152c15113a6083e9fde12e3b582f5587"
})
export function requireAgentDesignGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==workflow||!jobs.has(env.GITHUB_JOB)||env.AGENT_STUDIO_F01_GENUINE_CI!=='YES_DISPOSABLE_F01_ONLY'||Object.keys(env).some(k=>env[k]!==undefined&&['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(k)))throw Error('refuse_non_ephemeral_agent_design_genuine_ci')
  return requireEphemeralPg18Ci(env)
}

export async function agentDesignGenuineFixture(env=process.env,{browserMode=false}={}){
  const target=requireAgentDesignGenuineCi(env)
  if(browserMode!==(env.GITHUB_JOB==='pg18-agent-design-browser'))throw Error('agent_design_genuine_job_mode_required')
  const [assertModule,crypto,https,pgModule,baseModule,tlsModule,nativeModule,authModule,cookieModule,designHttp,designLedger,designBroker,designWorker,designClient,designPolicy,designContract,designResult,contracts,toolsModule,knowledgeModule,accessModule]=await Promise.all([
    import('node:assert/strict'),import('node:crypto'),import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-http.mjs'),import('../../src/native-auth-repository.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/agent-design-http.ts'),import('../../src/agent-design-ledger.ts'),import('../../src/agent-design-broker.ts'),import('../../src/agent-design-worker.ts'),import('../../src/agent-design-client.ts'),import('../../src/agent-design-runtime-policy.ts'),import('../../src/agent-design-contract.ts'),import('../../src/agent-design-result.ts'),import('../../src/contracts.ts'),import('../../src/tool-connection-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/knowledge-access-repository.ts')])
  const assert=assertModule.default,{randomUUID,createHash}=crypto,{AgentDesignLedgerRepository}=designLedger
  const fs=await import('node:fs')
  for(const [relative,expected] of Object.entries(agentDesignGenuineFrozenSources)){
    const raw=fs.readFileSync(new URL('../../../../'+relative,import.meta.url))
    assert.equal(createHash('sha256').update(raw).digest('hex'),expected,'Root must install the frozen final DB source, never a drafting template')
  }
  const audit=await designPolicy.loadAgentDesignAuditVerifier() // actual final DB author module; no stub/fallback
  const f=await baseModule.agentAssessmentTcpFixture(env),extraPools=[],cookies=new Map(),events=[],providerRequests=[],proofs=[],providerErrors=[],ticks=new Set()
  const activation={executionEnabled:true,executionApproval:designPolicy.agentDesignExecutionApproval,audit}
  const gates=new Set(),postWaiters=[],mutable={submissions:true,saves:true,dropSubmit:false,dropSave:false,dropPrivate:false,afterPost:null,beforeDispatch:null,providerMode:'success'}
  const output=(who='alice')=>({name:'F01 Genuine Designed Agent '+who,goal:'Synthetic complete design goal '+who,task_scope:'Synthetic complete task scope',deliverables:['Synthetic deliverable one','Synthetic deliverable two'],tools:['Advisory capability only'],task_plan:['Synthetic step one','Synthetic step two'],done_criteria:['Synthetic done criterion']})
  const apiPassword=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
  const connect=(login,password)=>{const pool=new pgModule.default.Pool({...target,user:login,password,max:4,statement_timeout:10000,query_timeout:15000});pool.on('error',()=>{});extraPools.push(pool);return {knowledgeSharing:true,connect:()=>pool.connect()}}
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  let nativeServer,privateClient,worker,broker,lifetime,resolveLifetime,readyResolve,readyReject,serverTls,nativeOrigin,allowedOrigin,closed=false
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
  const finish=new Promise(resolve=>{resolveLifetime=resolve})
  const bounded=async(promise,ms=10000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_design_genuine_cleanup_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const raw=(url,{method='GET',body,cookie,headers={}}={})=>{
    const selected=new URL(url);assert.equal(selected.protocol,'https:');assert.equal(selected.hostname,'localhost');assert.ok(nativeOrigin&&selected.origin===nativeOrigin)
    const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
    return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>524288){res.destroy();return};chunks.push(Buffer.from(b))});res.once('error',reject);res.once('aborted',()=>reject(Error('agent_design_genuine_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('agent_design_genuine_invalid_response'))}})});req.once('error',reject);req.end(bytes)})
  }
  const request=(who,path,body,options={})=>raw(nativeOrigin+path,{...options,method:body===undefined?'GET':'POST',body,cookie:cookies.get(who)})
  const login=async who=>{const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const values=response.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(v=>v.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
  const counts=async()=> (await f.db.query(`SELECT
    (SELECT count(*)::integer FROM agentstudio.agent_design_requests) AS requests,
    (SELECT count(*)::integer FROM agentstudio.agent_design_reservations) AS reservations,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outcomes) AS outcomes,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outputs) AS outputs,
    (SELECT count(*)::integer FROM agentstudio.agent_design_save_receipts) AS saves,
    (SELECT count(*)::integer FROM agentstudio.agent_collaboration_revisions) AS history,
    (SELECT count(*)::integer FROM agentstudio.agent_specs) AS agents,
    (SELECT count(*)::integer FROM agentstudio.runs) AS runs,
    (SELECT count(*)::integer FROM agentstudio.external_effects) AS old_effects`)).rows[0]
  const record=async(owner,requestId)=>(await f.db.query(`SELECT r.*,j.state,
    (SELECT count(*)::integer FROM agentstudio.agent_design_reservations e WHERE e.owner_user_id=r.owner_user_id AND e.request_id=r.request_id) AS reservations,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outputs o WHERE o.owner_user_id=r.owner_user_id AND o.request_id=r.request_id) AS outputs,
    (SELECT count(*)::integer FROM agentstudio.agent_design_save_receipts s WHERE s.owner_user_id=r.owner_user_id AND s.design_request_id=r.request_id) AS saves,
    (SELECT count(*)::integer FROM agentstudio.agent_design_tombstones t WHERE t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id) AS tombstones
    FROM agentstudio.agent_design_requests r JOIN agentstudio.agent_design_jobs j USING(owner_user_id,request_id) WHERE r.owner_user_id=$1 AND r.request_id=$2`,[owner,requestId])).rows[0]
  const wireControl=async(who,requestId,action)=>{const body={action,request_id:randomUUID(),design_request_id:requestId,confirm:true},response=await request(who,'/api/v2/agent-design/control',body);assert.equal(response.status,200);return {body,response}}
  const close=async()=>{
    if(closed)return;closed=true
    const failures=[]
    for(const release of gates)release();gates.clear();worker?.closeNewClaims();privateClient?.close();broker?.close()
    await bounded(Promise.allSettled([...ticks]),60000).catch(e=>failures.push(e))
    if(nativeServer){nativeServer.closeAllConnections();await bounded(new Promise(resolve=>nativeServer.close(resolve))).catch(e=>failures.push(e))}
    resolveLifetime();await bounded(lifetime??Promise.resolve(),15000).catch(e=>failures.push(e))
    try{const results=await bounded(Promise.allSettled(extraPools.map(p=>p.end())));for(const r of results)if(r.status==='rejected')failures.push(r.reason)}catch(e){failures.push(e)}
    await f.close();cookies.clear();if(failures.length)throw new AggregateError(failures,'agent_design_genuine_cleanup_failed')
  }
  try{
    // Existing fixture verifies fresh real18/5432 server and installs001-057.
    // These fixed final sources must exist after Root merges the DB author's062.
    for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design'])await f.db.exec(f.sql('migrations/pg_v9_'+part+'.sql'))
    const designPassword=kind=>createHash('sha512').update(target.password+':F01-design:'+kind).digest('hex').slice(0,80)
    const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs')
    for(const [login,role,kind] of [['synthetic_design_worker','agentstudio_design_worker','worker'],['synthetic_design_dispatch','agentstudio_design_dispatch','dispatch']]){
      await f.db.exec('CREATE ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(designPassword(kind))+"'")
      await f.db.exec('GRANT '+role+' TO '+login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
    }
    const workerPool=connect('synthetic_design_worker',designPassword('worker')),dispatchPool=connect('synthetic_design_dispatch',designPassword('dispatch')),adminPool=connect(target.user,target.password)
    const authPool=connect('agentstudio_native_login',apiPassword('agentstudio_native_login')),auth=new authModule.NativeAuthRepository(authPool)
    // Observe actual original connections only. Queries/results are untouched;
    // no fake metadata, role identity or permission projection is substituted.
    let credentialReads=0
    const secretPool={async connect(){const db=await f.secretPool.connect();return {async query(sql,args=[]){if(sql.includes('api_key_ciphertext')){
      const proof=proofs.at(-1);assert.ok(proof)
      const reservations=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_design_reservations WHERE owner_user_id=$1 AND request_id=$2',[args[1],proof.request_id])).rows[0].n
      assert.equal(reservations,1,'this request reservation is committed on an independent connection before key SELECT')
      const role=(await db.query('SELECT current_user AS role,session_user AS login')).rows[0];assert.equal(role.role,'agentstudio_model_broker');assert.equal(role.login,'synthetic_assessment_secret')
      credentialReads++;events.push({kind:'credential',owner:args[1],connection:args[0],request_id:proof.request_id})
    }return db.query(sql,args)},release:()=>db.release()}}}
    let config
    const resolver={resolve4:async host=>{assert.equal(host,'api.openai.com');return ['93.184.216.34']},resolve6:async()=>[]}
    const providerRequest=(options,callback)=>{
      assert.equal(options.hostname,'api.openai.com');assert.equal(options.port,443);assert.equal(options.path,'/v1/chat/completions');assert.equal(options.method,'POST');assert.equal(options.rejectUnauthorized,true)
      assert.ok(config);return https.request({...options,hostname:'127.0.0.1',port:7459,servername:'localhost',lookup:undefined,ca:config.ca,cert:config.cert,key:config.key,agent:false},callback)
    }
    broker=new designBroker.AgentDesignBroker(f.pool,dispatchPool,secretPool,f.key,{...activation,resolver,request:providerRequest})
    const handlerFactory=tls=>{
      const handle=designClient.createAgentDesignInternalHandler({...activation,...tls,dispatch:proof=>broker.dispatch(proof)})
      return async(req,res)=>{
        if(req.url!=='/v1/chat/completions'){
          if(mutable.dropPrivate&&req.url===designPolicy.agentDesignPrivateRoute){mutable.dropPrivate=false;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
          return handle(req,res)
        }
        try{
          assert.equal(req.socket.authorized,true);assert.equal(req.method,'POST')
          const chunks=[];let size=0;for await(const p of req){size+=p.length;assert.ok(size<=524288);chunks.push(Buffer.from(p))}
          const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))
          const who=['alice','bob'].find(w=>req.headers.authorization==='Bearer synthetic-'+w+'-assessment-key-never-network');assert.ok(who,'actual selected decrypted fixture key reaches only synthetic TLS provider')
          const proof=proofs.at(-1);assert.ok(proof)
          const row=await record(f.users[who],proof.request_id);assert.equal(row.reservations,1)
          const last=events.at(-1);assert.equal(last?.kind,'credential');assert.equal(last.request_id,proof.request_id);assert.equal(last.owner,f.users[who])
          const actual=(await f.db.query('SELECT body FROM agentstudio.agent_design_inputs WHERE owner_user_id=$1 AND request_id=$2',[f.users[who],proof.request_id])).rows[0]?.body
          assert.deepEqual(body.messages,actual.messages);assert.equal(body.model,actual.choice.model_binding.model_id);assert.equal(body.max_completion_tokens,actual.output_token_limit)
          assert.doesNotMatch(JSON.stringify(body),/api_key_ciphertext|knowledge-body-never-send|fixture-header-never-send|owner_user_id|lease_token/)
          providerRequests.push({who,request_id:proof.request_id,input_sha256:row.input_sha256,cap:body.max_completion_tokens});events.push({kind:'provider_post',request_id:proof.request_id,owner:f.users[who]});for(const notify of postWaiters.splice(0))notify()
          if(mutable.afterPost)await mutable.afterPost({who,request_id:proof.request_id})
          if(mutable.providerMode==='disconnect'){res.destroy();return}
          const result=output(who),content=mutable.providerMode==='partial'?'{"name":"incomplete"}':JSON.stringify(result)
          res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:mutable.providerMode==='truncated'?'length':'stop',message:{role:'assistant',content}}]}))
        }catch(error){providerErrors.push(error);res.destroy()}
      }
    }
    lifetime=tlsModule.withDisposableBoundModelTls(proof=>broker.dispatch(proof),async tls=>{
      config=tls;assert.equal(tls.origin,'https://127.0.0.1:7459');assert.ok(tls.serverTls,'Root must apply the explicit fixture delta; no product TLS bypass')
      serverTls=tls.serverTls
      privateClient=designClient.createAgentDesignMutualTlsClient({...activation,...tls})
      worker=new designWorker.AgentDesignWorker(workerPool,randomUUID(),async proof=>{proofs.push({...proof});if(mutable.beforeDispatch)await mutable.beforeDispatch(proof);return privateClient(proof)},activation)
      let nativeHandler
      nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return};void nativeHandler(req,res).catch(()=>res.destroy())})
      await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)})
      nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
      const repositories=()=>({open:new AgentDesignLedgerRepository(f.pool,{audit,allowSubmissions:mutable.submissions,allowSaves:mutable.saves})})
      const [{createHandler},{WorkflowRepository}]=await Promise.all([import('../../src/http.ts'),import('../../src/workflow-repository.ts')])
      let generic
      const native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowAgentDesign:true,allowAgentDesignSubmissions:true,allowAgentDesignSaves:true,businessHandler:async(req,res)=>{
        // Fresh repositories read test toggles; actual source/SQL/receipt gates
        // are never mocked, and original recovery remains the product path.
        const handler=designHttp.createAgentDesignHttpHandler({repository:repositories().open,authenticateRequest:native.authenticateRequest,allowedOrigin})
        if(await handler(req,res))return
        return generic(req,res)
      }})
      generic=createHandler({repository:f.agents,modelConnectionRepository:f.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(f.pool,f.key),workflowRepository:new WorkflowRepository(f.pool),knowledgeRepository:new knowledgeModule.KnowledgeBaseRepository(f.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F01_genuine_Native_cookie_only')}})
      nativeHandler=async(req,res)=>{
        const drop=mutable.dropSubmit&&req.url==='/api/v2/agent-design/submit'||mutable.dropSave&&req.url==='/api/v2/agent-design/save'
        if(drop){if(mutable.dropSubmit&&req.url.endsWith('/submit'))mutable.dropSubmit=false;else mutable.dropSave=false;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
        return native.handler(req,res)
      }
      await login('alice');await login('bob')
      readyResolve();await finish
    },{handlerFactory,listenPort:7459,includeServerTls:true}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{})
    await ready
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];const actual=await auth.verifySession(token);assert.ok(actual);return actual}
    const createDesign=async(who='alice',purpose='generate',options={})=>{
      const binding=f.resources[who].binding;let source=null
      if(purpose==='revise'){const s=await request(who,'/api/v2/agent-design/sources/'+(options.specId??f.resources[who].spec.id));assert.equal(s.status,200);source=s.body.source}
      const choice={action:'preview',purpose,instruction:options.instruction??'SYNTHETIC F01 design complete six descriptions; tools are advice only',model_binding:binding,output_token_limit:options.cap??4096,source}
      const preview=await request(who,'/api/v2/agent-design/preview',choice);assert.equal(preview.status,200)
      const {action:_action,...selected}=choice,body={...selected,action:'submit',request_id:options.requestId??randomUUID(),expected_input_sha256:preview.body.input_sha256,confirm:true,fee_acknowledgement:designContract.agentDesignFees[purpose]}
      return {who,owner:f.users[who],choice,preview:preview.body,body,request_id:body.request_id}
    }
    const submit=async p=>{const response=await request(p.who,'/api/v2/agent-design/submit',p.body);assert.equal(response.status,200);p.receipt=response.body;return response}
    const tick=()=>{const work=worker.tick();ticks.add(work);void work.finally(()=>ticks.delete(work)).catch(()=>{});return work}
    const waitForPost=async(after=0)=>{if(providerRequests.length>after)return;await new Promise(resolve=>postWaiters.push(resolve))}
    const savePreview=async(p,edits={})=>{const view=await request(p.who,'/api/v2/agent-design/requests/'+p.request_id);assert.equal(view.status,200);assert.equal(view.body.result_status,'available');const {tools:_tools,...original}=view.body.result.result;const fields={...original,...edits};const body={action:'preview_save',design_request_id:p.request_id,expected_result_sha256:view.body.result.result_sha256,fields};const preview=await request(p.who,'/api/v2/agent-design/preview-save',body);assert.equal(preview.status,200);return {view:view.body,body,preview:preview.body}}
    const saveBody=(p,s,requestId=randomUUID())=>({intent:{action:'save',request_id:requestId,design_request_id:p.request_id,expected_preview_sha256:s.preview.preview_sha256,expected_result_sha256:s.preview.result_sha256,expected_source_sha256:s.preview.source_sha256,expected_candidate_sha256:s.preview.candidate.candidate_sha256,confirm:true,save_acknowledgement:'APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1'},preview:s.body})
    const governance=async(who,enabled)=>{const items=await request('alice','/api/native-auth/employees');assert.equal(items.status,200);const row=items.body.items.find(r=>r.id===f.users[who]);assert.ok(row);const body={request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true};const changed=await request('alice','/api/native-auth/employees/change',body);assert.equal(changed.status,200);return changed.body}
    const withResource=async(who='alice')=>{const identity=await identityFor(who),tools=new toolsModule.ToolConnectionRepository(f.pool,f.key),tool=await tools.create(identity,{name:'F01 synthetic HTTP resource',description:'Resource authority test only',url:'https://example.com/f01-fixture',method:'GET',headers:[{key:'X-Synthetic-Fixture',value:'fixture-header-never-send'}],body_template:'',timeout_s:5,enabled:true});const previous=await f.agents.get(identity,f.resources[who].spec.id),{require_approval:_approval,...spec}=previous.spec;const role=await f.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...spec,tools:[...new Set([...spec.tools,'http_f01'])],http_tools:[{name:'http_f01',description:'Fixture',connection_id:tool.id,connection_revision:tool.revision}]}),previous.revision);return {tool,role,tools,identity}}
    const sharedKnowledge=async()=>{const alice=await identityFor('alice'),bob=await identityFor('bob'),bases=new knowledgeModule.KnowledgeBaseRepository(f.pool),base=await bases.create(alice,'F01 synthetic shared KB','Private fixture body stays out of model design'),access=new accessModule.KnowledgeAccessRepository(f.pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email));await bases.createTextDocument(alice,base.id,{filename:'f01-private-fixture.txt',text:'knowledge-body-never-send: actual stored synthetic private KB body.'});const granted=await access.change(alice,base.id,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:credentials.bob.email,role:'viewer',semantic_allowed:false});const prior=await f.agents.get(bob,f.resources.bob.spec.id),{require_approval:_a,...spec}=prior.spec;const role=await f.agents.update(bob,prior.id,prior.name,contracts.safeAgentSpec({...spec,tools:[...new Set([...spec.tools,'knowledge_search'])],knowledge_base_ids:[base.id]}),prior.revision);return {base,role,revoke:()=>access.change(alice,base.id,{action:'revoke',request_id:randomUUID(),expected_revision:granted.item.revision,recipient_id:f.users.bob})}}
    return {...f,target,adminPool,workerPool,dispatchPool,authPool,auth,audit,activation,request,login,nativeOrigin,allowedOrigin,serverTls,credentials,createDesign,submit,tick,wireControl,savePreview,saveBody,counts,record,governance,withResource,sharedKnowledge,identityFor,output,mutable,events,proofs,providerRequests,providerErrors,credentialReads:()=>credentialReads,waitForPost,
      pauseProvider(){let release;const held=new Promise(resolve=>{release=resolve});gates.add(release);mutable.afterPost=async()=>held;return ()=>{gates.delete(release);release();mutable.afterPost=null}},
      assertNoProviderErrors(){assert.deepEqual(providerErrors,[])},close}
  }catch(error){await close();throw error}
}
