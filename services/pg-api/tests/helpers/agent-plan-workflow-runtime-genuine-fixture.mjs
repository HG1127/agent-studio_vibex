// Real guarded PG18/Native HTTPS/Worker->Broker mTLS/model TLS fixture.
// The model endpoint is synthetic; no real provider or employee data is used.
// No DB/file/socket work occurs before the actual dedicated-purpose guard.
import {requireAgentPlanWorkflowGenuineCi,agentPlanWorkflowGenuineRuntimeJob,agentPlanWorkflowGenuineBrowserJob} from './agent-plan-workflow-genuine-guard.mjs'
export const agentPlanWorkflowRuntimeFrozenSources=Object.freeze({
  "services/pg-api/src/agent-plan-workflow-provider.ts": "610e7ee30e8ba2848094602e6e6ffbe2dadcb701a95ec119a8b222dea9c5323c",
  "services/pg-api/src/agent-plan-workflow-broker.ts": "300941ba28ad4967f41e37affbff2990cf15cd173369ec55a80afd7e35436c22",
  "services/pg-api/src/agent-plan-workflow-worker.ts": "ac291508277075095956d4449f8d2bfe424a7a3cd2a43f80fa8f308dca3de782",
  "services/pg-api/src/agent-plan-workflow-http.ts": "6ac88862f167d5855bb43d3ce904970b9a5e67969c6be6818bf2f3068546c7c4",
  "services/pg-api/src/agent-plan-workflow-client.ts": "5575cf2def09f53d75424f3250920a426bfa00aa8f5fe6335fc4aa8077df1e73",
  "services/pg-api/src/agent-plan-workflow-composition.ts": "e786b50d08821c958800d904f06cc9b25563e6d84136529d190f81392cf72146",
  "services/pg-api/src/agent-plan-workflow-service.ts": "4ef3076ee7fd20df225bd7e62542b25bdefa660f67f20655cf0f75d19de28bd6",
  "services/pg-api/src/agent-plan-workflow-service-config.ts": "5cac3bfad64bb5a2aa3705d830386c190aa47e9b68b1fbb25cfd702cdebd85db",
  "services/pg-api/src/native-auth-http.mjs": "3e849c29ef1df06ca00437708cf32d35b5f34313792e59db40996d5e32b2cd63",
  "services/pg-api/src/native-server.ts": "36bcfda573b72890b8fb1329de08884d0e85b4cc062a1d34a5f766e5c79704ba",
  "services/pg-api/src/server.ts": "60a141847ed0838190d229ba6740f67d7efd46f808c9e4e3cda00bb05bf286b7",
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
  "services/pg-api/src/native-config-uat-policy.ts": "2225e0bc8dcc19c21c6abd0a8eba824253855b13513397da1403d898ae7a2b17",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "8fe2a1f9c53d13b0331d24a03323833d5f8f5d0740695d57b6890b73cad1fa75",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "d5cc238eb52cf9e4e3e5d123897d41961b62ea7c1f02144c2f277ab3cef1aa9e",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "c314265af0f2c56f77f7d81112f89d0015f12b20dfad6b1b86f8758b5c315ab9",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "ec4620de0cbebcf7f9285c642f744c7e47ffbc4800169aa057f86acf696ce443",
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
  "services/pg-api/src/own-operations-repository.ts": "e685eb185d1d92596d93decd213aacaa7bcdaf12504dce4c5bb3ccaaa5afb075",
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
  "services/pg-api/src/pg18-full069-worker-live-child.mjs": "2ecb440a9ddfc8a539223a4d3469cf9d0862a033ccf7b717970a178efa5c605f",
  "services/pg-api/src/pg18-full069-worker-live-cli.mjs": "7b87c06eb64f117a0929d33d0e9c85be56f0c975862f31b2fac644b22464b898",
  "services/pg-api/src/pg18-full069-worker-live-contract.mjs": "8c286bae8658055ae38a3413e6db6dcbf93bb745e9868abe8cafa02aebe77e4e",
  "services/pg-api/src/pg18-full069-worker-live-native.mjs": "1f26da8d25c0821680a3fca668d6fd8634dc70822a57ac2d84b510a34d2ee966",
  "services/pg-api/src/pg18-full069-worker-live-processes.mjs": "c5850edf472c1efcc632feb93e12e2f0ef90dd5d4402b4d83c234136b3e2bb36",
  "services/pg-api/src/pg18-full069-worker-live-runner.mjs": "ace7a40aa381653bd0194831173e2ba20a575d747559b5618c7705d128bed632",
  "services/pg-api/src/pg18-full069-worker-live-runtime.mjs": "d821eb1f6eef98e0eba0c50115ab6759a4562d9dd26e0853c9f2cb9be898f91b",
  "services/pg-api/src/pg18-full069-worker-live-sources.mjs": "777e552f04da25376d0f085ba20471cabd277060025d437d05eda19c35152373",
  "services/pg-api/src/pg18-full069-worker-live-trust.mjs": "2ae2876e04739bc17a611572f49f0efc37c6cbfcb27cf1cb3b7ecec10332bddc",
  "services/pg-api/src/pg18-complete-executor-cli.mjs": "31486fca2a869b38255a15f1790c983f54a8cd877bdd824516676a66f6d451bd",
  "services/pg-api/src/pg18-complete-executor-core.mjs": "2d772585f25504be49e23000a77d1de0ef4e8f7523b83135c514d889f1ef6423",
  "services/pg-api/src/pg18-complete-executor-journal.mjs": "ef6039d1710ba7eddc067a762917985520ceacd490045cd7f4bc31de556f5775",
  "services/pg-api/src/pg18-complete-executor-plan.mjs": "79f9ecf9e529f06baf00698ea7bdd283f1af55b818538d06c676ab09492417bb"
})
export async function agentPlanWorkflowRuntimeGenuineFixture(env=process.env,{browserMode=false}={}){
  requireAgentPlanWorkflowGenuineCi(env)
  if(env.GITHUB_JOB!==(browserMode?agentPlanWorkflowGenuineBrowserJob:agentPlanWorkflowGenuineRuntimeJob))throw Error('F05_exact_runtime_browser_job_required')
  const [a,fs,path,url,crypto,https,baseModule,tlsModule,nativeModule,cookieModule,httpModule,ledgerModule,brokerModule,workerModule,clientModule,policy,contract,result,toolsModule,kbModule,workflowModule,peerModule,contracts,composition]=await Promise.all([
    import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:https'),import('./agent-plan-workflow-genuine-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),
    import('../../src/native-auth-http.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/http.ts'),import('../../src/agent-plan-workflow-ledger.ts'),import('../../src/agent-plan-workflow-broker.ts'),import('../../src/agent-plan-workflow-worker.ts'),
    import('../../src/agent-plan-workflow-client.ts'),import('../../src/agent-plan-workflow-runtime-policy.ts'),import('../../src/agent-plan-workflow-contract.ts'),import('../../src/agent-plan-workflow-result.ts'),import('../../src/tool-connection-repository.ts'),
    import('../../src/knowledge-repository.ts'),import('../../src/workflow-repository.ts'),import('../../src/bound-worker-mtls.ts'),import('../../src/contracts.ts'),import('../../src/agent-plan-workflow-composition.ts')])
  const assert=a.default,root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),hash=value=>crypto.createHash('sha256').update(contract.canonicalAgentPlanWorkflowValue(value),'utf8').digest('hex')
  assert.ok(Object.keys(agentPlanWorkflowRuntimeFrozenSources).length>=9,'Root must review actual product composition, runtime and metadata sources before any database connection')
  for(const [rel,expected]of Object.entries(agentPlanWorkflowRuntimeFrozenSources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex'),expected,'reviewed F05 runtime source changed')
  assert.equal(policy.selectAgentPlanWorkflowServiceOptIn(env),true)
  let f,broker,brokerRuntime,workerRuntime,worker,privateClient,nativeServer,nativeHandler,nativeOrigin,allowedOrigin,serverTls,modelTls,lifetime,closed=false
  let reviewedClientFingerprint256
  let readyResolve,readyReject,finishResolve
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{finishResolve=resolve}),cookies=new Map(),ticks=new Set(),dispatches=new Set(),gates=new Set()
  const providerEvents=[],proofs=[],credentialEvents=[],businessEvents=[]
  const mutable={available:true,submissions:true,saves:true,dropNext:null,afterBusiness:null,providerMode:'success',providerGate:null}
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  const bounded=async(promise,ms=20000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('F05_actual_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const output=()=>({protocol:'agent_plan_workflow_model_output_v1',name:'F05 Synthetic Model Workflow',graph:{version:2,description:'A bounded graph returned by the actual synthetic TLS model endpoint',nodes:[
    {id:'start',type:'start',position:{x:0,y:80},data:{title:'开始'}},{id:'analysis',type:'model',position:{x:250,y:80},data:{title:'分析',prompt:'模型设计的分析 {{input}}'}},
    {id:'end',type:'end',position:{x:500,y:80},data:{title:'结束',output_template:'{{分析.output}}'}}],edges:[{id:'begin',source:'start',target:'analysis'},{id:'finish',source:'analysis',target:'end'}]}})
  const request=async(who,pathName,body,options={})=>{
    const selected=new URL(pathName,nativeOrigin),method=options.method??(body===undefined?'GET':'POST'),bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
    return bounded(new Promise((resolve,reject)=>{
      const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,...(cookies.has(who)?{Cookie:cookies.get(who)}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length),'X-AgentStudio-Request':'1'}:{}),...options.headers}},res=>{
        const chunks=[];let size=0;res.on('data',piece=>{size+=piece.length;if(size>524288){res.destroy();reject(Error('F05_actual_reply_too_large'));return}chunks.push(Buffer.from(piece))});res.once('error',reject);res.once('aborted',()=>reject(Error('F05_actual_reply_aborted')))
        res.once('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null})}catch(error){reject(error)}})
      });req.once('error',reject);if(bytes)req.end(bytes);else req.end()
    }))
  }
  const login=async who=>{
    const reply=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(reply.status,200);const values=reply.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(v=>v.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie
  }
  const close=async()=>{
    if(closed)return;closed=true;for(const release of gates)release();gates.clear();workerRuntime?.close();brokerRuntime?.close()
    const failures=[]
    try{await bounded(Promise.allSettled([...ticks,...dispatches]))}catch(e){failures.push(e)}
    if(nativeServer){nativeServer.closeAllConnections();try{await bounded(new Promise(resolve=>nativeServer.close(resolve)))}catch(e){failures.push(e)}}
    finishResolve();try{await bounded(lifetime??Promise.resolve())}catch(e){failures.push(e)}
    try{await f?.close()}catch(e){failures.push(e)}cookies.clear()
    if(failures.length)throw new AggregateError(failures,'F05_actual_runtime_cleanup_failed')
  }
  try{
    f=await baseModule.agentPlanWorkflowGenuineFixture(env)
    const activation={executionEnabled:true,executionApproval:policy.agentPlanWorkflowExecutionApproval,audit:f.audit},generationModels={}
    for(const who of ['alice','bob']){
      const created=await f.models.create(f.identities[who],{name:'F05 Generation Model '+who,provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-'+who+'-F05-generation-key',models:['synthetic-generation'],enabled:true})
      const model=await f.models.testConnection(f.identities[who],created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''}));generationModels[who]={model,binding:{connection_id:model.id,connection_revision:model.revision,model_id:'synthetic-generation'}}
    }
    const secretPool={async connect(){const db=await f.secretPool.connect();return {async query(sql,args){
      if(sql.startsWith('SELECT owner_user_id,revision,provider,base_url,enabled,status,models,api_key_ciphertext')){
        const proof=proofs.at(-1);assert.ok(proof);await f.mustClient(db,'agentstudio_model_broker')
        const count=await f.admin(async client=>(await client.query('SELECT count(*)::integer AS n FROM agentstudio.agent_plan_workflow_reservations WHERE owner_user_id=$1 AND request_id=$2',[args[1],proof.request_id])).rows[0].n)
        assert.equal(count,1,'one real committed reservation must precede original credential SELECT');credentialEvents.push({request_id:proof.request_id,owner_user_id:args[1]})
      }
      return db.query(sql,args)
    },release:()=>db.release()}}}
    const providerRequest=(options,callback)=>{
      assert.equal(options.hostname,'api.openai.com');assert.equal(options.port,443);assert.equal(options.method,'POST');assert.equal(options.path,'/v1/chat/completions');assert.equal(options.rejectUnauthorized,true);assert.ok(modelTls)
      return https.request({...options,hostname:'127.0.0.1',port:Number(new URL(modelTls.origin).port),servername:'localhost',lookup:undefined,ca:modelTls.ca,cert:modelTls.cert,key:modelTls.key,agent:false},callback)
    }
    const dispatch=async proof=>{
      assert.ok(broker);proofs.push(proof);const work=broker.dispatch(proof);dispatches.add(work);void work.finally(()=>dispatches.delete(work)).catch(()=>{});return work
    }
    const providerFactory=options=>async(req,res)=>{
      try{
        peerModule.verifyBoundWorkerMutualTlsPeer(req.socket,options.reviewedClientFingerprint256)
        assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers['content-type'],'application/json')
        const known=['alice','bob'].some(who=>req.headers.authorization==='Bearer synthetic-'+who+'-F05-generation-key');assert.equal(known,true,'model request must use the real selected synthetic credential')
        let size=0;const chunks=[];for await(const piece of req){size+=piece.length;assert.ok(size<=524288);chunks.push(Buffer.from(piece))}
        const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert.equal(value.model,'synthetic-generation');assert.ok([4096,8192,16384].includes(value.max_completion_tokens));assert.equal(value.response_format?.type,'json_object');assert.equal(value.messages?.length,2);assert.equal(value.messages[0].role,'system');assert.equal(value.messages[1].role,'user')
        providerEvents.push({messages_sha256:hash({protocol:'agent_plan_workflow_messages_v1',messages:value.messages}),cap:value.max_completion_tokens,request_id:proofs.at(-1)?.request_id})
        if(mutable.providerGate)await mutable.providerGate
        if(mutable.providerMode==='disconnect'){req.socket.destroy();return}
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:mutable.providerMode==='bad-json'?'not a graph':JSON.stringify(output())}}]}))
      }catch{res.destroy()}
    }
    lifetime=tlsModule.withDisposableBoundModelTls(dispatch,async privateTls=>{
      return tlsModule.withDisposableBoundModelTls(async()=>{throw Error('F05_model_endpoint_is_not_dispatch')},async providerTls=>{
        modelTls=providerTls;serverTls=providerTls.serverTls;assert.ok(serverTls)
        brokerRuntime=await composition.createAgentPlanWorkflowBrokerRuntime({...activation,businessPool:f.pool,dispatchPool:f.privatePools.dispatch,secretPool,key:f.key,reviewedClientFingerprint256,resolver:{resolve4:async host=>{assert.equal(host,'api.openai.com');return ['93.184.216.34']},resolve6:async()=>[]},request:providerRequest})
        broker=brokerRuntime.broker
        const actualDispatch=broker.dispatch.bind(broker);broker.dispatch=proof=>{proofs.push(proof);const work=actualDispatch(proof);dispatches.add(work);void work.finally(()=>dispatches.delete(work)).catch(()=>{});return work}
        workerRuntime=await composition.createAgentPlanWorkflowWorkerRuntime({...activation,workerPool:f.privatePools.worker,workerId:crypto.randomUUID(),reviewedOrigin:privateTls.origin,reviewedServerFingerprint256:privateTls.reviewedServerFingerprint256,ca:privateTls.ca,cert:privateTls.cert,key:privateTls.key})
        worker=workerRuntime.worker;privateClient=workerRuntime.client
        nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return}void nativeHandler(req,res).catch(()=>res.destroy())})
        await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)});nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
        const caps=policy.selectNativeAgentPlanWorkflowCapabilities(env,true,allowedOrigin,true);assert.equal(caps.available,true);assert.equal(caps.submissions,true);assert.equal(caps.saves,true)
        let selectedFlags,prepared,native,generic,family
        nativeHandler=async(req,res)=>{
          const flags=JSON.stringify([mutable.available,mutable.submissions,mutable.saves])
          if(flags!==selectedFlags){
            const selectedEnv=mutable.available?{...env,AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_AVAILABLE:'true',AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_APPROVED:policy.agentPlanWorkflowNativeApproval,...(mutable.submissions?{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED:'true'}:{}),...(mutable.saves?{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SAVES_ENABLED:'true'}:{})}:{}
            if(!mutable.submissions)delete selectedEnv.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED
            if(!mutable.saves)delete selectedEnv.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SAVES_ENABLED
            prepared=await composition.prepareAgentPlanWorkflowNative({pool:f.pool,env:selectedEnv,listen:true,allowedOrigin,configurationWrites:true})
            native=nativeModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,...prepared.metadataOptions,businessHandler:async(incoming,outgoing)=>{if(family&&await family(incoming,outgoing))return;return generic(incoming,outgoing)}})
            family=prepared.createHandler(native.authenticateRequest)
            generic=httpModule.createHandler({repository:f.agents,modelConnectionRepository:f.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(f.pool,f.key),workflowRepository:new workflowModule.WorkflowRepository(f.pool),knowledgeRepository:new kbModule.KnowledgeBaseRepository(f.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F05_actual_Native_cookie_only')}})
            selectedFlags=flags
          }
          const drop=mutable.dropNext
          if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const end=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this}return end.apply(this,args)}}
          // Observes a real completed response. It cannot manufacture business
          // success or bypass the product's post-await Native identity check.
          const after=mutable.afterBusiness
          if(after){const end=res.end;res.end=function(...args){if(this.statusCode===200){void Promise.resolve().then(()=>after({operation:req.url})).then(()=>end.apply(this,args),()=>this.destroy());return this}return end.apply(this,args)}}
          businessEvents.push({operation:req.url})
          return native.handler(req,res)
        }
        await login('alice');await login('bob');readyResolve();await finish
      },{handlerFactory:providerFactory,listenPort:0,includeServerTls:true})
    },{handlerFactory:options=>{reviewedClientFingerprint256=options.reviewedClientFingerprint256;return async(req,res)=>{if(!brokerRuntime){res.writeHead(503);res.end();return}return brokerRuntime.handler(req,res)}},listenPort:0}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{});await ready
    const tick=async()=>{const work=worker.tick();ticks.add(work);try{return await work}finally{ticks.delete(work)}}
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const value=await f.auth.verifySession(token);assert.ok(value);return value}
    const governance=async(who,enabled)=>{const listed=await request('alice','/api/native-auth/employees');assert.equal(listed.status,200);const row=listed.body.items.find(r=>r.id===f.users[who]);assert.ok(row);const changed=await request('alice','/api/native-auth/employees/change',{request_id:crypto.randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(changed.status,200);return changed.body}
    const holdProvider=()=>{assert.equal(mutable.providerGate,null);let release;const wait=new Promise(resolve=>{release=()=>{if(mutable.providerGate===wait)mutable.providerGate=null;gates.delete(release);resolve()}});mutable.providerGate=wait;gates.add(release);return release}
    return {...f,nativeOrigin,allowedOrigin,serverTls,generationModels,credentials,request,login,identityFor,governance,tick,holdProvider,worker,mutable,providerEvents,credentialEvents,businessEvents,proofs,output,hash,close,
      evidenceScope:'actual PG18 + original Native Cookie + dedicated minimum-role Worker/Broker + real mTLS + synthetic TLS model response; no real vendor/fee or system-drain claim'}
  }catch(error){await close();throw error}
}
