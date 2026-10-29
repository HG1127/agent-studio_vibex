// Actual guarded F07 HTTPS/Vite browser fixture. Proxy may buffer one genuine
// upstream response to test late scope completion; it never fabricates a body.
import {requireAgentTemplateMarketGenuineCi} from '../../services/pg-api/tests/helpers/agent-template-market-genuine-guard.mjs'
import {agentTemplateMarketGenuineFixture} from '../../services/pg-api/tests/helpers/agent-template-market-genuine-fixture.mjs'
// BROWSER_SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_H
export const agentTemplateMarketBrowserFrozenSources=Object.freeze({
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "88abe0b779b09e5b769d591724ed428b096aecfc3ec8d196339255caa1bd1958",
  "src/pages/PgNativePilot/PgNativeTemplateMarketAgentSetup.tsx": "1484c40905eb35baed8c1aa8fb2770792f029100c10336a52be3b58d27977c80",
  "src/pages/PgNativePilot/PgNativeTemplateMarketPanel.tsx": "edf7af34ede2268eb4d6c8104811e3cec5303286b141b7bede0c1daf69b91abb",
  "src/lib/pgNativeTemplateMarket.ts": "0fa32da7d9537868b702010b5d3bf15b26d517425105105c16e29d9fe8e0dfd4",
  "src/lib/pgNativeTemplateMarketSession.ts": "8f6227c66288df695ec5dfd048d5fc418b83fc5438215c36cc218503a6e08e06",
  "src/lib/pgNativePilotApi.ts": "53e514d3eb8980a189d7e9a6b2b5009292a25d505a38bfdcd1d379ac10f26ddb",
  "src/pages/PgNativePilot/PgNativeAgentModelBindingPanel.tsx": "3bc4784404e4a8c804c634775d59293f56362fd77384a76bd82c0688902e03c9",
  "src/pages/PgNativePilot/PgNativeAgentHttpToolsPanel.tsx": "0ea640a8336933efcf6426bdcf4a9d4742afb608fc28af59dd3c6edc1b30497a",
  "src/pages/PgNativePilot/PgNativeAgentMcpToolsPanel.tsx": "5fdbd2f86dc925d583a2172e81a0c9ccf5861348bf1c0252216417d64c9be482",
  "src/pages/PgNativePilot/PgNativeAgentKnowledgePanel.tsx": "6c04d30c4048ed0bc4b1ed7620d8c0a52c5bb32c5a7e8703cebeff84c1dee41c",
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
  "src/lib/pgNativeStudioNavigation.ts": "8509911393486f8f092386a34234f8d521185865325c8619281a3b9098135991",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "e3f8ebac7e181e783ae7e93be6f649c940f7a06abde745d697d580db9d2b90c9",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec"
})
export async function startPgNativeTemplateMarketGenuineBrowserFixture(env=process.env){
  requireAgentTemplateMarketGenuineCi(env)
  if(env.GITHUB_JOB!=='pg18-template-market-browser'||env.AGENT_STUDIO_F07_GENUINE_SUITE!=='browser')throw Error('agent_template_market_browser_job_required')
  const [fs,path,url,https,crypto,viteModule,reactModule]=await Promise.all([import('node:fs'),import('node:path'),import('node:url'),import('node:https'),import('node:crypto'),import('vite'),import('@vitejs/plugin-react')])
  const root=path.resolve(url.fileURLToPath(new URL('../../',import.meta.url))),parent=path.join(root,'.tmp','pg-migration-completion')
  if(Object.keys(agentTemplateMarketBrowserFrozenSources).length<8)throw Error('F07_browser_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentTemplateMarketBrowserFrozenSources))if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw Error('F07_browser_reviewed_source_changed')
  fs.mkdirSync(parent,{recursive:true});const scratch=fs.mkdtempSync(path.join(parent,'f07-genuine-browser-'))
  if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent))throw Error('unsafe_F07_browser_scratch')
  let fixture,vite,agent,closed=false,holding=null
  const held=new Set()
  const close=async()=>{
    if(closed)return;closed=true;for(const gate of held)gate.release();held.clear();holding=null
    try{await vite?.close()}finally{try{agent?.destroy();await fixture?.close()}finally{if(path.dirname(fs.realpathSync(scratch))!==fs.realpathSync(parent)||!path.basename(scratch).startsWith('f07-genuine-browser-'))throw Error('unsafe_F07_browser_cleanup');fs.rmSync(scratch,{recursive:true,force:true})}}
  }
  try{
    fixture=await agentTemplateMarketGenuineFixture(env,{browserMode:true})
    fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>F07 actual synthetic PG18</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    fs.writeFileSync(path.join(scratch,'entry.tsx'),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    const target=new URL(fixture.nativeOrigin);agent=new https.Agent({ca:fixture.serverTls.ca,rejectUnauthorized:true,servername:'localhost'})
    vite=await viteModule.createServer({configFile:false,envFile:false,root,plugins:[reactModule.default()],cacheDir:path.join(scratch,'vite-cache'),resolve:{alias:{'@':path.join(root,'src')}},
      server:{host:'127.0.0.1',port:17443,strictPort:true,https:fixture.serverTls,hmr:false,ws:false,watch:null,proxy:{'/__pg_native':{target:'https://127.0.0.1:'+target.port,agent,secure:true,changeOrigin:true,rewrite:value=>value.replace(/^\/__pg_native(?=\/|$)/,''),
        configure(proxy){proxy.on('proxyRes',(upstream,req,res)=>{
          const gate=holding,pathName=new URL(req.url,'http://127.0.0.1').pathname
          if(!gate||req.method!=='GET'||!pathName.endsWith(gate.path))return
          holding=null
          if(upstream.statusCode!==200){gate.reject(Error('F07_held_actual_Agent_GET_must_be200'));held.delete(gate);return}
          // All bytes/headers come from one actual CA-validated Native response.
          // Buffer its real writes/end until release; no route.fulfill/mock API.
          const originalEnd=res.end;res.cork()
          res.end=function(...args){gate.enter({status:upstream.statusCode,path:gate.path});void gate.wait.then(()=>{held.delete(gate);if(!res.destroyed)originalEnd.apply(res,args)});return this}
        })}
      }}}})
    await vite.listen()
    const address='https://localhost:17443/'+path.relative(root,scratch).replaceAll('\\','/')+'/index.html'
    return{...fixture,url:address,browserOrigin:'https://localhost:17443',evidenceScope:'actual PG18 TCP + Native HTTPS Cookie + product Root page/SDK/Panel/resource setup; no PGlite/API body mocks/provider execution',
      holdNextAgentResponse(id){
        if(holding||closed||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))throw Error('F07_one_exact_held_Agent_required')
        let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((resolve,refuse)=>{enter=resolve;reject=refuse})
        const gate={path:'/api/v2/agent-specs/'+id,wait,release,enter,reject};holding=gate;held.add(gate)
        return{entered:async()=>{let timer;try{return await Promise.race([entered,new Promise((_,refuse)=>{timer=setTimeout(()=>refuse(Error('F07_actual_Agent_response_hold_timeout')),20000)})])}finally{clearTimeout(timer)}},release(){if(holding===gate)holding=null;gate.release()}}
      },close}
  }catch(error){await close();throw error}
}
