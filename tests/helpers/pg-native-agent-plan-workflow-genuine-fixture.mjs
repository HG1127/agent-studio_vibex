// Actual guarded F05 HTTPS/Vite browser fixture. Proxy may buffer one genuine
// upstream response to test late scope completion; it never fabricates a body.
import {requireAgentPlanWorkflowGenuineCi} from '../../services/pg-api/tests/helpers/agent-plan-workflow-genuine-guard.mjs'
import {agentPlanWorkflowRuntimeGenuineFixture} from '../../services/pg-api/tests/helpers/agent-plan-workflow-runtime-genuine-fixture.mjs'
// BROWSER_SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_H
export const agentPlanWorkflowBrowserFrozenSources=Object.freeze({
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "2b5481edf0032603c7a976269f07c19bc8329d964231d04c345bde566e630c18",
  "src/pages/PgNativePilot/PgNativeAgentPlanWorkflowPanel.tsx": "afb5dbb87aeb5938039ef892a14d62ac371571c5bf916f1c06a8d7f2ec8814c8",
  "src/pages/PgNativePilot/PgNativeWorkflowWorkspace.tsx": "feaf8c020b14e819cd0103686cd9c4d2da11b2a4426940df1f49aa8765e3f733",
  "src/pages/PgNativePilot/PgNativeWorkflowNodeForm.tsx": "ae518e62ad0fb171ce186d435aeb503996ebcd7a7cea8e0a048312bd8642826d",
  "src/lib/pgNativeAgentPlanWorkflow.ts": "675fd2507c6cbdc7e43184372dc5aea8aef7921278590de36c629ed35a0c08e7",
  "src/lib/pgNativeAgentPlanWorkflowSession.ts": "42f186e3538d010af2a616c484d9a96a7a31c1caebf6261daa15f201631116c9",
  "src/lib/pgNativeWorkflowGeneratedDraft.ts": "6bf25416747995adc9c2bd232fc1bb799e330d4c268a8779a371d5e3c06c78a0",
  "src/lib/pgNativePilotApi.ts": "0ca52f6a5ba47e842f7e44a91913bf9899537157bc87d4b91a52d69038c9d73a",
  "src/pages/PgNativePilot/PgNativeWorkflowCanvas.tsx": "1f271f636e47dc3e5190ecbcde8ce17e3b2355b9f3eed979b90f5fb3994033e8",
  "src/lib/pgNativeWorkflowEditor.ts": "6953b75015b6f2448ad3262e48908e5242836f752f7b7c1587bcc5bf7e17617c",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/approval-delegation-audit-core.ts": "0be2d8be27c0b373a0dd69e09a196ba4b97f2758b7d2713baf90fcd1809c9029",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "9678d4f5ac3f690eb530e0e1ff94e32b9f3163bf3fd0cbbff964a4eed5259934",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "791d148ef5b23403e27d39d60ff414f358e75abddd27d47b28f963079974de1c",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "44ae51fdbbc67b45144d9dcf74368e142e31dd3b548162745a34830695d2f42d",
  "services/pg-api/src/http.ts": "13be40fbd21cf705675b5fb5cc0af6e2db6d580da0496ae4c1111c53be0d8044",
  "services/pg-api/src/native-auth-http.d.mts": "e6d38d69510ced0b480f00c65f4dd99a8bc926a3a9498e83f6308796d43a53f2",
  "services/pg-api/src/native-auth-http.mjs": "042874351b19e4f0f6ee6bdb8da73d7f3043b8ac408f9b4a60e1d6b40ea1096c",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/native-server.ts": "e118c3ffb97e33a9538d0ca2c877bfa1c094c3b38ced43dfe11a2e57ce3ef95a",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "df0dd20ed73f59e2712a1f541299e9345283bf3fbf980dd5ec7d45a8255325e0",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "6c8eb907e9fd79ec43d1f360b4643e93bf94d9d2d93f10c800f7368519c1bd0c",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "f75da7c939b729d0004fdcffb25d81ef260dd7f5409740558cfd7b88884d4c45",
  "services/pg-api/src/pg18-complete-profile.ts": "6e638dd304c5abd36430326a045b4bd4d370c79b22be4388699999e8d4ef1172",
  "services/pg-api/src/run-repository.ts": "58704899b00516583d7f90d2b8570f945b958b4d37ed1e6824fa835eeaaecd39",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "edc0956ec2820bf701a147111d37e7e40eb21dd664d1c90f231a964e7831a8d6",
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
  "src/lib/pgNativeStudioNavigation.ts": "9ab9de8f0f731de21affe6d2c83aee2d5b9c8fea8859aed413076f823205d6f9",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "2c2599e194292288d3a3bda23432cc8d1bdbbcd237f41e042b39ca64202b2e05",
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
  "services/pg-api/src/contracts.ts": "7aa7b9d3332e8200f2d3dd78f88c62acf4b7363b83fdfd41dfa5b04b7c887935",
  "services/pg-api/src/model-connection-executor.ts": "8f239d7f9e00d267fe4fb3e6d552d8c3761e445ce4c3d4f70d79fef6621aa1aa",
  "services/pg-api/src/native-credential-policy.ts": "702147e13c977c4d20ec54bf6cf7e85125ad1866983d7614daaa05a6fbde1cc2",
  "services/pg-api/src/native-local-agent-contract.ts": "76c1ed1c587bdb5d5d8e0c06b39771b1efa8d20e4de777367d8a573d49c66c5b",
  "services/pg-api/src/native-local-agent-resources.ts": "b55d540428348a8cf8f867fff283634451eafb1aafe4519aab143253e9515e5f",
  "services/pg-api/src/native-local-device-audit-manifest.ts": "1f6c102a37791eb9ed7a188e8b68d259efba5053be353727e0abe10e92633072",
  "services/pg-api/src/native-local-device-audit.ts": "feff5b0010d1109d7888f949bb8a46d61a48ddd49109a028a3bc3a1fd2d2553d",
  "services/pg-api/src/native-local-device-execution.ts": "3fb168d7506fc2b2835e96920ab5e36839ba9891bf0a2c6da332a5117416ea54",
  "services/pg-api/src/native-local-device-http.ts": "9ff14f42fa1118aba622f43b5414623979fc77ac08b4b810e19f85c0f6977783",
  "services/pg-api/src/native-local-device-repository.ts": "73f491515d90a8f1e0cb7ae6ce4ed0df9bf17f1859bc0e395bd3fa4d744a759e",
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
  "services/pg-api/src/repository.ts": "6916fc4503aa5d4e1c40f43351b89842194257378f47b2d6cec4473e495229c2",
  "shared/agent-caller-contract.ts": "147f48678600d933f0a50899c5c6f7f74d1d07e967a54a6aec0003d879ecc8ff",
  "src/lib/pgNativeAgentCallerPresentation.ts": "b189fb03b382943e3158967e8eba08b925c589c774b52aa47cdafc02d379871e",
  "src/lib/pgNativeAgentCallerSession.ts": "d896c7a0b7fee383ca65a9b59b26827a760766dc7c6247633482cee69cf4057d",
  "src/lib/pgNativeAgentCallers.ts": "ebecb453fca95a02a18131f8f2c0fe112cd83de403e7445e1d8644319e8d3d76",
  "src/lib/pgPublicAgentCaller.ts": "e735ccf9a1b47f9ca3cb28d94e269b6b3724de18ecca604c4b3ed5f4dfc6f4f0",
  "src/pages/PgNativePilot/PgNativeAgentCallerDetails.tsx": "236a56ad5c7aa9fde2f3c9839dbf8be8fa630c284fc63782381ecc27f4205b3d",
  "src/pages/PgNativePilot/PgNativeAgentCallerPanel.tsx": "4d3628fd9b00e7c56376102b9efe14211b3873c70ea275867a9c0ddaaae1a1a4"
})
export async function startPgNativeAgentPlanWorkflowGenuineBrowserFixture(env=process.env){
  requireAgentPlanWorkflowGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-plan-workflow-browser'||env.AGENT_STUDIO_F05_GENUINE_SUITE!=='browser')throw Error('agent_plan_workflow_browser_job_required')
  const [fs,path,url,https,crypto,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  if(Object.keys(agentPlanWorkflowBrowserFrozenSources).length<8)throw Error('F05_browser_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentPlanWorkflowBrowserFrozenSources))if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw Error('F05_browser_reviewed_source_changed')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f05-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F05_browser_scratch')
  let fixture,vite,agent,closed=false,holding=null
  const held=new Set()
  const close=async()=>{
    if(closed)return;closed=true;for(const gate of held)gate.release();held.clear();holding=null
    try{await vite?.close()}finally{try{agent?.destroy();await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f05-genuine-browser-'))throw Error('unsafe_F05_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}
  }
  try{
    fixture=await agentPlanWorkflowRuntimeGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F05 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},
      server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,''),
        configure(proxy){proxy.on('proxyRes',(upstream,req,res)=>{
          const gate=holding,pathName=new URL(req.url,'http://127.0.0.1').pathname
          if(!gate||req.method!=='GET'||!pathName.endsWith(gate.path))return
          holding=null
          if(upstream.statusCode!==200){gate.reject(Error('F05_held_actual_result_GET_must_be200'));held.delete(gate);return}
          // All bytes/headers come from one actual CA-validated Native response.
          // Buffer its real writes/end until release; no route.fulfill/mock API.
          const originalEnd=res.end;res.cork()
          res.end=function(...args){gate.enter({status:upstream.statusCode,path:gate.path});void gate.wait.then(()=>{held.delete(gate);if(!res.destroyed)originalEnd.apply(res,args)});return this}
        })}
      }}}})
    await vite.listen()
    const address='https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html'
    return{...fixture,url:address,browserOrigin:'https://localhost:17443',evidenceScope:'actual PG18 TCP + Native HTTPS Cookie + product page/SDK/Panel/canvas + dedicated Worker/Broker mTLS + synthetic model TLS; no PGlite/API body mocks/real vendor or fee',
      holdNextResultResponse(id){
        if(holding||closed||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('F05_one_exact_held_result_required')
        let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,refuse)=>{enter=resolve;reject=refuse})
        const gate={path:'/api/v2/agent-plan-workflow/requests/'+id,wait,release,enter,reject};holding=gate;held.add(gate)
        return{entered:async()=>{let timer;try{return await Promise.race([entered,new Promise((_,refuse)=>{timer=setTimeout(()=>refuse(Error('F05_actual_result_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(holding===gate)holding=null;gate.release()}}
      },close}
  }catch(error){await close();throw error}
}
