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
  "services/pg-api/src/native-auth-http.mjs": "d7a01d4f9b03a11b35c73c0760727646c5f8bad1ee6d0df71868fd70b6ae9747",
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
  "services/pg-api/src/http.ts": "3824816b96ef1e110b7ecfaba74363204cac7cec4a0cab21f2315c3e9b145d68",
  "services/pg-api/src/native-auth-http.d.mts": "c6934f12654950afe00ef267723905ca5e20779963dda1db1d0aefee302369ea",
  "services/pg-api/src/native-config-uat-policy.ts": "1321619e4ff4f25286b59d3f6676028dea0d8c4da3f56121109b8bba4e0328e4",
  "services/pg-api/src/native-server.ts": "68f561844dbe866cc9428fd9080113e81d40f7c05b5254d0d17932be3c83f5f0",
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
  "services/pg-api/src/pg18-full069-worker-live-child.mjs": "209cefe0516c61c4998ebd3183e65460327a445bb185abbde2888e9ed3eb6a2b",
  "services/pg-api/src/pg18-full069-worker-live-cli.mjs": "7b87c06eb64f117a0929d33d0e9c85be56f0c975862f31b2fac644b22464b898",
  "services/pg-api/src/pg18-full069-worker-live-contract.mjs": "8c286bae8658055ae38a3413e6db6dcbf93bb745e9868abe8cafa02aebe77e4e",
  "services/pg-api/src/pg18-full069-worker-live-native.mjs": "fa503348624036e39c2abcdc88811c213ae7b7198a706adc140aa0a08b6ca8fc",
  "services/pg-api/src/pg18-full069-worker-live-processes.mjs": "9c9c5c932364369df21375af6af9d16dd1c7033a9c7dd5d7d86becbc1cb87c97",
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
  "services/pg-api/src/pg18-full069-worker-path-validation-runner.mjs": "8a59959929cc07512b1e3e77c5257bb5af4707065036838e9645f655951caaf6",
  "services/pg-api/src/pg18-full069-final-cli.mjs": "d137ed31ee18918f798b9731850aa9f665ee26d6ca05c8cf00935579ad79b890",
  "services/pg-api/src/pg18-full069-final-client-bindings.mjs": "67b9f635f1a22a9fb728c48405ea2b5fbba83a209b1229ce25720a5f7ca4762d",
  "services/pg-api/src/pg18-full069-final-companion-child.mjs": "82d27723ef449cf81b3eb9ca55f36d04a8ef96c1b0a5fab42fb43123c5ce23e6",
  "services/pg-api/src/pg18-full069-final-companion-contract.mjs": "a350021e1712ed971b1d1b6489ca22a65176893a4720c5574098951937e3b481",
  "services/pg-api/src/pg18-full069-final-companion-kernel.mjs": "25c97e090d9feb948f9dce662df4848362cffa2ebd393e7d5680999c8a0d68fb",
  "services/pg-api/src/pg18-full069-final-companions.mjs": "5fcedd866174e3a3fccc527358eb94fa889030ccf915cc7636a4490df4be2108",
  "services/pg-api/src/pg18-full069-final-login-contract.mjs": "ecd3142f8625daf0dfca3b256ba2e11a88de248baa901bab68db7d57e2c1dd22",
  "services/pg-api/src/pg18-full069-final-records.mjs": "ce30e7238c414977ce2e1168508989ebb6fe6bca853e5f30539ac66de3ed7e62",
  "services/pg-api/src/pg18-full069-final-runner.mjs": "d2e072be19aa097e0215f488a0836f740589867f141c790330704ddbb288fb29",
  "services/pg-api/src/pg18-full069-final-runtime.mjs": "68d849b5eb8450a5e45324222cea53f1888bfe628b8ec85b09da68483baba4ab",
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
  "services/pg-api/src/native-original-ui-preconditions.ts": "4217fcb81669794d0617771e5bf5ab7bc16497f1ba9048874dbefb9e1e1c79be",
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
  "services/pg-api/src/pg18-full069-owned-process-observation.mjs": "69d9a19997ff4a33bc3f9ba82efdb5840ef89b70d8762ba1dd7a422c80a0da20",
  "services/pg-api/src/agent-assessment-audit-core.ts": "87740182730dbb644cfbc31cb689a4fb80da4636452ef2a209f1cc2559acfd09",
  "services/pg-api/src/agent-assessment-audit.ts": "a1e1f0d65e50187388217fbbe8062182a1c2bf280395ed32561fa6c8d3c85ae4",
  "services/pg-api/src/agent-assessment-contract.ts": "da2c58bcfdf6b529e82c04370a6b2579dc34ffed7c63bf510bc91ba0645ec09a",
  "services/pg-api/src/agent-collaboration-audit.ts": "419dcfbbf694e178009a2775469f0f1049edd924ffe464cb51b0f93bb0f550dd",
  "services/pg-api/src/agent-collaboration-contract.ts": "d90adfe47be99de4d248fbcd694fd3867c2214f902d1677fd87bae1ad999154d",
  "services/pg-api/src/agent-collaboration-repository.ts": "cae414c4f242a350717d20dd9e0a9cc2923ee6d37913d2aa677a056d4a22e391",
  "services/pg-api/src/agent-descriptive-patch-audit-core.ts": "9c6ff4ab6247b40877b17c33fc87e90d007963a118101879eec6a4f58b067d6f",
  "services/pg-api/src/agent-descriptive-patch-audit.ts": "0b5e935ceae27502d2a1d567c265ad86ed3185b72896263bfb1910ea380fde79",
  "services/pg-api/src/agent-design-broker.ts": "65b88f24c647cd65d482f358a65276a9cd555df2696e32bdc0778a3f3eca8a3f",
  "services/pg-api/src/agent-design-client.ts": "3b952492043e4f4a3e4bae2c0749f95673280253fccd79d53bcce1c83e50269f",
  "services/pg-api/src/agent-design-http.ts": "a66a620ebcfa9b52705940d7db4bfd556cbcf46eeb8954f53b7b6d89e7e8f837",
  "services/pg-api/src/agent-design-input.ts": "8b109396006cd0b928b2e3542fb2154f855f7fd5723b4e4c9ee4bfc9cbf0c4c4",
  "services/pg-api/src/agent-design-ledger.ts": "e2104df39284a2a4e616513f2a6bbe86d8a051a77e6f679b20228667daea0391",
  "services/pg-api/src/agent-design-predecessor-audit-core.ts": "5edd52d341068256567775b9234abe0a3bf39194ca51ac6b40933062d6e4c988",
  "services/pg-api/src/agent-design-provider.ts": "736a5d5b48a517a840d72140384ed87e5e5ee6b10a654d1f4e4c47ca2dc73858",
  "services/pg-api/src/agent-design-result.ts": "7aa2505b5279d2742db6b445493626f82d0b987b6174d64514c718ca7458c5cc",
  "services/pg-api/src/agent-design-runtime-policy.ts": "735ff11d2a916f28b97895a642c65556f0f58cfd1faf54f4233f14b1ac6c8299",
  "services/pg-api/src/agent-design-source.ts": "4ac46854ccc6f275740cdfe88b92b1303069540876812c9bc8cdf18fba5809ae",
  "services/pg-api/src/agent-design-worker.ts": "ab8529cad4b91e4cc01ee620d13f6626ac3ae60e566ec716a2da8f1cf177c92a",
  "services/pg-api/src/agent-feedback-audit.ts": "b06c833d2caefbc79d683ee3831a7a58e0c0d6410119d728fba3e113ed05fe43",
  "services/pg-api/src/agent-feedback-contract.ts": "7ae5d38363fc35aa0c278bff38fc68f376ce05ed0258b0ef365eb3fee41938cc",
  "services/pg-api/src/agent-feedback-optimization-contract.ts": "4e9dd0b3870f09c4ae2ecf5a1ea64e20589238b7e97c55f2534e0b34490c903c",
  "services/pg-api/src/agent-feedback-repository.ts": "b5bff2cd5879ecea70e75319924822f13a64a8ff4c116457a3c12d493225fd94",
  "services/pg-api/src/agent-feedback-source.ts": "f867c742e7d9c513faf2678cffbe0b7db695d1bd289dc7d5a0354c3e6e8816a5",
  "services/pg-api/src/agent-generated-acceptance-contract.ts": "ec0807f410ed729aac62dc6eb3d60079944207580811fd71c7bdbd4d0892b151",
  "services/pg-api/src/agent-generated-audit-core.ts": "0907c803fb132c56bbe6c71bf5cf865404e35743e0fd6d5f4a36fb164803cf87",
  "services/pg-api/src/agent-generated-audit.ts": "f6797d9e1302c6278feaaa20617f8b834e0c279dcad45993198dada268c9f3b4",
  "services/pg-api/src/agent-http-tools.ts": "7842a30631c605366b668ce2a237a6417301daa4e15e835e451cf240ea017cb8",
  "services/pg-api/src/agent-human-input-audit.ts": "0d8c1bc917b98c708d6d25870c5fb4f381a072d7417f7e30de0e92069d398a89",
  "services/pg-api/src/agent-human-input-contract.ts": "af32896ca2050ffe69acf215e2c25f8107be97e494b598fb9b27a0ad8aca6e2e",
  "services/pg-api/src/agent-human-input-repository.ts": "863ccbe72ab9b46ff27ed13f6eed4d517d981796086685a9847d09d797a68e2b",
  "services/pg-api/src/agent-internal-share-audit-core.ts": "a179b261b50ebd3cf8fd6cc6186454a7f37d2755c46d8cdc24c26b1993dfb434",
  "services/pg-api/src/agent-internal-share-audit.ts": "7eac9cca88280e746a96daf272f2831797913dca827bb2833e239779ea3d367d",
  "services/pg-api/src/agent-knowledge-grounding.ts": "10f485894de97416ab3418026e475c9ac3d77a7878dc46adc60abe2ee64eb055",
  "services/pg-api/src/agent-memory-audit.ts": "2413ad71030947ad704c8e1281984de375d86fe099e13ed029951a1a0ef8d765",
  "services/pg-api/src/agent-memory-context-audit.ts": "b1d6e80c3adc42707a0f808830a700a905e7da29cd8869bfeffc993ccf97ef56",
  "services/pg-api/src/agent-memory-context-policy.ts": "e5974fa2742cdd3c4cc76320be83d7dc8e976404a1a9825f6803f24b21d5b3c1",
  "services/pg-api/src/agent-memory-context.ts": "9c73a6cab2cb9fb86bb3e0899989130f88b6936442c454865ae023d5e671bae6",
  "services/pg-api/src/agent-memory-contract.ts": "6ddf3b0734c4afc3f9f106e3eef4a759d4b78b1dcafea811e9f4651120dad75d",
  "services/pg-api/src/agent-memory-derived-audit.ts": "297b5bfc090c87708e581189c52c35fdbf6c1f114b5801384ace881e1046c2d3",
  "services/pg-api/src/agent-memory-derived-contract.ts": "05fef75fdd015861ee3438eb26b51f70cdb439c8cf2bb8ca8efdb53d5bf1ae3a",
  "services/pg-api/src/agent-memory-derived-repository.ts": "d53a65aeb1a63473e82743767fb45ddb1c5b50aa1c6b52356bc25efcceaad353",
  "services/pg-api/src/agent-memory-derived-source.ts": "742b6f32febb26920d933119f8a875cb3411a19e844540c84b66985c40f278e8",
  "services/pg-api/src/agent-memory-derived-text.ts": "ca471ad9f83b9158e89eff0ffcce5e22472468dcd8ad6c07c39d38dbf4cdf757",
  "services/pg-api/src/agent-memory-derived-tools.ts": "08eee0f49012b1f2df9002ff365fcacd4defcaf4bb89e215fea28b0ace4dee7f",
  "services/pg-api/src/agent-memory-failure-source-audit.ts": "748b86d58226c1b7b3d0c389b7c38038559024486791073c310517285be1e8c5",
  "services/pg-api/src/agent-memory-failure-source.ts": "61679562293a768ffe6a24a92609430e55033a82ea9825fdc4ecdfffbcda66f2",
  "services/pg-api/src/agent-memory-outcome-audit.ts": "75df7b6a7ab4341887efec2ae34a416a9c138cbdf962268588508824023eba0a",
  "services/pg-api/src/agent-memory-outcome-contract.ts": "7996bd3a2455d18e63db4b623b5b9e715247c60c67d8d98e120c13c1d99f0152",
  "services/pg-api/src/agent-memory-outcome-repository.ts": "c93c9747e44f4ef2b1d4fdc129bab5b44e75cc5ab044f18c4906f76c5a0cd402",
  "services/pg-api/src/agent-memory-relation-acl.ts": "432ce7769d43ad8f2f0475908200c5056c69400dbe5a5da19615091054c0df0f",
  "services/pg-api/src/agent-memory-repository.ts": "98e1b3df70be458001c80a1c9b668b9e3eb03604886778003ab911c7ad5081d4",
  "services/pg-api/src/agent-memory-runtime-policy.ts": "96bd8e5472d40094a416eef57ac047fc27118152c880119ef55c5c26f4a2354c",
  "services/pg-api/src/agent-memory-selection.ts": "b11aa714e16ce77aad4a41c30f8f8354b1d12cf55149cb5a0aec48ad4a46df86",
  "services/pg-api/src/agent-opinion-audit-core.ts": "2532390479de818bdf8b9d7cc43dd2c8fa46964834635475c066f88a1e67391c",
  "services/pg-api/src/agent-opinion-audit.ts": "418e4e6878dc9bfa173209b2e0ccddbdf4a8b32776e25a0270aec89d159cf453",
  "services/pg-api/src/agent-opinion-contract.ts": "a4f46ef1a2f83a2169943bf8c483c43333ad2c9a619cf1bee50d0935068852e7",
  "services/pg-api/src/agent-optimization-audit.ts": "6c9648b8f965e2f2420e1199779cdfdeb89ac969d31f7d5afc647e9e4d4ca08e",
  "services/pg-api/src/agent-plan-workflow-audit-core.ts": "96385b5f918ce0dccc7850aeed38cc65aad5811dbeedeb2291bc6a94d8203b42",
  "services/pg-api/src/agent-plan-workflow-audit.ts": "e36302d24fb1cd13599eb551f6604dea0681d9de01a16939f3942ad7b5f6dbf1",
  "services/pg-api/src/agent-plan-workflow-predecessor-061-audit-core.ts": "7e41e4f9662db2fd021587cb930b76e01974e3ff0acf10b6f3c3e41df991542b",
  "services/pg-api/src/agent-plan-workflow-predecessor-062-audit-core.ts": "761c136844c59b3824f78bc57e9f8a9a3ec7f2c69bd65ee545406046b4ae8566",
  "services/pg-api/src/agent-release-audit.ts": "648afdba50b772d0551d889c88f6aa04473bcca240d3a79e8e32b35638f9aea6",
  "services/pg-api/src/agent-release-contract.ts": "8f2a6f4f3bb974538ff280a462178ab3b084b8a4aaeb885263903c31635a6a18",
  "services/pg-api/src/agent-release-repository.ts": "1682f415a99fa2ce0383ddd1a9f8134e20f40f565ef1d8ababe29d11d8d5369e",
  "services/pg-api/src/agent-review-audit-core.ts": "c6837ffd2a53db63e8ab3c47860a27d0e91e03867bcb8770e4cfd028bef35dc7",
  "services/pg-api/src/agent-review-audit.ts": "d95afdd657024907f9196799f3983d24a2bf03699d88bd1856b15873505a7b80",
  "services/pg-api/src/agent-review-contract.ts": "2825ff8478eb27e1a30a5414f271adfc5df501f2ef5581e97b3011f45bd3707a",
  "services/pg-api/src/agent-review-control.ts": "ad04fabf885c160b82205273c2baf41da5fc40960a9d277b0c22bceee2ff7213",
  "services/pg-api/src/agent-review-history-contract.ts": "7e177278a5d63c64072b15aabdbb11d906771f44d64a5e510993c6a8dece4ccd",
  "services/pg-api/src/agent-review-input.ts": "c8d6f15a2f2d4a954bbd6e9726d131652d008b3631cf6b590577f5070510a412",
  "services/pg-api/src/agent-review-ledger.ts": "826eacbd5d5321765a127e73daba6259ecb2cdcec68ec1c28fb0453710c644bf",
  "services/pg-api/src/agent-review-public-contract.ts": "becde2f21a3aa4a4127f53f169b4eb7ad1dee0598068f0d91861dea22dad691a",
  "services/pg-api/src/agent-review-source.ts": "7fb5ee41ffe6967594206e00312705559ee3798e0f7e6a237c11126e5cb34a7c",
  "services/pg-api/src/agent-safe-text.ts": "efc0ad64e311b30d272e0c29ddae284fc33cf6551deb7b63e057dc43f671a0de",
  "services/pg-api/src/agent-template-market-audit-core.ts": "1f2c8edd622d4ade4f4198e0a7bd1c64e71be18944682b3b892fa37c87565e65",
  "services/pg-api/src/agent-template-market-audit.ts": "6fbc677dc83b845ab39ad7bb893309c8f1f2efc4be7eb41fff11d37255ff6d37",
  "services/pg-api/src/agent-template-market-contract.ts": "345d339ad6a7499a7c64005dfa429ff1187c24c3a285a356a992f675a2c2e819",
  "services/pg-api/src/autonomous-agent-graph.ts": "6d7003b827669f5d07475d7fc67bfc9e24058cf754c3c3bf7395701a5eb397ad",
  "services/pg-api/src/baota-pg18-fresh-init.mjs": "b8f2c750f7ee3c4aa9640e0efcddaa669d6520d4333b3db904f7c22cc771de44",
  "services/pg-api/src/bound-dispatch-role-preflight.ts": "af12d80dd34c12c5b73ded9eba2df9334edb7b72ffb7b0edfd71c59ba3fd1900",
  "services/pg-api/src/bound-lease-identity.ts": "64ea854941a944159ea33bbf01f4a1c4e44636dd2fb41a06c164c6681e3bc91a",
  "services/pg-api/src/bound-model-contract.ts": "f54ec7eba3ac8ccb4404f6f57b67abda0852aa65c33356884f409474f7d6fc4e",
  "services/pg-api/src/bound-model-internal-handler.ts": "282dfc7667e35ff8e83db253e534ade426370b498b6734b7e2219b526f9bdb6a",
  "services/pg-api/src/bound-runtime-credentials.ts": "846148225279783398214e8305cafa48d0d178bc51d9c3ec65f251287639d9d9",
  "services/pg-api/src/bound-tls-material.ts": "f5b388376c84c3a152f731fcfc132dab5615ebbd7e2695fdef84ecff863254a0",
  "services/pg-api/src/bound-worker-mtls.ts": "fc21fae1a545ee56f63ac7a8ed855222ddd1055b22b082bc6a75331108c5bcea",
  "services/pg-api/src/company-overview-audit-core.ts": "d4eb6c17d5c67a8a4084df304f13485a63f134f1c6d635fea3d4c14a9aedcc3e",
  "services/pg-api/src/document-parser.ts": "ee1e8b4206f060592771ce44bd4d6b5e63e9e1f114f4dc0ea19533b5ef6f6f1c",
  "services/pg-api/src/document-worker.ts": "84f172faf3c6901ae6dd96a3fb1d53887eb6199988ff1e0f72afb2e5efb63f6e",
  "services/pg-api/src/durable-v2-root.ts": "03fa6ff4a9144f69cee8829079bf0f197519baca28b9157c8a14b8a2133d4fe4",
  "services/pg-api/src/knowledge-access-repository.ts": "801555a6d85cd2d5af5b170f290902d0d53d21649008c5feaa2f83c9129b02d1",
  "services/pg-api/src/knowledge-agent-audit.ts": "d4b5e9d1506c5f5bef14d5cfccb5ff2e28744c082940c40133b34eb673d3935e",
  "services/pg-api/src/knowledge-agent-execution.ts": "c2ef30f0f6808a18085daf9fc8511e130206a4293c36f60b8e1ce81daf0f5238",
  "services/pg-api/src/knowledge-content-privileges.ts": "728af1d91a02ea892bf5b2ff4adf85c068b72d65e81eed90d1025aaa4154c2bf",
  "services/pg-api/src/knowledge-content-repository.ts": "7e664aedb261d54e051e776122983287516284bcb3f552b9af6cef6cf9f96071",
  "services/pg-api/src/knowledge-embedding-consent-contracts.ts": "71fdec727f0fe11c3951774ad6ebcd470f12fcde562e411c95fa8fe4095a75c0",
  "services/pg-api/src/knowledge-embedding-consent-repository.ts": "c37931f555a363c656246a1fff5dc3ba13fbcb97d5dc35bd5e8bbdbd168d49f0",
  "services/pg-api/src/knowledge-embedding-contracts.ts": "ff7464a9af592040376bd9a9db6c79c3457c105fda56b05320cf849f13e43452",
  "services/pg-api/src/knowledge-embedding-policy.ts": "1a1e2cdf99c98cfff20f808b904608614a3ba10f079faf19421c34d6c7ff8db7",
  "services/pg-api/src/knowledge-embedding-privileges.ts": "d0e28e6aff2ecbf0fb4f390d55724bc3dca4a386093d8460d0bf88603f13953d",
  "services/pg-api/src/knowledge-embedding-repository.ts": "4071b6ddb2178fb54f976cecfaf0257a1be48ad258ff211865dd82fdbec4addc",
  "services/pg-api/src/knowledge-evidence.ts": "0b4687c2e5beea455d6833dc7418aa3d66fb230c33debfebcd8b9ee576fefaaa",
  "services/pg-api/src/knowledge-execution-audit.ts": "d364861931b7a45af550f97d88f08936a0cd6c9107e5d609a6c2d2bd3f0ef04c",
  "services/pg-api/src/knowledge-execution-source.ts": "9c6183ebc54f21cd30131e802732334338e157de18f05f9ffea4d514b13155b2",
  "services/pg-api/src/knowledge-index-audit.ts": "e185c52f220bd3677dad2062961d4110d08e37be6461347846418efed77f0401",
  "services/pg-api/src/knowledge-index-contracts.ts": "fc81c367188b1b51fa5c50679a9637e165fc450c571e81a79d4b47ba9ed2b725",
  "services/pg-api/src/knowledge-index-repository.ts": "52e40940e8c15b414b0f5b2f4f0dc59ade00837ff23fd2b997f19d1cdcf5722d",
  "services/pg-api/src/knowledge-keyword-audit.ts": "63b3d93907d07dd1a0ef7172fd552a12255ed1019d26eb8e55bae01dbd6d8ee8",
  "services/pg-api/src/knowledge-keyword-execution.ts": "a667177ae27bf8b52458b7a4f03b443c741e49dc49a0e99b7f214d57324ee9c2",
  "services/pg-api/src/knowledge-lineage-audit.ts": "26c09303d58852684bd969ed8aabdf11863e0c3a9839c2f64f9cf920f47e4e59",
  "services/pg-api/src/knowledge-observation-policy.ts": "d8dc666cbfa9385e85b17aabebf42388532dbcddb275558e51b356215b31e195",
  "services/pg-api/src/knowledge-query-audit.ts": "86c78d2c6d000cd43cf5af88a442b948fb0b1a26544e62b6dfe2be2d8d2dc84e",
  "services/pg-api/src/knowledge-query-contracts.ts": "f5805aa25cd34010693a04cc19b3c78144e45a9f56c009e3770ba13623259cbd",
  "services/pg-api/src/knowledge-query-policy.ts": "f862389d5ef8595d086c441dea8ac0ef0d5ac7fee9461dd50cd74530414d2d95",
  "services/pg-api/src/knowledge-repository.ts": "6420206c2c3c835c78a698d5e0378be701773a01a48264cd1a5958803e925c16",
  "services/pg-api/src/knowledge-retrieval-binding.ts": "9f6a60cb925535ccc1b70f1d0a7ad6d08935a0e89ec339b2e09ab1d7ef25480c",
  "services/pg-api/src/knowledge-retrieval-policy.ts": "5e1b9bba27f153bc2d3516825ca693ad80de4facf9274cef7fff7d93a88e61fa",
  "services/pg-api/src/knowledge-runtime-scope.ts": "cf0b770cef03354194d300d63cac3c39b3fbd275310893b3aafc915aa1184857",
  "services/pg-api/src/knowledge-scope-policy.ts": "01ee93917e6362ded33e50a041ffaf424abc10f2273aef7fb262ed4859958e08",
  "services/pg-api/src/knowledge-sharing-contracts.ts": "15f52d0c2ece8706c2ae3d323b8e99620d5a9d830598ba4397377065e48cd08d",
  "services/pg-api/src/knowledge-sharing-policy.ts": "0b1b21d559035e4e5376213dd71bdc9c3c979f967a0bedb2772bff63b5a0dd8d",
  "services/pg-api/src/knowledge-tool-execution.ts": "a26bdfb79295c6aa02366e33d9cf051b41e2d9ebca384cf22cd8e6ba33a518d5",
  "services/pg-api/src/knowledge-tool-policy.ts": "35bffe8c142c456297acdb8012e3b9f639b3ce92e2ceff2368c817b344ab0751",
  "services/pg-api/src/mcp-binding-resources.ts": "44a797de2f61081fde7e13a2fd59edb8978a59519a3b7081e74cf802cf081701",
  "services/pg-api/src/mcp-binding.ts": "44294108896a8a377fd928de858c99e1ca1cbaebc8c9841b6316a208b377cedd",
  "services/pg-api/src/mcp-call.ts": "061f255d84e41d3a7a071b7198bf3e0306cfdd54cf0b0e934710c7a41d747921",
  "services/pg-api/src/mcp-catalog.ts": "358373e672a45928ca37d9be0c8d1c50a8a928d4df6329ba111386e153ba47e9",
  "services/pg-api/src/mcp-connection-repository.ts": "dd098b36c036d0af43fafc785ac91698779e63da39daf3b36f7e25f20ef70f1b",
  "services/pg-api/src/mcp-discovery.ts": "1a1be30cfa7b570b2d1ae4a2b584b8b17ce04e11348b73ebefd056812f61722a",
  "services/pg-api/src/mcp-network.ts": "fb212b6d786b865f4c215d4a76e712e622c2d0b646fc2893b2df8363628f0f6d",
  "services/pg-api/src/mcp-privileges.ts": "2488d3e1342c996fc4d350c714d35add69eb778c6dec279a28fc5751c1dd9300",
  "services/pg-api/src/mcp-validation.ts": "a66304822fc84700f8137c6713db31394d4195a355cd156039b0fceddce715fe",
  "services/pg-api/src/model-broker-actor.ts": "bfcaa8d76ec028b571f2a16e92be38073f3a0ed0740833d925c4cb7f61058522",
  "services/pg-api/src/model-connection-crypto.ts": "2f00edf8254539997c8f4771cd70227d479c6bb5a42466ec2c5f39ed568af3ec",
  "services/pg-api/src/model-connection-probe.ts": "ff5b6bb27b181cc7054f97b8164598c8ee3b0f07f05bd08f829a99bba1b78ea8",
  "services/pg-api/src/model-connection-repository.ts": "6c781b93d9f723c7034b1455ad1f9a19fbb66cc0e19fc54da7b4b9abf1a6cd22",
  "services/pg-api/src/model-provider.ts": "207a985ba1e611c4fdb8d94eeb949dfc8501f2a27d9a172455140a154ee165bb",
  "services/pg-api/src/native-activation-cli.mjs": "68f7c46a21d904335c3cff6089f21eca786149c86b84e2e0a8ceb918c39dc514",
  "services/pg-api/src/native-auth-repository.mjs": "f488ee7386c3ea27fe746ce90c10c4f786e9a0e8365f01df2778f0f841dd5a98",
  "services/pg-api/src/native-employee-auth.mjs": "96cc6b4978faae6c285335f364b1da89eded8319699ae4599aab98244804dfee",
  "services/pg-api/src/native-employee-governance-audit.mjs": "ff01bd91b44d4c84d2c2a1332a8768e182e70a00bdecb177757839c6818bc238",
  "services/pg-api/src/native-employee-governance.mjs": "2354206bc65c493c188459f76cf5da35d1c182c5e99d1c9187a9fa3692e4ef86",
  "services/pg-api/src/optional-credential-boundary.ts": "f019c3f541223ebb1b699dd1a795e64293ff603f396cd44aceb05e453b80633a",
  "services/pg-api/src/owner-model-dispatch.ts": "b05ca4eea7b490816800bd6bb8c33809ea4f937a9c8b196f7eaf1acc3a9d6f44",
  "services/pg-api/src/pg-runtime-target.ts": "4e47957241fc66c686a49e302d3c6698d781158727855d1b176a42ef2838253e",
  "services/pg-api/src/pg18-ci-schema.mjs": "b9091ac92aeeecc465c4ec2b9038bd8dec1033e734e9cb81fa6de0135da7bff1",
  "services/pg-api/src/pg18-ephemeral-ci-guard.mjs": "71c2205c1564424b856d43ef9b4a3483b1743b7a0a463f6b3b9f7bb3c2c64458",
  "services/pg-api/src/pg18-fresh-runtime-install.ts": "9e38f9278d26b73b5894cf3618a3c17092b7fcca8e7d1b145bcedb4b9d16b0c7",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs": "1d91520d5ec50021b6b1bc30294b608c33dd612547eb0aced8506bc7665e5bb1",
  "services/pg-api/src/pg18-full069-worker-startup-observation.d.mts": "1240a3dc22506ef7fe7170e162bace3a27737d344690d106bc4d3ef188f2cab9",
  "services/pg-api/src/pg18-full069-worker-startup-observation.mjs": "4651d93764b378018a2b81cdccb83eceeabb76772c411a2f085e2d73093d3d06",
  "services/pg-api/src/pg18-native-auth-ci-schema.mjs": "dbb0d9bac04896aab8c31d8e31b4a52a41f7536e760d796b82382a2848841e5c",
  "services/pg-api/src/pg18-service-login-inspector.ts": "7a334a19ddc13d8c4b048a8d0e4d5389cf2d3a08a55932c15fca102bc17a3b81",
  "services/pg-api/src/pg18-service-login-policy.mjs": "7548118f8efdc549a0a0ba90fd85479a911fa65c6c529e4b0a89ef3034e3cfd3",
  "services/pg-api/src/pg18-service-login-secrets.mjs": "5bad81528c8f2e9bc68035d5679f145d792cbfe77bf2f901c4ddcb1ae16e3ccb",
  "services/pg-api/src/public-result-text.ts": "f3bdea90ae09d82a5a8294c6f8fa45b5a0f215577b6507dab66df9067980c086",
  "services/pg-api/src/run-step-metadata.ts": "5569c3af59ac8a59075c9ff473b5406039c9f06de16f818f3ef2eeceedbc1859",
  "services/pg-api/src/schedule-draft-repository.ts": "e04c3d708902640e299695c9ba59b06b38828adeb41eed12edbe05f3612e410d",
  "services/pg-api/src/schedule-effect-policy.ts": "156dcd7f4507a766d1e32371e20e260d5a47552f1234868088361871bbe4500e",
  "services/pg-api/src/schedule-inventory-repository.ts": "fb9f7696bf8338e541b5c38cf9bdd13a1a1703ccabd6645277c3ebec01581939",
  "services/pg-api/src/schedule-runtime-audit.ts": "e4ac261c38d2b173f5c5844e742dd00f02b1c9f4d6c39449ed28adcb4ec58b6f",
  "services/pg-api/src/schedule-runtime-contract.ts": "bd0cd01ae41a62c2269c4535de60ded36f1614cdd9bd7e445f3768fec17207b4",
  "services/pg-api/src/schedule-runtime-repository.ts": "5957d1dc726925b8e8868c5b1f081e80db482d62e0916ee7c9109b9f027b2466",
  "services/pg-api/src/smithery-contracts.ts": "c339ff6fe08edc589347825643867a2b6d21d567235b884c1e6f1616a88b79ef",
  "services/pg-api/src/smithery-network.ts": "2e1989d9b0b5d74458791168784691173afbf0d3ae141d6302caf148b62e9d8d",
  "services/pg-api/src/smithery-repository.ts": "e091ad51dc41bfcb383a81a356c3886e61f01402ee1782f3f73fd129993a5a5e",
  "services/pg-api/src/tool-connection-repository.ts": "f1684c27ec55b03fd28eae6dab5f0e46b58e5974a1a5cb985564e63472859c83",
  "services/pg-api/src/worker-claim-admission.ts": "e0555bc90cc48da6b0236333b43650509cd8463e8bfdc6f5d468786991efdb5c",
  "services/pg-api/src/workflow-safe-plan.ts": "82b160d840338a04e5a731d48bf5e5c242efd79ece7bb6a397ac8f882c221948",
  "services/pg-api/src/workflow-safe-run-repository.ts": "d245ee24b663ed37f25b10fc2e7ad8bc83d92fb1a1b0336bfba6748dc39bbb1e",
  "services/pg-api/src/workflow-sample-lineage.ts": "42afc452047d93904d3c509174866a30d20f64cf7d209b6d2b86475469b731d3",
  "services/pg-api/src/workflow-sample-provenance.ts": "65a021919bad5fece2618fe242f98ecb82cd3cdcebc09a0f2b83f5b20669d2f7",
  "services/pg-api/src/workflow-v2-effect-failure.ts": "eebda0cad929328ede2132630a692ae92b7f9237d5e04f46f9e4cda83fe6262b",
  "services/pg-api/src/workflow-v2-model-client.ts": "e9a3ccad490657cec310bcab60b88af21cf22c62c22888c8586f75750fcab5fe",
  "services/pg-api/src/workflow-v2-model-contract.ts": "c2546943f89677cbf5263b7a3d314f9230de4de5953c1f61ee02f499bd63f5ca",
  "services/pg-api/src/workflow-v2-model-handler.ts": "74aba0319ca477ab19e8c185e85e385807522aec579d769c84fae5f12a09177c",
  "services/pg-api/src/workflow-v2-node-debug.ts": "bcec7baa1756afbb3b8d660d26df0cb7741d37918b095c37419ace31a481767e",
  "services/pg-api/src/workflow-v2-output-contract.ts": "eda56a03d46d4e2590ed691404d1dc310ba612ebd2ede95afaa62ceb8a75b85f",
  "services/pg-api/src/workflow-v2-output-projection.ts": "9a4f2ad3e96fe59286cd0632df28c0c8ed75bb0e1fe58ab2fa8f5f5c737f826d",
  "services/pg-api/src/workflow-v2-preview.ts": "c4e5945193223f865b3e29e0efc1bf14f925f25e8d0a209e18a95ea67ffd4640",
  "services/pg-api/src/workflow-v2-tool-contract.ts": "798b0f5bfad21366e81339f2b037bf3911d9ebf2fd243699eae0126cfa774e14",
  "services/pg-api/src/workflow-v2-tool-handler.ts": "f02afae91b5d789efb047d718e6aebf26eb7f50b3fdbfea4fd8d1f160835cd30",
  "services/pg-api/src/workflow-v2-tool-network.ts": "b58cc5eabbfdcf218b686eacd02a137f3d886672adb546f3ab71e506bbbf7dfd",
  "services/pg-api/src/workflow-v2-values.ts": "083de63a32d344177999ea5ce2b2ada40f39929f4a46034055ccc5f8fa36b4c7",
  "services/pg-api/src/workflow-validation-repository.ts": "c7f48166776f25e805913e33dcfe09d36131b70a281c008105a0ce500759f2b1",
  "services/pg-api/tests/agent-design-genuine-pg18.test.mjs": "af34b44c0780e77254c91baab89f061b93ee765af65b453cb44a25f0495dc158",
  "services/pg-api/tests/helpers/agent-assessment-fixture.mjs": "41f747c751a181ef02ddc2060bd86cc15e744420cc7c9688bfa6fb3b8e80266a",
  "services/pg-api/tests/helpers/agent-collaboration-fixture.mjs": "14faf6d33ec1309b5c364f3b8cb29f7119dda8c29eddb7241bf4cb3d8db1d039",
  "services/pg-api/tests/helpers/agent-memory-fixture.mjs": "ae4e0feef5b1884480ace9db69ab6266b4654b27be2f6e4b4d16bf5aaa1bc6a5",
  "services/pg-api/tests/helpers/agent-review-ledger-fixture.mjs": "bb0506a0f2aef11f4033ee7ea919102e06930d5fee2b3af037e236f04cf0f688",
  "services/pg-api/tests/helpers/bound-model-loopback-tls.mjs": "d3932a15340329b3e3550b2a58f25ac0f7c045aedc85d01a8b560d1931ce6b4c",
  "services/pg-api/tests/helpers/native-pg18-embedded.mjs": "6d29c92a24cbc4815f869d1b11fd9c3872873ceb61b1e0002e16a42b1a3a29a5",
  "services/pg-api/tests/helpers/pg18-preparation-fixture.mjs": "e88c16646c873271b8cc97812c7bd4e47ca063dde03487c82bc8d51633c8dd9f",
  "services/pg-api/tests/helpers/workflow-v2-agent-fixture.mjs": "2896442d9e7a9ac0c7e01cac13952c30693abda3ba80ab37b51703032d3872b0",
  "shared/agent-role-limits.mjs": "3f5898746f06114e7cb9de53b75e7412d750b6fe626476e91d2dc9c02d69e759",
  "shared/schedule-time.mjs": "05583e81e563ffd454630fb3453039a7f54f838c2f1d6941d41481adf75b762f",
  "db/postgres/003_finish_job.sql": "b10ebd832b5cfff727a0444814b91561e650f40c85e91f3be46a1115f358c738",
  "db/postgres/004_retry_job.sql": "5eab2265fd8f705b0745c2f8a2be0f64efca49b5fcd08ced834617035eec8337",
  "db/postgres/005_claim_agent_prepare.sql": "15e5989f7e60580639e3b70016fb032a63cc2e19a501272e4f3ddad296831064",
  "db/postgres/006_claim_agent_model.sql": "0b464605aa968c2d9f558b68b342eb409c809013dbd4d178c9f0ca9cdec6a449",
  "db/postgres/007_claim_workflow_safe.sql": "e7dc2335d97f8235e54b4a7a5c1ac03bc156577e2e7a2bdd2e0273f33af8bafa",
  "db/postgres/008_claim_workflow_v2.sql": "fa1f62bdda742c281d74ac50b01db1697402dda710c417437553828bf14c5ef1",
  "db/postgres/009_claim_autonomous_agent.sql": "b4188f7965c8329ea30e52eb420b799735616825887412796a402616072c4ab1",
  "services/pg-api/tests/native-control-ci-source-pins.test.mjs": "34d4f2cd3fba7da9ee2e41c5df0c69ff54d587e4f0d5cddce0294995faae76f2",
  "services/pg-api/src/agent-descriptive-patch-runtime-policy.ts": "ae0b0a64261b6f9b74f3bf3922c632ac156b6a4b47d605601118831152ee3761",
  "services/pg-api/src/agent-feedback-runtime-policy.ts": "368ba55e8f54a6a636eb80ece600aabc052a6ba4c2337d9f97965027b5fc1c0c",
  "services/pg-api/src/agent-generated-runtime-policy.ts": "4505dfeb0363f65fc55179505f7e6088696667f79e78ee9ca85dd1b74806a75a",
  "services/pg-api/src/agent-optimization-runtime-policy.ts": "244c25f809124fab36646e1dba89051eba18f4e8d036615b581c9bca672cfd47",
  "services/pg-api/src/agent-review-runtime-policy.ts": "4f04d4eb15b006083393fcc26f747fc9dfd08030b8dbb894262e87033e1349b0",
  "services/pg-api/src/knowledge-index-policy.ts": "7dd11105d72a658c5c39a7274789a1b918fc81389efc62975d311a2e99e9c55f",
  "services/pg-api/src/model-draft-discovery-provider.ts": "04a46069c9dbb7c67466b2ac3a0514871ac4ab8361fc8d8f8f85f0014f599b52",
  "services/pg-api/src/model-draft-probe-http.ts": "5e9693d8232547f10abcf4ee67f4507d464eea9d08781416a5c60cdb968a764d",
  "services/pg-api/src/model-draft-probe-repository.ts": "c15f96f72a7c61b80e17b59c4c711d90c28461b86deddfd1abb69307ef7dc5c3",
  "services/pg-api/src/pg18-full069-assessment-startup-observation.d.mts": "6143fe0961e7709e28fc8bc24dfefb471fc9de38cedf1b0b05cdd06275141f54",
  "services/pg-api/src/pg18-full069-assessment-startup-observation.mjs": "0fee6d247837db4ff7515c0271dd5e4d9907244fd7ae6a757b2449cb1e516154",
  "services/pg-api/src/pg18-full069-native-reader-failure-observation.mjs": "6f46b8dd1d5e44544e0d21deb2eae3d37eb79ebee7404e0f146842240fa4c2e8",
  "services/pg-api/src/schedule-runtime-policy.ts": "67640e87b94f18df20bb791c79c775f50849b53bae6eda374fb913f3375262b7",
  "services/pg-api/src/worker-heartbeat-activation-control-contract.ts": "3d1a9b65a50cba9f3538256203dab134ccff3d1166a9017d7f6e4fa916d55662",
  "services/pg-api/src/worker-heartbeat-contract.ts": "336cebafc1c1b54542fc6828093cb0e87d333950bb3ace1ef318ad75f2d10eba",
  "services/pg-api/src/worker-heartbeat-report-sequence.ts": "2930d9892a52acc4a61d3fe0f593f4c8396c290d03cab6352aa9bb31843737cb",
  "services/pg-api/src/worker-heartbeat-writer-protocol.ts": "d1d6b5b1e2b4dc0ca6d23223ffdf88ef8e0cf8e27f581266e273cb62ac31a844",
  "services/pg-api/tests/pg18-full069-closed-diagnostics.test.mjs": "cb83a5a2ac0c9128db091cc57c7cf12ede65d1b108cbfc9ea6235a86fce2540d",
  "shared/model-draft-probe-contract.ts": "5eb09609995587713cbbf9b3ec8614932723387c97697f6b9802ea93761a8aa6",
  "tests/model-draft-discovery-provider-pure.test.mjs": "ed7514ec1893c550ba4e5cfb4048d59a27f7c8f96fd5bba31316a935d8a9dea7",
  "tests/model-draft-probe-http-pure.test.mjs": "59b886a9324829611002bc07bb165984cd12360fa00d01a152a2b424a9d1a911",
  "tests/model-draft-probe-repository-pure.test.mjs": "dcfec30cd26387c1e183e1b093695071e43738c6746570a3d952143fe5c75a4e",
  "services/pg-api/src/agent-internal-share-observation.d.mts": "e3ac806b352ae559c4676ea5863557d140dd197b8641da889e2345ff850d7cc0",
  "services/pg-api/src/agent-internal-share-observation.mjs": "0b88b7d6ace039868fb85aaca7b4400a33133ab17c91d9701bee3db999c938af",
  "services/pg-api/src/model-connection-page-cursor.ts": "42350485eb767064df95b7506ec3c94fa6e0c0160c88fad032f437807f0aa02c",
  "services/pg-api/src/model-connection-pagination.ts": "224df07f1eab5f5d36d7a60f69150c4a2f3dbab328f07182a23fe6e4cc6d82dd",
  "shared/model-connection-pagination-contract.ts": "e86576c1cc6edb0d25b302ff82bf913411bccbb2f5c4ce3a53945db95d461dad",
  "tests/helpers/model-pagination-terminal-data.mjs": "4f1e4afe430b3b159cc30edff000fade344861d9c87de6ba74853a2630f18551",
  "tests/model-connection-pagination-server-pure.test.mjs": "6c8a489e82840f6c60bd26fe4a63bbf5365a789223bd3e1377b8cb0c4a036873",
  "tests/model-pagination-http-pure.test.mjs": "40df49567cc2b84bf6800d526ff67b513ce41b8b5f0cc5a7a96403f7b10ee68b",
  "tests/pg-original-internal-share-native-boundaries.test.mjs": "9f0772614db19504c8206eaa297cd03a6756e604a1978641332412b65ced6601",
  "services/pg-api/src/agent-template-market-result.ts": "d9d420f346dc5cc8915e77b3ce3593e2b6fdecec9988ffcbe55949f6cedb0953",
  "services/pg-api/src/worker-heartbeat-activated-audit-core.ts": "ba670a1722b241781f6cd28b85bbd571ff1919bac47e5f1ebca090ddfcff28b5",
  "services/pg-api/src/worker-heartbeat-activated-audit.ts": "977bc53eeee5aec9f4fcb7e663b11e121583618246df6615ed8b0554eedba1ee",
  "services/pg-api/src/worker-heartbeat-activation-control-runtime.mjs": "89ac707c17598be2e603317ce24a3b1024b57142c0382069851bf8158f9957a5",
  "services/pg-api/src/worker-heartbeat-activation-control-source.mjs": "67f95bf9da6285d20837471b73cd16d9c00e65ae7ad842f3b579468542449722",
  "services/pg-api/src/worker-heartbeat-activation-registry.ts": "8d395a75f00f954b1db3127e9383ebed1fd0c235a9cf377234a43ba2a1d9c93f",
  "services/pg-api/src/worker-heartbeat-audit-core.ts": "1f90a04ff358f9922020f6070a931c4f1aa621b945b4de927454b0fb5607b33e",
  "services/pg-api/src/worker-heartbeat-bounded-reporter.ts": "05d83cb9fc858dde2eee5ccc2c8301db3ee0e7a0482fd5bb6380d0b7cbe1a280",
  "services/pg-api/src/worker-heartbeat-management-audit-core.ts": "0d30a81558b3c2102d83f103e7d96ebd8664d37970505b6c2a131cede82e9bde",
  "services/pg-api/src/worker-heartbeat-management-audit.ts": "fb13ad9bb6a1d93215f6b975c21d1806d9707d3be77ba644790eea8934325744",
  "services/pg-api/src/worker-heartbeat-worker-binding.ts": "492a76e2f7ffa8b5646b48b8a330e0f020683de33d6a72116dac885d760a9a87",
  "services/pg-api/src/worker-heartbeat-writer-broker.ts": "64c9ec1cfd32c6f4afbaed044ef1b7c181805de0fc438613f8f5ae4a0e543988",
  "services/pg-api/src/worker-heartbeat-writer-credentials.ts": "9abf06d1bc8d6c0009de6ee3550d2b91f05b65df46842ed5492b576e38452328",
  "services/pg-api/tests/helpers/agent-internal-share-request-lifecycle.mjs": "be67b458132199229ddc62441394d68837e82f009c9e2f9abf7b6a5b5cc5b2b0",
  "services/pg-api/tests/worker-heartbeat-bind-admission.test.mjs": "59bba94debaf627efc8b2775b5bd70fd69e0fe33ad5ef5dbca5b45d1a01273d3",
  "shared/agent-internal-share-contract.ts": "1f29bece171b7ae575d6ee8e6b4cfdfb9e7dc411ab7568c9b463df3ad79215ee",
  "src/lib/originalInternalTemplates.ts": "7731726014afeba205a8f38d281bedf0ee4b5efbc9d85d437c5dfafea7217b35",
  "src/lib/pgNativeInternalShare.ts": "fbf2849bc1826c4d50fefad724b7b25bc863f4f3fb110d202bad5da63b4c4cf6",
  "src/lib/pgNativeInternalShareSession.ts": "aa8e3f5ed96003c21863e2ae3514db676ab4e665aa7f8b05aad6c6f8e35955cf",
  "src/lib/pgNativeTemplateMarket.ts": "0fa32da7d9537868b702010b5d3bf15b26d517425105105c16e29d9fe8e0dfd4",
  "tests/f08-request-lifecycle-race-pure.test.mjs": "35ae922aaa17acb7b11c7b89a88116892998ed31107825da7be93188a55dd1d0"
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
