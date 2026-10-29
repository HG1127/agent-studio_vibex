// Real isolated PG18 + Native Cookie HTTPS. No PGlite, session spoofing,
// table-return mocks, permission callbacks or fabricated positive auditors.
import {requireNativeLocalDeviceGenuineCi} from './native-local-device-genuine-guard.mjs'
// Literal reviewed Git LF sources; purpose guard runs before filesystem access.
export const nativeLocalDeviceGenuineFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_067_native_local_devices.sql": "908beb0a10c726d665968036e7f5fa01373afff61610b9db1356c52f374ef563",
  "local-executor/browser-server.mjs": "b05a401f8e507a8a989ee771173760111397828f1640e847cda0181f32eb7f9d",
  "local-executor/native-connection.mjs": "8c1c4030d9a1ca74a9acf192c1408bda9a2353055671acce8741376eb44cce72",
  "local-executor/native-run.mjs": "846a4947d4db2444f65ba28548f6b5386f639291f245f44e9fe6369b2dd806b9",
  "local-executor/office-table.mjs": "eb83713237a7f47f411c724823e3afea8e5b22e7079d0149477b37eba2052fc5",
  "local-executor/office-worker.mjs": "c2abd9abd34ed917c5d7bbe8edde236273e041d69c71db68cc0fb1f3bb2eb236",
  "local-executor/office.mjs": "7c3abc4f87c497ccc7dbaa84a83458fa0ac0f21e3c224be829799bfbe7110c8f",
  "local-executor/result.mjs": "9bb610ae182dbb903c00a12cefe5bcaf08acc29211c26731c344ff06b8f84e22",
  "local-executor/runtime.mjs": "e9e797cd8b4250a2b9515207761c56b35bbe7993613d6d0937c971f54196bf38",
  "package.json": "f94e851ad24a5f1953346bc8c918bbc6f68efce257e6c3ffa10f9e92b276656f",
  "pnpm-lock.yaml": "1331a2facbfce348d255c96695dcda3d090d8cc307c5c9618a717d61daac81aa",
  "services/pg-api/src/agent-human-input-policy.ts": "ac50ff7cdf68f523db52a404752d16598f2199f551990cf0b78ef67c60f8bc1b",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "00d6626138aff0039864a8c544e34f44109c2164281834fd923b11c39b927d3a",
  "services/pg-api/src/bound-dispatch-server.ts": "71ab49b6d5068d8639b01fda1bf5468932017014e71d150ccfcb27355431cacf",
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/http.ts": "918c7460a34b7603064e9c4c5c0c0f89e0ee9145f5b26c1c2bb5f3eb92576689",
  "services/pg-api/src/model-connection-executor.ts": "8f239d7f9e00d267fe4fb3e6d552d8c3761e445ce4c3d4f70d79fef6621aa1aa",
  "services/pg-api/src/native-auth-http.d.mts": "455046bbc72a9723f8143a4076b7b311d9914bb9fcfe5e61e5f84f944667d31a",
  "services/pg-api/src/native-auth-http.mjs": "3e849c29ef1df06ca00437708cf32d35b5f34313792e59db40996d5e32b2cd63",
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
  "services/pg-api/src/native-server.ts": "36bcfda573b72890b8fb1329de08884d0e85b4cc062a1d34a5f766e5c79704ba",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "8fe2a1f9c53d13b0331d24a03323833d5f8f5d0740695d57b6890b73cad1fa75",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "d5cc238eb52cf9e4e3e5d123897d41961b62ea7c1f02144c2f277ab3cef1aa9e",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "c314265af0f2c56f77f7d81112f89d0015f12b20dfad6b1b86f8758b5c315ab9",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "ec4620de0cbebcf7f9285c642f744c7e47ffbc4800169aa057f86acf696ce443",
  "services/pg-api/src/pg18-complete-profile.ts": "6dfd232a01592c85cc027d0e92de6816000d643a95d338cef070d63b1ff1b8f2",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/workflow-graph-v2.ts": "3d3c0f24fee5173869dc5c407583bc58cd901ec480b374de67030255ded3587a",
  "services/pg-api/src/workflow-v2-agent-machine.ts": "5b30556c6fac26b13e30196c5a78444faf5d726a966298755f50411dab140b26",
  "services/pg-api/src/workflow-v2-agent-resources.ts": "2ee0506dd283b7c1c636fc7d98e4e0fb6c5439fc2a842c84666f310bb8c98188",
  "services/pg-api/src/workflow-v2-dispatch-guard.ts": "7f3b06910262c145767f51c361c92811889a7b80c159a80e35d7d9d182883764",
  "services/pg-api/src/workflow-v2-machine.ts": "e3621b34e5e4b2f590b6cb35e5f75d859cc12b70665d77c7b8733739fd949fb4",
  "services/pg-api/src/workflow-v2-model-dispatch.ts": "0dfafe5447902c5f16eb869910aecb34ed93f21193394e5dabe0ac8d6e658536",
  "services/pg-api/src/workflow-v2-run-repository.ts": "0cd4ba90b942d30aacc5fcd5e4ae0067163b0c8def563c0b34212f4cdcd360cd",
  "services/pg-api/src/workflow-v2-tool-client.ts": "596b491c687d688c6859b28dfcc978387c7d6d7d37d8b603f15fbbdf47f7b1e9",
  "services/pg-api/src/workflow-v2-tool-dispatch.ts": "529cb64942c5f3570da92f25f2d705ec552a2bd1b10439151963244b7abf25ed",
  "services/pg-api/src/workflow-v2-tool-plan.ts": "196b47614e73d5421a6ebe08a29f89372fd07f4a98ff38f5921d7eea9bab012a",
  "services/pg-api/src/workflow-v2-worker-loop.ts": "214bbeaa14d514e60e106fe63358869b257909e056e14f7b400c4c19e8deba66",
  "services/pg-api/src/workflow-v2-worker.ts": "c95ae9e7dc1fa70e146a581f2c1b22b118816f756b63b2140101781f7bdfbc6b",
  "services/pg-api/tests/helpers/native-local-device-genuine-guard.mjs": "59aa2268542b7b854e2e04e1821680bdb226b12308df2b7c3f91ba726a89bac4",
  "shared/native-local-device-contract.d.mts": "bd0789512bb20b9bc4405f4b2ad9c8790e23b0cc0a5b970cbd065953479a55c1",
  "shared/native-local-device-contract.mjs": "1354c302ee2127a613b39f8f4df7d18051757a4b878b162557e59f8af586a928",
  "src/lib/pgNativeAutonomousAgentSession.ts": "b6c29648b7f08cb92c18749ab4f504fdfd33ae84edc67edc3706dad45ada81a5",
  "src/lib/pgNativeLocalDevice.ts": "255d079248f20b54f3c000f23cdb49ef7b99a12589039b218b9c585aa4b0fe31",
  "src/lib/pgNativeOfficeWorkflow.ts": "3f7e42d7dae05e20e7a1a8f14f7ebb8f442f79167f47bd7fa7883fafe3f1ea62",
  "src/lib/pgNativePilotApi.ts": "4552085614b117ebaced46a45769f3c45eacbf9629ad3d5a8a06c1b7acbe6ff7",
  "src/lib/pgNativeStudioNavigation.ts": "15cb618ced257a35bc644de565e67a8955e59b798d476ff580da0a088fccff17",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "2c2599e194292288d3a3bda23432cc8d1bdbbcd237f41e042b39ca64202b2e05",
  "src/pages/PgNativePilot/PgNativeLocalDevicesPanel.tsx": "ab56c6035d92b833fd4b83b454100ef595526e549a66a732b23e3b87292df3e3",
  "src/pages/PgNativePilot/PgNativeOfficeWorkflowPanel.tsx": "957f4eba1efc1497be3e6fd098add7c1cad54fe775c54fc3f0e0d9dcd868c1f1",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "8f06a93bb52dbb29365e9f1ce22cde962d4581c3a74a8ba8277bda13e7cd2ff9",
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
  "services/pg-api/src/native-config-uat-policy.ts": "2225e0bc8dcc19c21c6abd0a8eba824253855b13513397da1403d898ae7a2b17",
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
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "9070393ccd9c4a0e4e2ec234f559327c644b611096b441429ea8278f0a6c2f12",
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
  "services/pg-api/tests/helpers/native-local-device-business-route.mjs": "56ac105b95d4d373d5c931a6faf9c033a120501789e6bd05c18b2f761e8dcc36",
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
export async function nativeLocalDeviceGenuineFixture(env=process.env,{browserMode=false,chainSupport=false}={}){
 const target=requireNativeLocalDeviceGenuineCi(env)
 if(typeof chainSupport!=="boolean")throw Error("native_chain_fixture_option_required")
 const [sourceFs,sourcePath,sourceUrl,sourceCrypto]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
 const sourceRoot=sourcePath.resolve(sourceUrl.fileURLToPath(new URL('../../../../',import.meta.url)))
 for(const [relative,expected] of Object.entries(nativeLocalDeviceGenuineFrozenSources)){
  const actual=sourceCrypto.createHash('sha256').update(sourceFs.readFileSync(sourcePath.join(sourceRoot,relative))).digest('hex')
  if(actual!==expected)throw Error('native_local_reviewed_source_changed:'+relative)
 }
 if(browserMode!==(env.GITHUB_JOB==='pg18-local-device-browser'))throw Error('native_local_genuine_job_mode_required')
 const [{default:assert},crypto,https,pgModule,baseModule,tlsModule,authModule,nativeModule,cookiesModule,repoModule,httpModule,auditModule,contractsModule,genericModule,runModule,toolsModule,businessRouteModule]=await Promise.all([
  import('node:assert/strict'),import('node:crypto'),import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-repository.mjs'),import('../../src/native-auth-http.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/native-local-device-repository.ts'),import('../../src/native-local-device-http.ts'),import('../../src/native-local-device-audit.ts'),import('../../src/contracts.ts'),import('../../src/http.ts'),import('../../src/autonomous-agent-run-repository.ts'),import('../../src/tool-connection-repository.ts'),import('./native-local-device-business-route.mjs')])
 const chainModules=chainSupport?await Promise.all([import('../../src/agent-human-input-repository.ts'),import('../../src/workflow-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/agent-human-input-policy.ts')]):null
 const {randomUUID,createHash}=crypto,extraPools=[],cookies=new Map(),events=[],mutable={writes:true,dropNext:null,beforeAuthenticate:null}
 let base,server,tlsLifetime,finishTls,origin,allowedOrigin,serverTls,handler,closed=false
 const passwordFor=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
 const connect=login=>{const pool=new pgModule.default.Pool({...target,user:login,password:passwordFor(login),max:4,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});extraPools.push(pool);return{connect:()=>pool.connect()}}
 const raw=async(path,{method='GET',body,cookie,headers={},executor=false}={})=>{
  assert.ok(origin&&path.startsWith('/'));const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
  return new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port:Number(new URL(origin).port),servername:'localhost',path,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',...(executor?{}:{Origin:allowedOrigin}),...(method!=='GET'?{'Content-Type':'application/json',...(executor?{}:{'X-AgentStudio-Request':'1'})}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},response=>{
   const chunks=[];let n=0;response.on('data',piece=>{n+=piece.length;if(n>1600000){response.destroy(Error('native_local_genuine_response_bound'));return}chunks.push(Buffer.from(piece))});response.once('error',reject);response.once('aborted',()=>reject(Error('native_local_actual_ack_lost')));response.once('end',()=>{try{resolve({status:response.statusCode,headers:response.headers,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))})}catch{reject(Error('native_local_genuine_invalid_response'))}})
  });request.once('error',reject);request.end(bytes)})
 }
 const request=(who,path,body,options={})=>raw(path,{...options,method:options.method??(body===undefined?'GET':'POST'),body,cookie:cookies.get(who)})
 const executor=(token,operation,body,options={})=>raw('/api/public/native-local-executor/'+operation,{method:'POST',body,executor:true,headers:{...(token?{'X-Studio-Device-Token':token}:{}),...options.headers}})
 const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
 const login=async who=>{const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const set=response.headers['set-cookie'];assert.ok(Array.isArray(set));const cookie=set.find(c=>c.startsWith(cookiesModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
 const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const identity=await auth.verifySession(token);assert.ok(identity);return identity}
 let auth,executorPool
 async function close(){if(closed)return;closed=true;const errors=[]
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve)).catch(e=>errors.push(e))}
  finishTls?.();await tlsLifetime?.catch(e=>errors.push(e));for(const pool of extraPools){try{await pool.end?.()}catch(e){errors.push(e)}}
  try{await base?.close()}catch(e){errors.push(e)}cookies.clear();if(errors.length)throw new AggregateError(errors,'native_local_genuine_cleanup_failed')
 }
 try{
  base=await baseModule.agentAssessmentTcpFixture(env)
  for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share','067_native_local_devices'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
  const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs'),loginName='synthetic_local_executor'
  await base.db.exec('CREATE ROLE '+loginName+" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+makeNativeScramVerifier(passwordFor(loginName))+"'")
  await base.db.exec('GRANT agentstudio_local_executor TO '+loginName+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  executorPool=connect(loginName)
  try{await auditModule.inspectNativeLocalDevicePool(base.pool,'agentstudio_api');await auditModule.inspectNativeLocalDevicePool(executorPool,'agentstudio_local_executor')}
  catch(error){
   // Catalog-only observations of the ACTUAL installed database. No data rows,
   // credentials, token hashes, fake expected rows or positive audit callback.
   const routines=(await base.db.query("SELECT p.proname,oidvectortypes(p.proargtypes) args,p.proargnames names,pg_get_expr(p.proargdefaults,0,false) defaults,format_type(p.prorettype,NULL) returns,p.provolatile,p.proisstrict,p.prosecdef,p.proconfig,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') source_sha256 FROM pg_catalog.pg_proc p WHERE p.pronamespace='agentstudio'::regnamespace AND (starts_with(p.proname,'native_local_') OR p.proname IN('agent_design_sort_key','agent_design_number','agent_design_index_key','agent_design_compact','agent_design_digest','agent_design_native')) ORDER BY p.proname")).rows
   const constraints=(await base.db.query("SELECT c.conrelid::regclass::text table_name,c.conname,c.contype,c.convalidated,c.conenforced,pg_get_constraintdef(c.oid,false) definition FROM pg_catalog.pg_constraint c WHERE c.conrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace='agentstudio'::regnamespace AND relname IN('native_local_devices','native_local_receipts','native_local_run_devices','native_local_jobs')) ORDER BY c.conrelid,c.conname")).rows
   process.stderr.write(JSON.stringify({event:'native_local_actual_installed_catalog_observation',routines,constraints,observed_data_only:true})+'\n');throw error
  }
  if(chainModules){const db=await base.pool.connect();try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');await chainModules[3].requireHumanInputSchema(db)}finally{await db.query('ROLLBACK');db.release()}}
  auth=new authModule.NativeAuthRepository(connect('agentstudio_native_login'))
  let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{finishTls=resolve})
  tlsLifetime=tlsModule.withDisposableBoundModelTls(async()=>{throw Error('unexpected_native_local_fixture_model_dispatch')},async tls=>{
   serverTls=tls.serverTls;assert.ok(serverTls);server=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!handler){res.writeHead(503);res.end();return}void handler(req,res).catch(()=>res.destroy())});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
   origin='https://localhost:'+server.address().port;allowedOrigin=browserMode?'https://localhost:17443':origin
   const {selectNativeLocalDevices}=await import('../../src/native-local-device-runtime-policy.ts');const enabled=selectNativeLocalDevices(env,true,allowedOrigin,true);assert.equal(enabled.available,true);assert.equal(enabled.writes,true)
   const executorRepository=new repoModule.NativeLocalExecutorRepository(executorPool)
   handler=async(req,res)=>{
    const repository=new repoModule.NativeLocalDeviceRepository(base.pool,{allowWrites:mutable.writes});let local,generic,business
    const native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowLocalDevices:true,allowLocalDeviceWrites:mutable.writes,allowAutonomousAgentSubmission:true,allowAgentHumanInput:chainSupport,businessHandler:(incoming,outgoing)=>business(incoming,outgoing)})
    const authenticateRequest=async incoming=>{if(mutable.beforeAuthenticate)await mutable.beforeAuthenticate({path:incoming.url,method:incoming.method});return native.authenticateRequest(incoming)}
    local=httpModule.createNativeLocalDeviceHttp({repository,executor:executorRepository,authenticateRequest,allowedOrigin,allowWrites:mutable.writes})
    const chainBusiness=chainModules?{agentHumanInputRepository:new chainModules[0].AgentHumanInputRepository(base.pool,'agent_native_v2',{allowResponses:true}),workflowRepository:new chainModules[1].WorkflowRepository(base.pool),knowledgeRepository:new chainModules[2].KnowledgeBaseRepository(base.pool)}:{}
    generic=genericModule.createHandler({...chainBusiness,allowNativeLocalAgentSpecs:true,repository:base.agents,modelConnectionRepository:base.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(base.pool,base.key),autonomousAgentRunRepository:new runModule.AutonomousAgentRunRepository(base.pool,{allowHumanInput:true,allowLocalDevices:true}),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('native_local_cookie_only')}})
    business=businessRouteModule.composeNativeLocalDeviceBusiness(local,generic)
    const drop=mutable.dropNext;if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const end=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this}return end.apply(this,args)}}
    events.push({path:req.url,method:req.method});return native.handler(req,res)
   }
   await login('alice');await login('bob');readyResolve();await finish
  },{listenPort:0,includeServerTls:true}).catch(e=>{readyReject(e);throw e});void tlsLifetime.catch(()=>{});await ready
  const counts=async()=> (await base.db.query("SELECT (SELECT count(*)::int FROM agentstudio.native_local_devices) devices,(SELECT count(*)::int FROM agentstudio.native_local_jobs) jobs,(SELECT count(*)::int FROM agentstudio.native_local_receipts) receipts,(SELECT count(*)::int FROM agentstudio.audit_events WHERE action LIKE 'local.%') audit,(SELECT count(*)::int FROM agentstudio.agent_specs) agents")).rows[0]
  return{...base,target,auth,executorPool,audit:auditModule,request,executor,login,identityFor,cookies,credentials,mutable,events,counts,nativeOrigin:origin,allowedOrigin,serverTls,close,randomUUID,contracts:contractsModule,
   childTlsCa:()=>Buffer.from(serverTls.ca)}
 }catch(e){await close();throw e}
}
